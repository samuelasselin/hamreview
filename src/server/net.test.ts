import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { findFreePort, waitForFile, waitForUrl } from "./net";

describe("findFreePort", () => {
  it("returns a usable port number", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});

describe("waitForFile", () => {
  it("resolves true when the file appears", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hamreview-net-"));
    const target = join(dir, "signal");
    setTimeout(() => writeFileSync(target, ""), 50);
    const found = await waitForFile(target, 2000, 20);
    expect(found).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves false on timeout", async () => {
    const found = await waitForFile(join(tmpdir(), "hamreview-does-not-exist-xyz"), 100, 20);
    expect(found).toBe(false);
  });
});

describe("waitForUrl", () => {
  it("resolves true when the server responds", async () => {
    const srv = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const addr = srv.address();
    const port = addr && typeof addr === "object" ? addr.port : 0;
    const ok = await waitForUrl(`http://127.0.0.1:${port}`, 2000, 20);
    expect(ok).toBe(true);
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });

  it("resolves false when nothing responds before the timeout", async () => {
    const ok = await waitForUrl("http://127.0.0.1:1", 200, 50);
    expect(ok).toBe(false);
  });
});
