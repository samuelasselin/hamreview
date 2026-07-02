import { NextResponse } from "next/server";
import { buildModelFor, readEnv } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = readEnv(process.env);
  const model = buildModelFor(env.handoffPath);
  return NextResponse.json({ model });
}
