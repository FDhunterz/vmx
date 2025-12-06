'use client'

import { useState, useEffect } from 'react'

interface QueueItem {
  id: string
  type: string
  status: string
  progress: number
  outputFile: string
  width: number
  height: number
  fps: number
  encoder?: string
  preset?: string
  createdAt: string
  updatedAt: string
  errorMessage?: string
}

interface QueueViewProps {
  apiUrl: string
}

export default function QueueView({ apiUrl }: QueueViewProps) {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set())

  const fetchQueue = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/queue/list`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch queue')
      }

      const data = await response.json()
      setQueueItems(data)
      setError('')
    } catch (err: any) {
      console.error('[QUEUE] Error fetching queue:', err)
      setError(err.message || 'Failed to fetch queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
    // Auto-refresh every 2 seconds
    const interval = setInterval(fetchQueue, 2000)
    return () => clearInterval(interval)
  }, [apiUrl])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#28a745'
      case 'processing':
        return '#007bff'
      case 'failed':
        return '#dc3545'
      case 'pending':
        return '#ffc107'
      case 'cancelled':
        return '#6c757d'
      default:
        return '#6c757d'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✅'
      case 'processing':
        return '⏳'
      case 'failed':
        return '❌'
      case 'pending':
        return '⏸️'
      default:
        return '❓'
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('id-ID')
    } catch {
      return dateString
    }
  }

  const downloadFile = (outputFile: string) => {
    // Extract filename from path
    const filename = outputFile.split(/[/\\]/).pop() || 'output.mp4'
    // Try to open the file - user will need to navigate to the Downloads folder
    alert(`File tersimpan di: ${outputFile}\n\nSilakan buka folder Downloads/vmx_file untuk mengakses file.`)
  }

  const cancelQueueItem = async (queueId: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan queue ini?')) {
      return
    }

    setCancellingIds(prev => new Set(prev).add(queueId))

    try {
      const response = await fetch(`${apiUrl}/api/queue/cancel?id=${queueId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to cancel queue')
      }

      // Refresh queue after cancellation
      await fetchQueue()
    } catch (err: any) {
      console.error('[QUEUE] Error cancelling queue:', err)
      setError(err.message || 'Failed to cancel queue')
      setTimeout(() => setError(''), 5000)
    } finally {
      setCancellingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(queueId)
        return newSet
      })
    }
  }

  if (loading) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#6c757d'
      }}>
        Memuat queue...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <h3 style={{ margin: 0 }}>📋 Queue Processing</h3>
        <button
          onClick={fetchQueue}
          style={{
            padding: '0.5rem 1rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>

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

      {queueItems.length === 0 ? (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6c757d',
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '1px dashed #dee2e6'
        }}>
          Queue kosong. Tidak ada proses yang sedang berjalan.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {queueItems.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '1.5rem',
                background: 'white',
                borderRadius: '8px',
                border: `2px solid ${getStatusColor(item.status)}`,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{getStatusIcon(item.status)}</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                      {item.type === 'black-screen' ? '🎬 Black Screen' : '🎥 Video Loop'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6c757d' }}>
                      ID: {item.id.substring(0, 8)}...
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '0.5rem 1rem',
                  background: getStatusColor(item.status),
                  color: 'white',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  fontSize: '0.875rem'
                }}>
                  {item.status.toUpperCase()}
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem'
                }}>
                  <span>Progress</span>
                  <span style={{ fontWeight: 'bold' }}>{item.progress}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '24px',
                  background: '#e9ecef',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${item.progress}%`,
                    height: '100%',
                    background: item.progress === 100 
                      ? '#28a745' 
                      : item.status === 'failed' 
                      ? '#dc3545' 
                      : '#007bff',
                    transition: 'width 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    {item.progress > 0 && item.progress < 100 && `${item.progress}%`}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#6c757d'
              }}>
                {item.type === 'black-screen' && (
                  <>
                    <div>Width: {item.width}px</div>
                    <div>Height: {item.height}px</div>
                    <div>FPS: {item.fps}</div>
                  </>
                )}
                {item.encoder && (
                  <div>
                    <strong>Encoder:</strong> {item.encoder === 'cpu' ? 'CPU (libx264)' : 
                      item.encoder === 'nvenc' ? 'NVIDIA GPU (NVENC)' :
                      item.encoder === 'qsv' ? 'Intel GPU (Quick Sync)' :
                      item.encoder === 'amf' ? 'AMD GPU (AMF)' :
                      item.encoder === 'vaapi' ? 'VAAPI (Linux)' :
                      item.encoder === 'videotoolbox' ? 'Apple GPU (VideoToolbox)' : item.encoder}
                  </div>
                )}
                {item.preset && (
                  <div>
                    <strong>Preset:</strong> {item.preset}
                  </div>
                )}
                <div>Created: {formatDate(item.createdAt)}</div>
                <div>Updated: {formatDate(item.updatedAt)}</div>
              </div>

              {/* Error Message */}
              {item.errorMessage && (
                <div style={{
                  padding: '0.75rem',
                  background: '#f8d7da',
                  color: '#721c24',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}>
                  <strong>Error:</strong> {item.errorMessage}
                </div>
              )}

              {/* Output File */}
              {item.status === 'completed' && item.outputFile && (
                <div style={{
                  padding: '0.75rem',
                  background: '#d4edda',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    ✅ File selesai diproses:
                  </div>
                  <div style={{ 
                    wordBreak: 'break-all',
                    color: '#155724',
                    marginBottom: '0.5rem'
                  }}>
                    {item.outputFile}
                  </div>
                  <button
                    onClick={() => downloadFile(item.outputFile)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    📥 Info Lokasi File
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end'
              }}>
                {(item.status === 'pending' || item.status === 'processing') && (
                  <button
                    onClick={() => cancelQueueItem(item.id)}
                    disabled={cancellingIds.has(item.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: cancellingIds.has(item.id) ? '#6c757d' : '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: cancellingIds.has(item.id) ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      opacity: cancellingIds.has(item.id) ? 0.6 : 1
                    }}
                  >
                    {cancellingIds.has(item.id) ? '⏳ Membatalkan...' : '❌ Batalkan'}
                  </button>
                )}
                {(item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') && (
                  <button
                    onClick={() => cancelQueueItem(item.id)}
                    disabled={cancellingIds.has(item.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: cancellingIds.has(item.id) ? '#6c757d' : '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: cancellingIds.has(item.id) ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      opacity: cancellingIds.has(item.id) ? 0.6 : 1
                    }}
                  >
                    {cancellingIds.has(item.id) ? '⏳ Menghapus...' : '🗑️ Hapus'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

