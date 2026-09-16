import pino from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.logLevel,
    base: { service: "cinemind-backend" },
    // Redact anything that could look like a secret so it never hits logs.
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "*.apiKey", "*.secret", "*.token"],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;