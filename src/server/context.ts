import { readFileSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import {
  parseHandoff,
  parseUnifiedDiff,
  buildReviewModel,
  parseFeedback,
  serializeFeedback,
  type ReviewModel,
  type Feedback,
} from "../core/index";
import { getWorkingDiff, makeFileReader } from "./git";

export interface ServerEnv {
  handoffPath: string;
  feedbackOut: string;
  donePath: string;
  token: string;
}

export function readEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const handoffPath = required(env, "HAMREVIEW_HANDOFF");
  const feedbackOut = required(env, "HAMREVIEW_FEEDBACK_OUT");
  const donePath = required(env, "HAMREVIEW_DONE");
  const token = required(env, "HAMREVIEW_TOKEN");
  return { handoffPath, feedbackOut, donePath, token };
}

/** Constant-time check of the per-run review token. */
export function tokenOk(env: ServerEnv, provided: string | null): boolean {
  if (provided === null || provided.length === 0) return false;
  const a = Buffer.from(env.token);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildModelFor(handoffPath: string): ReviewModel {
  const handoff = parseHandoff(readFileSync(handoffPath, "utf8"));
  if (handoff.base !== "working-tree") {
    throw new Error(
      `unsupported handoff base "${handoff.base}"; only "working-tree" is supported in this version`,
    );
  }
  const diff = parseUnifiedDiff(getWorkingDiff(handoff.root));
  return buildReviewModel(handoff, diff, makeFileReader(handoff.root));
}

export function submitFeedback(env: ServerEnv, body: unknown): Feedback {
  const feedback = parseFeedback(body);
  writeFileSync(env.feedbackOut, serializeFeedback(feedback));
  writeFileSync(env.donePath, "submitted");
  return feedback;
}

export function submitAbort(env: ServerEnv): void {
  writeFileSync(env.donePath, "aborted");
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`missing required env var ${key}`);
  return v;
}
