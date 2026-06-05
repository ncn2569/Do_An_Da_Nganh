"use strict";

const { connectMqtt } = require("../config/mqtt");
const logger = require("../utils/logger");
const environmentService = require("../services/environment.service");

const METRIC_ALIASES = {
  temperature: ["temperature", "temp", "nhietdo", "nhiet-do"],
  humidity: ["humidity", "humid", "doam", "do-am"],
  light: ["light", "bright", "brightness", "anhsang", "anh-sang"],
  gas: ["gas", "gas_level", "smoke", "co2"]
};

function toNumberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseTopicList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMetricName(input) {
  const normalized = String(input || "").toLowerCase();

  for (const [metric, aliases] of Object.entries(METRIC_ALIASES)) {
    if (aliases.includes(normalized)) {
      return metric;
    }
  }

  return null;
}

function getFeedMetricMap() {
  const mapping = {};

  for (const aliases of Object.values(METRIC_ALIASES)) {
    for (const alias of aliases) {
      mapping[alias] = normalizeMetricName(alias);
    }
  }

  if (!process.env.MQTT_SENSOR_MAP) {
    return mapping;
  }

  try {
    const customMap = JSON.parse(process.env.MQTT_SENSOR_MAP);
    for (const [feedKey, metricName] of Object.entries(customMap)) {
      const normalizedMetric = normalizeMetricName(metricName);
      if (normalizedMetric) {
        mapping[String(feedKey).toLowerCase()] = normalizedMetric;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Invalid MQTT_SENSOR_MAP, using default mapping");
  }

  return mapping;
}

function normalizeEnvironmentPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const timestamp = raw.ts || raw.timestamp || new Date().toISOString();
  const temperature = toNumberOrNull(raw.temperature ?? raw.temp);
  const humidity = toNumberOrNull(raw.humidity ?? raw.humid);
  const light = toNumberOrNull(raw.light ?? raw.bright ?? raw.brightness);
  const gas = toNumberOrNull(raw.gas ?? raw.gas_level ?? raw.smoke);

  const hasEnvironmentFields =
    temperature !== null || humidity !== null || light !== null || gas !== null;

  if (!hasEnvironmentFields) {
    return null;
  }

  return {
    kind: "environment",
    deviceId: raw.deviceId || raw.device_id || process.env.MQTT_DEVICE_ID || null,
    roomId: raw.roomId || raw.room_id || raw.r_id || process.env.MQTT_ROOM_ID || null,
    temperature,
    humidity,
    light,
    gas,
    ts: timestamp,
    raw
  };
}

function normalizeSingleSensorPayload({ metricName, raw, fallbackValue }) {
  const value =
    toNumberOrNull(raw?.value) ??
    toNumberOrNull(raw?.data) ??
    toNumberOrNull(raw?.last_value) ??
    toNumberOrNull(fallbackValue);

  if (!metricName || value === null) {
    return null;
  }

  const sensorId = raw?.sensorId || raw?.sensor_id || metricName;

  return {
    kind: "single",
    sensorId,
    value,
    unit: raw?.unit || null,
    deviceId: raw?.deviceId || raw?.device_id || process.env.MQTT_DEVICE_ID || null,
    roomId: raw?.roomId || raw?.room_id || raw?.r_id || process.env.MQTT_ROOM_ID || null,
    ts: raw?.ts || raw?.timestamp || new Date().toISOString(),
    raw: raw && typeof raw === "object" ? raw : { value, metricName }
  };
}

function normalizeTelemetry({ topic, payloadText, sensorMap }) {
  let parsed;

  try {
    parsed = JSON.parse(payloadText);
  } catch (err) {
    parsed = payloadText;
  }

  const environmentPayload = normalizeEnvironmentPayload(parsed);
  if (environmentPayload) {
    return environmentPayload;
  }

  const feedMatch = topic.match(/\/feeds\/([^/]+)$/i);
  const feedKey = feedMatch?.[1] ? String(feedMatch[1]).toLowerCase() : null;
  const metricFromTopic = feedKey ? sensorMap[feedKey] : null;

  if (metricFromTopic) {
    return normalizeSingleSensorPayload({
      metricName: metricFromTopic,
      raw: typeof parsed === "object" && parsed !== null ? parsed : null,
      fallbackValue: payloadText
    });
  }

  if (parsed && typeof parsed === "object") {
    const sensorId = parsed.sensorId || parsed.sensor_id || feedKey;
    const metricFromPayload = sensorId ? sensorMap[String(sensorId).toLowerCase()] : null;

    if (metricFromPayload) {
      return normalizeSingleSensorPayload({
        metricName: metricFromPayload,
        raw: parsed,
        fallbackValue: payloadText
      });
    }
  }

  return null;
}

function matchesTopic(subscribedTopic, actualTopic) {
  const escaped = subscribedTopic
    .split("/")
    .map((segment) => {
      if (segment === "+") {
        return "[^/]+";
      }

      if (segment === "#") {
        return ".*";
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return new RegExp(`^${escaped}$`).test(actualTopic);
}

function initMqtt({ broadcast }) {
  const client = connectMqtt();
  const telemetryTopics = parseTopicList(process.env.MQTT_TOPIC_TELEMETRY);
  const topics = telemetryTopics.length > 0 ? telemetryTopics : ["yolohome/telemetry"];
  const sensorMap = getFeedMetricMap();

  client.on("connect", () => {
    for (const topic of topics) {
      client.subscribe(topic, (err) => {
        if (err) {
          logger.error({ err, topic }, "MQTT subscribe failed");
        } else {
          logger.info({ topic }, "MQTT subscribed");
        }
      });
    }
  });

  client.on("message", async (topic, payloadBuffer) => {
    if (!topics.some((subscribedTopic) => matchesTopic(subscribedTopic, topic))) {
      return;
    }

    if (payloadBuffer.length > 10_000) {
      logger.warn("Payload too large, ignored");
      return;
    }

    const payloadText = payloadBuffer.toString("utf8");
    const telemetry = normalizeTelemetry({ topic, payloadText, sensorMap });

    if (!telemetry) {
      logger.warn(
        { topic, payload: payloadText },
        "Ignored invalid telemetry"
      );
      return;
    }

    try {
      await environmentService.saveTelemetry(telemetry);
    } catch (err) {
      logger.error({ err, telemetry }, "Failed to save telemetry");
    }

    if (typeof broadcast === "function") {
      try {
        broadcast({
          type: "telemetry",
          topic,
          data: telemetry
        });
      } catch (err) {
        logger.error({ err }, "WS broadcast failed");
      }
    }
  });

  return client;
}

module.exports = { initMqtt };
