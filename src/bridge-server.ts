import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { renderViewerHtml } from "./viewer-html.js";

export interface CodexSession {
  sendInput(text: string): void;
  interrupt(): void;
  onMessage(listener: (message: Record<string, unknown>) => void): void;
  stop(): void;
}

export interface CodexSessionFactory {
  startSession(options: {
    projectPath: string;
    unrestricted: boolean;
  }): Promise<CodexSession>;
}

export interface BridgeServer {
  port: number;
  close(): Promise<void>;
}

interface StartBridgeServerOptions {
  port: number;
  host?: string;
  codexFactory: CodexSessionFactory;
}

type ClientMessage =
  | { type: "start"; projectPath: string }
  | { type: "input"; text: string }
  | { type: "interrupt" };

interface ActiveSession {
  id: string;
  projectPath: string;
  codexSession: CodexSession;
}

export async function startBridgeServer(
  options: StartBridgeServerOptions,
): Promise<BridgeServer> {
  const host = options.host ?? "127.0.0.1";
  const activeSessions = new Map<WebSocket, ActiveSession>();

  const stopActiveSession = (ws: WebSocket): void => {
    const active = activeSessions.get(ws);
    if (!active) {
      return;
    }
    active.codexSession.stop();
    activeSessions.delete(ws);
  };

  const httpServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderViewerHtml());
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      const message = parseClientMessage(String(raw));
      if (!message) {
        send(ws, { type: "error", message: "Invalid message format" });
        return;
      }

      if (message.type === "start") {
        const projectPath = message.projectPath.trim();
        if (!projectPath) {
          send(ws, { type: "error", message: "Project path is required." });
          return;
        }

        stopActiveSession(ws);

        try {
          const codexSession = await options.codexFactory.startSession({
            projectPath,
            unrestricted: true,
          });

          if (ws.readyState !== WebSocket.OPEN) {
            codexSession.stop();
            return;
          }

          const session: ActiveSession = {
            id: randomUUID().slice(0, 8),
            projectPath,
            codexSession,
          };
          activeSessions.set(ws, session);
          codexSession.onMessage((serverMessage) => {
            const active = activeSessions.get(ws);
            if (!active || active.id !== session.id) {
              return;
            }
            send(ws, serverMessage);
          });

          send(ws, {
            type: "system",
            subtype: "session_created",
            sessionId: session.id,
            projectPath,
          });
          send(ws, { type: "status", status: "idle" });
        } catch (error) {
          send(ws, {
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const active = activeSessions.get(ws);
      if (!active) {
        send(ws, { type: "error", message: "No active session. Send 'start' first." });
        return;
      }

      if (message.type === "input") {
        const text = message.text.trim();
        if (!text) {
          send(ws, { type: "error", message: "Prompt text is required." });
          return;
        }

        send(ws, { type: "user", text });
        active.codexSession.sendInput(text);
        return;
      }

      if (message.type === "interrupt") {
        active.codexSession.interrupt();
      }
    });

    ws.on("close", () => {
      stopActiveSession(ws);
    });
  });

  await listen(httpServer, options.port, host);
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine listening port");
  }

  return {
    port: address.port,
    async close() {
      for (const session of activeSessions.values()) {
        session.codexSession.stop();
      }
      activeSessions.clear();
      for (const client of wss.clients) {
        client.close();
      }
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          wss.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
      ]);
    },
  };
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.type === "start" && typeof data.projectPath === "string") {
      return { type: "start", projectPath: data.projectPath };
    }
    if (data.type === "input" && typeof data.text === "string") {
      return { type: "input", text: data.text };
    }
    if (data.type === "interrupt") {
      return { type: "interrupt" };
    }
    return null;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

async function listen(server: HttpServer, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", reject);
  });
}
