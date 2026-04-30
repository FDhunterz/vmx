'use client'

import { useState } from 'react'
import VideoMixer from '@/components/VideoMixer'
import QueueView from '@/components/QueueView'
import ProgressTracker from '@/components/ProgressTracker'
import AutoMixer from '@/components/AutoMixer'
import TemplateMixer from '@/components/TemplateMixer'
import WebhookSettings from '@/components/WebhookSettings'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'mixer' | 'automixer' | 'templatemixer' | 'queue' | 'progress' | 'webhook'>('mixer')
  const [apiUrl, setApiUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vmx_api_url')
      if (saved) return saved
    }
    return API_BASE_URL
  })

  return (
    <main style={{ minHeight: '100vh', padding: '2rem', background: '#f6f7fb' }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: '#f6f7fb',
        borderRadius: '24px',
        padding: '1.5rem',
        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.06), 0 6px 14px rgba(15, 23, 42, 0.05)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.2rem'
        }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.9rem', fontWeight: 700 }}>
              VMX Studio
            </h1>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>
              Video workflow dashboard untuk mixing, queue, dan progress.
            </p>
          </div>
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '999px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: '0.8rem',
            color: '#475569'
          }}>
            API: <strong style={{ color: '#0f172a' }}>{apiUrl}</strong>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.6rem',
          marginBottom: '1.2rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e9edf5'
        }}>
          <button
            onClick={() => setActiveTab('mixer')}
            style={{
              padding: '0.58rem 1rem',
              background: activeTab === 'mixer' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'mixer' ? '#ffffff' : '#334155',
              border: activeTab === 'mixer' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            Video Mixer
          </button>
          <button
            onClick={() => setActiveTab('automixer')}
            style={{
              padding: '0.58rem 1rem',
              background: activeTab === 'automixer' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'automixer' ? '#ffffff' : '#334155',
              border: activeTab === 'automixer' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            Auto Mixer
          </button>
          <button
            onClick={() => setActiveTab('templatemixer')}
            style={{
              padding: '0.58rem 1rem',
              background: activeTab === 'templatemixer' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'templatemixer' ? '#ffffff' : '#334155',
              border: activeTab === 'templatemixer' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            Template Mixer
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            style={{
              padding: '0.58rem 1rem',
              background: activeTab === 'queue' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'queue' ? '#ffffff' : '#334155',
              border: activeTab === 'queue' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            Queue {activeTab === 'queue' ? '(Live)' : ''}
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            style={{
              padding: '0.58rem 1rem',
              background: activeTab === 'progress' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'progress' ? '#ffffff' : '#334155',
              border: activeTab === 'progress' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            Progress Tracker
          </button>
          <button
            onClick={() => setActiveTab('webhook')}
            style={{
              padding: '0.58rem 1rem',
              background: activeTab === 'webhook' ? '#0f172a' : '#f8fafc',
              color: activeTab === 'webhook' ? '#ffffff' : '#334155',
              border: activeTab === 'webhook' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            Webhook
          </button>
        </div>

        {/* Content */}
        {activeTab === 'mixer' ? (
          <VideoMixer />
        ) : activeTab === 'automixer' ? (
          <AutoMixer />
        ) : activeTab === 'templatemixer' ? (
          <TemplateMixer />
        ) : activeTab === 'queue' ? (
          <QueueView apiUrl={apiUrl} />
        ) : activeTab === 'progress' ? (
          <ProgressTracker apiUrl={apiUrl} />
        ) : (
          <WebhookSettings />
        )}
      </div>
    </main>
  )
}

