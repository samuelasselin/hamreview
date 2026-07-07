import { NextResponse } from "next/server";
import { buildModelFor, readEnv, tokenOk } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = readEnv(process.env);
  if (!tokenOk(env, req.headers.get("x-hamreview-token")))
    return NextResponse.json({ error: "invalid or missing review token" }, { status: 403 });
  const model = buildModelFor(env.handoffPath);
  return NextResponse.json({ model });
}
