"use strict";

const { prisma } = require("../config/database");
const logger = require("../utils/logger");

/**
 * Lấy threshold config từ DB
 * config_key: "temp_threshold" | "gas_threshold" | ...
 * config_value: { min, max, unit, enabled }
 */
async function getThresholdConfig(configKey) {
  try {
    const config = await prisma.threshold.findUnique({
      where: { config_key: configKey }
    });

    if (!config) return null;

    return {
      configKey,
      ...config.config_value
    };
  } catch (err) {
    logger.error({ err, configKey }, "Failed to get threshold config");
    return null;
  }
}

/**
 * Set hoặc update threshold
 */
async function setThresholdConfig(configKey, configValue) {
  try {
    const result = await prisma.threshold.upsert({
      where: { config_key: configKey },
      update: { config_value: configValue },
      create: { config_key: configKey, config_value: configValue }
    });

    logger.info({ configKey, configValue }, "Threshold updated");
    return result;
  } catch (err) {
    logger.error({ err, configKey }, "Failed to set threshold config");
    throw err;
  }
}

/**
 * Lấy tất cả threshold configs
 */
async function getAllThresholds() {
  try {
    const configs = await prisma.threshold.findMany();
    return configs.map((c) => ({
      configKey: c.config_key,
      ...c.config_value
    }));
  } catch (err) {
    logger.error({ err }, "Failed to get all threshold configs");
    return [];
  }
}

/**
 * Kiểm tra giá trị có vượt ngưỡng không
 * Trả về: { triggered: boolean, reason: string }
 */
async function checkThreshold(metricName, value) {
  const configKey = `${metricName}_threshold`;
  const config = await getThresholdConfig(configKey);

  if (!config || !config.enabled) {
    return { triggered: false, reason: "disabled" };
  }

  const numValue = Number(value);
  const min = Number.isFinite(Number(config?.min)) ? Number(config.min) : null;
  const max = Number.isFinite(Number(config?.max)) ? Number(config.max) : null;

  if (min !== null && numValue < min) {
    return {
      triggered: true,
      reason: `${metricName} too low (${numValue} < ${min})`,
      bounds: { min, max }
    };
  }

  if (max !== null && numValue > max) {
    return {
      triggered: true,
      reason: `${metricName} too high (${numValue} > ${max})`,
      bounds: { min, max }
    };
  }

  return { triggered: false, reason: "within range", bounds: { min, max } };
}

/**
 * Tạo alert record
 */
async function createAlert({ alertType, roomId = null, metadata = {} }) {
  try {
    const alert = await prisma.alert.create({
      data: {
        a_type: alertType,
        r_id: roomId,
        metadata
      }
    });

    logger.info({ alertType, roomId }, "Alert created");
    return alert;
  } catch (err) {
    logger.error({ err, alertType }, "Failed to create alert");
    throw err;
  }
}

/**
 * Lấy alerts gần đây
 */
async function getRecentAlerts({ limit = 50, roomId = null, hours = null, from = null, to = null } = {}) {
  try {
    const where = {
      ...(roomId && { r_id: roomId })
    };

    if (from || to) {
      where.time = {
        ...(from && { gte: from }),
        ...(to && { lte: to })
      };
    } else if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
      where.time = { gte: new Date(Date.now() - hours * 3600000) };
    }

    const alerts = await prisma.alert.findMany({
      where,
      take: limit,
      orderBy: { time: "desc" },
      include: { rooms: true }
    });

    return alerts;
  } catch (err) {
    logger.error({ err }, "Failed to get recent alerts");
    return [];
  }
}

/**
 * Xoá alert
 */
async function deleteAlert(alertId) {
  try {
    const result = await prisma.alert.delete({
      where: { a_id: alertId }
    });

    logger.info({ alertId }, "Alert deleted");
    return result;
  } catch (err) {
    logger.error({ err, alertId }, "Failed to delete alert");
    throw err;
  }
}

module.exports = {
  getThresholdConfig,
  setThresholdConfig,
  getAllThresholds,
  checkThreshold,
  createAlert,
  getRecentAlerts,
  deleteAlert
};
