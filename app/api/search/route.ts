import { type NextRequest, NextResponse } from 'next/server'
import { SEARCH_CANDIDATE_LIMIT, SEARCH_MORE_LIMIT } from '@/modules/search/constants'
import type { SearchResultType } from '@/modules/search/types'
import { searchSite, searchSiteSection } from '@/payload/services/search.service'
import { captureError } from '@/services/observability/capture'

// Payload Local API требует Node.js runtime
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES: readonly SearchResultType[] = ['product', 'knowledge', 'faq']

/**
 * Ответ одинаков для всех посетителей (в выдаче только опубликованное, без
 * персональных цен), поэтому его можно держать в кэше браузера: повтор
 * того же запроса — стёр букву и вернул — не доходит до сервера. Минута —
 * компромисс между этим и свежестью цен.
 *
 * X-Robots-Tag — страховка: /api/ и так закрыт в robots.txt, но ссылка на
 * эндпоинт может оказаться где угодно, и индексировать JSON незачем.
 */
const HEADERS = {
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  'X-Robots-Tag': 'noindex, nofollow',
}

/**
 * GET /api/search?q=…                        — первые порции всех секций;
 * GET /api/search?q=…&type=product&offset=6  — следующая порция одной секции.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const query = params.get('q') ?? ''
  const type = params.get('type')

  try {
    if (type === null) {
      return NextResponse.json(await searchSite(query), { headers: HEADERS })
    }

    if (!TYPES.includes(type as SearchResultType)) {
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }

    const offset = Number(params.get('offset') ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= SEARCH_CANDIDATE_LIMIT) {
      return NextResponse.json({ error: 'Invalid offset' }, { status: 400 })
    }

    const section = await searchSiteSection(
      query,
      type as SearchResultType,
      offset,
      SEARCH_MORE_LIMIT[type as SearchResultType],
    )
    return NextResponse.json({ section }, { headers: HEADERS })
  } catch (error) {
    const errorId = captureError(error, {
      source: 'http',
      module: 'api/search',
      http: { method: 'GET', route: '/api/search', status: 500 },
    })
    console.error('[api/search] Unexpected error:', error, { errorId })
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
