// JSX typings for <yrslv-mark> in React 19 projects.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

export type YrslvMarkAttributes = DetailedHTMLProps<
	HTMLAttributes<HTMLElement>,
	HTMLElement
> & {
	/** "ru" | "en". Defaults to the page language. */
	lang?: string;
	/** Link target. Defaults to the YRSLV portfolio with UTM tags naming this site. */
	href?: string;
	/** Accent colour. Defaults to #af2934. */
	accent?: string;
	/** Seconds between idle waves; "0" turns them off. Defaults to 10. */
	wave?: string;
};

declare module "react" {
	// biome-ignore lint/style/noNamespace: так React объявляет JSX.IntrinsicElements
	namespace JSX {
		interface IntrinsicElements {
			"yrslv-mark": YrslvMarkAttributes;
		}
	}
}
