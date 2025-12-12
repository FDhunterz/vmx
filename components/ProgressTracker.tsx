'use client'

import { useState, useEffect, useRef } from 'react'

// File System Access API types
interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file'
  getFile(): Promise<File>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory'
  getFileHandle(name: string): Promise<FileSystemFileHandle>
  values(): AsyncIterableIterator<FileSystemHandle>
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
}

interface FileInfo {
  name: string
  size: number
  lastModified: number
  type: string
  progressData?: ProgressData
  progressTarget?: ProgressTarget
}

interface ProgressData {
  frame: number
  fps: number
  bitrate: string
  outTime: string
  outTimeMs: number
  speed: string
  progress: string
  totalSize: number
  streamQuality?: number
}

interface ProgressTarget {
  queueId: string
  type: string
  outputFile: string
  totalDuration: number
  totalFrames: number
  width?: number
  height?: number
  fps?: number
  encoder: string
  preset: string
  fadeEffect?: string
  fadeDuration?: number
  fadeOffset?: number
  createdAt: string
}

interface ProgressTrackerProps {
  apiUrl: string
}

export default function ProgressTracker({ apiUrl }: ProgressTrackerProps) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [directoryPath, setDirectoryPath] = useState<string>('')
  const [isRestoring, setIsRestoring] = useState(true)
  const directoryInputRef = useRef<HTMLInputElement>(null)

  // Check if File System Access API is supported
  const isFileSystemAccessSupported = () => {
    return 'showDirectoryPicker' in window
  }

  // Save directory handle to IndexedDB
  const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
    try {
      if ('storage' in navigator && 'persist' in navigator.storage) {
        const persisted = await navigator.storage.persist()
        if (persisted) {
          console.log('[PROGRESS] Storage persistence granted')
        }
      }

      // Save to IndexedDB
      const dbName = 'vmx_directory_db'
      const dbVersion = 1
      
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        
        request.onerror = () => {
          console.error('[PROGRESS] Failed to open IndexedDB:', request.error)
          reject(request.error)
        }
        
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(['handles'], 'readwrite')
          const store = transaction.objectStore('handles')
          
          // Store handle with ID
          const putRequest = store.put(handle, 'directory_handle')
          
          putRequest.onsuccess = () => {
            console.log('[PROGRESS] Directory handle saved to IndexedDB')
            resolve()
          }
          
          putRequest.onerror = () => {
            console.error('[PROGRESS] Failed to save handle:', putRequest.error)
            reject(putRequest.error)
          }
        }
        
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result
          if (!db.objectStoreNames.contains('handles')) {
            db.createObjectStore('handles')
          }
        }
      })
    } catch (err) {
      console.error('[PROGRESS] Error saving directory handle:', err)
    }
  }

  // Restore directory handle from IndexedDB
  const restoreDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const dbName = 'vmx_directory_db'
      const dbVersion = 1
      
      return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        
        request.onerror = () => {
          console.error('[PROGRESS] Failed to open IndexedDB:', request.error)
          resolve(null)
        }
        
        request.onsuccess = () => {
          const db = request.result
          
          if (!db.objectStoreNames.contains('handles')) {
            resolve(null)
            return
          }
          
          const transaction = db.transaction(['handles'], 'readonly')
          const store = transaction.objectStore('handles')
          const getRequest = store.get('directory_handle')
          
          getRequest.onsuccess = () => {
            const handle = getRequest.result as FileSystemDirectoryHandle | undefined
            if (handle) {
              console.log('[PROGRESS] Directory handle restored from IndexedDB')
              resolve(handle)
            } else {
              resolve(null)
            }
          }
          
          getRequest.onerror = () => {
            console.error('[PROGRESS] Failed to get handle:', getRequest.error)
            resolve(null)
          }
        }
        
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result
          if (!db.objectStoreNames.contains('handles')) {
            db.createObjectStore('handles')
          }
        }
      })
    } catch (err) {
      console.error('[PROGRESS] Error restoring directory handle:', err)
      return null
    }
  }

  // Verify directory handle is still accessible
  const verifyDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
    try {
      // Try to iterate directory to verify access
      const iterator = handle.values()
      await iterator.next()
      return true
    } catch (err) {
      console.error('[PROGRESS] Directory handle verification failed:', err)
      return false
    }
  }

  // Open directory picker using File System Access API
  const openDirectoryPicker = async () => {
    if (!isFileSystemAccessSupported()) {
      setError('File System Access API tidak didukung di browser ini. Gunakan Chrome/Edge versi terbaru.')
      return
    }

    try {
      setLoading(true)
      setError('')

      const handle = await (window as any).showDirectoryPicker({
        mode: 'read'
      })

      setDirectoryHandle(handle)
      setDirectoryPath(handle.name)
      
      // Save directory name to localStorage for display
      if (typeof window !== 'undefined') {
        localStorage.setItem('vmx_directory_name', handle.name)
      }

      // Save handle to IndexedDB for persistence
      await saveDirectoryHandle(handle)

      // Read files from directory
      await readDirectoryFiles(handle)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[PROGRESS] Error opening directory:', err)
        setError(err.message || 'Gagal membuka directory')
      }
    } finally {
      setLoading(false)
    }
  }

  // Parse progress file content
  const parseProgressFile = async (file: File): Promise<ProgressData | null> => {
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      // Get the last valid progress entry (latest data is at the end)
      // Progress entries are grouped by frame=, so we need to find the last complete group
      let currentProgress: ProgressData | null = null
      let lastProgress: ProgressData | null = null
      
      for (const line of lines) {
        if (!line.includes('=')) continue
        
        const parts = line.split('=')
        if (parts.length !== 2) continue
        
        const key = parts[0].trim()
        const value = parts[1].trim()
        
        // Initialize new progress object when we encounter frame=
        if (key === 'frame') {
          // Save previous progress if exists
          if (currentProgress) {
            lastProgress = { ...currentProgress }
          }
          
          // Start new progress entry
          currentProgress = {
            frame: parseInt(value) || 0,
            fps: 0,
            bitrate: '',
            outTime: '',
            outTimeMs: 0,
            speed: '',
            progress: 'continue',
            totalSize: 0
          }
        } else if (currentProgress) {
          // Update current progress object with other values
          switch (key) {
            case 'fps':
              currentProgress.fps = parseFloat(value) || 0
              break
            case 'bitrate':
              currentProgress.bitrate = value.trim()
              break
            case 'out_time':
              currentProgress.outTime = value
              break
            case 'out_time_ms':
              currentProgress.outTimeMs = parseInt(value) || 0
              break
            case 'speed':
              currentProgress.speed = value.trim()
              break
            case 'progress':
              currentProgress.progress = value
              break
            case 'total_size':
              currentProgress.totalSize = parseInt(value) || 0
              break
            case 'stream_0_0_q':
              currentProgress.streamQuality = parseFloat(value) || undefined
              break
          }
        }
      }
      
      // Return the last complete progress entry (or current if it's the only one)
      return currentProgress || lastProgress
    } catch (err) {
      console.error('[PROGRESS] Error parsing progress file:', err)
      return null
    }
  }

  // Get base name without extension and _progress suffix
  const getBaseFileName = (fileName: string): string => {
    // Remove _progress.txt, _progress_target.txt or .mp4 extension
    return fileName
      .replace(/_progress\.txt$/, '')
      .replace(/_progress_target\.txt$/, '')
      .replace(/\.(mp4|mkv|avi)$/, '')
  }

  // Parse progress target file
  const parseProgressTargetFile = async (file: File): Promise<ProgressTarget | null> => {
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      const target: Partial<ProgressTarget> = {}
      
      for (const line of lines) {
        if (!line.includes('=')) continue
        
        const parts = line.split('=')
        if (parts.length !== 2) continue
        
        const key = parts[0].trim()
        const value = parts[1].trim()
        
        switch (key) {
          case 'queue_id':
            target.queueId = value
            break
          case 'type':
            target.type = value
            break
          case 'output_file':
            target.outputFile = value
            break
          case 'total_duration':
            target.totalDuration = parseFloat(value) || 0
            break
          case 'total_frames':
            target.totalFrames = parseInt(value) || 0
            break
          case 'width':
            target.width = parseInt(value) || undefined
            break
          case 'height':
            target.height = parseInt(value) || undefined
            break
          case 'fps':
            target.fps = parseInt(value) || undefined
            break
          case 'encoder':
            target.encoder = value
            break
          case 'preset':
            target.preset = value
            break
          case 'fade_effect':
            target.fadeEffect = value === 'none' ? undefined : value
            break
          case 'fade_duration':
            target.fadeDuration = parseFloat(value) || undefined
            break
          case 'fade_offset':
            target.fadeOffset = parseFloat(value) || undefined
            break
          case 'created_at':
            target.createdAt = value
            break
        }
      }
      
      if (target.queueId && target.totalDuration && target.totalFrames) {
        return target as ProgressTarget
      }
      
      return null
    } catch (err) {
      console.error('[PROGRESS] Error parsing progress target file:', err)
      return null
    }
  }

  // Read files from directory
  const readDirectoryFiles = async (handle: FileSystemDirectoryHandle) => {
    try {
      setLoading(true)
      const fileList: FileInfo[] = []
      const progressFiles = new Map<string, File>() // Map base name to progress file

      // First pass: collect video files, progress files, and target files
      const targetFiles = new Map<string, File>() // Map base name to target file
      
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const fileHandle = entry as FileSystemFileHandle
          const file = await fileHandle.getFile()
          const fileName = file.name.toLowerCase()
          
          // Collect progress files
          if (fileName.endsWith('_progress.txt')) {
            const baseName = getBaseFileName(file.name)
            progressFiles.set(baseName, file)
          }
          
          // Collect progress target files
          if (fileName.endsWith('_progress_target.txt')) {
            const baseName = getBaseFileName(file.name)
            targetFiles.set(baseName, file)
          }
          
          // Collect video files
          if (fileName.endsWith('.mp4') || 
              fileName.endsWith('.mkv') || 
              fileName.endsWith('.avi')) {
            fileList.push({
              name: file.name,
              size: file.size,
              lastModified: file.lastModified,
              type: file.type || 'unknown'
            })
          }
        }
      }

      // Second pass: parse progress files and target files, attach to corresponding video files
      for (const fileInfo of fileList) {
        const baseName = getBaseFileName(fileInfo.name)
        const progressFile = progressFiles.get(baseName)
        const targetFile = targetFiles.get(baseName)
        
        // Parse progress target file (contains configuration)
        if (targetFile) {
          const progressTarget = await parseProgressTargetFile(targetFile)
          if (progressTarget) {
            fileInfo.progressTarget = progressTarget
          }
        }
        
        // Parse progress file (contains current progress)
        if (progressFile) {
          const progressData = await parseProgressFile(progressFile)
          if (progressData) {
            fileInfo.progressData = progressData
          }
        }
      }

      // Sort by last modified (newest first)
      fileList.sort((a, b) => b.lastModified - a.lastModified)
      setFiles(fileList)
    } catch (err: any) {
      console.error('[PROGRESS] Error reading directory:', err)
      setError(err.message || 'Gagal membaca file dari directory')
    } finally {
      setLoading(false)
    }
  }

  // Refresh files from current directory
  const refreshFiles = async () => {
    if (directoryHandle) {
      await readDirectoryFiles(directoryHandle)
    } else {
      setError('Silakan pilih directory terlebih dahulu')
    }
  }

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Get file icon
  const getFileIcon = (fileName: string): string => {
    if (fileName.endsWith('_progress.txt')) return '📄'
    if (fileName.endsWith('.mp4')) return '🎬'
    if (fileName.endsWith('.mkv')) return '🎥'
    if (fileName.endsWith('.avi')) return '📹'
    return '📁'
  }

  // Open file in directory (if possible)
  const openFile = async (fileName: string) => {
    if (!directoryHandle) return

    try {
      const fileHandle = await directoryHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      
      // Create object URL and download
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('[PROGRESS] Error opening file:', err)
      setError('Gagal membuka file: ' + err.message)
    }
  }

  // Restore directory handle on mount
  useEffect(() => {
    const restoreDirectory = async () => {
      if (!isFileSystemAccessSupported()) {
        setIsRestoring(false)
        return
      }

      try {
        setIsRestoring(true)
        
        // Try to restore handle from IndexedDB
        const handle = await restoreDirectoryHandle()
        
        if (handle) {
          // Verify handle is still accessible
          const isValid = await verifyDirectoryHandle(handle)
          
          if (isValid) {
            setDirectoryHandle(handle)
            setDirectoryPath(handle.name)
            
            // Read files from restored directory
            await readDirectoryFiles(handle)
            console.log('[PROGRESS] Directory restored successfully')
          } else {
            console.log('[PROGRESS] Stored directory handle is no longer accessible')
            // Clear invalid handle from IndexedDB
            await clearDirectoryHandle()
          }
        } else {
          // Try to restore directory name from localStorage for display
          const savedDirName = typeof window !== 'undefined' 
            ? localStorage.getItem('vmx_directory_name') 
            : null
          
          if (savedDirName) {
            setDirectoryPath(savedDirName)
          }
        }
      } catch (err) {
        console.error('[PROGRESS] Error restoring directory:', err)
      } finally {
        setIsRestoring(false)
      }
    }

    restoreDirectory()
  }, [])

  // Clear directory handle from IndexedDB
  const clearDirectoryHandle = async () => {
    try {
      const dbName = 'vmx_directory_db'
      const dbVersion = 1
      
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        
        request.onsuccess = () => {
          const db = request.result
          if (db.objectStoreNames.contains('handles')) {
            const transaction = db.transaction(['handles'], 'readwrite')
            const store = transaction.objectStore('handles')
            const deleteRequest = store.delete('directory_handle')
            
            deleteRequest.onsuccess = () => {
              console.log('[PROGRESS] Directory handle cleared from IndexedDB')
              resolve()
            }
            
            deleteRequest.onerror = () => {
              reject(deleteRequest.error)
            }
          } else {
            resolve()
          }
        }
        
        request.onerror = () => {
          resolve() // Ignore errors
        }
        
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result
          if (!db.objectStoreNames.contains('handles')) {
            db.createObjectStore('handles')
          }
        }
      })
    } catch (err) {
      console.error('[PROGRESS] Error clearing directory handle:', err)
    }
  }

  if (!isFileSystemAccessSupported()) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        background: '#fff3cd',
        borderRadius: '8px',
        border: '1px solid #ffc107'
      }}>
        <h3 style={{ marginTop: 0, color: '#856404' }}>⚠️ Browser Tidak Didukung</h3>
        <p style={{ color: '#856404' }}>
          File System Access API hanya didukung di browser modern seperti Chrome/Edge versi terbaru.
        </p>
        <p style={{ color: '#856404', fontSize: '0.875rem' }}>
          Silakan gunakan Chrome atau Edge untuk fitur ini.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <div>
          <h3 style={{ margin: 0 }}>📂 Progress Tracker</h3>
          {directoryPath && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6c757d' }}>
              Directory: {directoryPath}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {directoryHandle && (
            <>
              <button
                onClick={refreshFiles}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                🔄 Refresh
              </button>
              <button
                onClick={async () => {
                  setDirectoryHandle(null)
                  setDirectoryPath('')
                  setFiles([])
                  await clearDirectoryHandle()
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('vmx_directory_name')
                  }
                }}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                🗑️ Hapus
              </button>
            </>
          )}
          <button
            onClick={openDirectoryPicker}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              background: directoryHandle ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {directoryHandle ? '📂 Ganti Directory' : '📂 Pilih Directory'}
          </button>
        </div>
      </div>

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

      {/* Info */}
      {!directoryHandle && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          background: '#d1ecf1',
          borderRadius: '8px',
          border: '1px solid #bee5eb'
        }}>
          <p style={{ margin: 0, color: '#0c5460' }}>
            Klik <strong>"Pilih Directory"</strong> untuk memilih folder output file (contoh: C:\Users\FDhunterz\Downloads\vmx_file)
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#0c5460' }}>
            Browser akan meminta izin untuk mengakses directory yang dipilih.
          </p>
        </div>
      )}

      {/* Restoring */}
      {isRestoring && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6c757d'
        }}>
          Memulihkan directory yang tersimpan...
        </div>
      )}

      {/* Loading */}
      {!isRestoring && loading && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6c757d'
        }}>
          Memuat file...
        </div>
      )}

      {/* File List */}
      {!isRestoring && !loading && directoryHandle && files.length === 0 && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6c757d',
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '1px dashed #dee2e6'
        }}>
          Tidak ada file video atau progress file di directory ini.
        </div>
      )}

      {!isRestoring && !loading && files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{
            padding: '0.75rem',
            background: '#e9ecef',
            borderRadius: '4px',
            fontSize: '0.875rem',
            fontWeight: 'bold'
          }}>
            Total: {files.length} file
          </div>
          
          {files.map((file, index) => (
            <div
              key={index}
              style={{
                padding: '1rem',
                background: 'white',
                borderRadius: '8px',
                border: file.progressData ? '2px solid #007bff' : '1px solid #dee2e6',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}
            >
              {/* File Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{getFileIcon(file.name)}</span>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', wordBreak: 'break-all' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6c757d', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span>📦 {formatFileSize(file.size)}</span>
                    <span>🕒 {formatDate(file.lastModified)}</span>
                  </div>
                </div>
              </div>

              {/* Progress Information */}
              {(file.progressData || file.progressTarget) && (
                <div style={{
                  padding: '0.75rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6'
                }}>
                  {/* Progress Bar */}
                  {file.progressTarget && file.progressData && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.25rem',
                        fontSize: '0.75rem',
                        color: '#6c757d'
                      }}>
                        <span>Progress</span>
                        <span style={{ fontWeight: 'bold' }}>
                          {(() => {
                            // Calculate percentage based on time (out_time_ms / total_duration)
                            if (file.progressData.progress === 'end') {
                              return 100
                            }
                            if (file.progressTarget.totalDuration > 0 && file.progressData.outTimeMs > 0) {
                              // Convert outTimeMs from microseconds to seconds, then calculate percentage
                              const currentTimeSeconds = file.progressData.outTimeMs / 1000000.0
                              const percentage = Math.min((currentTimeSeconds / file.progressTarget.totalDuration) * 100, 100)
                              return Math.round(percentage)
                            }
                            return 0
                          })()}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '20px',
                        background: '#e9ecef',
                        borderRadius: '10px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${(() => {
                            // Calculate percentage based on time
                            if (file.progressData.progress === 'end') {
                              return 100
                            }
                            if (file.progressTarget.totalDuration > 0 && file.progressData.outTimeMs > 0) {
                              const currentTimeSeconds = file.progressData.outTimeMs / 1000000.0
                              const percentage = Math.min((currentTimeSeconds / file.progressTarget.totalDuration) * 100, 100)
                              return Math.max(0, Math.min(percentage, 100))
                            }
                            return 0
                          })()}%`,
                          height: '100%',
                          background: file.progressData.progress === 'end' ? '#28a745' : '#007bff',
                          transition: 'width 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '0.7rem',
                          fontWeight: 'bold'
                        }}>
                          {(() => {
                            if (file.progressData.progress === 'end') {
                              return '100% Complete'
                            }
                            if (file.progressTarget.totalDuration > 0 && file.progressData.outTimeMs > 0) {
                              const currentTimeSeconds = file.progressData.outTimeMs / 1000000.0
                              const percentage = Math.min((currentTimeSeconds / file.progressTarget.totalDuration) * 100, 100)
                              return `${Math.round(percentage)}%`
                            }
                            return '0%'
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ 
                    fontWeight: 'bold', 
                    marginBottom: '0.5rem',
                    color: file.progressData?.progress === 'end' ? '#28a745' : '#007bff',
                    fontSize: '0.875rem'
                  }}>
                    {file.progressData?.progress === 'end' ? '✅ Processing Complete' : '⏳ Processing...'}
                  </div>
                  
                  {/* Target Configuration */}
                  {file.progressTarget && (
                    <div style={{
                      marginBottom: '0.5rem',
                      padding: '0.5rem',
                      background: '#e7f3ff',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#004085'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Target Configuration:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.25rem' }}>
                        <div><strong>Duration:</strong> {file.progressTarget.totalDuration.toFixed(2)}s</div>
                        <div><strong>Total Frames:</strong> {file.progressTarget.totalFrames.toLocaleString()}</div>
                        {file.progressTarget.width && file.progressTarget.height && (
                          <div><strong>Resolution:</strong> {file.progressTarget.width}x{file.progressTarget.height}</div>
                        )}
                        {file.progressTarget.fps && (
                          <div><strong>FPS:</strong> {file.progressTarget.fps}</div>
                        )}
                        <div><strong>Encoder:</strong> {file.progressTarget.encoder}</div>
                        <div><strong>Preset:</strong> {file.progressTarget.preset}</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Current Progress */}
                  {file.progressData && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#6c757d'
                    }}>
                      {file.progressData.frame > 0 && (
                        <div>
                          <strong>Frame:</strong> {file.progressData.frame.toLocaleString()}
                        </div>
                      )}
                      {file.progressData.fps > 0 && (
                        <div>
                          <strong>FPS:</strong> {file.progressData.fps.toFixed(2)}
                        </div>
                      )}
                      {file.progressData.bitrate && (
                        <div>
                          <strong>Bitrate:</strong> {file.progressData.bitrate}
                        </div>
                      )}
                      {file.progressData.outTime && (
                        <div>
                          <strong>Time:</strong> {file.progressData.outTime}
                        </div>
                      )}
                      {file.progressData.speed && (
                        <div>
                          <strong>Speed:</strong> <span style={{ 
                            color: parseFloat(file.progressData.speed.replace('x', '')) >= 1 ? '#28a745' : '#ffc107',
                            fontWeight: 'bold'
                          }}>{file.progressData.speed}</span>
                        </div>
                      )}
                      {file.progressData.streamQuality !== undefined && (
                        <div>
                          <strong>Quality:</strong> {file.progressData.streamQuality.toFixed(1)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

