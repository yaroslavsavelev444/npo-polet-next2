import type { ReactNode } from "react";

export function LandingHeroSurface({ children }: { children: ReactNode }) {
	return (
		<section
			className="relative isolate overflow-hidden bg-[var(--void-deep)]"
			style={{
				marginTop: "calc(-1 * var(--sticky-header-height))",
				paddingTop: "var(--sticky-header-height)",
			}}
		>
			<div
				className="pointer-events-none absolute inset-0 -z-10"
				aria-hidden="true"
				style={{
					background:
						"radial-gradient(110% 70% at 8% 100%, color-mix(in srgb, var(--primary) 13%, transparent) 0%, transparent 58%)",
				}}
			/>
			{children}
		</section>
	);
}
