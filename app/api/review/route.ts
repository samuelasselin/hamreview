import { NextResponse } from "next/server";
import { buildModelFor, readEnv, tokenOk } from "../../../src/server/context";
import { HandoffValidationError } from "../../../src/core/index";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = readEnv(process.env);
  if (!tokenOk(env, req.headers.get("x-hamreview-token")))
    return NextResponse.json({ error: "invalid or missing review token" }, { status: 403 });
  try {
    const model = buildModelFor(env.handoffPath);
    return NextResponse.json({ model });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = e instanceof HandoffValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
