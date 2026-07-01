import { NextRequest, NextResponse } from 'next/server'
import { searchProducts } from '@/payload/services/search.service'
import type { SearchApiResponse } from '@/modules/search/types'

// Payload Local API требует Node.js runtime
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse<SearchApiResponse>> {
  const query = request.nextUrl.searchParams.get('q') ?? ''

  try {
    const results = await searchProducts({ query })
    return NextResponse.json({ results, total: results.length })
  } catch (error) {
    console.error('[api/search] Unexpected error:', error)
    return NextResponse.json({ results: [], total: 0 }, { status: 500 })
  }
}