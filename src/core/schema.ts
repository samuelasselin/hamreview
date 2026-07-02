import type { Handoff, HandoffFlow, HandoffStep, LineRange } from "./types";
import { isObject } from "./internal";

export class HandoffValidationError extends Error {}

export function parseHandoff(input: string | unknown): Handoff {
  const data = typeof input === "string" ? safeJson(input) : input;
  if (!isObject(data)) throw new HandoffValidationError("handoff must be a JSON object");
  if (data.version !== 1) throw new HandoffValidationError("handoff.version must be 1");
  if (typeof data.root !== "string" || data.root.length === 0)
    throw new HandoffValidationError("handoff.root must be a non-empty string");
  if (typeof data.base !== "string" || data.base.length === 0)
    throw new HandoffValidationError("handoff.base must be a non-empty string");
  if (data.feature !== undefined && typeof data.feature !== "string")
    throw new HandoffValidationError("handoff.feature must be a string when present");
  if (!Array.isArray(data.flows) || data.flows.length === 0)
    throw new HandoffValidationError("handoff.flows must be a non-empty array");

  const ids = new Set<string>();
  const flows = data.flows.map((f, i) => parseFlow(f, i, ids));

  return {
    version: 1,
    root: data.root,
    base: data.base,
    ...(data.feature !== undefined ? { feature: data.feature as string } : {}),
    flows,
  };
}

function parseFlow(f: unknown, i: number, ids: Set<string>): HandoffFlow {
  if (!isObject(f)) throw new HandoffValidationError(`flows[${i}] must be an object`);
  if (typeof f.id !== "string" || f.id.length === 0)
    throw new HandoffValidationError(`flows[${i}].id must be a non-empty string`);
  if (ids.has(f.id)) throw new HandoffValidationError(`duplicate flow id: ${f.id}`);
  ids.add(f.id);
  if (typeof f.title !== "string" || f.title.length === 0)
    throw new HandoffValidationError(`flows[${i}].title must be a non-empty string`);
  if (f.complete !== undefined && typeof f.complete !== "boolean")
    throw new HandoffValidationError(`flows[${i}].complete must be a boolean when present`);
  if (!Array.isArray(f.steps) || f.steps.length === 0)
    throw new HandoffValidationError(`flows[${i}].steps must be a non-empty array`);

  const steps = f.steps.map((s, j) => parseStep(s, i, j));
  return {
    id: f.id,
    title: f.title,
    ...(f.complete !== undefined ? { complete: f.complete as boolean } : {}),
    steps,
  };
}

function parseStep(s: unknown, i: number, j: number): HandoffStep {
  const where = `flows[${i}].steps[${j}]`;
  if (!isObject(s)) throw new HandoffValidationError(`${where} must be an object`);
  if (typeof s.path !== "string" || s.path.length === 0)
    throw new HandoffValidationError(`${where}.path must be a non-empty string`);
  if (typeof s.role !== "string" || s.role.length === 0)
    throw new HandoffValidationError(`${where}.role must be a non-empty string`);
  if (s.note !== undefined && typeof s.note !== "string")
    throw new HandoffValidationError(`${where}.note must be a string when present`);
  if (!Array.isArray(s.ranges) || s.ranges.length === 0)
    throw new HandoffValidationError(`${where}.ranges must be a non-empty array`);

  const ranges = s.ranges.map((r, k) => parseRange(r, `${where}.ranges[${k}]`));
  return {
    path: s.path,
    role: s.role,
    ...(s.note !== undefined ? { note: s.note as string } : {}),
    ranges,
  };
}

function parseRange(r: unknown, where: string): LineRange {
  if (!Array.isArray(r) || r.length !== 2)
    throw new HandoffValidationError(`${where} must be a [start, end] pair`);
  const [start, end] = r as [unknown, unknown];
  if (!Number.isInteger(start) || !Number.isInteger(end))
    throw new HandoffValidationError(`${where} start and end must be integers`);
  if ((start as number) < 1) throw new HandoffValidationError(`${where} start must be >= 1`);
  if ((end as number) < (start as number))
    throw new HandoffValidationError(`${where} end must be >= start`);
  return [start as number, end as number];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new HandoffValidationError(`handoff is not valid JSON: ${(e as Error).message}`);
  }
}
