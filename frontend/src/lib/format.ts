import { ApiError } from "./api";

/** Render a movie's runtime as "2h 22m" when present. */
export function formatRuntime(minutes?: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format money in a projected ISO 4217 currency (defaults to USD). */
export function formatMoney(amount?: number, currency = "USD"): string | null {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return amount.toLocaleString("en-US");
  }
}

/** Turn an unknown thrown value into a safe, useful message. */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

/** Like errorMessage but adds rate-limit guidance when the backend said so. */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiError && err.retryAfterMs) {
    const seconds = Math.ceil(err.retryAfterMs / 1000);
    return `${err.message} Try again in about ${seconds} second${seconds === 1 ? "" : "s"}.`;
  }
  return errorMessage(err, fallback);
}