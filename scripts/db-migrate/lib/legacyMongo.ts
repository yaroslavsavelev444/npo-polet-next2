// scripts/db-migrate/lib/legacyMongo.ts
import { type Db, MongoClient } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Старая MongoDB — реплика-сет (mongo1/mongo2/mongo3) в отдельном docker-compose
 * проекте на том же VPS. Имена mongo1/mongo2/mongo3 резолвятся только внутри
 * ЕГО docker-сети, поэтому подключение отсюда обязано быть direct-соединением
 * к ОДНОМУ узлу (без discovery остальных членов реплика-сета) — иначе драйвер
 * попытается достучаться до mongo2/mongo3 по их внутренним именам и зависнет.
 *
 * LEGACY_MONGODB_URI задаётся полностью через env, без дефолта — сетевая
 * топология (реальный host:port, куда мы можем достучаться из контейнера/с
 * хоста нового проекта) зависит от того, как именно запущен этот скрипт, и
 * её нельзя угадать. Пример для случая, когда старый mongo1 публикует порт
 * на хост VPS (как в его docker-compose.yml: "27017:27017"):
 *   LEGACY_MONGODB_URI=mongodb://<host-or-gateway-ip>:27017/polet?directConnection=true
 */
const CONNECTIVITY_HINT = `
Нужна прямая (не replica-set discovery) ссылка на один узел старой Mongo, например:

  LEGACY_MONGODB_URI=mongodb://<host>:27017/polet?directConnection=true

Где <host> — адрес, по которому этот процесс реально видит опубликованный порт mongo1
(в старом docker-compose.yml он публикует "27017:27017" на хост VPS). Если скрипт
запускается на самом хосте VPS — обычно это 127.0.0.1. Если запускается внутри
контейнера нового проекта — потребуется либо IP хоста/шлюза docker-сети, либо
docker network connect к сети старого проекта.
`.trim();

export async function getLegacyDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.LEGACY_MONGODB_URI; //
  if (!uri) {
    throw new Error(`LEGACY_MONGODB_URI не задан.\n${CONNECTIVITY_HINT}`);
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  try {
    await client.connect();
    await client.db().command({ ping: 1 });
  } catch (err) {
    await client.close().catch(() => {});
    client = null;
    throw new Error(
      `Не удалось подключиться к старой MongoDB по LEGACY_MONGODB_URI="${uri}".\n${CONNECTIVITY_HINT}\n\nИсходная ошибка: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  db = client.db();
  return db;
}

export async function closeLegacyMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
