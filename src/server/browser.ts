import { spawn } from "node:child_process";

/**
 * Best-effort browser open. Resolves false instead of ever throwing or
 * crashing: the error listener is attached BEFORE unref, unlike the `open`
 * package, whose unhandled 'error' event can take down the process in
 * headless environments.
 */
export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
): Promise<boolean> {
  const spec =
    platform === "darwin"
      ? { cmd: "open", args: [url] }
      : platform === "win32"
        ? { cmd: "cmd", args: ["/c", "start", "", url] }
        : { cmd: "xdg-open", args: [url] };
  return new Promise((done) => {
    try {
      const child = spawnImpl(spec.cmd, spec.args, { stdio: "ignore", detached: true });
      child.once("error", () => done(false));
      child.once("spawn", () => {
        child.unref();
        done(true);
      });
    } catch {
      done(false);
    }
  });
}
