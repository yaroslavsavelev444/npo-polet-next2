"use client";

import { Button } from "@payloadcms/ui";
import Link from "next/link";
import styles from "./analytics.module.css";

export function AnalyticsLinkButton() {
	return (
		<div className={styles.listAction}>
			<Button
				buttonStyle="secondary"
				el="link"
				Link={Link}
				margin={false}
				size="small"
				url="/admin/orders/analytics"
			>
				Аналитика заказов
			</Button>
		</div>
	);
}
