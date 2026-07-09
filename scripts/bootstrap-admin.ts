// scripts/bootstrap-admin.ts
import { getPayload } from "payload";
import config from "../payload.config.ts";

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const name = process.env.ADMIN_BOOTSTRAP_NAME ?? "Administrator";

  if (!email || !password) {
    console.error(
      "❌ Задайте ADMIN_BOOTSTRAP_EMAIL и ADMIN_BOOTSTRAP_PASSWORD как env-переменные для запуска",
    ); //
    process.exit(1);
  }

  const payload = await getPayload({ config });

  const { totalDocs } = await payload.find({
    collection: "admins",
    limit: 0,
    overrideAccess: true,
  });

  if (totalDocs > 0) {
    console.log(
      "ℹ️  В коллекции admins уже есть пользователи. Bootstrap пропущен.",
    );
    console.log(
      "   Для создания дополнительных админов используйте /admin от имени superadmin.",
    );
    process.exit(0);
  }

  await payload.create({
    collection: "admins",
    data: { email, password, name, role: "superadmin" },
    overrideAccess: true,
  });

  console.log(`✅ Создан первый superadmin: ${email}`);
  console.log(
    "⚠️  Теперь удалите ADMIN_BOOTSTRAP_EMAIL/PASSWORD из .env.production и смените пароль в панели.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});
