import pino from "pino";
import type { FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config.js";

/**
 * Fastify logger options (Fastify v5 configures its own pino instance).
 * Secrets are redacted so they never reach logs.
 */
export function loggerOptions(config: AppConfig): NonNullable<FastifyServerOptions["logger"]> {
  return {
    level: config.logLevel,
    base: { service: "cinemind-backend" },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "*.apiKey", "*.secret", "*.token"],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/** The slice of logger surface the app needs; satisfied by Fastify's logger. */
export interface Logger {
  info(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}