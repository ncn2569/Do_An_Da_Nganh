"use strict";

const { prisma } = require("../config/database");
const logger = require("../utils/logger");
const ruleEngine = require("./ruleEngine.service");

async function saveTelemetry(telemetry) {
  if (!telemetry || typeof telemetry !== "object") {
    throw new Error("telemetry is required");
  }

  let saved;

  if (telemetry.kind === "environment") {
    saved = await saveEnvironmentReading(telemetry);
  } else if (telemetry.kind === "single") {
    saved = await saveSingleReadingAsEnvironment(telemetry);
  } else {
    throw new Error(`Unsupported telemetry kind: ${telemetry.kind}`);
  }

  try {
    await ruleEngine.evaluateReading(telemetry);
  } catch (err) {
    logger.error({ err, telemetry }, "Failed to evaluate telemetry threshold rules");
  }

  return saved;
}

async function resolveRoomId({ roomId, deviceId }) {
  if (roomId) return roomId;
  if (!deviceId) return null;

  const device = await prisma.devices.findUnique({
    where: { device_id: deviceId },
    select: { r_id: true }
  });

  return device?.r_id || null;
}

async function saveEnvironmentReading(reading) {
  const {
    roomId = null,
    deviceId = null,
    temperature = null,
    humidity = null,
    light = null,
    gas = null
  } = reading;

  const hasAtLeastOneValue =
    typeof temperature === "number" ||
    typeof humidity === "number" ||
    typeof light === "number" ||
    typeof gas === "number";

  if (!hasAtLeastOneValue) {
    throw new Error("At least one environment value is required");
  }

  const r_id = await resolveRoomId({ roomId, deviceId });

  return prisma.environment.create({
    data: {
      r_id,
      temp: typeof temperature === "number" ? temperature : null,
      humidity: typeof humidity === "number" ? humidity : null,
      bright: typeof light === "number" ? light : null,
      gas_level: typeof gas === "number" ? gas : null
    }
  });
}

async function saveSingleReadingAsEnvironment(reading) {
  const { sensorId, value, deviceId = null, roomId = null, raw = null } = reading;

  if (!sensorId || typeof value !== "number") {
    throw new Error("Invalid single telemetry");
  }

  const normalizedKey = String(sensorId).toLowerCase();
  const data = {
    temp: null,
    humidity: null,
    bright: null,
    gas_level: null
  };

  if (normalizedKey.includes("temp")) {
    data.temp = value;
  } else if (normalizedKey.includes("humid")) {
    data.humidity = value;
  } else if (normalizedKey.includes("light") || normalizedKey.includes("bright")) {
    data.bright = value;
  } else if (normalizedKey.includes("gas") || normalizedKey.includes("smoke")) {
    data.gas_level = value;
  } else {
    logger.warn(
      { reading, raw },
      "Cannot map single telemetry to environment columns"
    );
    throw new Error("Unsupported single telemetry sensor mapping");
  }

  const r_id = await resolveRoomId({ roomId, deviceId });

  return prisma.environment.create({
    data: {
      r_id,
      ...data
    }
  });
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  if (typeof max === "number") {
    return Math.min(parsed, max);
  }

  return parsed;
}

function buildEnvironmentWhere({ roomId = null, from = null, to = null } = {}) {
  const where = {};

  if (roomId) {
    where.r_id = roomId;
  }

  if (from || to) {
    where.time_created = {};

    if (from) {
      where.time_created.gte = from;
    }

    if (to) {
      where.time_created.lte = to;
    }
  }

  return where;
}

async function getLatestReadings({ limit = 50, roomId = null } = {}) {
  return prisma.environment.findMany({
    where: buildEnvironmentWhere({ roomId }),
    take: parsePositiveInt(limit, 50, 200),
    orderBy: { time_created: "desc" },
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

async function getLatestReading({ roomId = null } = {}) {
  const [latest] = await getLatestReadings({ limit: 1, roomId });
  return latest || null;
}

async function getReadingHistory({
  roomId = null,
  limit = 100,
  from = null,
  to = null
} = {}) {
  return prisma.environment.findMany({
    where: buildEnvironmentWhere({ roomId, from, to }),
    take: parsePositiveInt(limit, 100, 10000),
    orderBy: { time_created: "desc" },
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

async function getLatestReadingsByRoom({ scanLimit = 500 } = {}) {
  const readings = await prisma.environment.findMany({
    take: parsePositiveInt(scanLimit, 500, 2000),
    orderBy: { time_created: "desc" },
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

  const seenRoomIds = new Set();
  const latestByRoom = [];

  for (const reading of readings) {
    const roomKey = reading.r_id || "__unassigned__";

    if (seenRoomIds.has(roomKey)) {
      continue;
    }

    seenRoomIds.add(roomKey);
    latestByRoom.push(reading);
  }

  return latestByRoom;
}

async function listRooms() {
  return prisma.rooms.findMany({
    orderBy: { name: "asc" },
    select: {
      r_id: true,
      name: true,
      room_type: true,
      u_id: true
    }
  });
}

async function createRoom({ name, roomType, userId = null } = {}) {
  const trimmedName = String(name || "").trim();
  const trimmedRoomType = String(roomType || "").trim();

  if (!trimmedName) {
    throw new Error("room name is required");
  }

  if (!trimmedRoomType) {
    throw new Error("room_type is required");
  }

  return prisma.rooms.create({
    data: {
      name: trimmedName,
      room_type: trimmedRoomType,
      u_id: userId || null
    },
    select: {
      r_id: true,
      name: true,
      room_type: true,
      u_id: true
    }
  });
}

async function getLatestSnapshot({ roomId = null, scanLimit = 200 } = {}) {
  const readings = await prisma.environment.findMany({
    where: buildEnvironmentWhere({ roomId }),
    take: parsePositiveInt(scanLimit, 200, 1000),
    orderBy: { time_created: "desc" },
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

  const snapshot = {
    room: readings[0]?.rooms || null,
    temperature: null,
    humidity: null,
    light: null,
    gas: null
  };

  for (const reading of readings) {
    if (snapshot.temperature === null && typeof reading.temp === "number") {
      snapshot.temperature = {
        value: reading.temp,
        capturedAt: reading.time_created,
        sourceReadingId: reading.en_id
      };
    }

    if (snapshot.humidity === null && typeof reading.humidity === "number") {
      snapshot.humidity = {
        value: reading.humidity,
        capturedAt: reading.time_created,
        sourceReadingId: reading.en_id
      };
    }

    if (snapshot.light === null && typeof reading.bright === "number") {
      snapshot.light = {
        value: reading.bright,
        capturedAt: reading.time_created,
        sourceReadingId: reading.en_id
      };
    }

    if (snapshot.gas === null && typeof reading.gas_level === "number") {
      snapshot.gas = {
        value: reading.gas_level,
        capturedAt: reading.time_created,
        sourceReadingId: reading.en_id
      };
    }

    if (
      snapshot.temperature &&
      snapshot.humidity &&
      snapshot.light &&
      snapshot.gas
    ) {
      break;
    }
  }

  return snapshot;
}

module.exports = {
  saveTelemetry,
  saveEnvironmentReading,
  saveSingleReadingAsEnvironment,
  getLatestReadings,
  getLatestReading,
  getReadingHistory,
  getLatestReadingsByRoom,
  listRooms,
  createRoom,
  getLatestSnapshot
};
