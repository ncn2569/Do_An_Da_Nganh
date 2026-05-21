"use strict";

const express = require("express");
const { authMiddleware } = require("../middlewares/auth.middleware");
const deviceController = require("../controllers/device.controller");

const router = express.Router();

router.get("/", authMiddleware, deviceController.list);
router.put("/:id", authMiddleware, deviceController.update);
router.post("/:id/control", authMiddleware, deviceController.control);
router.get("/history/all", authMiddleware, deviceController.globalControlHistory);
router.get("/:id/history", authMiddleware, deviceController.controlHistory);
router.post("/face-access", deviceController.faceAccessWebhook);
module.exports = router;
