'use strict';

const moment = require('moment');
const { Op } = require('sequelize');
const db = require('../database/config');
const { getNumberDecimal } = require('../helpers/company');

moment.locale('es');

const parseFlexibleDate = (val) => {
  if (!val) return null;
  if (moment.isMoment(val)) return val.clone();
  if (val instanceof Date) return moment(val);
  const str = String(val).trim();
  if (!str) return null;

  const formats = [
    moment.ISO_8601,
    'YYYY-MM-DD',
    'DD-MM-YYYY',
    'YYYY/MM/DD',
    'DD/MM/YYYY',
    'YYYY-MM-DD HH:mm:ss',
    'DD-MM-YYYY HH:mm:ss',
  ];

  const parsed = moment(str, formats, true);
  if (parsed.isValid()) return parsed;

  const relaxed = moment(str);
  return relaxed.isValid() ? relaxed : null;
};

const resolveCutoffDate = (filterBy = 'RANGE', date1, date2) => {
  const mode = String(filterBy || 'RANGE').toUpperCase();
  let cutoffMoment = null;

  switch (mode) {
    case 'DAY': {
      const parsedDay = parseFlexibleDate(date1) || moment();
      cutoffMoment = parsedDay.clone().endOf('day');
      break;
    }
    case 'MONTH': {
      let yearNum = moment().year();
      let monthNum = moment().month(); // 0-11

      if (date2 && /^\d{4}$/.test(String(date2).trim())) {
        yearNum = parseInt(String(date2).trim(), 10);
      } else if (date2) {
        const parsedYear = parseFlexibleDate(date2);
        if (parsedYear) yearNum = parsedYear.year();
      }

      if (date1 !== undefined && date1 !== null && /^\d{1,2}$/.test(String(date1).trim())) {
        monthNum = parseInt(String(date1).trim(), 10) - 1;
      } else if (date1) {
        const parsedMonth = parseFlexibleDate(date1);
        if (parsedMonth) {
          monthNum = parsedMonth.month();
          if (!date2) yearNum = parsedMonth.year();
        }
      }

      cutoffMoment = moment({ year: yearNum, month: monthNum, day: 1 }).endOf('month');
      break;
    }
    case 'YEAR': {
      let yearNum = moment().year();
      if (date1 && /^\d{4}$/.test(String(date1).trim())) {
        yearNum = parseInt(String(date1).trim(), 10);
      } else if (date1) {
        const parsedYear = parseFlexibleDate(date1);
        if (parsedYear) yearNum = parsedYear.year();
      }
      cutoffMoment = moment({ year: yearNum, month: 11, day: 31 }).endOf('day');
      break;
    }
    case 'RANGE':
    default: {
      const targetDate = date2 || date1;
      const parsed = parseFlexibleDate(targetDate) || moment();
      cutoffMoment = parsed.clone().endOf('day');
      break;
    }
  }

  const cutoffDate = cutoffMoment.toDate();
  const fileDateStr = cutoffMoment.format('YYYY-MM-DD');
  const dayStr = cutoffMoment.date();
  const monthName = cutoffMoment.format('MMMM');
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const yearStr = cutoffMoment.year();
  const headerLabel = `Al ${dayStr} de ${capitalizedMonth} de ${yearStr}`;

  return {
    cutoffMoment,
    cutoffDate,
    fileDateStr,
    headerLabel,
    filterBy: mode,
  };
};

const normalizeArrayParam = (param) => {
  if (!param) return [];
  if (Array.isArray(param)) {
    return param.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof param === 'string') {
    return param.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [String(param).trim()].filter(Boolean);
};

const normalizeReportFilters = (rawQuery = {}) => {
  const sucursales = normalizeArrayParam(rawQuery.id_sucursales || rawQuery.id_sucursal);
  const storages = normalizeArrayParam(rawQuery.id_storages || rawQuery.id_storage);
  const products = normalizeArrayParam(rawQuery.id_products || rawQuery.id_product);
  const categories = normalizeArrayParam(rawQuery.category_ids);

  const showZeroSaldo = rawQuery.showZeroSaldo === true ||
    rawQuery.showZeroSaldo === 'true' ||
    rawQuery.include_zero === true ||
    rawQuery.include_zero === 'true';

  const querySearch = typeof rawQuery.query === 'string' ? rawQuery.query.trim() : '';

  let orderField = 'cod';
  let orderDir = 'ASC';
  if (Array.isArray(rawQuery.orderNew) && rawQuery.orderNew.length >= 2) {
    orderField = rawQuery.orderNew[rawQuery.orderNew.length - 2];
    orderDir = String(rawQuery.orderNew[rawQuery.orderNew.length - 1]).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  } else if (rawQuery.fieldSort) {
    orderField = rawQuery.fieldSort.replace('product.', '');
    orderDir = String(rawQuery.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  }

  const cutoffInfo = resolveCutoffDate(rawQuery.filterBy, rawQuery.date1, rawQuery.date2);

  return {
    sucursales,
    storages,
    products,
    categories,
    showZeroSaldo,
    querySearch,
    orderField,
    orderDir,
    cutoffInfo,
    rawFilterBy: rawQuery.filterBy || 'RANGE',
    date1: rawQuery.date1,
    date2: rawQuery.date2,
  };
};

const roundPrecision = (num, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(num) || 0) * factor) / factor;
};

const resolveReportLocations = async ({ sucursales = [], storages = [] }) => {
  const isByStorage = storages.length > 0;
  const sucursalWhere = sucursales.length > 0 ? { id: { [Op.in]: sucursales } } : {};

  if (isByStorage) {
    const storageWhere = {
      id: { [Op.in]: storages },
      ...(sucursales.length > 0 ? { id_sucursal: { [Op.in]: sucursales } } : {}),
    };

    const storagesList = await db.Storage.findAll({
      where: storageWhere,
      include: [{ model: db.Sucursal, as: 'sucursal', attributes: ['id', 'name'] }],
      order: [
        [{ model: db.Sucursal, as: 'sucursal' }, 'name', 'ASC'],
        ['name', 'ASC'],
      ],
      raw: true,
      nest: true,
    });

    return storagesList.map(st => ({
      key: `loc_${st.id_sucursal}_${st.id}`,
      id_sucursal: st.id_sucursal,
      sucursal_name: st.sucursal?.name || `Sucursal ${st.id_sucursal}`,
      id_storage: st.id,
      storage_name: st.name || `Almacén ${st.id}`,
      label: `${st.sucursal?.name || `Sucursal ${st.id_sucursal}`} / ${st.name || `Almacén ${st.id}`}`,
    }));
  }

  const sucursalesList = await db.Sucursal.findAll({
    where: sucursalWhere,
    order: [['name', 'ASC']],
    raw: true,
  });

  return sucursalesList.map(suc => ({
    key: `loc_${suc.id}`,
    id_sucursal: suc.id,
    sucursal_name: suc.name || `Sucursal ${suc.id}`,
    id_storage: null,
    storage_name: null,
    label: suc.name || `Sucursal ${suc.id}`,
  }));
};

const queryKardexBalances = async ({ sucursales = [], storages = [], products = [], categories = [], cutoffDate, isByStorage }) => {
  const sucursalCond = sucursales.length > 0 ? { id_sucursal: { [Op.in]: sucursales } } : {};
  const storageCond = storages.length > 0 ? { id_storage: { [Op.in]: storages } } : {};
  const productCond = products.length > 0 ? { id_product: { [Op.in]: products } } : {};

  const groupAttrs = isByStorage
    ? ['id_product', 'id_sucursal', 'id_storage']
    : ['id_product', 'id_sucursal'];

  const options = {
    attributes: [
      ...groupAttrs,
      [db.sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
      [db.sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
      [db.sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
    ],
    where: {
      [Op.and]: [
        sucursalCond,
        storageCond,
        productCond,
        { date: { [Op.lte]: cutoffDate } },
      ],
    },
    group: groupAttrs,
    raw: true,
  };

  const results = await db.ViewKardex.findAll(options);
  const balanceMap = new Map();

  for (const row of results) {
    const locKey = isByStorage
      ? `loc_${row.id_sucursal}_${row.id_storage}`
      : `loc_${row.id_sucursal}`;
    const productKey = `${row.id_product}:${locKey}`;
    balanceMap.set(productKey, Number(row.quantity_saldo || 0));
  }

  return balanceMap;
};

const queryPendingTransfers = async ({ sucursales = [], storages = [], products = [], cutoffDate, isByStorage }) => {
  const sucursalCond = sucursales.length > 0 ? { id_sucursal_received: { [Op.in]: sucursales } } : {};
  const storageCond = storages.length > 0 ? { id_storage_received: { [Op.in]: storages } } : {};
  const productCond = products.length > 0 ? { id_product: { [Op.in]: products } } : {};

  const transferWhere = {
    [Op.and]: [
      sucursalCond,
      storageCond,
      { date_send: { [Op.lte]: cutoffDate } },
      {
        [Op.or]: [
          { date_received: null },
          { date_received: { [Op.gt]: cutoffDate } },
        ],
      },
      {
        status: {
          [Op.notIn]: ['ANULADO', 'CANCELLED'],
        },
      },
    ],
  };

  const transfers = await db.Transfers.findAll({
    where: transferWhere,
    include: [{
      model: db.DetailsTransfers,
      as: 'detailsTransfers',
      where: productCond,
      attributes: ['id_product', 'quantity'],
    }],
  });

  const pendingMap = new Map();

  for (const tr of transfers) {
    const locKey = isByStorage
      ? `loc_${tr.id_sucursal_received}_${tr.id_storage_received}`
      : `loc_${tr.id_sucursal_received}`;

    const details = tr.detailsTransfers || [];
    for (const d of details) {
      const pKey = `${d.id_product}:${locKey}`;
      const qty = Number(d.quantity || 0);
      const current = pendingMap.get(pKey) || 0;
      pendingMap.set(pKey, current + qty);
    }
  }

  return pendingMap;
};

const queryConciliationHolds = async ({ sucursales = [], storages = [], products = [], cutoffDate, isByStorage }) => {
  if (!db.TransferReviewInventoryHold) {
    return new Map();
  }

  const sucursalCond = sucursales.length > 0 ? { id_sucursal: { [Op.in]: sucursales } } : {};
  const storageCond = storages.length > 0 ? { id_storage: { [Op.in]: storages } } : {};
  const productCond = products.length > 0 ? { id_product: { [Op.in]: products } } : {};

  const holdWhere = {
    [Op.and]: [
      sucursalCond,
      storageCond,
      productCond,
      { createdAt: { [Op.lte]: cutoffDate } },
      {
        [Op.or]: [
          { disposition: { [Op.in]: ['EN_REVISION', 'RETENIDO_SIN_AJUSTE'] } },
          {
            [Op.and]: [
              { disposition: 'LIBERADO_POR_AJUSTE' },
              { updatedAt: { [Op.gt]: cutoffDate } },
            ],
          },
        ],
      },
    ],
  };

  const holds = await db.TransferReviewInventoryHold.findAll({
    where: holdWhere,
    attributes: ['id_product', 'id_sucursal', 'id_storage', 'quantity'],
    raw: true,
  });

  const holdMap = new Map();

  for (const h of holds) {
    const locKey = isByStorage
      ? `loc_${h.id_sucursal}_${h.id_storage}`
      : `loc_${h.id_sucursal}`;
    const pKey = `${h.id_product}:${locKey}`;
    const qty = Number(h.quantity || 0);
    const current = holdMap.get(pKey) || 0;
    holdMap.set(pKey, current + qty);
  }

  return holdMap;
};

const queryCatalogProducts = async ({ products = [], categories = [], querySearch = '', orderField = 'cod', orderDir = 'ASC' }) => {
  const whereProduct = {};
  if (products.length > 0) {
    whereProduct.id = { [Op.in]: products };
  }
  if (querySearch) {
    whereProduct[Op.or] = [
      { name: { [Op.iLike]: `%${querySearch}%` } },
      { cod: { [Op.iLike]: `%${querySearch}%` } },
    ];
  }

  const whereCategory = {
    type: { [Op.in]: ['RAW_MATERIAL', 'FINISHED_PRODUCT'] },
  };
  if (categories.length > 0) {
    whereCategory.id = { [Op.in]: categories };
  }

  const validOrderField = ['cod', 'name', 'id'].includes(orderField) ? orderField : 'cod';
  const validOrderDir = orderDir === 'DESC' ? 'DESC' : 'ASC';

  const productRows = await db.Product.findAll({
    where: whereProduct,
    include: [
      {
        model: db.Category,
        as: 'category',
        where: whereCategory,
        attributes: ['id', 'name', 'type'],
      },
      {
        model: db.Unit,
        as: 'unit',
        attributes: ['id', 'name', 'siglas'],
      },
    ],
    order: [
      [{ model: db.Category, as: 'category' }, 'name', 'ASC'],
      [validOrderField, validOrderDir],
    ],
  });

  return productRows;
};

const validateProjectionIntegrity = (projection, decimals = 2) => {
  const errors = [];
  const tolerance = 1 / Math.pow(10, decimals);

  const checkDiff = (label, expected, actual) => {
    const diff = Math.abs(roundPrecision(expected, decimals) - roundPrecision(actual, decimals));
    if (diff > tolerance) {
      errors.push(`${label}: esperado ${expected}, calculado ${actual} (diferencia: ${diff})`);
    }
  };

  const sections = [projection.sections.rawMaterial, projection.sections.finishedProduct];

  for (const section of sections) {
    let sectionExpectedStock = 0;
    let sectionExpectedPending = 0;
    let sectionExpectedConciliation = 0;
    const sectionExpectedLocStock = {};

    for (const cat of section.categories) {
      let catExpectedStock = 0;
      let catExpectedPending = 0;
      let catExpectedConciliation = 0;
      const catExpectedLocStock = {};

      for (const prod of cat.products) {
        let prodLocStockSum = 0;
        for (const loc of projection.locations) {
          const locData = prod.locations[loc.key] || { registeredStock: 0, pendingReceipt: 0, inConciliation: 0 };
          prodLocStockSum += locData.registeredStock;
          catExpectedLocStock[loc.key] = (catExpectedLocStock[loc.key] || 0) + locData.registeredStock;
        }
        checkDiff(`Producto ${prod.cod} suma ubicaciones stock`, prod.totalRegisteredStock, prodLocStockSum);

        catExpectedStock += prod.totalRegisteredStock;
        catExpectedPending += prod.totalPendingReceipt;
        catExpectedConciliation += prod.totalInConciliation;
      }

      checkDiff(`Categoría ${cat.category_name} total stock`, cat.subtotals.totalRegisteredStock, catExpectedStock);
      checkDiff(`Categoría ${cat.category_name} total pendiente`, cat.subtotals.totalPendingReceipt, catExpectedPending);
      checkDiff(`Categoría ${cat.category_name} total conciliación`, cat.subtotals.totalInConciliation, catExpectedConciliation);

      for (const loc of projection.locations) {
        checkDiff(`Categoría ${cat.category_name} ubicacion ${loc.label} stock`, cat.subtotals.locations[loc.key]?.registeredStock || 0, catExpectedLocStock[loc.key] || 0);
        sectionExpectedLocStock[loc.key] = (sectionExpectedLocStock[loc.key] || 0) + (cat.subtotals.locations[loc.key]?.registeredStock || 0);
      }

      sectionExpectedStock += cat.subtotals.totalRegisteredStock;
      sectionExpectedPending += cat.subtotals.totalPendingReceipt;
      sectionExpectedConciliation += cat.subtotals.totalInConciliation;
    }

    checkDiff(`Sección ${section.title} total stock`, section.totals.totalRegisteredStock, sectionExpectedStock);
    checkDiff(`Sección ${section.title} total pendiente`, section.totals.totalPendingReceipt, sectionExpectedPending);
    checkDiff(`Sección ${section.title} total conciliación`, section.totals.totalInConciliation, sectionExpectedConciliation);

    for (const loc of projection.locations) {
      checkDiff(`Sección ${section.title} ubicacion ${loc.label} stock`, section.totals.locations[loc.key]?.registeredStock || 0, sectionExpectedLocStock[loc.key] || 0);
    }
  }

  const grandExpectedStock = projection.sections.rawMaterial.totals.totalRegisteredStock + projection.sections.finishedProduct.totals.totalRegisteredStock;
  const grandExpectedPending = projection.sections.rawMaterial.totals.totalPendingReceipt + projection.sections.finishedProduct.totals.totalPendingReceipt;
  const grandExpectedConciliation = projection.sections.rawMaterial.totals.totalInConciliation + projection.sections.finishedProduct.totals.totalInConciliation;

  checkDiff('Total General stock', projection.grandTotals.totalRegisteredStock, grandExpectedStock);
  checkDiff('Total General pendiente', projection.grandTotals.totalPendingReceipt, grandExpectedPending);
  checkDiff('Total General conciliación', projection.grandTotals.totalInConciliation, grandExpectedConciliation);

  return {
    valid: errors.length === 0,
    errors,
  };
};

const buildConsolidatedInventoryProjection = async (rawQuery = {}) => {
  const filters = normalizeReportFilters(rawQuery);
  const { sucursales, storages, products, categories, showZeroSaldo, querySearch, orderField, orderDir, cutoffInfo } = filters;
  const isByStorage = storages.length > 0;
  const rawDecimals = await getNumberDecimal();
  const decimalPlaces = (typeof rawDecimals === 'number' && rawDecimals > 0) ? rawDecimals : 2;

  const locations = await resolveReportLocations({ sucursales, storages });

  const [balancesMap, pendingMap, holdsMap, catalogProducts] = await Promise.all([
    queryKardexBalances({ sucursales, storages, products, categories, cutoffDate: cutoffInfo.cutoffDate, isByStorage }),
    queryPendingTransfers({ sucursales, storages, products, cutoffDate: cutoffInfo.cutoffDate, isByStorage }),
    queryConciliationHolds({ sucursales, storages, products, cutoffDate: cutoffInfo.cutoffDate, isByStorage }),
    queryCatalogProducts({ products, categories, querySearch, orderField, orderDir }),
  ]);

  const rawMaterialCategoriesMap = new Map();
  const finishedProductCategoriesMap = new Map();

  for (const prod of catalogProducts) {
    const prodId = prod.id;
    const cat = prod.category;
    if (!cat) continue;

    const locQuantities = {};
    let totalRegisteredStock = 0;
    let totalPendingReceipt = 0;
    let totalInConciliation = 0;

    for (const loc of locations) {
      const pKey = `${prodId}:${loc.key}`;
      const regStock = roundPrecision(balancesMap.get(pKey) || 0, decimalPlaces);
      const pend = roundPrecision(pendingMap.get(pKey) || 0, decimalPlaces);
      const hold = roundPrecision(holdsMap.get(pKey) || 0, decimalPlaces);

      locQuantities[loc.key] = {
        registeredStock: regStock,
        pendingReceipt: pend,
        inConciliation: hold,
      };

      totalRegisteredStock += regStock;
      totalPendingReceipt += pend;
      totalInConciliation += hold;
    }

    totalRegisteredStock = roundPrecision(totalRegisteredStock, decimalPlaces);
    totalPendingReceipt = roundPrecision(totalPendingReceipt, decimalPlaces);
    totalInConciliation = roundPrecision(totalInConciliation, decimalPlaces);

    const hasAnyBalance = (totalRegisteredStock !== 0) || (totalPendingReceipt !== 0);

    if (!showZeroSaldo && !hasAnyBalance) {
      continue;
    }

    const productEntry = {
      id_product: prodId,
      cod: prod.cod || '',
      name: prod.name || '',
      unit: prod.unit?.siglas || prod.unit?.name || 'UND',
      observations: String(prod.description || '').trim(),
      locations: locQuantities,
      totalRegisteredStock,
      totalPendingReceipt,
      totalInConciliation,
    };

    const targetMap = cat.type === 'RAW_MATERIAL' ? rawMaterialCategoriesMap : finishedProductCategoriesMap;
    if (!targetMap.has(cat.id)) {
      targetMap.set(cat.id, {
        id_category: cat.id,
        category_name: cat.name || 'SIN CATEGORÍA',
        type: cat.type,
        products: [],
      });
    }

    targetMap.get(cat.id).products.push(productEntry);
  }

  const processCategorySection = (catMap, sectionType, sectionTitle) => {
    const categoriesArray = [];
    const sectionTotals = {
      locations: {},
      totalRegisteredStock: 0,
      totalPendingReceipt: 0,
      totalInConciliation: 0,
    };

    for (const loc of locations) {
      sectionTotals.locations[loc.key] = {
        registeredStock: 0,
        pendingReceipt: 0,
        inConciliation: 0,
      };
    }

    for (const cat of catMap.values()) {
      if (cat.products.length === 0) continue;

      const catSubtotals = {
        locations: {},
        totalRegisteredStock: 0,
        totalPendingReceipt: 0,
        totalInConciliation: 0,
      };

      for (const loc of locations) {
        catSubtotals.locations[loc.key] = {
          registeredStock: 0,
          pendingReceipt: 0,
          inConciliation: 0,
        };
      }

      for (const prod of cat.products) {
        for (const loc of locations) {
          const pLoc = prod.locations[loc.key];
          catSubtotals.locations[loc.key].registeredStock = roundPrecision(catSubtotals.locations[loc.key].registeredStock + pLoc.registeredStock, decimalPlaces);
          catSubtotals.locations[loc.key].pendingReceipt = roundPrecision(catSubtotals.locations[loc.key].pendingReceipt + pLoc.pendingReceipt, decimalPlaces);
          catSubtotals.locations[loc.key].inConciliation = roundPrecision(catSubtotals.locations[loc.key].inConciliation + pLoc.inConciliation, decimalPlaces);
        }

        catSubtotals.totalRegisteredStock = roundPrecision(catSubtotals.totalRegisteredStock + prod.totalRegisteredStock, decimalPlaces);
        catSubtotals.totalPendingReceipt = roundPrecision(catSubtotals.totalPendingReceipt + prod.totalPendingReceipt, decimalPlaces);
        catSubtotals.totalInConciliation = roundPrecision(catSubtotals.totalInConciliation + prod.totalInConciliation, decimalPlaces);
      }

      for (const loc of locations) {
        sectionTotals.locations[loc.key].registeredStock = roundPrecision(sectionTotals.locations[loc.key].registeredStock + catSubtotals.locations[loc.key].registeredStock, decimalPlaces);
        sectionTotals.locations[loc.key].pendingReceipt = roundPrecision(sectionTotals.locations[loc.key].pendingReceipt + catSubtotals.locations[loc.key].pendingReceipt, decimalPlaces);
        sectionTotals.locations[loc.key].inConciliation = roundPrecision(sectionTotals.locations[loc.key].inConciliation + catSubtotals.locations[loc.key].inConciliation, decimalPlaces);
      }

      sectionTotals.totalRegisteredStock = roundPrecision(sectionTotals.totalRegisteredStock + catSubtotals.totalRegisteredStock, decimalPlaces);
      sectionTotals.totalPendingReceipt = roundPrecision(sectionTotals.totalPendingReceipt + catSubtotals.totalPendingReceipt, decimalPlaces);
      sectionTotals.totalInConciliation = roundPrecision(sectionTotals.totalInConciliation + catSubtotals.totalInConciliation, decimalPlaces);

      categoriesArray.push({
        id_category: cat.id_category,
        category_name: cat.category_name,
        products: cat.products,
        subtotals: catSubtotals,
      });
    }

    return {
      type: sectionType,
      title: sectionTitle,
      categories: categoriesArray,
      totals: sectionTotals,
    };
  };

  const rawMaterialSection = processCategorySection(rawMaterialCategoriesMap, 'RAW_MATERIAL', 'MATERIA PRIMA');
  const finishedProductSection = processCategorySection(finishedProductCategoriesMap, 'FINISHED_PRODUCT', 'PRODUCTOS TERMINADOS');

  const grandTotals = {
    locations: {},
    totalRegisteredStock: roundPrecision(rawMaterialSection.totals.totalRegisteredStock + finishedProductSection.totals.totalRegisteredStock, decimalPlaces),
    totalPendingReceipt: roundPrecision(rawMaterialSection.totals.totalPendingReceipt + finishedProductSection.totals.totalPendingReceipt, decimalPlaces),
    totalInConciliation: roundPrecision(rawMaterialSection.totals.totalInConciliation + finishedProductSection.totals.totalInConciliation, decimalPlaces),
  };

  for (const loc of locations) {
    grandTotals.locations[loc.key] = {
      registeredStock: roundPrecision((rawMaterialSection.totals.locations[loc.key]?.registeredStock || 0) + (finishedProductSection.totals.locations[loc.key]?.registeredStock || 0), decimalPlaces),
      pendingReceipt: roundPrecision((rawMaterialSection.totals.locations[loc.key]?.pendingReceipt || 0) + (finishedProductSection.totals.locations[loc.key]?.pendingReceipt || 0), decimalPlaces),
      inConciliation: roundPrecision((rawMaterialSection.totals.locations[loc.key]?.inConciliation || 0) + (finishedProductSection.totals.locations[loc.key]?.inConciliation || 0), decimalPlaces),
    };
  }

  const projection = {
    metadata: {
      cutoffDate: cutoffInfo.cutoffDate,
      fileDateStr: cutoffInfo.fileDateStr,
      headerLabel: cutoffInfo.headerLabel,
      filterBy: cutoffInfo.filterBy,
      filtersSummary: {
        sucursales,
        storages,
        categories,
        products,
        showZeroSaldo,
        querySearch,
      },
      decimalPlaces,
    },
    locations,
    sections: {
      rawMaterial: rawMaterialSection,
      finishedProduct: finishedProductSection,
    },
    grandTotals,
  };

  const integrityResult = validateProjectionIntegrity(projection, decimalPlaces);
  projection.integrity = integrityResult;

  if (!integrityResult.valid) {
    const errorMsg = `Inconsistencia matemática en proyección de inventario consolidado: ${integrityResult.errors.join('; ')}`;
    const err = new Error(errorMsg);
    err.statusCode = 422;
    err.errors = integrityResult.errors;
    throw err;
  }

  return projection;
};

module.exports = {
  parseFlexibleDate,
  resolveCutoffDate,
  normalizeArrayParam,
  normalizeReportFilters,
  roundPrecision,
  resolveReportLocations,
  queryKardexBalances,
  queryPendingTransfers,
  queryConciliationHolds,
  queryCatalogProducts,
  validateProjectionIntegrity,
  buildConsolidatedInventoryProjection,
};
