import { createServer, type Server } from "http";
import { createLogger } from "@interviewed/config";

const logger = createLogger("worker-health");

export type HealthServer = {
  server: Server;
  setReady: (ready: boolean) => void;
  close: () => Promise<void>;
};

export function startHealthServer(port: number): HealthServer {
  let ready = false;

  const server = createServer((_req, res) => {
    const body = JSON.stringify({
      status: ready ? "ok" : "starting",
      service: "worker",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks: ready ? { rabbitmq: "ready" } : { rabbitmq: "connecting" },
    });
    res.writeHead(ready ? 200 : 503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`Worker health endpoint listening on http://localhost:${port}/health`);
  });

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { server, setReady: (value: boolean) => { ready = value; }, close };
}