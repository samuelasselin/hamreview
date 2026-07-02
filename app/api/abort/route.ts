import { NextResponse } from "next/server";
import { readEnv, submitAbort } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function POST() {
  const env = readEnv(process.env);
  submitAbort(env);
  return NextResponse.json({ ok: true });
}
