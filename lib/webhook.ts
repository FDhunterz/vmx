export type WebhookEventName = 'build_started' | 'build_success' | 'build_failed'

export interface WebhookProfile {
  id: string
  name: string
  enabled: boolean
  webhookUrl: string
  /** Object JSON → dikonversi ke query string (?a=b&...) dan digabung ke URL request */
  customQueryJson: string
  method: 'POST' | 'PUT' | 'PATCH'
  authType: 'none' | 'bearer'
  bearerToken: string
  /** JSON tambahan yang digabung ke body request (object), setelah field bawaan VMX, sebelum payload event */
  customBodyJson: string
  /** Disematkan ke body sebagai `dirPath` (mis. dari folder picker atau input manual) */
  dirPath: string
  timeoutMs: number
  retryEnabled: boolean
  maxRetries: number
  retryDelayMs: number
  triggerOn: WebhookEventName[]
}

export const WEBHOOK_STORAGE_KEY = 'vmx_webhook_profiles'

const makeId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `wh_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export const createDefaultWebhookProfile = (): WebhookProfile => ({
  id: makeId(),
  name: 'upload-youtube',
  enabled: false,
  webhookUrl: 'http://localhost:5678/webhook/upload-youtube',
  customQueryJson: '',
  method: 'POST',
  authType: 'none',
  bearerToken: '',
  customBodyJson: '',
  dirPath: '',
  timeoutMs: 10000,
  retryEnabled: true,
  maxRetries: 2,
  retryDelayMs: 1000,
  triggerOn: ['build_started', 'build_success', 'build_failed']
})

export const loadWebhookProfiles = (): WebhookProfile[] => {
  if (typeof window === 'undefined') return [createDefaultWebhookProfile()]
  const raw = localStorage.getItem(WEBHOOK_STORAGE_KEY)
  if (!raw) return [createDefaultWebhookProfile()]

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return [createDefaultWebhookProfile()]
    return parsed.map((item) => {
      const partial = item as Partial<WebhookProfile>
      const fallback = createDefaultWebhookProfile()
      return {
        ...fallback,
        ...partial,
        id: partial.id || makeId(),
        name: partial.name || fallback.name,
        triggerOn: Array.isArray(partial.triggerOn) ? partial.triggerOn : fallback.triggerOn
      }
    })
  } catch {
    return [createDefaultWebhookProfile()]
  }
}

export const saveWebhookProfiles = (profiles: WebhookProfile[]) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(WEBHOOK_STORAGE_KEY, JSON.stringify(profiles))
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const appendQueryFromJson = (baseUrl: string, queryJson: string | undefined): string => {
  const trimmed = (queryJson ?? '').trim()
  if (!trimmed) return baseUrl
  let parsed: Record<string, unknown>
  try {
    const p = JSON.parse(trimmed) as unknown
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      console.warn('[VMX] customQueryJson harus berupa object JSON. Query string diabaikan.')
      return baseUrl
    }
    parsed = p as Record<string, unknown>
  } catch (e) {
    console.warn('[VMX] customQueryJson tidak valid JSON. Query string diabaikan.', e)
    return baseUrl
  }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
      sp.append(k, String(v))
    } else {
      sp.append(k, JSON.stringify(v))
    }
  }
  const extra = sp.toString()
  if (!extra) return baseUrl
  try {
    const u = new URL(baseUrl)
    const merged = new URLSearchParams(u.search)
    for (const [k, val] of sp.entries()) {
      merged.set(k, val)
    }
    u.search = merged.toString()
    return u.toString()
  } catch {
    const sep = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${sep}${extra}`
  }
}

const parseCustomBodyJson = (raw: string | undefined): Record<string, unknown> | null => {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    console.warn('[VMX] customBodyJson harus berupa object JSON (bukan array/primitif). Body tambahan diabaikan.')
    return null
  } catch (e) {
    console.warn('[VMX] customBodyJson tidak valid JSON. Body tambahan diabaikan.', e)
    return null
  }
}

export const triggerWebhook = async (
  event: WebhookEventName,
  payload: Record<string, unknown>
): Promise<void> => {
  if (typeof window === 'undefined') return
  const profiles = loadWebhookProfiles()
  const activeProfiles = profiles.filter((p) => p.enabled && p.webhookUrl && p.triggerOn.includes(event))

  for (const profile of activeProfiles) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (profile.authType === 'bearer' && profile.bearerToken.trim()) {
      headers.Authorization = `Bearer ${profile.bearerToken.trim()}`
    }

    const customLayer = parseCustomBodyJson(profile.customBodyJson)
    const dirPathTrimmed = profile.dirPath?.trim() ?? ''
    const requestBody = {
      source: 'vmx',
      profileId: profile.id,
      profileName: profile.name,
      event,
      timestamp: new Date().toISOString(),
      ...(customLayer ?? {}),
      ...(dirPathTrimmed ? { dirPath: dirPathTrimmed } : {}),
      ...payload
    }

    const requestUrl = appendQueryFromJson(profile.webhookUrl, profile.customQueryJson)

    const attempts = profile.retryEnabled ? Math.max(1, profile.maxRetries + 1) : 1

    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, profile.timeoutMs))

      try {
        const response = await fetch(requestUrl, {
          method: profile.method,
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Webhook response status ${response.status}`)
        }
        break
      } catch (err) {
        clearTimeout(timeoutId)
        if (i === attempts - 1) {
          console.warn(`[VMX] webhook trigger failed for "${profile.name}":`, err)
          break
        }
        await sleep(Math.max(300, profile.retryDelayMs) * (i + 1))
      }
    }
  }
}
