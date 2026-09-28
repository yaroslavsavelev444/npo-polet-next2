// app/api/health/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { captureError } from "@/services/observability/capture";

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
    // Детали (строка подключения к БД, хост, стектрейс) — только в логи
    // сервера. Наружу — минимум, иначе публичный /api/health превращается в
    // источник разведданных об инфраструктуре при сбое БД.
    const errorId = captureError(error, {
      source: "http",
      module: "api/health",
      http: { method: "GET", route: "/api/health", status: 503 },
    });
    console.error("[api/health] check failed:", error, { errorId });
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
