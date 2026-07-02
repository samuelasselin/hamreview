import type { Feedback, FlowVerdict, ReviewComment, Intent, Verdict, LineRange } from "./types";
import { isObject } from "./internal";

export class FeedbackValidationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

const INTENTS: readonly Intent[] = ["must-fix", "question", "nit"];
const VERDICTS: readonly Verdict[] = ["approved", "changes-requested"];

export function buildFeedback(
  flows: FlowVerdict[],
  comments: ReviewComment[],
  submittedAt: string,
): Feedback {
  return { version: 1, submittedAt, flows, comments };
}

export function serializeFeedback(feedback: Feedback): string {
  return JSON.stringify(feedback, null, 2) + "\n";
}

export function parseFeedback(input: string | unknown): Feedback {
  const data = typeof input === "string" ? safeJson(input) : input;
  if (!isObject(data)) throw new FeedbackValidationError("feedback must be an object");
  if (data.version !== 1) throw new FeedbackValidationError("feedback.version must be 1");
  if (typeof data.submittedAt !== "string" || data.submittedAt.length === 0)
    throw new FeedbackValidationError("feedback.submittedAt must be a non-empty string");
  if (!Array.isArray(data.flows)) throw new FeedbackValidationError("feedback.flows must be an array");
  if (!Array.isArray(data.comments))
    throw new FeedbackValidationError("feedback.comments must be an array");

  const flows = data.flows.map((f, i) => parseVerdict(f, i));
  const comments = data.comments.map((c, i) => parseComment(c, i));
  return { version: 1, submittedAt: data.submittedAt, flows, comments };
}

function parseVerdict(f: unknown, i: number): FlowVerdict {
  if (!isObject(f)) throw new FeedbackValidationError(`flows[${i}] must be an object`);
  if (typeof f.id !== "string" || f.id.length === 0)
    throw new FeedbackValidationError(`flows[${i}].id must be a non-empty string`);
  if (!VERDICTS.includes(f.verdict as Verdict))
    throw new FeedbackValidationError(`flows[${i}].verdict must be one of ${VERDICTS.join(", ")}`);
  return { id: f.id, verdict: f.verdict as Verdict };
}

function parseComment(c: unknown, i: number): ReviewComment {
  const where = `comments[${i}]`;
  if (!isObject(c)) throw new FeedbackValidationError(`${where} must be an object`);
  if (typeof c.flowId !== "string" || c.flowId.length === 0)
    throw new FeedbackValidationError(`${where}.flowId must be a non-empty string`);
  if (typeof c.path !== "string" || c.path.length === 0)
    throw new FeedbackValidationError(`${where}.path must be a non-empty string`);
  const lines = parseLines(c.lines, where);
  if (!INTENTS.includes(c.intent as Intent))
    throw new FeedbackValidationError(`${where}.intent must be one of ${INTENTS.join(", ")}`);
  if (typeof c.text !== "string" || c.text.length === 0)
    throw new FeedbackValidationError(`${where}.text must be a non-empty string`);
  return { flowId: c.flowId, path: c.path, lines, intent: c.intent as Intent, text: c.text };
}

function parseLines(v: unknown, where: string): LineRange {
  if (!Array.isArray(v) || v.length !== 2)
    throw new FeedbackValidationError(`${where}.lines must be a [start, end] pair`);
  const [start, end] = v as [unknown, unknown];
  if (!Number.isInteger(start) || !Number.isInteger(end))
    throw new FeedbackValidationError(`${where}.lines must be integers`);
  if ((start as number) < 1 || (end as number) < (start as number))
    throw new FeedbackValidationError(`${where}.lines must be a valid 1-indexed range`);
  return [start as number, end as number];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new FeedbackValidationError(`feedback is not valid JSON: ${(e as Error).message}`);
  }
}
