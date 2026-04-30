export type WebhookEventName = 'build_started' | 'build_success' | 'build_failed'

export interface WebhookProfile {
  id: string
  name: string
  enabled: boolean
  webhookUrl: string
  method: 'POST' | 'PUT' | 'PATCH'
  authType: 'none' | 'bearer'
  bearerToken: string
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
  method: 'POST',
  authType: 'none',
  bearerToken: '',
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

    const requestBody = {
      source: 'vmx',
      profileId: profile.id,
      profileName: profile.name,
      event,
      timestamp: new Date().toISOString(),
      ...payload
    }

    const attempts = profile.retryEnabled ? Math.max(1, profile.maxRetries + 1) : 1

    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, profile.timeoutMs))

      try {
        const response = await fetch(profile.webhookUrl, {
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
