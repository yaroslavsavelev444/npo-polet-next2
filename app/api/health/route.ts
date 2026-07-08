// app/api/health/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPayloadInstance } from "@/payload/services/getPayload";

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
