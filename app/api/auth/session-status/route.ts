import { NextRequest, NextResponse } from "next/server";
import { resolveSessionStatus } from "@/modules/auth/lib/session";
import { getPayloadInstance } from "@/payload/services/getPayload";

export async function GET(req: NextRequest) {
  const payload = await getPayloadInstance();
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  const status = await resolveSessionStatus(payload, req.headers, sessionId);
  if (!status) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    twoFAVerified: status.twoFAVerified,
    user: { email: status.email },
  });
}

export const runtime = "nodejs";
