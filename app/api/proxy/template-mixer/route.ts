import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const apiUrl = searchParams.get('apiUrl') || DEFAULT_API_BASE_URL
    const encoder = searchParams.get('encoder') || 'cpu'
    const preset = searchParams.get('preset') || 'medium'
    const fade = searchParams.get('fade') || 'false'
    const fadeDuration = searchParams.get('fadeDuration') || '1.0'
    const fadeOffset = searchParams.get('fadeOffset') || '1.0'

    const normalizedBase = apiUrl.replace(/\/+$/, '')
    const queryString =
      `encoder=${encodeURIComponent(encoder)}` +
      `&preset=${encodeURIComponent(preset)}` +
      `&fade=${encodeURIComponent(fade)}` +
      `&fadeDuration=${encodeURIComponent(fadeDuration)}` +
      `&fadeOffset=${encodeURIComponent(fadeOffset)}`

    // Kompatibilitas beberapa naming endpoint backend.
    const endpointCandidates = [
      '/api/join/template-mixer',
      '/api/join/template_mixer',
      '/api/join/video-loop',
    ]

    const originalFormData = await request.formData()
    const formEntries = Array.from(originalFormData.entries())

    const createForwardFormData = () => {
      const fd = new FormData()
      for (const [key, value] of formEntries) {
        fd.append(key, value)
      }
      return fd
    }

    let response: Response | null = null
    let lastTriedUrl = ''
    for (const endpoint of endpointCandidates) {
      const targetUrl = `${normalizedBase}${endpoint}?${queryString}`
      lastTriedUrl = targetUrl
      response = await fetch(targetUrl, {
        method: 'POST',
        body: createForwardFormData(),
      })
      if (response.status !== 404) {
        break
      }
    }

    if (!response) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gagal meneruskan request ke backend',
        },
        { status: 502 }
      )
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await response.json()
      return NextResponse.json(json, { status: response.status })
    }

    const text = await response.text()
    return NextResponse.json(
      {
        success: response.ok,
        error: response.ok ? undefined : text || `Backend error: ${response.status}`,
        attemptedUrl: response.ok ? undefined : lastTriedUrl,
        message: response.ok ? text : undefined,
      },
      { status: response.status }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to reach backend API',
      },
      { status: 502 }
    )
  }
}

