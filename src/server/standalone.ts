import { join } from "node:path";

/** Absolute path to the built standalone server, given the package root. */
export function standaloneServerPath(packageRoot: string): string {
  return join(packageRoot, ".next", "standalone", "server.js");
}

export interface ServerSpawnSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Build the spawn spec for the review server: run `node` against the
 * standalone server, binding it to a free port on localhost and passing the
 * HAMREVIEW_* env the API routes read at request time.
 */
export function serverSpawnSpec(opts: {
  execPath: string;
  packageRoot: string;
  port: number;
  handoffPath: string;
  feedbackOut: string;
  donePath: string;
  token: string;
  baseEnv: NodeJS.ProcessEnv;
}): ServerSpawnSpec {
  return {
    command: opts.execPath,
    args: [standaloneServerPath(opts.packageRoot)],
    env: {
      ...opts.baseEnv,
      PORT: String(opts.port),
      HOSTNAME: "127.0.0.1",
      HAMREVIEW_HANDOFF: opts.handoffPath,
      HAMREVIEW_FEEDBACK_OUT: opts.feedbackOut,
      HAMREVIEW_DONE: opts.donePath,
      HAMREVIEW_TOKEN: opts.token,
    },
  };
}
