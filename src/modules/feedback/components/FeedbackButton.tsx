"use client";

import { Bug } from "lucide-react";
import { useEffect, useState } from "react";
import { Tooltip } from "@/UI";
import { FeedbackDialog } from "./FeedbackDialog";

export function FeedbackButton() {
	const [open, setOpen] = useState(false);
	const [userEmail, setUserEmail] = useState<string | undefined>();

	useEffect(() => {
		fetch("/api/auth/session-status")
			.then((res) => res.json())
			.then((data) => {
				if (data?.user?.email) {
					setUserEmail(data.user.email);
				}
			})
			.catch(() => {});
	}, []);

	return (
		<>
			<Tooltip content="Сообщить о проблеме" placement="right">
				<button
					onClick={() => setOpen(true)}
					className="
            group fixed left-4 bottom-4 z-50
            flex items-center justify-center
            w-10 h-10
            border-0 bg-transparent cursor-pointer
            transition-transform hover:-translate-y-0.5
            focus:outline-none
          "
					aria-label="Сообщить о проблеме"
				>
					<Bug
						className="h-6 w-6 text-(--error) transition-colors group-hover:text-(--error-hover)"
						aria-hidden
					/>
				</button>
			</Tooltip>

			<FeedbackDialog
				open={open}
				onClose={() => setOpen(false)}
				userEmail={userEmail}
			/>
		</>
	);
}
