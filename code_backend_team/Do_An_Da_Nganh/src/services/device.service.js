"use strict";

const { prisma } = require("../config/database");
const { connectMqtt } = require("../config/mqtt");
const { getBroadcast } = require("../iot/wsHandler");

let mqttClient;

function getMqttClient() {
  if (!mqttClient) mqttClient = connectMqtt();
  return mqttClient;
}

function publishAsync(client, topic, message) {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function parseJsonMap(value) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function getControlTopicMap() {
  const rawMap = parseJsonMap(process.env.MQTT_CONTROL_TOPIC_MAP);
  const normalized = {};

  for (const [key, value] of Object.entries(rawMap)) {
    normalized[String(key).toLowerCase()] = value;
  }

  return normalized;
}

function getControlValueMap() {
  const rawMap = parseJsonMap(process.env.MQTT_CONTROL_VALUE_MAP);
  const normalized = {};

  for (const [key, value] of Object.entries(rawMap)) {
    normalized[String(key).toLowerCase()] = String(value);
  }

  return normalized;
}

async function listDevices() {
  return prisma.devices.findMany({
    orderBy: { device_id: "asc" }
  });
}

async function findDevice(deviceId) {
  return prisma.devices.findUnique({
    where: { device_id: deviceId },
    include: {
      rooms: {
        select: {
          r_id: true,
          name: true,
          room_type: true
        }
      }
    }
  });
}

async function updateDevice({ deviceId, data = {} } = {}) {
  if (!deviceId) throw new Error("deviceId is required");

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(data, "r_id")) {
    payload.r_id = data.r_id || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, "d_name") && data.d_name) {
    payload.d_name = String(data.d_name).trim();
  }

  if (Object.prototype.hasOwnProperty.call(data, "type") && data.type) {
    payload.type = String(data.type).trim();
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No updatable device fields provided");
  }

  return prisma.devices.update({
    where: { device_id: deviceId },
    data: payload
  });
}

function resolveControlTopic({ deviceId, device }) {
  const topicMap = getControlTopicMap();
  const candidates = [
    deviceId,
    device?.type,
    device?.d_name
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  for (const candidate of candidates) {
    if (topicMap[candidate]) {
      return topicMap[candidate];
    }
  }

  return process.env.MQTT_TOPIC_CONTROL || null;
}

function resolveControlValue({ action, payload }) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.value !== undefined &&
    payload.value !== null
  ) {
    return String(payload.value);
  }

  const actionMap = getControlValueMap();
  const mapped = actionMap[String(action).toLowerCase()];

  if (mapped !== undefined) {
    return mapped;
  }

  if (typeof payload === "string" || typeof payload === "number") {
    return String(payload);
  }

  return JSON.stringify({
    action,
    payload: payload ?? null
  });
}

async function controlDevice({ deviceId, action, payload, actor }) {
  if (!deviceId) throw new Error("deviceId is required");
  if (!action) throw new Error("action is required");

  const device = await findDevice(deviceId);
  const topic = resolveControlTopic({ deviceId, device });

  if (!topic) {
    throw new Error("No control topic configured for this device");
  }

  const value = resolveControlValue({ action, payload });

  await publishAsync(getMqttClient(), topic, value);

  const event = {
    deviceId,
    topic,
    action,
    publishedValue: value,
    payload: payload ?? null,
    actor: actor ? { sub: actor.sub, email: actor.email, username: actor.username } : null,
    device: device ? {
      deviceId: device.device_id,
      name: device.d_name,
      type: device.type,
      roomId: device.r_id || null,
      roomName: device.rooms?.name || null
    } : null,
    ts: new Date().toISOString()
  };

  if (device) {
    await prisma.control_log.create({
      data: {
        device_id: deviceId,
        u_id: actor?.sub || null,
        event
      }
    }).catch(() => null);
  }
  
  const broadcast = getBroadcast();
  if (broadcast) {
    broadcast({ 
      type: "DEVICE_ACTION", 
      data: {
        id: Math.random().toString(), // ID tạm thời để UI render
        deviceId,
        deviceName: device?.d_name || deviceId,
        deviceType: device?.type || null,
        roomId: device?.r_id || null,
        roomName: device?.rooms?.name || null,
        action: action,
        userId: actor?.sub || null,
        userName: actor?.username || actor?.email || "Ai đó",
        timestamp: new Date().toISOString()
      } 
    });
  }


  return {
    ok: true,
    topic,
    value
  };
}

/**
 * Lấy lịch sử điều khiển device
 */
async function getControlHistory({ deviceId = null, userId = null, roomId = null, limit = 100, from = null, to = null } = {}) {
  const where = {};

  if (deviceId) {
    where.device_id = deviceId;
  }

  if (userId) {
    where.u_id = userId;
  }

  if (roomId) {
    where.devices = { r_id: roomId };
  }

  if (from || to) {
    where.time = {};
    if (from) where.time.gte = from;
    if (to) where.time.lte = to;
  }

  const numLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  return prisma.control_log.findMany({
    where,
    take: numLimit,
    orderBy: { time: "desc" },
    include: {
      devices: {
        select: {
          device_id: true,
          d_name: true,
          type: true,
          r_id: true,
          rooms: {
            select: {
              r_id: true,
              name: true,
              room_type: true
            }
          }
        }
      },
      users: { select: { u_id: true, username: true, email: true } }
    }
  });
}

module.exports = { listDevices, findDevice, updateDevice, controlDevice, getControlHistory };
