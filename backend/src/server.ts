import "./env.js"; // must precede loadConfig — it only reads process.env
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err, "failed to start");
    process.exit(1);
  }
}

void main();