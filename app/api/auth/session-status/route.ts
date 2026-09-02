import { NextRequest, NextResponse } from "next/server";
import { resolveSessionStatus } from "@/modules/auth/lib/session";
import { getPayloadInstance } from "@/payload/services/getPayload";

export async function GET(req: NextRequest) {
  const payload = await getPayloadInstance();
  // Идентификатор сессии берём ИЗ COOKIE, а не из query-параметра: параметром
  // клиент управляет сам, и его значение ничего не подтверждает (раньше
  // достаточно было не передавать его вовсе, чтобы проверка сессии не
  // выполнялась). Cookie session-id выставляется сервером в verifyOtpAction
  // вместе с самим токеном.
  const sessionId = req.cookies.get("session-id")?.value ?? null;

  const status = await resolveSessionStatus(payload, req.headers, sessionId);
  if (!status) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ответ 200 сам по себе означает полностью авторизованного пользователя:
  // payload-token, по которому resolveSessionStatus его опознал, выдаётся
  // только после подтверждения OTP (см. verifyOtp.ts).
  return NextResponse.json({
    authenticated: true,
    user: { email: status.email },
  });
}

export const runtime = "nodejs";
