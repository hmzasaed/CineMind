import { appFromEnv } from "./app.js";

async function main(): Promise<void> {
  const app = await appFromEnv();
  const port = app.server.address()?.port ?? Number(process.env.BACKEND_PORT ?? 3000);
  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err, "failed to start");
    process.exit(1);
  }
}

void main();