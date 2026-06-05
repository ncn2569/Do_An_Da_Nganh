"use strict";

const express = require("express");
const { authMiddleware } = require("../middlewares/auth.middleware");
const environmentController = require("../controllers/environment.controller");
const thresholdController = require("../controllers/threshold.controller");
const thresholdRoutes = require("./threshold.routes");

const router = express.Router();

// Environment sensor data
router.get("/", authMiddleware, environmentController.listLatest);
router.get("/latest", authMiddleware, environmentController.latest);
router.get("/snapshot", authMiddleware, environmentController.snapshot);
router.get("/history", authMiddleware, environmentController.history);
router.get("/rooms", authMiddleware, environmentController.rooms);
router.post("/rooms", authMiddleware, environmentController.createRoom);
router.get("/rooms/latest", authMiddleware, environmentController.latestByRoom);

// Alerts
router.get("/alerts", authMiddleware, thresholdController.listAlerts);
router.post("/alerts", authMiddleware, thresholdController.createAlert);
router.delete("/alerts/:alertId", authMiddleware, thresholdController.deleteAlert);

// Thresholds
router.use("/settings/thresholds", thresholdRoutes);

module.exports = router;
