// src/payload/services/getPayload.ts
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { getPayload } from "payload";
import config from "../../../payload.config";

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>;

let cachedPayload: PayloadInstance | null = null;
let buildStub: PayloadInstance | null = null;

/**
 * `next build` один раз рендерит дерево серверных компонентов каждого маршрута
 * на этапе «Generating static pages» для валидации и построения манифеста RSC —
 * это происходит даже для маршрутов, экспортирующих `dynamic = "force-dynamic"`,
 * поскольку этот экспорт отключает только *кеширование* вывода во время выполнения,
 * а не однократный рендеринг на сборке. Поскольку корневой макет (и Navbar/Footer/
 * TopHeader) читают Settings/Categories/Consents через Local API Payload,
 * этот единственный рендеринг требует живого подключения к Postgres для каждой страницы —
 * а этап сборки Docker намеренно не имеет доступа к работающему контейнеру Postgres.
 *
 * Вместо того чтобы защищать каждый сервисный файл по отдельности, мы защищаем единую
 * точку входа, через которую проходят все вызовы. На этапе сборки возвращаем заглушку,
 * которая разрешается в пустые/нейтральные значения; во время выполнения (NEXT_PHASE
 * не установлена) эта ветка никогда не выполняется, и поведение не меняется.
 */
function createBuildStub(): PayloadInstance {
  const emptyFind = async () => ({
    docs: [],
    totalDocs: 0,
    totalPages: 0,
    page: 1,
    limit: 0,
    pagingCounter: 0,
    hasNextPage: false,
    hasPrevPage: false,
    nextPage: null,
    prevPage: null,
  });

  return {
    find: emptyFind,
    findByID: async () => {
      throw new Error("Payload Local API недоступна во время `next build`.");
    },
    findGlobal: async () => null,
    auth: async () => ({ user: null }),
    create: async () => {
      throw new Error("Мутации Payload недоступны во время `next build`.");
    },
    update: async () => {
      throw new Error("Мутации Payload недоступны во время `next build`.");
    },
    delete: async () => {
      throw new Error("Мутации Payload недоступны во время `next build`.");
    },
    login: async () => {
      throw new Error(
        "Аутентификация Payload недоступна во время `next build`.",
      );
    },
  } as unknown as PayloadInstance;
}

export async function getPayloadInstance(): Promise<PayloadInstance> {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    if (!buildStub) buildStub = createBuildStub();
    return buildStub;
  }
  if (!cachedPayload) {
    cachedPayload = await getPayload({ config });
  }
  return cachedPayload;
}
