// app/(frontend)/auth/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Авторизация", template: "%s — НПО Полёт" },
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
