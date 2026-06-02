"use strict";

const deviceService = require("../services/device.service");
const { getBroadcast } = require("../iot/wsHandler");
const { prisma } = require("../config/database");

async function list(req, res, next) {
  try {
    const devices = await deviceService.listDevices();
    res.json({ devices });
  } catch (err) {
    next(err);
  }
}

async function control(req, res, next) {
  try {
    const deviceId = req.params.id;
    const { action, payload } = req.body || {};

    if (!action) {
      return res.status(400).json({ ok: false, error: "action is required" });
    }

    const result = await deviceService.controlDevice({ deviceId, action, payload, actor: req.user });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function controlHistory(req, res, next) {
  try {
    const deviceId = req.params.id;
    const limit = req.query.limit || 100;
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const history = await deviceService.getControlHistory({
      deviceId,
      limit,
      from: from && !isNaN(from) ? from : null,
      to: to && !isNaN(to) ? to : null
    });

    res.json({
      deviceId,
      count: history.length,
      data: history
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const deviceId = req.params.id;
    const device = await deviceService.updateDevice({ deviceId, data: req.body || {} });
    res.json({ device });
  } catch (err) {
    next(err);
  }
}

async function faceAccessWebhook(req, res, next) {
  try {
    const payload = req.body;
    
    if (payload.action === "voice_grant") {
      // Phát sóng WebSocket lên UI để Frontend cấp quyền voice control
      const broadcast = getBroadcast();
      if (broadcast) {
        broadcast({ type: "VOICE_GRANTED", data: payload });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function globalControlHistory(req, res, next) {
  try {
    const limit = req.query.limit || 50;
    const deviceId = req.query.deviceId || null;
    const userId = req.query.userId || null;
    const roomId = req.query.roomId || null;
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const history = await deviceService.getControlHistory({
      limit,
      deviceId,
      userId,
      roomId,
      from: from && !isNaN(from) ? from : null,
      to: to && !isNaN(to) ? to : null
    });
    res.json({ count: history.length, data: history });
  } catch (err) {
    next(err);
  }
}


async function voiceCommand(req, res, next) {
  try {
    const { text, faceUser } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "text is required" });
    }

    await deviceService.publishVoiceCommand(text.trim(), req.user, faceUser);

    res.json({ ok: true, text });
  } catch (err) {
    next(err);
  }
}

async function getAISuggestions(req, res, next) {
  try {
    // 1. Lấy dữ liệu cảm biến mới nhất mà KHÔNG BỊ NULL từ DB
    const [latestTemp, latestHum, latestBright, latestGas] = await Promise.all([
      prisma.environment.findFirst({ where: { temp: { not: null } }, orderBy: { time_created: 'desc' } }),
      prisma.environment.findFirst({ where: { humidity: { not: null } }, orderBy: { time_created: 'desc' } }),
      prisma.environment.findFirst({ where: { bright: { not: null } }, orderBy: { time_created: 'desc' } }),
      prisma.environment.findFirst({ where: { gas_level: { not: null } }, orderBy: { time_created: 'desc' } })
    ]);

    const currentEnv = {
      temperature: latestTemp ? latestTemp.temp : 25.0,
      humidity: latestHum ? latestHum.humidity : 50.0,
      brightness: latestBright ? latestBright.bright : 50.0,
      gas_level: latestGas ? latestGas.gas_level : 0.0
    };

    // 2. Gửi dữ liệu qua Python FastAPI AI Server (Cổng 8000)
    const response = await fetch("http://127.0.0.1:8000/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentEnv)
    });

    if (!response.ok) {
      throw new Error(`AI Server Error: ${response.status}`);
    }

    const aiData = await response.json();

    // 3. Trả về cho Client App
    res.json({
      ok: true,
      currentEnvironment: currentEnv,
      suggestions: aiData.suggestions,
      reasons: aiData.reasons || {}
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, update, control, controlHistory, faceAccessWebhook, voiceCommand, globalControlHistory, getAISuggestions };
