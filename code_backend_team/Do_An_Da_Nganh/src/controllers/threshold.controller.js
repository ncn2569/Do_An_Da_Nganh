"use strict";

const thresholdService = require("../services/threshold.service");
const logger = require("../utils/logger");

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * GET /api/settings/thresholds - Lấy tất cả threshold configs
 */
async function listThresholds(req, res) {
  try {
    const thresholds = await thresholdService.getAllThresholds();
    res.json({ data: thresholds });
  } catch (err) {
    logger.error({ err }, "Failed to list thresholds");
    res.status(500).json({ error: "Failed to list thresholds" });
  }
}

/**
 * GET /api/settings/thresholds/:configKey - Lấy threshold config
 */
async function getThreshold(req, res) {
  try {
    const { configKey } = req.params;
    const config = await thresholdService.getThresholdConfig(configKey);

    if (!config) {
      return res.status(404).json({ error: "Threshold config not found" });
    }

    res.json({ data: config });
  } catch (err) {
    logger.error({ err }, "Failed to get threshold");
    res.status(500).json({ error: "Failed to get threshold" });
  }
}

/**
 * POST /api/settings/thresholds - Tạo hoặc update threshold
 * Body: { configKey, min, max, enabled, unit }
 */
async function setThreshold(req, res) {
  try {
    const { configKey, min, max, enabled = true, unit } = req.body;

    if (!configKey) {
      return res.status(400).json({ error: "configKey is required" });
    }

    const normalizedMin = parseOptionalNumber(min);
    const normalizedMax = parseOptionalNumber(max);

    // Validate min/max
    if (normalizedMin === null && normalizedMax === null) {
      return res.status(400).json({ error: "At least min or max is required" });
    }

    const configValue = {
      min: normalizedMin,
      max: normalizedMax,
      enabled:
        typeof enabled === "string"
          ? enabled.toLowerCase() !== "false"
          : !!enabled,
      unit: unit || ""
    };

    const result = await thresholdService.setThresholdConfig(
      configKey,
      configValue
    );

    res.status(201).json({
      data: result,
      message: "Threshold updated successfully"
    });
  } catch (err) {
    logger.error({ err }, "Failed to set threshold");
    res.status(500).json({ error: "Failed to set threshold" });
  }
}

/**
 * GET /api/environment/alerts - Lấy alerts gần đây
 * Query: ?limit=50&roomId=...&hours=24
 */
async function listAlerts(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const roomId = req.query.roomId || null;
    const hours = req.query.hours === undefined ? null : Number(req.query.hours);
    const from = parseDateOrNull(req.query.from);
    const to = parseDateOrNull(req.query.to);

    const alerts = await thresholdService.getRecentAlerts({
      limit,
      roomId,
      hours,
      from,
      to
    });

    res.json({
      data: alerts,
      count: alerts.length
    });
  } catch (err) {
    logger.error({ err }, "Failed to list alerts");
    res.status(500).json({ error: "Failed to list alerts" });
  }
}

/**
 * DELETE /api/environment/alerts/:alertId - Xoá alert
 */
async function deleteAlert(req, res) {
  try {
    const { alertId } = req.params;

    const result = await thresholdService.deleteAlert(alertId);

    res.json({
      data: result,
      message: "Alert deleted"
    });
  } catch (err) {
    logger.error({ err }, "Failed to delete alert");
    res.status(500).json({ error: "Failed to delete alert" });
  }
}

/**
 * POST /api/environment/alerts - Lưu alert ngay lập tức
 * Body: { alertType, roomId, metadata }
 */
async function createAlert(req, res) {
  try {
    const { alertType, roomId = null, metadata = {} } = req.body;

    if (!alertType) {
      return res.status(400).json({ error: "alertType is required" });
    }

    const result = await thresholdService.createAlert({
      alertType,
      roomId,
      metadata
    });

    res.status(201).json({ data: result, message: "Alert saved" });
  } catch (err) {
    logger.error({ err }, "Failed to create alert");
    res.status(500).json({ error: "Failed to create alert" });
  }
}

module.exports = {
  listThresholds,
  getThreshold,
  setThreshold,
  listAlerts,
  deleteAlert,
  createAlert
};
