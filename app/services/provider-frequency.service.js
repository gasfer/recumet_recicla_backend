const { Input, DetailsInput, sequelize } = require('../database/config');
const { Op } = require('sequelize');

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
  async calculateFrequency(providerId, productId, branchId = null) {
    if (!providerId || !productId) {
      return {
        hasSufficientHistory: false,
        totalDeliveries: 0,
        lastDeliveryDate: null,
        averageDays: 0,
        frequencyCode: 'UNDETERMINED',
        frequencyLabel: 'Sin determinar',
        nextEstimatedDate: null,
        message: 'Proveedor o producto no especificado.',
      };
    }

    const whereInput = {
      id_provider: Number(providerId),
      status: 'ACTIVE',
    };

    if (branchId) {
      whereInput.id_sucursal = Number(branchId);
    }

    const records = await DetailsInput.findAll({
      attributes: ['id_product', 'createdAt'],
      include: [
        {
          model: Input,
          as: 'input',
          attributes: ['id', 'date_voucher', 'createdAt', 'status', 'id_sucursal'],
          where: whereInput,
          required: true,
        },
      ],
      where: {
        id_product: Number(productId),
        status: { [Op.or]: ['ACTIVE', null] },
      },
      order: [[{ model: Input, as: 'input' }, 'date_voucher', 'ASC']],
    });

    // Extraer fechas únicas reales (formato YYYY-MM-DD para evitar duplicados en el mismo día)
    const dateMap = new Map();
    records.forEach((row) => {
      const rawDate = row.input?.date_voucher || row.input?.createdAt || row.createdAt;
      if (rawDate) {
        const dateObj = new Date(rawDate);
        if (!isNaN(dateObj.getTime())) {
          const key = dateObj.toISOString().slice(0, 10);
          if (!dateMap.has(key)) {
            dateMap.set(key, dateObj);
          }
        }
      }
    });

    const uniqueDates = Array.from(dateMap.values()).sort((a, b) => a.getTime() - b.getTime());
    const totalDeliveries = uniqueDates.length;

    if (totalDeliveries < 2) {
      const singleDate = totalDeliveries === 1 ? uniqueDates[0] : null;
      return {
        hasSufficientHistory: false,
        totalDeliveries,
        lastDeliveryDate: singleDate ? singleDate.toISOString().slice(0, 10) : null,
        averageDays: 0,
        frequencyCode: 'UNDETERMINED',
        frequencyLabel: 'Sin determinar',
        nextEstimatedDate: null,
        message: 'No hay suficiente historial para calcular automáticamente.',
      };
    }

    // Calcular intervalos entre entregas consecutivas
    const intervals = [];
    for (let i = 1; i < uniqueDates.length; i++) {
      const diffMs = uniqueDates[i].getTime() - uniqueDates[i - 1].getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      intervals.push(Math.max(1, diffDays));
    }

    const sumDays = intervals.reduce((acc, curr) => acc + curr, 0);
    const averageDays = sumDays / intervals.length;
    const classification = this.classifyFrequency(averageDays);

    const lastDate = uniqueDates[uniqueDates.length - 1];
    const roundedAvg = Math.round(averageDays);
    const nextEstimated = new Date(lastDate.getTime() + roundedAvg * 24 * 60 * 60 * 1000);

    return {
      hasSufficientHistory: true,
      totalDeliveries,
      intervalsCount: intervals.length,
      averageDays: Number(averageDays.toFixed(2)),
      averageDaysRounded: roundedAvg,
      frequencyCode: classification.code,
      frequencyLabel: classification.label,
      lastDeliveryDate: lastDate.toISOString().slice(0, 10),
      nextEstimatedDate: nextEstimated.toISOString().slice(0, 10),
      message: `Frecuencia detectada: ${classification.label}`,
    };
  }
}

module.exports = new ProviderFrequencyService();
