import { getErrorMessage } from "../util.js";

/** Same convention as services/ingestion.ts's postgrestError. */
export function postgrestError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${getErrorMessage(error.message)}`);
}
