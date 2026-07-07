import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { openBrowser } from "./browser";

function fakeSpawn(outcome: "spawn" | "error") {
  const calls: { cmd: string; args: string[] }[] = [];
  const impl = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    queueMicrotask(() => child.emit(outcome, outcome === "error" ? new Error("ENOENT") : undefined));
    return child;
  }) as unknown as typeof import("node:child_process").spawn;
  return { impl, calls };
}

describe("openBrowser", () => {
  it("resolves true when the opener spawns", async () => {
    const { impl, calls } = fakeSpawn("spawn");
    await expect(openBrowser("http://x", "darwin", impl)).resolves.toBe(true);
    expect(calls[0]).toEqual({ cmd: "open", args: ["http://x"] });
  });

  it("resolves false (does not throw) when no opener exists", async () => {
    const { impl } = fakeSpawn("error");
    await expect(openBrowser("http://x", "linux", impl)).resolves.toBe(false);
  });

  it("picks the platform-appropriate command", async () => {
    const linux = fakeSpawn("spawn");
    await openBrowser("http://x", "linux", linux.impl);
    expect(linux.calls[0].cmd).toBe("xdg-open");
    const win = fakeSpawn("spawn");
    await openBrowser("http://x", "win32", win.impl);
    expect(win.calls[0]).toEqual({ cmd: "cmd", args: ["/c", "start", "", "http://x"] });
  });
});
