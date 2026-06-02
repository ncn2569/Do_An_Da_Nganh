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

function parseTopicList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const CONTROL_TOPIC_INDEX_MAP = {
  light: 0,
  button1: 0,
  fan: 1,
  button2: 1,
  button3: 2,
  auto_light: 2,
  auto_light_mode: 2,
  auto_lamp: 2,
  button4: 3,
  auto_fan: 3,
  auto_fan_mode: 3
};

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

function getControlTopicSequence() {
  return parseTopicList(process.env.MQTT_TOPIC_CONTROL);
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
  const topicSequence = getControlTopicSequence();
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

    const topicIndex = CONTROL_TOPIC_INDEX_MAP[candidate];
    if (typeof topicIndex === "number" && topicSequence[topicIndex]) {
      return topicSequence[topicIndex];
    }
  }

  if (topicSequence.length === 1) {
    return topicSequence[0];
  }

  return null;
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

   // OPTIMISTIC UPDATE: Cập nhật trạng thái thiết bị vào DB ngay sau khi gửi lệnh
  let newState = action;
  if (String(action).toLowerCase() === 'turn_on') newState = 'on';
  if (String(action).toLowerCase() === 'turn_off') newState = 'off';
  if (device) {
    await prisma.devices.update({
      where: { device_id: deviceId },
      data: { state: newState }
    });
  }
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

/**
 * Publish lệnh voice text thẳng lên feed HuyGia/feeds/voice
 * YoloBoard sẽ xử lý chuyển đổi thành lệnh điều khiển thiết bị tương ứng
 */
async function publishVoiceCommand(text, actor, faceUser) {
  const topic = process.env.MQTT_VOICE_TOPIC || "HuyGia/feeds/voice";
  await publishAsync(getMqttClient(), topic, text);

  // Dịch lệnh voice thành action và targetType
  const lowerText = text.toLowerCase();
  let targetType = null;
  let action = null;
  let newState = null;

  if (lowerText.includes("đèn")) {
    targetType = "light";
    if (lowerText.includes("bật") || lowerText.includes("mở") || lowerText.includes("sáng")) {
      action = "turn_on"; newState = "on";
    } else if (lowerText.includes("tắt") || lowerText.includes("tối")) {
      action = "turn_off"; newState = "off";
    }
  } else if (lowerText.includes("quạt")) {
    targetType = "fan";
    if (lowerText.includes("bật") || lowerText.includes("mở") || lowerText.includes("quay")) {
      action = "turn_on"; newState = "on";
    } else if (lowerText.includes("tắt") || lowerText.includes("ngừng")) {
      action = "turn_off"; newState = "off";
    }
  }

  if (targetType && action && newState) {
    // Lấy tất cả device có type hoặc tên chứa targetType (VD: 'light', 'fan')
    const targetDevices = await prisma.devices.findMany({
      where: {
        OR: [
          { type: { contains: targetType, mode: "insensitive" } },
          { d_name: { contains: targetType, mode: "insensitive" } }
        ]
      },
      include: {
        rooms: {
          select: { name: true }
        }
      }
    });

    const broadcast = getBroadcast();

    for (const device of targetDevices) {
      // 1. Cập nhật state
      await prisma.devices.update({
        where: { device_id: device.device_id },
        data: { state: newState }
      });

      // 2. Ghi control_log
      const event = {
        deviceId: device.device_id,
        topic: topic,
        action: action,
        source: "voice_command",
        faceUser: faceUser || null,
        publishedValue: text,
        actor: actor ? { sub: actor.sub, email: actor.email, username: actor.username } : null,
        device: {
          deviceId: device.device_id,
          name: device.d_name,
          type: device.type,
          roomId: device.r_id || null,
          roomName: device.rooms?.name || null
        },
        ts: new Date().toISOString()
      };

      await prisma.control_log.create({
        data: {
          device_id: device.device_id,
          u_id: actor?.sub || null,
          event
        }
      }).catch(() => null);

      // 3. Broadcast sự kiện để UI update tự động
      if (broadcast) {
        broadcast({
          type: "DEVICE_ACTION",
          data: {
            id: Math.random().toString(),
            deviceId: device.device_id,
            deviceName: device.d_name,
            deviceType: device.type,
            roomId: device.r_id || null,
            roomName: device.rooms?.name || null,
            action: action,
            userId: actor?.sub || null,
            userName: faceUser ? `${faceUser} (Voice)` : (actor?.username || actor?.email || "Voice Command"),
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  }
}

module.exports = { listDevices, findDevice, updateDevice, controlDevice, getControlHistory, publishVoiceCommand };
