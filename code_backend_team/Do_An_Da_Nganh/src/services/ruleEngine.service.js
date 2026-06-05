"use strict";

const { prisma } = require("../config/database");
const logger = require("../utils/logger");
const thresholdService = require("./threshold.service");

/**
 * Kiểm tra reading có vượt ngưỡng không và tạo alert nếu cần
 */
async function evaluateReading(reading) {
  // reading có thể là:
  // - { kind: "environment", temperature, humidity, light, gas, roomId, deviceId, ... }
  // - { kind: "single", sensorId, value, ... }

  if (!reading) return { ok: true, reading };

  const alerts = [];

  try {
    if (reading.kind === "environment") {
      const hasTemp = typeof reading.temperature === "number";
      const hasGas = typeof reading.gas === "number";

      let isTempDanger = false;
      let isGasDanger = false;
      let tempReason = "";
      let tempBounds = null;
      let gasReason = "";
      let gasBounds = null;

      if (hasTemp) {
        const tempCheck = await thresholdService.checkThreshold(
          "temperature",
          reading.temperature
        );
        isTempDanger = tempCheck.triggered;
        tempReason = tempCheck.reason;
        tempBounds = tempCheck.bounds;
      }

      if (hasGas) {
        const gasCheck = await thresholdService.checkThreshold(
          "gas",
          reading.gas
        );
        isGasDanger = gasCheck.triggered;
        gasReason = gasCheck.reason;
        gasBounds = gasCheck.bounds;
      }

      // 1. Cảnh báo cháy nổ (Gas + Temp)
      if (isGasDanger && isTempDanger) {
        alerts.push({
          type: "fire_explosion_alert",
          reason: `Cảnh báo cháy nổ (Gas: ${reading.gas} ppm, Temp: ${reading.temperature}°C)`,
          value: reading.gas,
          bounds: gasBounds,
          roomId: reading.roomId
        });
      } 
      // 2. Cảnh báo rò rỉ gas
      else if (isGasDanger) {
        alerts.push({
          type: "gas_leak_alert",
          reason: `Cảnh báo rò rỉ gas: ${gasReason}`,
          value: reading.gas,
          bounds: gasBounds,
          roomId: reading.roomId
        });
      } 
      // 3. Cảnh báo quá nhiệt
      else if (isTempDanger) {
        alerts.push({
          type: "temperature_alert",
          reason: `Cảnh báo nhiệt độ: ${tempReason}`,
          value: reading.temperature,
          bounds: tempBounds,
          roomId: reading.roomId
        });
      }

      // Xử lý các cảm biến khác (Light, Humidity)
      if (typeof reading.humidity === "number") {
        const humidityCheck = await thresholdService.checkThreshold(
          "humidity",
          reading.humidity
        );
        if (humidityCheck.triggered) {
          alerts.push({
            type: "humidity_alert",
            reason: humidityCheck.reason,
            value: reading.humidity,
            bounds: humidityCheck.bounds,
            roomId: reading.roomId
          });
        }
      }

      if (typeof reading.light === "number") {
        const lightCheck = await thresholdService.checkThreshold(
          "light",
          reading.light
        );
        if (lightCheck.triggered) {
          alerts.push({
            type: "light_alert",
            reason: lightCheck.reason,
            value: reading.light,
            bounds: lightCheck.bounds,
            roomId: reading.roomId
          });
        }
      }
    } else if (reading.kind === "single") {
      // Kiểm tra single sensor
      const metricCheck = await thresholdService.checkThreshold(
        reading.sensorId,
        reading.value
      );
      if (metricCheck.triggered) {
        alerts.push({
          type: `${reading.sensorId}_alert`,
          reason: metricCheck.reason,
          value: reading.value,
          bounds: metricCheck.bounds,
          roomId: reading.roomId
        });
      }
    }

    // Tạo alert records nếu có vi phạm
    for (const alert of alerts) {
      try {
        await thresholdService.createAlert({
          alertType: alert.type,
          roomId: alert.roomId,
          metadata: {
            reason: alert.reason,
            value: alert.value,
            bounds: alert.bounds,
            readingKind: reading.kind,
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        logger.error({ err, alert }, "Failed to create alert");
      }
    }

    return { ok: true, reading, alerts };
  } catch (err) {
    logger.error({ err, reading }, "Rule engine evaluation failed");
    return { ok: false, error: err.message, reading };
  }
}

async function getLatestReadings() {
  const latest = await prisma.environment.findMany({
    take: 50,
    orderBy: { time_created: "desc" },
    include: { rooms: true }
  });

  return latest;
}

module.exports = { evaluateReading, getLatestReadings };