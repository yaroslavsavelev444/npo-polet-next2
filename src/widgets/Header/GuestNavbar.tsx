import { Button, Flex } from "@once-ui-system/core";
import Link from "next/link";

export function GuestNavbar() {
	return (
		<>
			<Link href="/">
				<strong>ПОЛЁТ</strong>
			</Link>

			<Flex gap="12">
				<Link href="/auth/login">
					<Button variant="secondary">Войти</Button>
				</Link>

				<Link href="/auth/register">
					<Button>Регистрация</Button>
				</Link>
			</Flex>
		</>
	);
}
