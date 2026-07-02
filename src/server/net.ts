import { createServer } from "node:net";
import { existsSync } from "node:fs";

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not determine port")));
      }
    });
  });
}

export function waitForFile(path: string, timeoutMs: number, intervalMs = 100): Promise<boolean> {
  return poll(() => existsSync(path), timeoutMs, intervalMs);
}

export function waitForUrl(url: string, timeoutMs: number, intervalMs = 200): Promise<boolean> {
  return poll(
    async () => {
      try {
        await fetch(url);
        return true;
      } catch {
        return false;
      }
    },
    timeoutMs,
    intervalMs,
  );
}

async function poll(check: () => boolean | Promise<boolean>, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
