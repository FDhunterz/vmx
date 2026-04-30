'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import {
  createDefaultWebhookProfile,
  loadWebhookProfiles,
  saveWebhookProfiles,
  triggerWebhook,
  type WebhookProfile
} from '@/lib/webhook'

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.75rem',
  borderRadius: '10px',
  border: '1px solid #dbe3ef',
  background: '#fff',
  fontSize: '0.9rem'
}

export default function WebhookSettings() {
  const [profiles, setProfiles] = useState<WebhookProfile[]>(() => loadWebhookProfiles())
  const [selectedId, setSelectedId] = useState<string>(() => loadWebhookProfiles()[0]?.id || '')
  const [showDetail, setShowDetail] = useState(false)
  const [message, setMessage] = useState('')

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || profiles[0],
    [profiles, selectedId]
  )

  const activeEvents = useMemo(() => new Set(selectedProfile?.triggerOn || []), [selectedProfile])

  const updateProfile = (patch: Partial<WebhookProfile>) => {
    if (!selectedProfile) return
    setProfiles((prev) => prev.map((item) => (item.id === selectedProfile.id ? { ...item, ...patch } : item)))
  }

  const updateEvent = (eventName: 'build_started' | 'build_success' | 'build_failed') => {
    if (!selectedProfile) return
    const next = new Set(selectedProfile.triggerOn)
      if (next.has(eventName)) next.delete(eventName)
      else next.add(eventName)
    updateProfile({ triggerOn: Array.from(next) as WebhookProfile['triggerOn'] })
  }

  const handleSave = () => {
    saveWebhookProfiles(profiles)
    setMessage('Daftar webhook berhasil disimpan di localhost.')
    setTimeout(() => setMessage(''), 2500)
  }

  const handleAddProfile = () => {
    const profile = createDefaultWebhookProfile()
    setProfiles((prev) => [...prev, profile])
    setSelectedId(profile.id)
    setShowDetail(true)
  }

  const handleDeleteProfile = () => {
    if (!selectedProfile) return
    const next = profiles.filter((p) => p.id !== selectedProfile.id)
    const safeNext = next.length > 0 ? next : [createDefaultWebhookProfile()]
    setProfiles(safeNext)
    setSelectedId(safeNext[0].id)
    setShowDetail(false)
    saveWebhookProfiles(safeNext)
    setMessage('Webhook trigger dihapus.')
    setTimeout(() => setMessage(''), 2500)
  }

  const handleReset = () => {
    if (!selectedProfile) return
    const reset = createDefaultWebhookProfile()
    reset.id = selectedProfile.id
    const next = profiles.map((item) => (item.id === selectedProfile.id ? reset : item))
    setProfiles(next)
    saveWebhookProfiles(next)
    setMessage('Webhook terpilih direset ke default.')
    setTimeout(() => setMessage(''), 2500)
  }

  const handleTest = async () => {
    if (!selectedProfile) return
    const prevEnabled = selectedProfile.enabled
    const prevTriggers = selectedProfile.triggerOn
    const next = profiles.map((item) =>
      item.id === selectedProfile.id
        ? { ...item, enabled: true, triggerOn: ['build_started'] }
        : item
    )

    setProfiles(next)
    saveWebhookProfiles(next)

    await triggerWebhook('build_started', {
      module: 'webhook_settings',
      test: true,
      note: `manual test dari trigger ${selectedProfile.name}`
    })

    const restored = next.map((item) =>
      item.id === selectedProfile.id
        ? { ...item, enabled: prevEnabled, triggerOn: prevTriggers }
        : item
    )
    setProfiles(restored)
    saveWebhookProfiles(restored)

    setMessage(`Test trigger dikirim ke "${selectedProfile.name}".`)
    setTimeout(() => setMessage(''), 2500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ padding: '1.1rem', borderRadius: '14px', background: '#f6f7fb', boxShadow: '0 10px 20px rgba(15,23,42,0.08)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Webhook Trigger Settings</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
          Config ini berbentuk list dan disimpan di localhost browser (`localStorage`), jadi bisa punya banyak webhook dengan nama berbeda.
        </p>
      </div>

      <div style={{ padding: '1.1rem', borderRadius: '14px', background: '#f6f7fb', boxShadow: '0 10px 20px rgba(15,23,42,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
          <label style={{ fontWeight: 600 }}>Daftar Trigger</label>
          <button onClick={handleAddProfile} style={{ padding: '0.5rem 0.85rem', border: 'none', borderRadius: '10px', background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
            + Tambah
          </button>
        </div>

        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {profiles.map((p) => (
            <div
              key={p.id}
              style={{
                borderRadius: '12px',
                background: selectedProfile?.id === p.id ? '#eef2ff' : '#ffffff',
                boxShadow: '0 6px 14px rgba(15,23,42,0.07)',
                padding: '0.65rem 0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedId(p.id)
                    setShowDetail(false)
                    const active = p.enabled
                    const triggerOn = p.triggerOn
                    const next = profiles.map((item) =>
                      item.id === p.id ? { ...item, enabled: true, triggerOn: ['build_started'] } : item
                    )
                    setProfiles(next)
                    saveWebhookProfiles(next)
                    await triggerWebhook('build_started', { module: 'webhook_settings', test: true, note: `quick test ${p.name}` })
                    const restored = next.map((item) =>
                      item.id === p.id ? { ...item, enabled: active, triggerOn } : item
                    )
                    setProfiles(restored)
                    saveWebhookProfiles(restored)
                    setMessage(`Test trigger dikirim ke "${p.name}".`)
                    setTimeout(() => setMessage(''), 2500)
                  }}
                  title="Test trigger"
                  style={{ width: '34px', height: '34px', borderRadius: '999px', border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  ▶
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id)
                    setShowDetail((prev) => (selectedId === p.id ? !prev : true))
                  }}
                  title="Buka pengaturan"
                  style={{ width: '34px', height: '34px', borderRadius: '999px', border: 'none', background: '#e2e8f0', color: '#334155', cursor: 'pointer', fontWeight: 700 }}
                >
                  ⚙
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.webhookUrl}</div>
                </div>

                <div style={{ fontSize: '0.75rem', color: p.enabled ? '#166534' : '#64748b', fontWeight: 600 }}>
                  {p.enabled ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedProfile && showDetail && (
        <div style={{ padding: '1.1rem', borderRadius: '14px', background: '#f6f7fb', boxShadow: '0 10px 20px rgba(15,23,42,0.08)' }}>
          <div style={{ display: 'grid', gap: '0.8rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem' }}>Trigger Name</label>
            <input
              style={inputStyle}
              value={selectedProfile?.name || ''}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder="upload-youtube"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem' }}>ID (auto generated)</label>
            <input style={inputStyle} value={selectedProfile?.id || ''} readOnly />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={Boolean(selectedProfile?.enabled)}
              onChange={(e) => updateProfile({ enabled: e.target.checked })}
            />
            Aktifkan webhook trigger
          </label>

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem' }}>Webhook URL</label>
            <input
              style={inputStyle}
              value={selectedProfile?.webhookUrl || ''}
              onChange={(e) => updateProfile({ webhookUrl: e.target.value })}
              placeholder="http://localhost:5678/webhook/upload-youtube"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>Method</label>
              <select
                style={inputStyle}
                value={selectedProfile?.method || 'POST'}
                onChange={(e) => updateProfile({ method: e.target.value as WebhookProfile['method'] })}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>Auth</label>
              <select
                style={inputStyle}
                value={selectedProfile?.authType || 'none'}
                onChange={(e) => updateProfile({ authType: e.target.value as WebhookProfile['authType'] })}
              >
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
              </select>
            </div>
          </div>

          {selectedProfile?.authType === 'bearer' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>Bearer Token</label>
              <input
                style={inputStyle}
                type="password"
                value={selectedProfile?.bearerToken || ''}
                onChange={(e) => updateProfile({ bearerToken: e.target.value })}
                placeholder="token..."
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>Timeout (ms)</label>
              <input
                style={inputStyle}
                type="number"
                min={1000}
                value={selectedProfile?.timeoutMs || 10000}
                onChange={(e) => updateProfile({ timeoutMs: Math.max(1000, Number(e.target.value) || 10000) })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>Max Retries</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={selectedProfile?.maxRetries || 0}
                onChange={(e) => updateProfile({ maxRetries: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>Retry Delay (ms)</label>
              <input
                style={inputStyle}
                type="number"
                min={300}
                value={selectedProfile?.retryDelayMs || 1000}
                onChange={(e) => updateProfile({ retryDelayMs: Math.max(300, Number(e.target.value) || 1000) })}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={Boolean(selectedProfile?.retryEnabled)}
              onChange={(e) => updateProfile({ retryEnabled: e.target.checked })}
            />
            Aktifkan retry
          </label>

          <div>
            <div style={{ marginBottom: '0.35rem' }}>Trigger On</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label><input type="checkbox" checked={activeEvents.has('build_started')} onChange={() => updateEvent('build_started')} /> build_started</label>
              <label><input type="checkbox" checked={activeEvents.has('build_success')} onChange={() => updateEvent('build_success')} /> build_success</label>
              <label><input type="checkbox" checked={activeEvents.has('build_failed')} onChange={() => updateEvent('build_failed')} /> build_failed</label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button onClick={handleSave} style={{ padding: '0.65rem 1rem', border: 'none', borderRadius: '10px', background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
              Simpan
            </button>
            <button onClick={handleTest} style={{ padding: '0.65rem 1rem', border: 'none', borderRadius: '10px', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
              Test Trigger
            </button>
            <button onClick={handleReset} style={{ padding: '0.65rem 1rem', border: 'none', borderRadius: '10px', background: '#64748b', color: '#fff', cursor: 'pointer' }}>
              Reset Trigger
            </button>
            <button onClick={handleDeleteProfile} style={{ padding: '0.65rem 1rem', border: 'none', borderRadius: '10px', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
              Hapus Trigger
            </button>
          </div>
        </div>
        </div>
      )}

      {message && (
        <div style={{ padding: '0.8rem', borderRadius: '10px', background: '#eef2ff', color: '#3730a3' }}>
          {message}
        </div>
      )}
    </div>
  )
}
