// app/components/Navbar/Logo.tsx
import Link from "next/link";
import type { Setting } from "@/payload-types";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { getCompanyName } from "@/utils/settings-helpers";

interface LogoProps {
  settings: Setting | null;
}

export default function Logo({ settings }: LogoProps) {
  const companyName = getCompanyName(settings) || "ПОЛЁТ";

  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
      <BrandLogo alt={companyName} className="h-8" />
    </Link>
  );
}
