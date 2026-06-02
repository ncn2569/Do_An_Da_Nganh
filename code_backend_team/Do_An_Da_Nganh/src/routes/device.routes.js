"use strict";

const express = require("express");
const { authMiddleware } = require("../middlewares/auth.middleware");
const deviceController = require("../controllers/device.controller");

const router = express.Router();

function createControlAlias(deviceId) {
	return (req, res, next) => {
		req.params.id = deviceId;
		return deviceController.control(req, res, next);
	};
}

router.get("/", authMiddleware, deviceController.list);
router.put("/:id", authMiddleware, deviceController.update);
router.post("/:id/control", authMiddleware, deviceController.control);
router.post("/button3/control", authMiddleware, createControlAlias("button3"));
router.post("/button4/control", authMiddleware, createControlAlias("button4"));
router.get("/history/all", authMiddleware, deviceController.globalControlHistory);
router.get("/:id/history", authMiddleware, deviceController.controlHistory);
router.get("/ai-suggest", authMiddleware, deviceController.getAISuggestions);
router.post("/face-access", deviceController.faceAccessWebhook);
router.post("/voice-command", authMiddleware, deviceController.voiceCommand);
module.exports = router;
