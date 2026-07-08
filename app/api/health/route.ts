// app/api/health/route.ts

import { NextResponse } from "next/server";
import { getPayloadInstance } from "@/payload/services/getPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getPayloadInstance();
    // Лёгкий запрос — подтверждает, что БД доступна и Payload инициализирован
    await payload.findGlobal({
      slug: "settings",
      depth: 0,
      overrideAccess: true,
    });
    return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
