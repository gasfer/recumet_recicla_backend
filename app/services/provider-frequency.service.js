const { sequelize } = require('../database/config');
const { QueryTypes } = require('sequelize');

const FREQUENCY_MAP = {
  WEEKLY: { code: 'WEEKLY', label: 'Semanal', minDays: 1, maxDays: 10 },
  BIWEEKLY: { code: 'BIWEEKLY', label: 'Quincenal', minDays: 11, maxDays: 17 },
  MONTHLY: { code: 'MONTHLY', label: 'Mensual', minDays: 18, maxDays: 45 },
  QUARTERLY: { code: 'QUARTERLY', label: 'Trimestral', minDays: 46, maxDays: 120 },
  ANNUAL: { code: 'ANNUAL', label: 'Anual', minDays: 121, maxDays: Infinity },
};

class ProviderFrequencyService {
  /**
   * Clasifica el promedio de días en las categorías establecidas
   * 1-10 días = Semanal
   * 11-17 días = Quincenal
   * 18-45 días = Mensual
   * 46-120 días = Trimestral
   * 121+ días = Anual
   */
  classifyFrequency(averageDays) {
    const days = Math.round(Number(averageDays) || 0);
    if (days <= 10) return FREQUENCY_MAP.WEEKLY;
    if (days <= 17) return FREQUENCY_MAP.BIWEEKLY;
    if (days <= 45) return FREQUENCY_MAP.MONTHLY;
    if (days <= 120) return FREQUENCY_MAP.QUARTERLY;
    return FREQUENCY_MAP.ANNUAL;
  }

  /**
   * Analiza el historial real de entregas/compras por PROVEEDOR + PRODUCTO/MATERIAL + SUCURSAL
   */
  analyzePurchases(purchases, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
    const sorted = purchases.filter(purchase => /^\d{4}-\d{2}-\d{2}$/.test(purchase.purchase_date)).sort((a, b) => a.purchase_date.localeCompare(b.purchase_date) || Number(a.id) - Number(b.id));
    const dates = [...new Set(sorted.map(purchase => purchase.purchase_date))];
    const first = dates[0] || null;
    const last = dates[dates.length - 1] || null;
    const difference = (start, end) => Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
    const elapsedDays = first && last ? difference(first, last) : 0;
    const averageDays = dates.length > 1 ? elapsedDays / (dates.length - 1) : null;
    const totalKg = sorted.reduce((sum, purchase) => sum + Number(purchase.total_kg || 0), 0);
    const kgPurchases = sorted.filter(purchase => purchase.has_kg);
    const estimatedVolume = kgPurchases.length ? totalKg / kgPurchases.length : null;
    const classification = averageDays !== null ? this.classifyFrequency(averageDays) : null;
    const next = averageDays !== null ? new Date(Date.parse(last + 'T00:00:00Z') + Math.max(1, Math.round(averageDays)) * 86400000).toISOString().slice(0, 10) : null;
    const overdue = next && difference(next, today) > 0 ? difference(next, today) : 0;
    return {
      hasSufficientHistory: averageDays !== null, totalDeliveries: dates.length, totalPurchases: sorted.length,
      firstDeliveryDate: first, lastDeliveryDate: last, elapsedDays,
      intervalsCount: Math.max(0, dates.length - 1), averageDays: averageDays !== null ? Number(averageDays.toFixed(2)) : null,
      frequencyCode: classification?.code || 'UNDETERMINED', frequencyLabel: classification?.label || 'Sin determinar',
      totalKg: Number(totalKg.toFixed(3)), estimatedVolume: estimatedVolume !== null ? Number(estimatedVolume.toFixed(3)) : null,
      nextEstimatedDate: next, recommendedContactDate: overdue ? today : next, overdueDays: overdue,
      purchases: sorted.map(purchase => ({ ...purchase, total_kg: Number(purchase.total_kg || 0) })),
      message: classification ? `Frecuencia aproximada: ${classification.label}. Volumen promedio por compra en kg.` : 'Se necesitan compras en al menos dos fechas distintas para estimar la frecuencia. El volumen se calcula con las compras disponibles.',
    };
  }

  async calculateFrequency(providerId, productId, branchId = null) {
    for (const value of [providerId, ...(productId != null ? [productId] : []), ...(branchId != null ? [branchId] : [])]) {
      if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) { const error = new Error('El identificador del proveedor, producto o sucursal no es válido.'); error.statusCode = 400; throw error; }
    }
    const records = await sequelize.query(`
      SELECT i.id, i.cod, (COALESCE(i.date_voucher, i."createdAt") AT TIME ZONE 'America/La_Paz')::date::text AS purchase_date,
        COALESCE(SUM(d.quantity) FILTER (WHERE LOWER(TRIM(u.siglas)) IN ('kg', 'kgs', 'kgr')), 0) AS total_kg,
        COUNT(d.id) FILTER (WHERE LOWER(TRIM(u.siglas)) IN ('kg', 'kgs', 'kgr')) > 0 AS has_kg
      FROM inputs i
      LEFT JOIN details_inputs d ON d.id_input = i.id AND (d.status = 'ACTIVE' OR d.status IS NULL) ${productId ? 'AND d.id_product = :product' : ''}
      LEFT JOIN products p ON p.id = d.id_product
      LEFT JOIN units u ON u.id = p.id_unit
      WHERE i.id_provider = :provider AND i.status = 'ACTIVE'
        ${branchId ? 'AND i.id_sucursal = :branch' : ''}
        ${productId ? 'AND d.id_product = :product' : ''}
      GROUP BY i.id, i.cod, i.date_voucher, i."createdAt"
      ORDER BY purchase_date, i.id
    `, { replacements: { provider: Number(providerId), product: Number(productId) || null, branch: Number(branchId) || null }, type: QueryTypes.SELECT });
    return this.analyzePurchases(records);
  }
}
module.exports = new ProviderFrequencyService();