import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { getActiveSession } from "@/modules/auth/lib/session";
import { isUser } from "@/modules/auth/lib/typeGuards";
import config from "@/payloadconfig";
import { isTwoFAVerified } from "../lib/twoFA";

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config });

  let user: Awaited<ReturnType<typeof payload.auth>>["user"];

  try {
    const auth = await payload.auth({ headers: req.headers });
    user = auth.user;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!user || !isUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    const session = await getActiveSession(payload, sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session revoked or expired" },
        { status: 401 },
      );
    }
  }

  if (user.status === "blocked" || user.status === "suspended") {
    return NextResponse.json({ error: "Account blocked" }, { status: 403 });
  }

  const twoFAVerified = isTwoFAVerified(user);

  return NextResponse.json({ twoFAVerified });
}

export const runtime = "nodejs";
