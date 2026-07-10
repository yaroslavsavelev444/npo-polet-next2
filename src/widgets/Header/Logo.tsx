// app/components/Navbar/Logo.tsx
import Link from "next/link";
import type { Setting } from "@/payload-types";
import { getCompanyName, getLogoUrl } from "@/utils/settings-helpers";

interface LogoProps {
  settings: Setting | null;
}

export default function Logo({ settings }: LogoProps) {
  const logoUrl = getLogoUrl(settings); // теперь получаем URL правильно
  const companyName = getCompanyName(settings) || "ПОЛЁТ";

  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline">
      {logoUrl ? (
        <img src={logoUrl} alt={companyName} className="h-8 w-auto" />
      ) : (
        <span className="font-semibold text-xl text-white">{companyName}</span>
      )}
    </Link>
  );
}
