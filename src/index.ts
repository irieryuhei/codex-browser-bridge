import { startBridgeServer } from "./bridge-server.js";
import { createCodexSessionFactory } from "./codex-process.js";

async function main(): Promise<void> {
  const port = parseIntegerEnv(process.env.PORT) ?? parseIntegerEnv(process.env.BRIDGE_PORT) ?? 8765;
  const host = process.env.HOST ?? process.env.BRIDGE_HOST ?? "0.0.0.0";

  const server = await startBridgeServer({
    port,
    host,
    codexFactory: createCodexSessionFactory(),
  });

  console.log(`[bridge] Listening on http://${host}:${server.port}`);
  console.log(`[bridge] Viewer: http://127.0.0.1:${server.port}/`);
  console.log(`[bridge] Health: http://127.0.0.1:${server.port}/health`);

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

function parseIntegerEnv(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

void main().catch((error) => {
  console.error("[bridge] Failed to start:", error);
  process.exit(1);
});
