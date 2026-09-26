"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { LoginForm } from "@/modules/auth/components/LoginForm";
import { OtpForm } from "@/modules/auth/components/OtpForm";
import { resolveSafeRedirect } from "@/modules/auth/lib/safeRedirect";

/**
 * Клиентская логика входа на отдельной странице.
 *
 * Состояние живёт на клиенте — это минимальный UI state, не требующий
 * глобального хранилища. Компонент рендерится в левой колонке AuthShell,
 * поэтому при переходе login → otp меняется только форма, а изображение
 * справа остаётся на месте.
 *
 * Шагов теперь может быть один или два — решает это сервер:
 *
 *   1. LoginForm → email + пароль
 *   2. OtpForm   → 6-значный код, ЕСЛИ устройство не доверенное
 *
 * С доверенного устройства второго шага нет: loginAction завершает вход сам и
 * возвращает `requiresOtp: false` (см. modules/auth/lib/trustedDevice.ts).
 * Тогда остаётся только увести пользователя туда, куда он шёл.
 *
 * Навигация здесь, а не серверным redirect() внутри действия: эта же форма
 * используется в оверлее поверх корзины, где уводить со страницы нельзя, —
 * поэтому решение о переходе принимает тот, кто форму открыл.
 */
export function LoginFlow() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [step, setStep] = useState<"login" | "otp">("login");
	const [email, setEmail] = useState("");

	const handleRequiresOtp = useCallback((enteredEmail: string) => {
		setEmail(enteredEmail);
		setStep("otp");
	}, []);

	/**
	 * Вход завершён без кода. Возвращаем на исходный путь из `?from=` — тот
	 * самый параметр, который проставляет гейт защищённых путей в proxy.ts.
	 *
	 * Тот же resolveSafeRedirect, что и на сервере: параметр приходит из
	 * адресной строки, то есть полностью управляется тем, кто прислал ссылку, и
	 * без проверки это готовый open redirect с доверенного домена.
	 *
	 * replace(), а не push(): страница входа не должна оставаться в истории —
	 * «назад» с неё вернуло бы уже вошедшего пользователя на форму входа.
	 * refresh() следом — чтобы серверный layout перерисовался с пользователем
	 * (шапка, корзина, избранное), см. разбор в verifyOtp.ts.
	 */
	const handleAuthenticated = useCallback(() => {
		const target = resolveSafeRedirect(searchParams.get("from"), {
			origin: window.location.origin,
			fallback: "/profile",
			isDisallowedTarget: (pathname) => pathname.startsWith("/auth/"),
		});

		router.replace(target);
		router.refresh();
	}, [router, searchParams]);

	if (step === "otp") {
		return (
			<OtpForm
				type="login_2fa"
				email={email}
				title="Подтверждение входа"
				description="Введите код, отправленный на"
			/>
		);
	}

	return (
		<LoginForm
			onRequiresOtp={handleRequiresOtp}
			onAuthenticated={handleAuthenticated}
		/>
	);
}
