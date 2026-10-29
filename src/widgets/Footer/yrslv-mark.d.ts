// JSX-типы для <yrslv-mark> — метки разработчика с yarsav.ru (см. Footer.tsx).
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
	// biome-ignore lint/style/noNamespace: расширить JSX-типы React можно только через его namespace
	namespace JSX {
		interface IntrinsicElements {
			"yrslv-mark": DetailedHTMLProps<
				HTMLAttributes<HTMLElement>,
				HTMLElement
			> & {
				href?: string;
				accent?: string;
				wave?: string;
			};
		}
	}
}
