import { readFileSync, writeFileSync } from "node:fs";
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
}

export function readEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const handoffPath = required(env, "FLOWREVIEW_HANDOFF");
  const feedbackOut = required(env, "FLOWREVIEW_FEEDBACK_OUT");
  const donePath = required(env, "FLOWREVIEW_DONE");
  return { handoffPath, feedbackOut, donePath };
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
  writeFileSync(env.donePath, "");
  return feedback;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`missing required env var ${key}`);
  return v;
}
