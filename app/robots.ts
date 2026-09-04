// app/(frontend)/robots.ts
import type { MetadataRoute } from "next";
import { baseURL } from "@/resources/content";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: [
					"/admin",
					"/admin/*",
					"/api/",
					"/auth/",
					"/cart",
					"/checkout",
					"/profile",
					"/orders",
					"/orders/*",
					"/wishlist",
					"/reviews",
					"/*?*group=",
					// Отфильтрованная выдача базы знаний: то же содержимое в другой
					// нарезке. Сами материалы при этом полностью открыты — робот
					// доходит до них с /knowledge и из sitemap.
					"/knowledge?*",
				],
			},
		],
		sitemap: `${baseURL}/sitemap.xml`,
		host: baseURL,
	};
}
