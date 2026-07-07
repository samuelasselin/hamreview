import { NextResponse } from "next/server";
import { readEnv, submitAbort, tokenOk } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = readEnv(process.env);
  if (!tokenOk(env, req.headers.get("x-hamreview-token")))
    return NextResponse.json({ error: "invalid or missing review token" }, { status: 403 });
  submitAbort(env);
  return NextResponse.json({ ok: true });
}
