'use client'

import { useState } from 'react'
import VideoMixer from '@/components/VideoMixer'
import QueueView from '@/components/QueueView'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'mixer' | 'queue'>('mixer')
  const [apiUrl, setApiUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vmx_api_url')
      if (saved) return saved
    }
    return API_BASE_URL
  })

  return (
    <main style={{ padding: '2rem', minHeight: '100vh' }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto',
        background: 'white',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '2rem',
          color: '#333',
          fontSize: '2.5rem',
          fontWeight: 'bold'
        }}>
          🎬 VMX - Video Mixer
        </h1>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          borderBottom: '2px solid #dee2e6'
        }}>
          <button
            onClick={() => setActiveTab('mixer')}
            style={{
              padding: '1rem 2rem',
              background: activeTab === 'mixer' ? '#007bff' : 'transparent',
              color: activeTab === 'mixer' ? 'white' : '#333',
              border: 'none',
              borderBottom: activeTab === 'mixer' ? '3px solid #007bff' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            🎬 Video Mixer
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            style={{
              padding: '1rem 2rem',
              background: activeTab === 'queue' ? '#007bff' : 'transparent',
              color: activeTab === 'queue' ? 'white' : '#333',
              border: 'none',
              borderBottom: activeTab === 'queue' ? '3px solid #007bff' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            📋 Queue ({activeTab === 'queue' ? 'Live' : ''})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'mixer' ? (
          <VideoMixer />
        ) : (
          <QueueView apiUrl={apiUrl} />
        )}
      </div>
    </main>
  )
}

