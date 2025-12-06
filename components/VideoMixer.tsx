'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// API URL bisa diatur via environment variable atau default ke localhost
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface AudioFile {
  file: File
  name: string
  id: string
}

interface BuildOptions {
  width: number
  height: number
  fps: number
}

export default function VideoMixer() {
  // Get API URL from localStorage or use default
  const getInitialApiUrl = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vmx_api_url')
      if (saved) return saved
    }
    return API_BASE_URL
  }

  const [apiUrl, setApiUrl] = useState<string>(() => getInitialApiUrl())
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [mode, setMode] = useState<'black-screen' | 'video-loop'>('black-screen')
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [buildOptions, setBuildOptions] = useState<BuildOptions>({
    width: 1920,
    height: 1080,
    fps: 30
  })
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Save API URL to localStorage
  const saveApiUrl = (url: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vmx_api_url', url)
      setApiUrl(url)
      checkApiHealth() // Re-check with new URL
    }
  }

  // Check API health
  const checkApiHealth = useCallback(async () => {
    try {
      console.log('[VMX] Health check: Checking', `${apiUrl}/`)
      const response = await fetch(`${apiUrl}/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      console.log('[VMX] Health check response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('[VMX] Health check response data:', data)
        if (data.status === 'online' || data.status === 'ok') {
          setApiStatus('online')
          return true
        }
      }
      console.warn('[VMX] Health check: API is offline')
      setApiStatus('offline')
      return false
    } catch (err: any) {
      console.error('[VMX] Health check error:', err)
      console.error('[VMX] Health check error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      })
      setApiStatus('offline')
      return false
    }
  }, [apiUrl])

  // Check API on component mount and auto-refresh every 5 seconds
  useEffect(() => {
    checkApiHealth()
    const interval = setInterval(checkApiHealth, 5000) // Check every 5 seconds
    return () => clearInterval(interval)
  }, [checkApiHealth])

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newAudioFiles: AudioFile[] = files.map(file => ({
      file,
      name: file.name,
      id: Math.random().toString(36).substr(2, 9)
    }))
    setAudioFiles(prev => [...prev, ...newAudioFiles])
    setError('')
  }

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setVideoFile(file)
      setError('')
    }
  }

  const removeAudioFile = (id: string) => {
    setAudioFiles(prev => prev.filter(f => f.id !== id))
  }

  const moveAudioFile = (id: string, direction: 'up' | 'down') => {
    setAudioFiles(prev => {
      const index = prev.findIndex(f => f.id === id)
      if (index === -1) return prev
      if (direction === 'up' && index === 0) return prev
      if (direction === 'down' && index === prev.length - 1) return prev

      const newFiles = [...prev]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      ;[newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]]
      return newFiles
    })
  }

  const randomizeAudioFiles = () => {
    if (audioFiles.length <= 1) return
    
    setAudioFiles(prev => {
      const shuffled = [...prev]
      // Fisher-Yates shuffle algorithm
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }

  const buildVideo = async () => {
    console.log('[VMX] ========== Build Video Started ==========')
    console.log('[VMX] Mode:', mode)
    console.log('[VMX] Audio files count:', audioFiles.length)
    console.log('[VMX] Video file:', videoFile ? videoFile.name : 'none')
    
    if (audioFiles.length === 0) {
      console.error('[VMX] Error: No audio files')
      setError('Minimal harus ada 1 file audio')
      return
    }

    if (mode === 'video-loop' && !videoFile) {
      console.error('[VMX] Error: Video file required for video-loop mode')
      setError('Mode video-loop memerlukan file video')
      return
    }

    setIsBuilding(true)
    setError('')
    setBuildProgress('Menyiapkan file...')
    console.log('[VMX] Step 1: Preparing files...')
    
    let startTime: number | null = null

    try {
      // Check API health first
      console.log('[VMX] Step 2: Checking API health at', apiUrl)
      const isHealthy = await checkApiHealth()
      console.log('[VMX] API health check result:', isHealthy)
      
      if (!isHealthy) {
        console.error('[VMX] API server is not healthy')
        throw new Error(`API server tidak tersedia. Pastikan server berjalan di ${apiUrl}`)
      }

      console.log('[VMX] Step 3: Creating FormData...')
      const formData = new FormData()

      // Add audio files
      let totalAudioSize = 0
      audioFiles.forEach((audioFile, index) => {
        const fileSizeMB = audioFile.file.size / 1024 / 1024
        totalAudioSize += audioFile.file.size
        console.log(`[VMX] Adding audio file ${index + 1}:`, audioFile.name, `(${fileSizeMB.toFixed(2)} MB)`)
        formData.append(`audio${index + 1}`, audioFile.file)
      })
      console.log('[VMX] Total audio files size:', (totalAudioSize / 1024 / 1024).toFixed(2), 'MB')

      let url = ''
      if (mode === 'black-screen') {
        // Add query parameters for black-screen mode
        url = `${apiUrl}/api/join/black-screen?width=${buildOptions.width}&height=${buildOptions.height}&fps=${buildOptions.fps}`
        console.log('[VMX] Step 4: Black-screen mode - URL:', url)
        console.log('[VMX] Build options:', buildOptions)
        setBuildProgress('Menggabungkan audio dengan black screen...')
      } else {
        // Add video file for video-loop mode
        if (videoFile) {
          const videoSizeMB = videoFile.size / 1024 / 1024
          console.log('[VMX] Adding video file:', videoFile.name, `(${videoSizeMB.toFixed(2)} MB)`)
          formData.append('video', videoFile)
          console.log('[VMX] Total upload size (audio + video):', ((totalAudioSize + videoFile.size) / 1024 / 1024).toFixed(2), 'MB')
        }
        url = `${apiUrl}/api/join/video-loop`
        console.log('[VMX] Step 4: Video-loop mode - URL:', url)
        setBuildProgress('Menggabungkan audio dengan video loop...')
      }

      setBuildProgress('Mengirim request ke server...')
      console.log('[VMX] Step 5: Sending request to server...')

      // Calculate estimated timeout based on audio duration
      // For very long audio (50+ minutes), we need much longer timeout
      // Base timeout: 6 hours (21600000ms) for processing very long files
      // Add extra buffer: 1 hour per 10 minutes of audio
      const estimatedTimeout = 21600000 // 6 hours base timeout
      console.log('[VMX] Timeout set to:', estimatedTimeout / 1000 / 60, 'minutes (', estimatedTimeout / 1000 / 3600, 'hours)')
      
      const controller = new AbortController()
      startTime = Date.now()
      const timeoutId = setTimeout(() => {
        const elapsed = (Date.now() - startTime) / 1000 / 60
        console.error('[VMX] Request timeout after', elapsed.toFixed(2), 'minutes')
        controller.abort()
        setError('Request timeout - Proses memakan waktu terlalu lama. Silakan coba lagi atau gunakan file yang lebih kecil.')
      }, estimatedTimeout)

      try {
        console.log('[VMX] Fetch request started at:', new Date().toISOString())
        console.log('[VMX] Request URL:', url)
        console.log('[VMX] Request method: POST')
        console.log('[VMX] FormData entries count:', Array.from(formData.entries()).length)
        
        const response = await fetch(url, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          // Keep-alive untuk koneksi yang lama
          keepalive: false,
          // CORS headers akan otomatis ditangani oleh browser dan server
        })

        const fetchTime = (Date.now() - startTime) / 1000
        console.log('[VMX] Fetch response received after', fetchTime.toFixed(2), 'seconds')
        console.log('[VMX] Response status:', response.status)
        console.log('[VMX] Response ok:', response.ok)
        console.log('[VMX] Response headers:', Object.fromEntries(response.headers.entries()))

        if (!response.ok) {
          console.error('[VMX] Response not OK:', response.status, response.statusText)
          let errorMessage = `Server error: ${response.status}`
          try {
            const errorText = await response.text()
            console.error('[VMX] Error response body:', errorText)
            if (errorText) {
              errorMessage = errorText
            }
          } catch (e) {
            console.error('[VMX] Failed to read error response:', e)
            // Ignore if can't parse error
          }
          throw new Error(errorMessage)
        }

        console.log('[VMX] Step 6: Response OK, starting blob download...')
        setBuildProgress('Mendownload hasil video...')

        // Get the video blob with timeout handling
        // Use Promise.race to add timeout for blob download (30 minutes)
        const blobStartTime = Date.now()
        console.log('[VMX] Starting blob download at:', new Date().toISOString())
        
        const blobPromise = response.blob()
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            const elapsed = (Date.now() - blobStartTime) / 1000 / 60
            console.error('[VMX] Blob download timeout after', elapsed.toFixed(2), 'minutes')
            reject(new Error('Timeout saat mendownload video hasil (lebih dari 30 menit)'))
          }, 1800000) // 30 minutes
        })

        let blob: Blob
        try {
          blob = await Promise.race([blobPromise, timeoutPromise])
          const blobTime = (Date.now() - blobStartTime) / 1000
          console.log('[VMX] Blob downloaded successfully after', blobTime.toFixed(2), 'seconds')
          console.log('[VMX] Blob size:', (blob.size / 1024 / 1024).toFixed(2), 'MB')
          console.log('[VMX] Blob type:', blob.type)
        } catch (blobErr: any) {
          console.error('[VMX] Blob download error:', blobErr)
          if (blobErr.message?.includes('Timeout')) {
            throw new Error('Timeout saat mendownload video hasil. File mungkin terlalu besar.')
          }
          throw blobErr
        }
        
        console.log('[VMX] Step 7: Creating download link...')
        const videoUrl = URL.createObjectURL(blob)

        // Create download link
        const a = document.createElement('a')
        a.href = videoUrl
        const filename = `output-${Date.now()}.mp4`
        a.download = filename
        console.log('[VMX] Download filename:', filename)
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(videoUrl)

        const totalTime = (Date.now() - startTime) / 1000 / 60
        console.log('[VMX] ========== Build Video Completed Successfully ==========')
        console.log('[VMX] Total time:', totalTime.toFixed(2), 'minutes')
        console.log('[VMX] ========================================================')
        
        setBuildProgress('Selesai! Video berhasil dibuat dan didownload.')
        setTimeout(() => {
          setBuildProgress('')
          setIsBuilding(false)
        }, 2000)
      } finally {
        clearTimeout(timeoutId) // Always clear timeout
        console.log('[VMX] Timeout cleared')
      }

    } catch (err: any) {
      const elapsed = startTime ? (Date.now() - startTime) : 0
      console.error('[VMX] ========== Build Video Failed ==========')
      console.error('[VMX] Error name:', err.name)
      console.error('[VMX] Error message:', err.message)
      console.error('[VMX] Error stack:', err.stack)
      console.error('[VMX] Time elapsed:', (elapsed / 1000 / 60).toFixed(2), 'minutes')
      console.error('[VMX] Error details:', {
        name: err.name,
        message: err.message,
        cause: err.cause,
        code: err.code
      })
      console.error('[VMX] =========================================')
      
      // Handle timeout errors specifically
      if (err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        console.error('[VMX] Detected timeout/network error')
        setError('Request timeout - File terlalu besar atau proses memakan waktu lama. Proses masih berjalan di server, silakan tunggu atau coba lagi nanti. Timeout saat ini: 6 jam.')
      } else if (err.message?.includes('fetch')) {
        console.error('[VMX] Detected fetch error')
        setError('Gagal terhubung ke server. Pastikan server masih berjalan dan koneksi internet stabil. Proses mungkin masih berjalan di server.')
      } else {
        console.error('[VMX] Other error')
        setError(err.message || 'Terjadi kesalahan saat membangun video')
      }
      setIsBuilding(false)
      setBuildProgress('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* API Status */}
      <div style={{
        padding: '1rem',
        borderRadius: '8px',
        background: apiStatus === 'online' ? '#d4edda' : apiStatus === 'offline' ? '#f8d7da' : '#fff3cd',
        border: `1px solid ${apiStatus === 'online' ? '#c3e6cb' : apiStatus === 'offline' ? '#f5c6cb' : '#ffeaa7'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span style={{ fontSize: '1.2rem' }}>
          {apiStatus === 'online' ? '🟢' : apiStatus === 'offline' ? '🔴' : '🟡'}
        </span>
        <span style={{ flex: 1 }}>
          {apiStatus === 'online' 
            ? `API Server Online (${apiUrl})` 
            : apiStatus === 'offline' 
            ? `API Server Offline - Pastikan server berjalan di ${apiUrl}`
            : 'Memeriksa status API...'}
        </span>
        {apiStatus !== 'checking' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowApiConfig(!showApiConfig)}
              style={{
                padding: '0.5rem 1rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              ⚙️ Config
            </button>
            <button
              onClick={checkApiHealth}
              style={{
                padding: '0.5rem 1rem',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* API Configuration */}
      {showApiConfig && (
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: '#f8f9fa',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Konfigurasi API Server</h4>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:8080"
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
            <button
              onClick={() => saveApiUrl(apiUrl)}
              style={{
                padding: '0.5rem 1rem',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Simpan
            </button>
            <button
              onClick={() => {
                setApiUrl(API_BASE_URL)
                saveApiUrl(API_BASE_URL)
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </div>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#6c757d' }}>
            Untuk deploy ke cloud, masukkan URL backend API Anda (contoh: https://api.example.com)
          </p>
        </div>
      )}

      {/* Mode Selection */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="radio"
            value="black-screen"
            checked={mode === 'black-screen'}
            onChange={(e) => {
              setMode('black-screen')
              setVideoFile(null)
            }}
          />
          <span>Black Screen (Audio saja)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="radio"
            value="video-loop"
            checked={mode === 'video-loop'}
            onChange={(e) => setMode('video-loop')}
          />
          <span>Video Loop (Video + Audio)</span>
        </label>
      </div>

      {/* Video Upload (for video-loop mode) */}
      {mode === 'video-loop' && (
        <div style={{
          padding: '1.5rem',
          border: '2px dashed #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Video Background</h3>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            style={{ display: 'none' }}
          />
          {videoFile ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem',
              background: 'white',
              borderRadius: '4px',
              marginBottom: '0.5rem'
            }}>
              <span>📹 {videoFile?.name || 'Video'}</span>
              <button
                onClick={() => {
                  setVideoFile(null)
                  if (videoInputRef.current) videoInputRef.current.value = ''
                }}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Hapus
              </button>
            </div>
          ) : (
            <button
              onClick={() => videoInputRef.current?.click()}
              style={{
                padding: '1rem 2rem',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              📹 Upload Video
            </button>
          )}
        </div>
      )}

      {/* Audio Files Upload */}
      <div style={{
        padding: '1.5rem',
        border: '2px dashed #dee2e6',
        borderRadius: '8px',
        background: '#f8f9fa'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>File Audio</h3>
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleAudioUpload}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => audioInputRef.current?.click()}
            style={{
              padding: '1rem 2rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            🎵 Upload Audio Files
          </button>
          
          {audioFiles.length > 1 && (
            <button
              onClick={randomizeAudioFiles}
              style={{
                padding: '1rem 2rem',
                background: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              🎲 Randomize Urutan
            </button>
          )}
        </div>

        {audioFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {audioFiles.map((audioFile, index) => (
              <div
                key={audioFile.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  background: 'white',
                  borderRadius: '4px'
                }}
              >
                <span style={{ minWidth: '30px', fontWeight: 'bold' }}>#{index + 1}</span>
                <span style={{ flex: 1 }}>🎵 {audioFile.name}</span>
                <button
                  onClick={() => moveAudioFile(audioFile.id, 'up')}
                  disabled={index === 0}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: index === 0 ? '#ccc' : '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: index === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() => moveAudioFile(audioFile.id, 'down')}
                  disabled={index === audioFiles.length - 1}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: index === audioFiles.length - 1 ? '#ccc' : '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: index === audioFiles.length - 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ↓
                </button>
                <button
                  onClick={() => removeAudioFile(audioFile.id)}
                  style={{
                    padding: '0.25rem 0.75rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Build Options (for black-screen mode) */}
      {mode === 'black-screen' && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Opsi Build</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Width (px)
              </label>
              <input
                type="number"
                value={buildOptions.width}
                onChange={(e) => setBuildOptions(prev => ({ ...prev, width: parseInt(e.target.value) || 1920 }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Height (px)
              </label>
              <input
                type="number"
                value={buildOptions.height}
                onChange={(e) => setBuildOptions(prev => ({ ...prev, height: parseInt(e.target.value) || 1080 }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px'
                }}
              /> 
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                FPS
              </label>
              <input
                type="number"
                value={buildOptions.fps}
                onChange={(e) => setBuildOptions(prev => ({ ...prev, fps: parseInt(e.target.value) || 30 }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '8px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Build Progress */}
      {buildProgress && (
        <div style={{
          padding: '1rem',
          background: '#d1ecf1',
          color: '#0c5460',
          border: '1px solid #bee5eb',
          borderRadius: '8px'
        }}>
          {buildProgress}
        </div>
      )}

      {/* Build Button */}
      <button
        onClick={buildVideo}
        disabled={isBuilding || audioFiles.length === 0 || (mode === 'video-loop' && !videoFile)}
        style={{
          padding: '1rem 2rem',
          background: isBuilding || audioFiles.length === 0 || (mode === 'video-loop' && !videoFile) 
            ? '#6c757d' 
            : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: isBuilding || audioFiles.length === 0 || (mode === 'video-loop' && !videoFile)
            ? 'not-allowed'
            : 'pointer',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          transition: 'all 0.3s'
        }}
      >
        {isBuilding ? '⏳ Membangun Video...' : '🎬 Build Video'}
      </button>
    </div>
  )
}

