'use client'

import { useState, useRef, useEffect, type ChangeEvent } from 'react'

interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | Blob | ArrayBuffer | DataView): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory'
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
  values(): AsyncIterableIterator<FileSystemHandle>
}

interface AudioSource {
  name: string
  mainFiles: File[]
  alterFiles: File[]
}

interface PlaylistFile {
  file: File
  isMain: boolean
  /** path relatif dari root folder yang dipilih (unik, untuk history) */
  sourceName: string
}

interface MixHistory {
  playlist: string[]
  template?: string
  background?: string
  timestamp: string
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

const DB_NAME = 'vmx_templatemixer_db'
const DB_VERSION = 1

export default function TemplateMixer() {
  const [sourcesDirectory, setSourcesDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [sourcesDirectoryName, setSourcesDirectoryName] = useState<string>('')
  const [audioSources, setAudioSources] = useState<AudioSource[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistFile[]>([])
  const [templateVideo, setTemplateVideo] = useState<File | null>(null)
  const [backgroundDirectory, setBackgroundDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [backgroundDirectoryName, setBackgroundDirectoryName] = useState<string>('')
  const [backgroundImages, setBackgroundImages] = useState<File[]>([])
  const [selectedBackgroundImage, setSelectedBackgroundImage] = useState<File | null>(null)

  const [songCount, setSongCount] = useState<number>(10)
  const [encoder, setEncoder] = useState<string>('cpu')
  const [preset, setPreset] = useState<string>('medium')
  const [loading, setLoading] = useState(false)
  const [loadingBackground, setLoadingBackground] = useState(false)
  const templateInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>('')
  const [info, setInfo] = useState<string>('')
  const [isMixing, setIsMixing] = useState(false)
  const [mixProgress, setMixProgress] = useState<string>('')

  const [apiUrl, setApiUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vmx_api_url')
      if (saved) return saved
    }
    return API_BASE_URL
  })

  const isFileSystemAccessSupported = () => {
    return 'showDirectoryPicker' in window
  }

  // ── IndexedDB helpers ──

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles')
        }
      }
    })
  }

  const saveHandle = async (key: string, handle: FileSystemDirectoryHandle) => {
    try {
      if ('storage' in navigator && 'persist' in navigator.storage) {
        await navigator.storage.persist()
      }
      const db = await openDB()
      const tx = db.transaction('handles', 'readwrite')
      tx.objectStore('handles').put(handle, key)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    } catch (err) {
      console.error('[TEMPLATEMIXER] Error saving handle:', err)
    }
  }

  const restoreHandle = async (key: string): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const db = await openDB()
      if (!db.objectStoreNames.contains('handles')) return null
      const tx = db.transaction('handles', 'readonly')
      const getReq = tx.objectStore('handles').get(key)
      return new Promise((resolve) => {
        getReq.onsuccess = () => resolve(getReq.result ?? null)
        getReq.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  // ── Restore on mount ──

  useEffect(() => {
    const restore = async () => {
      const srcHandle = await restoreHandle('sources_directory')
      if (srcHandle) {
        setSourcesDirectory(srcHandle)
        setSourcesDirectoryName(srcHandle.name)
        await scanSourcesDirectory(srcHandle)
      }

      const bgHandle = await restoreHandle('background_directory')
      if (bgHandle) {
        setBackgroundDirectory(bgHandle)
        setBackgroundDirectoryName(bgHandle.name)
        await scanBackgroundDirectory(bgHandle)
      }
    }
    restore()
  }, [])

  // ── Directory reading helpers ──

  const readMp3Files = async (dir: FileSystemDirectoryHandle): Promise<File[]> => {
    const files: File[] = []
    try {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          const fh = entry as FileSystemFileHandle
          const file = await fh.getFile()
          if (file.name.toLowerCase().endsWith('.mp3')) files.push(file)
        }
      }
    } catch (err) {
      console.error('[TEMPLATEMIXER] Error reading mp3 dir:', err)
    }
    return files
  }

  const readImageFiles = async (dir: FileSystemDirectoryHandle): Promise<File[]> => {
    const files: File[] = []
    const validImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp', 'image/gif', 'image/avif']
    const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif']

    try {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          const fh = entry as FileSystemFileHandle
          const file = await fh.getFile()
          const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
          if (file.type.startsWith('image/') || validExtensions.includes(ext)) {
            if (validImageTypes.includes(file.type) || validExtensions.includes(ext)) {
              files.push(file)
            }
          }
        }
      }
    } catch (err) {
      console.error('[TEMPLATEMIXER] Error reading image dir:', err)
    }
    return files
  }

  // ── Sources directory ──

  const openSourcesPicker = async () => {
    if (!isFileSystemAccessSupported()) {
      setError('File System Access API tidak didukung di browser ini. Gunakan Chrome/Edge versi terbaru.')
      return
    }
    try {
      setLoading(true)
      setError('')
      setInfo('')
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      setSourcesDirectory(handle)
      setSourcesDirectoryName(handle.name)
      localStorage.setItem('vmx_tpl_sources_dir', handle.name)
      await saveHandle('sources_directory', handle)
      await scanSourcesDirectory(handle)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Gagal membuka directory')
      }
    } finally {
      setLoading(false)
    }
  }

  const scanSourcesDirectory = async (handle: FileSystemDirectoryHandle) => {
    try {
      setLoading(true)
      setError('')
      setInfo('Memindai folder sources...')

      const sources: AudioSource[] = []
      let hasDirectMain = false

      try {
        await handle.getDirectoryHandle('main')
        hasDirectMain = true
      } catch {}

      if (hasDirectMain) {
        let mainFiles: File[] = []
        let alterFiles: File[] = []
        try {
          mainFiles = await readMp3Files(await handle.getDirectoryHandle('main'))
        } catch {}
        try {
          alterFiles = await readMp3Files(await handle.getDirectoryHandle('alter'))
        } catch {}
        if (mainFiles.length > 0) {
          sources.push({ name: handle.name, mainFiles, alterFiles })
        }
      } else {
        for await (const entry of handle.values()) {
          if (entry.kind === 'directory') {
            const dirHandle = entry as FileSystemDirectoryHandle
            if (dirHandle.name === 'main' || dirHandle.name === 'alter' || dirHandle.name === 'template') continue
            let mainFiles: File[] = []
            let alterFiles: File[] = []
            try {
              mainFiles = await readMp3Files(await dirHandle.getDirectoryHandle('main'))
            } catch { continue }
            try {
              alterFiles = await readMp3Files(await dirHandle.getDirectoryHandle('alter'))
            } catch {}
            if (mainFiles.length > 0) {
              sources.push({ name: dirHandle.name, mainFiles, alterFiles })
            }
          }
        }
      }

      setAudioSources(sources)
      if (sources.length === 0) {
        setError('Tidak ditemukan file MP3 di folder. Pastikan struktur folder benar (main/alter).')
      } else {
        setInfo(`Ditemukan ${sources.length} folder audio`)
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memindai directory')
    } finally {
      setLoading(false)
    }
  }

  const validVideoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']

  const openBackgroundDirectoryPicker = async () => {
    if (!isFileSystemAccessSupported()) {
      setError('File System Access API tidak didukung di browser ini. Gunakan Chrome/Edge versi terbaru.')
      return
    }
    try {
      setLoadingBackground(true)
      setError('')
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
      setBackgroundDirectory(handle)
      setBackgroundDirectoryName(handle.name)
      await saveHandle('background_directory', handle)
      await scanBackgroundDirectory(handle)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Gagal membuka directory background')
      }
    } finally {
      setLoadingBackground(false)
    }
  }

  const scanBackgroundDirectory = async (handle: FileSystemDirectoryHandle) => {
    try {
      setLoadingBackground(true)
      const images = await readImageFiles(handle)
      setBackgroundImages(images)
      setSelectedBackgroundImage(null)
      if (images.length === 0) {
        setError('Folder background tidak berisi image. Gunakan PNG/JPG/WEBP/BMP/GIF/AVIF.')
      } else {
        setInfo(prev => (prev ? `${prev} | ` : '') + `${images.length} background image ditemukan`)
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memindai directory background')
    } finally {
      setLoadingBackground(false)
    }
  }

  const handleTemplateUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    if (!file.type.startsWith('video/') && !validVideoExts.includes(ext)) {
      setError('File harus berupa video (MP4, MKV, AVI, MOV, WEBM, atau M4V)')
      if (templateInputRef.current) templateInputRef.current.value = ''
      return
    }
    setError('')
    setTemplateVideo(file)
  }

  const replaceTemplate = () => {
    setTemplateVideo(null)
    setInfo('')
    if (templateInputRef.current) templateInputRef.current.value = ''
    templateInputRef.current?.click()
  }

  // ── Mix history (same pattern as AutoMixer) ──

  const readMixHistory = async (): Promise<MixHistory[]> => {
    if (!sourcesDirectory) return []
    const storageKey = `vmx_tpl_history_${sourcesDirectoryName}`
    try {
      const fh = await sourcesDirectory.getFileHandle('template_mix_history.json', { create: false })
      const file = await fh.getFile()
      const content = await file.text()
      const history = JSON.parse(content) as MixHistory[]
      localStorage.setItem(storageKey, JSON.stringify(history))
      return history
    } catch {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try { return JSON.parse(stored) as MixHistory[] } catch {}
      }
      return []
    }
  }

  const writeMixHistory = async (history: MixHistory[]) => {
    if (!sourcesDirectory) return
    const storageKey = `vmx_tpl_history_${sourcesDirectoryName}`
    try {
      const fh = await sourcesDirectory.getFileHandle('template_mix_history.json', { create: true })
      const writable = await fh.createWritable()
      await writable.write(JSON.stringify(history, null, 2))
      await writable.close()
      localStorage.setItem(storageKey, JSON.stringify(history))
    } catch {
      localStorage.setItem(storageKey, JSON.stringify(history))
    }
  }

  // ── Playlist helpers ──

  const getBaseName = (filename: string): string =>
    filename.replace(/\.[^/.]+$/, '').toLowerCase()

  const addIdentifier = (filename: string, isMain: boolean): string => {
    const dotIdx = filename.lastIndexOf('.')
    if (dotIdx === -1) return `${filename}__${isMain ? 'main' : 'alter'}`
    return `${filename.substring(0, dotIdx)}__${isMain ? 'main' : 'alter'}${filename.substring(dotIdx)}`
  }

  const normalizeFilename = (filename: string): string => {
    if (filename.includes('__main') || filename.includes('__alter')) return filename
    const dotIdx = filename.lastIndexOf('.')
    if (dotIdx === -1) return `${filename}__main`
    return `${filename.substring(0, dotIdx)}__main${filename.substring(dotIdx)}`
  }

  const playlistExistsInHistory = (playlist: string[], history: MixHistory[]): boolean => {
    const norm = playlist.map(normalizeFilename)
    return history.some(h => {
      if (h.playlist.length !== norm.length) return false
      const normH = h.playlist.map(normalizeFilename)
      return normH.every((name, i) => name === norm[i])
    })
  }

  const getUsedBackgrounds = (history: MixHistory[]): Set<string> => {
    const used = new Set<string>()
    history.forEach(h => {
      if (h.background) used.add(h.background)
    })
    return used
  }

  const findUnusedBackground = (images: File[], history: MixHistory[]): File | null => {
    const used = getUsedBackgrounds(history)
    for (const img of images) {
      if (!used.has(img.name)) return img
    }
    return null
  }

  const generateRandomPlaylist = (sources: AudioSource[], count: number): PlaylistFile[] => {
    const usedTitles = new Set<string>()
    const all: Array<{ file: File; source: string; isMain: boolean; title: string }> = []

    sources.forEach(src => {
      src.mainFiles.forEach(f => all.push({ file: f, source: src.name, isMain: true, title: getBaseName(f.name) }))
      src.alterFiles.forEach(f => all.push({ file: f, source: src.name, isMain: false, title: getBaseName(f.name) }))
    })

    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]]
    }

    const playlist: PlaylistFile[] = []
    for (const item of all) {
      if (playlist.length >= count) break
      if (!usedTitles.has(item.title)) {
        playlist.push({ file: item.file, isMain: item.isMain, sourceName: item.source })
        usedTitles.add(item.title)
      }
    }

    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]]
    }
    return playlist
  }

  // ── Generate playlist ──

  const performAutoMix = async () => {
    if (audioSources.length === 0) {
      setError('Tidak ada sumber audio. Silakan pilih folder sources terlebih dahulu.')
      return
    }
    if (!templateVideo) {
      setError('Silakan pilih satu file template video (MP4 dll.) terlebih dahulu.')
      return
    }
    if (backgroundImages.length === 0) {
      setError('Silakan pilih folder background image terlebih dahulu.')
      return
    }
    if (songCount <= 0) {
      setError('Jumlah lagu harus lebih dari 0')
      return
    }

    const allTitles = new Set<string>()
    audioSources.forEach(src => {
      src.mainFiles.forEach(f => allTitles.add(getBaseName(f.name)))
      src.alterFiles.forEach(f => allTitles.add(getBaseName(f.name)))
    })
    if (allTitles.size < songCount) {
      setError(`Tidak cukup file audio unik. Tersedia: ${allTitles.size}, diminta: ${songCount}`)
      return
    }

    try {
      setIsMixing(true)
      setError('')
      setInfo('')
      setMixProgress('Membaca history...')

      const history = await readMixHistory()
      setMixProgress(history.length === 0
        ? 'Tidak ada history, membuat baru...'
        : `History: ${history.length} playlist. Mencari playlist unik...`)

      let playlist: PlaylistFile[] = []
      let names: string[] = []
      let attempts = 0
      const maxAttempts = 10

      while (attempts < maxAttempts) {
        playlist = generateRandomPlaylist(audioSources, songCount)
        names = playlist.map(pf => addIdentifier(pf.file.name, pf.isMain))
        if (playlist.length < songCount) {
          setError(`Hanya berhasil membuat ${playlist.length} dari ${songCount} lagu.`)
          setIsMixing(false)
          return
        }
        if (!playlistExistsInHistory(names, history)) break
        attempts++
        if (attempts < maxAttempts) {
          setMixProgress(`Playlist sudah ada di history, mencoba lagi... (${attempts}/${maxAttempts})`)
        }
      }

      if (attempts >= maxAttempts) {
        setError(`Tidak dapat membuat playlist unik setelah ${maxAttempts} percobaan. Tambahkan lebih banyak file audio.`)
        setIsMixing(false)
        return
      }

      const unusedBackground = findUnusedBackground(backgroundImages, history)
      if (!unusedBackground) {
        setError('Semua background image sudah pernah dipakai. Tambahkan image baru di folder background.')
        setIsMixing(false)
        return
      }

      setMixProgress('Playlist unik ditemukan!')
      setSelectedPlaylist(playlist)
      setSelectedBackgroundImage(unusedBackground)
      setInfo(`Playlist ${playlist.length} lagu, template: ${templateVideo.name}, background: ${unusedBackground.name}`)
    } catch (err: any) {
      setError(err.message || 'Gagal melakukan auto mix')
    } finally {
      setIsMixing(false)
      setMixProgress('')
    }
  }

  // ── Build video ──

  const buildVideo = async () => {
    if (selectedPlaylist.length === 0) {
      setError('Tidak ada playlist yang dipilih')
      return
    }
    if (!templateVideo) {
      setError('Silakan pilih file template video terlebih dahulu')
      return
    }
    if (!selectedBackgroundImage) {
      setError('Silakan generate playlist dulu agar background image otomatis dipilih.')
      return
    }

    try {
      setIsMixing(true)
      setError('')
      setInfo('')
      setMixProgress('Memeriksa API server...')

      const health = await fetch(`${apiUrl}/`)
      if (!health.ok) throw new Error(`API server tidak tersedia di ${apiUrl}`)

      setMixProgress('Menyiapkan file...')
      const formData = new FormData()
      selectedPlaylist.forEach((pf, i) => formData.append(`audio${i + 1}`, pf.file))
      formData.append('video', templateVideo)
      formData.append('background', selectedBackgroundImage)
      formData.append('thumbnail', selectedBackgroundImage)

      const url = `/api/proxy/template-mixer?apiUrl=${encodeURIComponent(apiUrl)}&encoder=${encodeURIComponent(encoder)}&preset=${encodeURIComponent(preset)}&fade=false&fadeDuration=1.0&fadeOffset=1.0`
      setMixProgress('Menggabungkan audio dengan template video...')

      const response = await fetch(url, { method: 'POST', body: formData })
      if (response.status !== 200) {
        const txt = await response.text()
        throw new Error(txt || `Server error: ${response.status}`)
      }

      const data = await response.json()
      setMixProgress('Build berhasil! Menyimpan history...')

      const currentHistory = await readMixHistory()
      currentHistory.push({
        playlist: selectedPlaylist.map(pf => addIdentifier(pf.file.name, pf.isMain)),
        template: templateVideo.name,
        background: selectedBackgroundImage.name,
        timestamp: new Date().toISOString()
      })
      await writeMixHistory(currentHistory)

      if (data.success && data.queueId) {
        setInfo(`Video build dimulai. Template: ${templateVideo.name}, BG: ${selectedBackgroundImage.name}. Queue ID: ${data.queueId}`)
      } else {
        setInfo(`Video build berhasil. Template: ${templateVideo.name}, BG: ${selectedBackgroundImage.name}`)
      }
      setTimeout(() => setMixProgress(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Gagal membangun video')
    } finally {
      setIsMixing(false)
    }
  }

  // ── Render ──

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
        🎞️ Template Mixer
      </h2>
      <p style={{ margin: 0, fontSize: '0.9rem', color: '#555', lineHeight: 1.6 }}>
        Gabungkan file MP3 dengan template video MP4 (background hitam + animasi bergerak).
        Template akan di-loop dari frame 0 sampai durasi seluruh musik habis.
      </p>

      {/* ── 1. Folder Sources ── */}
      <div style={{
        padding: '1.5rem',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        background: '#f8f9fa'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📁 Folder Sources (MP3)</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          {sourcesDirectoryName ? (
            <div style={{
              padding: '0.75rem',
              background: 'white',
              borderRadius: '4px',
              flex: 1,
              border: '1px solid #dee2e6'
            }}>
              📁 {sourcesDirectoryName}
            </div>
          ) : (
            <div style={{
              padding: '0.75rem',
              background: '#fff3cd',
              borderRadius: '4px',
              flex: 1,
              border: '1px solid #ffeaa7',
              color: '#856404'
            }}>
              Belum ada folder yang dipilih
            </div>
          )}
          <button
            onClick={openSourcesPicker}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: loading ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              whiteSpace: 'nowrap'
            }}
          >
            {loading ? '⏳ Memindai...' : '📁 Pilih Folder Sources'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6c757d' }}>
          Struktur: folder berisi subfolder <strong>main</strong> (wajib) dan <strong>alter</strong> (opsional) dengan file MP3.
        </p>
      </div>

      {/* ── Audio Sources Info ── */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🎵 Sumber Audio Ditemukan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {audioSources.map((src, i) => (
              <div key={i} style={{
                padding: '0.75rem',
                background: 'white',
                borderRadius: '4px',
                border: '1px solid #dee2e6'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>📁 {src.name}</div>
                <div style={{ fontSize: '0.875rem', color: '#6c757d' }}>
                  Main: {src.mainFiles.length} file | Alter: {src.alterFiles.length} file
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2. Folder Background Image ── */}
      <div style={{
        padding: '1.5rem',
        border: '1px solid #20c997',
        borderRadius: '8px',
        background: '#f3fffb'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#198754' }}>🖼️ Folder Background Image</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          {backgroundDirectoryName ? (
            <div style={{
              padding: '0.75rem',
              background: 'white',
              borderRadius: '4px',
              flex: 1,
              border: '1px solid #b9f1dd'
            }}>
              🖼️ {backgroundDirectoryName}
            </div>
          ) : (
            <div style={{
              padding: '0.75rem',
              background: '#fff3cd',
              borderRadius: '4px',
              flex: 1,
              border: '1px solid #ffeaa7',
              color: '#856404'
            }}>
              Belum ada folder background yang dipilih
            </div>
          )}
          <button
            onClick={openBackgroundDirectoryPicker}
            disabled={loadingBackground}
            style={{
              padding: '0.75rem 1.5rem',
              background: loadingBackground ? '#6c757d' : '#20c997',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loadingBackground ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              whiteSpace: 'nowrap'
            }}
          >
            {loadingBackground ? '⏳ Memindai...' : '🖼️ Pilih Folder BG'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6c757d' }}>
          Format: PNG, JPG/JPEG, WEBP, BMP, GIF, AVIF. Sistem akan memilih image BG yang belum pernah digunakan.
        </p>
      </div>

      {backgroundImages.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🖼️ Background Image Tersedia</h3>
          <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>
            Total: {backgroundImages.length} image
          </div>
          {selectedBackgroundImage && (
            <div style={{
              padding: '0.75rem',
              background: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '4px',
              color: '#155724',
              fontWeight: 'bold'
            }}>
              ✅ Background terpilih: {selectedBackgroundImage.name}
            </div>
          )}
        </div>
      )}

      {/* ── 2. Satu file template video ── */}
      <div style={{
        padding: '1.5rem',
        border: '1px solid #6f42c1',
        borderRadius: '8px',
        background: '#f8f5ff'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#6f42c1' }}>🎞️ Template Video (1 file)</h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#6c757d' }}>
          Unggah satu file template MP4 (background hitam + animasi bergerak).
          Untuk mengganti template, klik &quot;Ganti template&quot; lalu pilih file lain.
        </p>
        <input
          ref={templateInputRef}
          type="file"
          accept="video/mp4,video/*,.mp4,.mkv,.avi,.mov,.webm,.m4v"
          onChange={handleTemplateUpload}
          style={{ display: 'none' }}
        />
        {templateVideo ? (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.75rem',
            background: 'white',
            borderRadius: '4px',
            border: '1px solid #d5c8f0'
          }}>
            <span style={{ flex: 1, minWidth: '200px', fontWeight: 'bold', color: '#333' }}>
              📹 {templateVideo.name}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#6c757d' }}>
              {(templateVideo.size / 1024 / 1024).toFixed(2)} MB
            </span>
            <button
              type="button"
              onClick={replaceTemplate}
              style={{
                padding: '0.5rem 1rem',
                background: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}
            >
              Ganti template
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplateVideo(null)
                setInfo('')
                if (templateInputRef.current) templateInputRef.current.value = ''
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Hapus
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => templateInputRef.current?.click()}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            🎞️ Pilih file template video
          </button>
        )}
      </div>

      {/* ── 3. Jumlah Lagu ── */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🔢 Jumlah Lagu</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{ fontWeight: 'bold', minWidth: '150px' }}>Jumlah Lagu:</label>
            <input
              type="number"
              min="1"
              value={songCount}
              onChange={(e) => setSongCount(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                padding: '0.5rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '1rem',
                width: '100px'
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#6c757d' }}>
            Jumlah lagu yang akan digabungkan. Tidak ada duplikasi judul antara main/alter dalam satu playlist.
          </p>
        </div>
      )}

      {/* ── 4. Encoder & Preset ── */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>⚙️ Encoder & Preset</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Encoder</label>
              <select
                value={encoder}
                onChange={(e) => {
                  setEncoder(e.target.value)
                  const defaults: Record<string, string> = {
                    cpu: 'medium', nvenc: 'p4', qsv: 'medium', amf: 'balanced', vaapi: 'medium', videotoolbox: 'medium'
                  }
                  setPreset(defaults[e.target.value] || 'medium')
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '1rem' }}
              >
                <option value="cpu">CPU (libx264)</option>
                <option value="nvenc">NVIDIA GPU (NVENC)</option>
                <option value="qsv">Intel GPU (Quick Sync)</option>
                <option value="amf">AMD GPU (AMF)</option>
                <option value="vaapi">VAAPI (Linux)</option>
                <option value="videotoolbox">Apple GPU (VideoToolbox - M1/M2/M3/M4)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Preset</label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '1rem' }}
              >
                {encoder === 'cpu' && (
                  <>
                    <option value="ultrafast">Ultrafast (Tercepat)</option>
                    <option value="superfast">Superfast</option>
                    <option value="veryfast">Veryfast</option>
                    <option value="faster">Faster</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="slow">Slow</option>
                    <option value="slower">Slower</option>
                    <option value="veryslow">Veryslow (Terbaik)</option>
                  </>
                )}
                {encoder === 'nvenc' && (
                  <>
                    <option value="p1">P1 (Tercepat)</option>
                    <option value="p2">P2</option>
                    <option value="p3">P3</option>
                    <option value="p4">P4 (Default)</option>
                    <option value="p5">P5</option>
                    <option value="p6">P6</option>
                    <option value="p7">P7 (Terbaik)</option>
                  </>
                )}
                {encoder === 'qsv' && (
                  <>
                    <option value="veryfast">Veryfast (Tercepat)</option>
                    <option value="faster">Faster</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="slow">Slow</option>
                    <option value="slower">Slower</option>
                    <option value="veryslow">Veryslow (Terbaik)</option>
                  </>
                )}
                {encoder === 'amf' && (
                  <>
                    <option value="speed">Speed (Tercepat)</option>
                    <option value="balanced">Balanced (Default)</option>
                    <option value="quality">Quality (Terbaik)</option>
                  </>
                )}
                {encoder === 'vaapi' && (
                  <>
                    <option value="fast">Fast (Tercepat)</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="slow">Slow (Terbaik)</option>
                  </>
                )}
                {encoder === 'videotoolbox' && (
                  <>
                    <option value="ultrafast">Ultrafast (Tercepat)</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="slow">Slow (Terbaik)</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.8rem', color: '#6c757d' }}>
            GPU encoder lebih cepat tapi memerlukan hardware yang sesuai. Preset lebih cepat = kualitas lebih rendah.
          </p>
        </div>
      )}

      {/* ── 5. Generate & Build ── */}
      {audioSources.length > 0 && templateVideo && backgroundImages.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🎲 Generate & Build</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={performAutoMix}
              disabled={isMixing || songCount <= 0}
              style={{
                padding: '1rem 2rem',
                background: isMixing || songCount <= 0 ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isMixing || songCount <= 0 ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              {isMixing ? '⏳ Memproses...' : '🎲 Generate Playlist'}
            </button>
          </div>
          {mixProgress && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#d1ecf1',
              color: '#0c5460',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {mixProgress}
            </div>
          )}
        </div>
      )}

      {/* ── Selected Playlist ── */}
      {selectedPlaylist.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📋 Playlist yang Dipilih</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
            {selectedPlaylist.map((pf, i) => (
              <div key={i} style={{
                padding: '0.75rem',
                background: 'white',
                borderRadius: '4px',
                border: '1px solid #dee2e6'
              }}>
                <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>#{i + 1}</span>
                <span>🎵 {addIdentifier(pf.file.name, pf.isMain)}</span>
                <span style={{
                  marginLeft: '0.5rem',
                  fontSize: '0.75rem',
                  color: pf.isMain ? '#28a745' : '#17a2b8',
                  fontWeight: 'bold'
                }}>
                  ({pf.isMain ? 'MAIN' : 'ALTER'})
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={buildVideo}
            disabled={isMixing}
            style={{
              padding: '1rem 2rem',
              background: isMixing ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isMixing ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {isMixing ? '⏳ Membangun Video...' : '🎬 Build Video dengan Template'}
          </button>
        </div>
      )}

      {/* ── Error ── */}
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

      {/* ── Info ── */}
      {info && (
        <div style={{
          padding: '1rem',
          background: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '8px'
        }}>
          ℹ️ {info}
        </div>
      )}
    </div>
  )
}
