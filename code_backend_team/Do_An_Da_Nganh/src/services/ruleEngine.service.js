"use strict";

const { prisma } = require("../config/database");
const logger = require("../utils/logger");
const thresholdService = require("./threshold.service");

/**
 * Kiểm tra reading có vượt ngưỡng không và tạo alert nếu cần
 */
async function evaluateReading(reading) {
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
      
      if (metricCheck.triggered && reading.sensorId !== 'gas' && reading.sensorId !== 'temperature' && reading.sensorId !== 'temp') {
        alerts.push({
          type: `${reading.sensorId}_alert`,
          reason: metricCheck.reason,
          value: reading.value,
          bounds: metricCheck.bounds,
          roomId: reading.roomId
        });
      }
    }

    // 2. Kiểm tra luật gộp 
    const environmentService = require("./environment.service");
    const snapshot = await environmentService.getLatestSnapshot({ roomId: reading.roomId, scanLimit: 50 });
    
    const tempValue = snapshot.temperature?.value ?? (reading.kind === "environment" ? reading.temperature : null);
    const gasValue = snapshot.gas?.value ?? (reading.kind === "environment" ? reading.gas : null);

    const hasTemp = typeof tempValue === "number";
    const hasGas = typeof gasValue === "number";

    let isTempDanger = false;
    let isGasDanger = false;
    let tempReason = "";
    let gasReason = "";

    if (hasTemp) {
      const tempCheck = await thresholdService.checkThreshold("temperature", tempValue);
      isTempDanger = tempCheck.triggered;
      tempReason = tempCheck.reason;
    }

    if (hasGas) {
      const gasCheck = await thresholdService.checkThreshold("gas", gasValue);
      isGasDanger = gasCheck.triggered;
      gasReason = gasCheck.reason;
    }

    // Luật gộp:
    if (isGasDanger && isTempDanger) {
      alerts.push({
        type: "fire_explosion_alert",
        reason: `Cảnh báo cháy nổ (Gas: ${gasValue} ppm, Temp: ${tempValue}°C)`,
        value: gasValue,
        roomId: reading.roomId
      });
    } else if (isGasDanger) {
      alerts.push({
        type: "gas_leak_alert",
        reason: `Cảnh báo rò rỉ gas: ${gasReason}`,
        value: gasValue,
        roomId: reading.roomId
      });
    } else if (isTempDanger) {
      alerts.push({
        type: "temperature_alert",
        reason: `Cảnh báo nhiệt độ: ${tempReason}`,
        value: tempValue,
        roomId: reading.roomId
      });
    }

    // Nếu reading.kind là environment, kiểm tra thêm light và humidity
    if (reading.kind === "environment") {
      if (typeof reading.humidity === "number") {
        const humidityCheck = await thresholdService.checkThreshold("humidity", reading.humidity);
        if (humidityCheck.triggered) {
          alerts.push({ type: "humidity_alert", reason: humidityCheck.reason, value: reading.humidity, roomId: reading.roomId });
        }
      }
      if (typeof reading.light === "number") {
        const lightCheck = await thresholdService.checkThreshold("light", reading.light);
        if (lightCheck.triggered) {
          alerts.push({ type: "light_alert", reason: lightCheck.reason, value: reading.light, roomId: reading.roomId });
        }
      }
    }

    // 3. Xóa các cảnh báo trùng lặp (ví dụ: cùng 1 phòng, cùng 1 loại lỗi)
    const uniqueAlertsMap = new Map();
    for (const alert of alerts) {
      uniqueAlertsMap.set(alert.type, alert);
    }
    const finalAlerts = Array.from(uniqueAlertsMap.values());

    // 4. Lưu vào Database
    for (const alert of finalAlerts) {
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

    return { ok: true, reading, alerts: finalAlerts };
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