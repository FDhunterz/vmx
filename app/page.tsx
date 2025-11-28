'use client'

import VideoMixer from '@/components/VideoMixer'

export default function Home() {
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
        <VideoMixer />
      </div>
    </main>
  )
}

