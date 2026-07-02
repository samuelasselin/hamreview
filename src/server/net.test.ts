import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findFreePort, waitForFile } from "./net";

describe("findFreePort", () => {
  it("returns a usable port number", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});

describe("waitForFile", () => {
  it("resolves true when the file appears", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flowreview-net-"));
    const target = join(dir, "signal");
    setTimeout(() => writeFileSync(target, ""), 50);
    const found = await waitForFile(target, 2000, 20);
    expect(found).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves false on timeout", async () => {
    const found = await waitForFile(join(tmpdir(), "flowreview-does-not-exist-xyz"), 100, 20);
    expect(found).toBe(false);
  });
});
