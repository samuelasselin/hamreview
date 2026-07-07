import { NextResponse } from "next/server";
import { readEnv, submitFeedback, tokenOk } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = readEnv(process.env);
  if (!tokenOk(env, req.headers.get("x-hamreview-token")))
    return NextResponse.json({ error: "invalid or missing review token" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    submitFeedback(env, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
