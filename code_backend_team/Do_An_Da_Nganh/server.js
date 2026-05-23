"use strict";

require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = require("./src/app");
const { connectDb, disconnectDb } = require("./src/config/database");
const { initWebSocketServer } = require("./src/iot/wsHandler");
const { initMqtt } = require("./src/iot/mqttHandler");
const logger = require("./src/utils/logger");

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }

  const v = String(raw).toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function startAiServerIfEnabled() {
  if (!envFlag("REQUIRE_AI", false)) {
    logger.info("AI server disabled (REQUIRE_AI=false)");
    return null;
  }

  logger.info("Starting AI FastAPI server...");

  const preferredPython = path.resolve(__dirname, "ai_sever", "venv", "Scripts", "python.exe");
  const fallbackPython = path.resolve(__dirname, "..", "..", ".venv", "Scripts", "python.exe");
  const pythonExecutable = fs.existsSync(preferredPython) ? preferredPython : fallbackPython;
  const command = pythonExecutable;
  const args = ["-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"];

  const child = spawn(command, args, {
    cwd: "./ai_sever",
    shell: false,
    stdio: "inherit",
  });

  child.on("error", (err) => {
    logger.warn({ err }, "AI server failed to start");
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      logger.warn({ code }, "AI server exited");
    }
  });

  return child;
}

async function main() {
  const port = Number(process.env.PORT || 3001);
  const requireDb = envFlag("REQUIRE_DB");
  const requireMqtt = envFlag("REQUIRE_MQTT");
  const pythonServer = startAiServerIfEnabled();

  if (requireDb) {
    try {
      await connectDb();
    } catch (err) {
      logger.warn({ err }, "Database connect failed");
      throw err;
    }
  } else {
    logger.info("Database disabled (REQUIRE_DB=false)");
  }

  const server = http.createServer(app);
  const { broadcast } = initWebSocketServer(server);

  if (requireMqtt) {
    try {
      if (!process.env.MQTT_URL) {
        throw new Error("Missing MQTT_URL");
      }
      initMqtt({ broadcast });
    } catch (err) {
      logger.warn({ err }, "MQTT init failed");
      throw err;
    }
  } else {
    logger.info("MQTT disabled (REQUIRE_MQTT=false)");
  }

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  const shutdown = async () => {
    logger.info("Shutting down");

    if (pythonServer && !pythonServer.killed) {
      try {
        pythonServer.kill("SIGTERM");
      } catch (err) {
        logger.warn({ err }, "AI server shutdown failed");
      }
    }

    try {
      await disconnectDb();
    } catch (err) {
      logger.warn({ err }, "DB disconnect failed");
    }

    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
