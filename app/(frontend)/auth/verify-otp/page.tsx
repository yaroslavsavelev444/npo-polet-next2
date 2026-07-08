export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OtpForm } from "@/modules/auth/components/OtpForm";
import { isTwoFAVerified } from "@/modules/auth/lib/twoFA";
import { isUser } from "@/modules/auth/lib/typeGuards";
import { getPayloadInstance } from "@/payload/services/getPayload";

export default async function VerifyOtpPage() {
  const cookieStore = await cookies();
  const payloadToken = cookieStore.get("payload-token");

  if (!payloadToken) {
    redirect("/auth/login");
  }

  const payload = await getPayloadInstance();
  const h = await headers();

  const { user } = await payload.auth({ headers: h });

  if (!user || !isUser(user)) {
    redirect("/auth/login");
  }

  if (isTwoFAVerified(user)) {
    redirect("/profile");
  }

  return (
    <OtpForm
      type="login_2fa"
      email={user.email}
      title="Подтверждение входа"
      description="Введите код, отправленный на"
    />
  );
}
