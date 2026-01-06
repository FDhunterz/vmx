'use client'

import { useState, useRef, useEffect } from 'react'

// File System Access API types
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

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
}

interface AudioSource {
  name: string
  mainFiles: File[]
  alterFiles: File[]
}

interface PlaylistFile {
  file: File
  isMain: boolean
  sourceName: string
}

interface MixHistory {
  playlist: string[] // Array of file names in order
  thumbnail?: string // Thumbnail file name used
  timestamp: string
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export default function AutoMixer() {
  const [sourcesDirectory, setSourcesDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [sourcesDirectoryName, setSourcesDirectoryName] = useState<string>('')
  const [audioSources, setAudioSources] = useState<AudioSource[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistFile[]>([])
  const [thumbnailFiles, setThumbnailFiles] = useState<File[]>([])
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null)
  const [songCount, setSongCount] = useState<number>(10)
  const [encoder, setEncoder] = useState<string>('cpu')
  const [preset, setPreset] = useState<string>('medium')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [info, setInfo] = useState<string>('')
  const [isMixing, setIsMixing] = useState(false)
  const [mixProgress, setMixProgress] = useState<string>('')
  
  // Get API URL from localStorage or use default
  const getInitialApiUrl = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vmx_api_url')
      if (saved) return saved
    }
    return API_BASE_URL
  }

  const [apiUrl, setApiUrl] = useState<string>(() => getInitialApiUrl())

  // Check if File System Access API is supported
  const isFileSystemAccessSupported = () => {
    return 'showDirectoryPicker' in window
  }

  // Save sources directory handle to IndexedDB
  const saveSourcesDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
    try {
      if ('storage' in navigator && 'persist' in navigator.storage) {
        await navigator.storage.persist()
      }

      const dbName = 'vmx_automixer_db'
      const dbVersion = 1
      
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        
        request.onerror = () => {
          console.error('[AUTOMIXER] Failed to open IndexedDB:', request.error)
          reject(request.error)
        }
        
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(['handles'], 'readwrite')
          const store = transaction.objectStore('handles')
          
          const putRequest = store.put(handle, 'sources_directory_handle')
          
          putRequest.onsuccess = () => {
            console.log('[AUTOMIXER] Sources directory handle saved to IndexedDB')
            resolve()
          }
          
          putRequest.onerror = () => {
            console.error('[AUTOMIXER] Failed to save handle:', putRequest.error)
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
      console.error('[AUTOMIXER] Error saving directory handle:', err)
    }
  }

  // Restore sources directory handle from IndexedDB
  const restoreSourcesDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const dbName = 'vmx_automixer_db'
      const dbVersion = 1
      
      return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        
        request.onerror = () => {
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
          const getRequest = store.get('sources_directory_handle')
          
          getRequest.onsuccess = () => {
            const handle = getRequest.result as FileSystemDirectoryHandle | undefined
            if (handle) {
              console.log('[AUTOMIXER] Sources directory handle restored from IndexedDB')
              resolve(handle)
            } else {
              resolve(null)
            }
          }
          
          getRequest.onerror = () => {
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
      console.error('[AUTOMIXER] Error restoring directory handle:', err)
      return null
    }
  }

  // Restore on mount
  useEffect(() => {
    const restore = async () => {
      const handle = await restoreSourcesDirectoryHandle()
      if (handle) {
        setSourcesDirectory(handle)
        setSourcesDirectoryName(handle.name)
        await scanSourcesDirectory(handle)
      }
    }
    restore()
  }, [])

  // Open directory picker for sources folder
  const openSourcesDirectoryPicker = async () => {
    if (!isFileSystemAccessSupported()) {
      setError('File System Access API tidak didukung di browser ini. Gunakan Chrome/Edge versi terbaru.')
      return
    }

    try {
      setLoading(true)
      setError('')
      setInfo('')

      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite' // Request readwrite mode to allow saving history
      })

      setSourcesDirectory(handle)
      setSourcesDirectoryName(handle.name)
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('vmx_sources_directory_name', handle.name)
      }

      await saveSourcesDirectoryHandle(handle)
      await scanSourcesDirectory(handle)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[AUTOMIXER] Error opening directory:', err)
        setError(err.message || 'Gagal membuka directory')
      }
    } finally {
      setLoading(false)
    }
  }

  // Helper function to read MP3 files from a directory
  const readMp3FilesFromDirectory = async (dirHandle: FileSystemDirectoryHandle): Promise<File[]> => {
    const files: File[] = []
    try {
      for await (const fileEntry of dirHandle.values()) {
        if (fileEntry.kind === 'file') {
          const fileHandle = fileEntry as FileSystemFileHandle
          const file = await fileHandle.getFile()
          if (file.name.toLowerCase().endsWith('.mp3')) {
            files.push(file)
          }
        }
      }
    } catch (err) {
      console.error('[AUTOMIXER] Error reading directory:', err)
    }
    return files
  }

  // Helper function to read video files from thumbnail directory
  const readThumbnailFilesFromDirectory = async (dirHandle: FileSystemDirectoryHandle): Promise<File[]> => {
    const files: File[] = []
    const validVideoTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm']
    const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']
    
    try {
      for await (const fileEntry of dirHandle.values()) {
        if (fileEntry.kind === 'file') {
          const fileHandle = fileEntry as FileSystemFileHandle
          const file = await fileHandle.getFile()
          const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
          
          if (file.type.startsWith('video/') || validExtensions.includes(fileExtension)) {
            if (validVideoTypes.includes(file.type) || validExtensions.includes(fileExtension)) {
              files.push(file)
            }
          }
        }
      }
    } catch (err) {
      console.error('[AUTOMIXER] Error reading thumbnail directory:', err)
    }
    return files
  }

  // Scan sources directory for main and alter folders
  const scanSourcesDirectory = async (handle: FileSystemDirectoryHandle) => {
    try {
      setLoading(true)
      setError('')
      setInfo('Memindai folder sources...')

      const sources: AudioSource[] = []

      // First, check if the selected folder directly contains 'main' and 'alter'
      // This handles the case: sources/main/ and sources/alter/
      let hasDirectMain = false
      let hasDirectAlter = false
      
      try {
        const mainHandle = await handle.getDirectoryHandle('main')
        hasDirectMain = true
      } catch (err) {
        // No direct main folder
      }

      try {
        const alterHandle = await handle.getDirectoryHandle('alter')
        hasDirectAlter = true
      } catch (err) {
        // No direct alter folder
      }

      // If direct main folder exists, treat the selected folder as a single source
      if (hasDirectMain) {
        console.log('[AUTOMIXER] Detected direct main/alter structure')
        let mainFiles: File[] = []
        let alterFiles: File[] = []

        try {
          const mainHandle = await handle.getDirectoryHandle('main')
          mainFiles = await readMp3FilesFromDirectory(mainHandle)
        } catch (err) {
          console.error('[AUTOMIXER] Error reading main folder:', err)
        }

        if (hasDirectAlter) {
          try {
            const alterHandle = await handle.getDirectoryHandle('alter')
            alterFiles = await readMp3FilesFromDirectory(alterHandle)
          } catch (err) {
            console.log('[AUTOMIXER] Error reading alter folder:', err)
          }
        }

        if (mainFiles.length > 0) {
          sources.push({
            name: handle.name,
            mainFiles,
            alterFiles
          })
        }
      } else {
        // Otherwise, iterate through subfolders (each subfolder should have main/alter)
        // This handles the case: sources/folder1/main/, sources/folder1/alter/, etc.
        console.log('[AUTOMIXER] Scanning subfolders for main/alter structure')
        
        for await (const entry of handle.values()) {
          if (entry.kind === 'directory') {
            const dirHandle = entry as FileSystemDirectoryHandle
            const sourceName = dirHandle.name
            
            // Skip if this is main or alter folder (already processed in direct mode)
            if (sourceName === 'main' || sourceName === 'alter') {
              continue
            }
            
            // Check if this directory has a 'main' folder
            let mainFiles: File[] = []
            let alterFiles: File[] = []

            try {
              const mainHandle = await dirHandle.getDirectoryHandle('main')
              mainFiles = await readMp3FilesFromDirectory(mainHandle)
            } catch (err) {
              console.warn(`[AUTOMIXER] Folder ${sourceName} tidak memiliki folder 'main'`)
              continue // Skip this folder if no main folder
            }

            // Try to read alter folder (optional)
            try {
              const alterHandle = await dirHandle.getDirectoryHandle('alter')
              alterFiles = await readMp3FilesFromDirectory(alterHandle)
            } catch (err) {
              // Alter folder is optional, so we ignore the error
              console.log(`[AUTOMIXER] Folder ${sourceName} tidak memiliki folder 'alter' (opsional)`)
            }

            if (mainFiles.length > 0) {
              sources.push({
                name: sourceName,
                mainFiles,
                alterFiles
              })
            }
          }
        }
      }

      // Scan thumbnail folder
      let thumbnails: File[] = []
      try {
        const thumbnailHandle = await handle.getDirectoryHandle('thumbnail')
        thumbnails = await readThumbnailFilesFromDirectory(thumbnailHandle)
        console.log(`[AUTOMIXER] Found ${thumbnails.length} thumbnail files`)
      } catch (err) {
        console.warn('[AUTOMIXER] Folder thumbnail tidak ditemukan atau tidak dapat dibaca')
        setError('Folder "thumbnail" wajib ada di folder yang dipilih. Pastikan folder yang dipilih memiliki subfolder "thumbnail" dengan file gambar.')
      }

      setAudioSources(sources)
      setThumbnailFiles(thumbnails)
      setSelectedThumbnail(null) // Reset selected thumbnail
      
      if (sources.length === 0) {
        if (hasDirectMain) {
          setError('Folder "main" ditemukan tetapi tidak ada file MP3 di dalamnya. Pastikan folder "main" berisi file MP3.')
        } else {
          setError('Tidak ditemukan folder dengan struktur yang benar. Struktur yang didukung:\n' +
            '1. Langsung: folder yang dipilih berisi subfolder "main" (wajib) dan "alter" (opsional)\n' +
            '2. Bertingkat: folder yang dipilih berisi subfolder, masing-masing memiliki "main" (wajib) dan "alter" (opsional)')
        }
      } else if (thumbnails.length === 0) {
        setError('Folder "thumbnail" ditemukan tetapi tidak ada file video di dalamnya. Pastikan folder "thumbnail" berisi file video loop (MP4, MKV, AVI, MOV, WEBM, atau M4V).')
      } else {
        setInfo(`Ditemukan ${sources.length} folder dengan file audio dan ${thumbnails.length} video thumbnail loop`)
      }
    } catch (err: any) {
      console.error('[AUTOMIXER] Error scanning directory:', err)
      setError(err.message || 'Gagal memindai directory')
    } finally {
      setLoading(false)
    }
  }

  // Read mix history from file
  const readMixHistory = async (): Promise<MixHistory[]> => {
    if (!sourcesDirectory) return []

    const storageKey = `vmx_mix_history_${sourcesDirectoryName}`

    try {
      const historyFileHandle = await sourcesDirectory.getFileHandle('mix_history.json', { create: false })
      const historyFile = await historyFileHandle.getFile()
      const content = await historyFile.text()
      const history = JSON.parse(content) as MixHistory[]
      
      // Also sync to localStorage as backup
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(history))
      }
      
      return history
    } catch (err) {
      // File doesn't exist yet, try localStorage as fallback
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          try {
            return JSON.parse(stored) as MixHistory[]
          } catch (e) {
            console.error('[AUTOMIXER] Error parsing localStorage history:', e)
          }
        }
      }
      return []
    }
  }

  // Write mix history to file
  const writeMixHistory = async (history: MixHistory[]) => {
    if (!sourcesDirectory) return

    const storageKey = `vmx_mix_history_${sourcesDirectoryName}`

    try {
      // Try to write directly first (if directory was opened with readwrite mode)
      try {
        const historyFileHandle = await sourcesDirectory.getFileHandle('mix_history.json', { create: true })
        const writable = await historyFileHandle.createWritable()
        await writable.write(JSON.stringify(history, null, 2))
        await writable.close()
        console.log('[AUTOMIXER] History saved successfully to file')
        
        // Also save to localStorage as backup
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(history))
        }
        return
      } catch (writeErr: any) {
        // If we can't write to file, use localStorage as fallback
        console.log('[AUTOMIXER] Cannot write to file, using localStorage as fallback')
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(history))
          console.log('[AUTOMIXER] History saved to localStorage')
        }
        // Don't throw error, just use localStorage
      }
    } catch (err: any) {
      console.error('[AUTOMIXER] Error writing history:', err)
      // Still try to save to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(history))
        } catch (e) {
          console.error('[AUTOMIXER] Failed to save to localStorage:', e)
        }
      }
    }
  }

  // Check if playlist exists in history (with backward compatibility)
  const playlistExistsInHistory = (playlist: string[], history: MixHistory[]): boolean => {
    // Normalize current playlist
    const normalizedPlaylist = normalizePlaylistForComparison(playlist)
    
    return history.some(h => {
      if (h.playlist.length !== normalizedPlaylist.length) return false
      // Normalize history playlist for comparison
      const normalizedHistoryPlaylist = normalizePlaylistForComparison(h.playlist)
      return normalizedHistoryPlaylist.every((name, index) => name === normalizedPlaylist[index])
    })
  }

  // Get used thumbnails from history
  const getUsedThumbnails = (history: MixHistory[]): Set<string> => {
    const used = new Set<string>()
    history.forEach(h => {
      if (h.thumbnail) {
        used.add(h.thumbnail)
      }
    })
    return used
  }

  // Find unused thumbnail
  const findUnusedThumbnail = (thumbnails: File[], history: MixHistory[]): File | null => {
    const usedThumbnails = getUsedThumbnails(history)
    
    for (const thumbnail of thumbnails) {
      if (!usedThumbnails.has(thumbnail.name)) {
        return thumbnail
      }
    }
    
    return null
  }

  // Helper function to extract base name (without extension) from filename
  const getBaseName = (filename: string): string => {
    return filename.replace(/\.[^/.]+$/, '').toLowerCase()
  }

  // Helper function to normalize filename for comparison (backward compatibility)
  // Files without __main or __alter are treated as __main
  const normalizeFilenameForComparison = (filename: string): string => {
    // Check if filename already has identifier
    if (filename.includes('__main') || filename.includes('__alter')) {
      return filename
    }
    // If no identifier, treat as main (backward compatibility)
    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex === -1) {
      return `${filename}__main`
    }
    const nameWithoutExt = filename.substring(0, lastDotIndex)
    const extension = filename.substring(lastDotIndex)
    return `${nameWithoutExt}__main${extension}`
  }

  // Helper function to normalize playlist for comparison
  const normalizePlaylistForComparison = (playlist: string[]): string[] => {
    return playlist.map(normalizeFilenameForComparison)
  }

  // Helper function to add identifier to filename
  const addIdentifierToFilename = (filename: string, isMain: boolean): string => {
    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex === -1) {
      // No extension
      return `${filename}__${isMain ? 'main' : 'alter'}`
    }
    const nameWithoutExt = filename.substring(0, lastDotIndex)
    const extension = filename.substring(lastDotIndex)
    return `${nameWithoutExt}__${isMain ? 'main' : 'alter'}${extension}`
  }

  // Generate random playlist from sources with specified count
  // Ensures no duplicate titles between main and alter in the same playlist
  const generateRandomPlaylist = (sources: AudioSource[], count: number): PlaylistFile[] => {
    const playlist: PlaylistFile[] = []
    const usedTitles = new Set<string>() // Track titles already used
    
    // Collect all available files with their source info
    const allAvailableFiles: Array<{ file: File; source: string; isMain: boolean; title: string }> = []
    
    sources.forEach(source => {
      // Add main files
      source.mainFiles.forEach(file => {
        const title = getBaseName(file.name)
        allAvailableFiles.push({
          file,
          source: source.name,
          isMain: true,
          title
        })
      })
      
      // Add alter files
      source.alterFiles.forEach(file => {
        const title = getBaseName(file.name)
        allAvailableFiles.push({
          file,
          source: source.name,
          isMain: false,
          title
        })
      })
    })

    // Shuffle all available files
    const shuffled = [...allAvailableFiles]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // Select files ensuring no duplicate titles
    for (const fileInfo of shuffled) {
      if (playlist.length >= count) break
      
      // Check if this title is already used
      if (!usedTitles.has(fileInfo.title)) {
        playlist.push({
          file: fileInfo.file,
          isMain: fileInfo.isMain,
          sourceName: fileInfo.source
        })
        usedTitles.add(fileInfo.title)
      }
    }

    // If we don't have enough unique files, try to fill with remaining files
    // but still avoid duplicates
    if (playlist.length < count) {
      for (const fileInfo of shuffled) {
        if (playlist.length >= count) break
        
        // Skip if already in playlist or title already used
        const alreadyInPlaylist = playlist.some(pf => pf.file.name === fileInfo.file.name && pf.isMain === fileInfo.isMain)
        if (!alreadyInPlaylist && !usedTitles.has(fileInfo.title)) {
          playlist.push({
            file: fileInfo.file,
            isMain: fileInfo.isMain,
            sourceName: fileInfo.source
          })
          usedTitles.add(fileInfo.title)
        }
      }
    }

    // Final shuffle of the selected playlist
    const finalShuffled = [...playlist]
    for (let i = finalShuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalShuffled[i], finalShuffled[j]] = [finalShuffled[j], finalShuffled[i]]
    }

    return finalShuffled
  }

  // Auto mix with history checking
  const performAutoMix = async () => {
    if (audioSources.length === 0) {
      setError('Tidak ada sumber audio yang tersedia. Silakan pilih folder sources terlebih dahulu.')
      return
    }

    if (songCount <= 0) {
      setError('Jumlah lagu harus lebih dari 0')
      return
    }

    // Calculate total available unique files
    const allTitles = new Set<string>()
    audioSources.forEach(source => {
      source.mainFiles.forEach(file => allTitles.add(getBaseName(file.name)))
      source.alterFiles.forEach(file => allTitles.add(getBaseName(file.name)))
    })

    if (allTitles.size < songCount) {
      setError(`Tidak cukup file audio unik. Tersedia: ${allTitles.size} judul unik, diminta: ${songCount}. Silakan tambahkan lebih banyak file audio.`)
      return
    }

    try {
      setIsMixing(true)
      setError('')
      setInfo('')
      setMixProgress('Membaca history...')

      // Read history (will create new file if doesn't exist)
      const history = await readMixHistory()
      if (history.length === 0) {
        setMixProgress('Tidak ada history ditemukan, akan membuat file history baru...')
      } else {
        setMixProgress(`History ditemukan: ${history.length} playlist. Mencari playlist unik...`)
      }

      // Try to generate unique playlist (max 10 attempts)
      let playlist: PlaylistFile[] = []
      let playlistNames: string[] = []
      let attempts = 0
      const maxAttempts = 10

      while (attempts < maxAttempts) {
        playlist = generateRandomPlaylist(audioSources, songCount)
        playlistNames = playlist.map(pf => addIdentifierToFilename(pf.file.name, pf.isMain))

        // Ensure we have the requested count
        if (playlist.length < songCount) {
          setError(`Tidak dapat membuat playlist dengan ${songCount} lagu unik. Hanya berhasil membuat ${playlist.length} lagu.`)
          setIsMixing(false)
          return
        }

        if (!playlistExistsInHistory(playlistNames, history)) {
          // Found unique playlist
          break
        }

        attempts++
        if (attempts < maxAttempts) {
          setMixProgress(`Playlist sudah ada di history, mencoba lagi... (${attempts}/${maxAttempts})`)
        }
      }

      if (attempts >= maxAttempts) {
        // Calculate possible combinations for better error message
        const allTitles = new Set<string>()
        audioSources.forEach(source => {
          source.mainFiles.forEach(file => allTitles.add(getBaseName(file.name)))
          source.alterFiles.forEach(file => allTitles.add(getBaseName(file.name)))
        })
        
        const errorMsg = `Tidak dapat membuat playlist unik setelah ${maxAttempts} percobaan. ` +
          `History saat ini memiliki ${history.length} playlist. ` +
          `Silakan tambahkan lebih banyak file audio di folder main/alter untuk variasi yang lebih banyak. ` +
          `(Judul unik tersedia: ${allTitles.size}, Diminta: ${songCount}, History: ${history.length})`
        
        setError(errorMsg)
        setIsMixing(false)
        return
      }

      setMixProgress('Playlist unik ditemukan! Mengecek thumbnail unik...')

      // Check for unused thumbnail
      const unusedThumbnail = findUnusedThumbnail(thumbnailFiles, history)
      
      if (!unusedThumbnail) {
        setError('Tidak ada video thumbnail yang terbaru. Semua video thumbnail sudah pernah digunakan. Silakan tambahkan video thumbnail baru di folder "thumbnail".')
        setIsMixing(false)
        return
      }

      setSelectedThumbnail(unusedThumbnail)
      setMixProgress(`Playlist dan video thumbnail loop unik ditemukan! Video thumbnail: ${unusedThumbnail.name}`)

      // Set selected playlist (don't save to history yet)
      setSelectedPlaylist(playlist)
      const playlistDisplayNames = playlist.map(pf => addIdentifierToFilename(pf.file.name, pf.isMain)).join(', ')
      setInfo(`Playlist berhasil dibuat dengan ${playlist.length} file audio. Video thumbnail loop yang akan digunakan: ${unusedThumbnail.name}`)

    } catch (err: any) {
      console.error('[AUTOMIXER] Error performing auto mix:', err)
      setError(err.message || 'Gagal melakukan auto mix')
    } finally {
      setIsMixing(false)
      setMixProgress('')
    }
  }

  // Build video with selected playlist
  const buildVideoWithPlaylist = async () => {
    if (selectedPlaylist.length === 0) {
      setError('Tidak ada playlist yang dipilih')
      return
    }

    if (!selectedThumbnail) {
      setError('Tidak ada thumbnail yang dipilih. Silakan generate playlist terlebih dahulu.')
      return
    }

    try {
      setIsMixing(true)
      setError('')
      setInfo('')
      setMixProgress('Memeriksa API server...')

      // Check API health
      const healthResponse = await fetch(`${apiUrl}/`)
      if (!healthResponse.ok) {
        throw new Error(`API server tidak tersedia. Pastikan server berjalan di ${apiUrl}`)
      }

      setMixProgress('Menyiapkan file untuk build...')

      const formData = new FormData()
      selectedPlaylist.forEach((playlistFile, index) => {
        formData.append(`audio${index + 1}`, playlistFile.file)
      })

      // Add video thumbnail loop as background
      formData.append('video', selectedThumbnail)

      // Use video-loop mode with thumbnail video
      const url = `${apiUrl}/api/join/video-loop?encoder=${encoder}&preset=${preset}&fade=false&fadeDuration=1.0&fadeOffset=1.0`
      setMixProgress('Menggabungkan audio dengan video thumbnail loop...')
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      })

      // Check if response is 200 OK
      if (response.status !== 200) {
        const errorText = await response.text()
        throw new Error(errorText || `Server error: ${response.status}`)
      }

      // Response is 200 OK, parse JSON
      const responseData = await response.json()
      
      // Save history after successful 200 response
      setMixProgress('Build berhasil! Menyimpan playlist dan thumbnail ke history...')
      
      // Read history again to get latest state
      const currentHistory = await readMixHistory()
      
      // Create history entry with playlist and thumbnail
      const playlistNames = selectedPlaylist.map(pf => addIdentifierToFilename(pf.file.name, pf.isMain))
      const historyEntry: MixHistory = {
        playlist: playlistNames,
        thumbnail: selectedThumbnail.name,
        timestamp: new Date().toISOString()
      }
      
      // Add new entry to history
      currentHistory.push(historyEntry)
      
      // Save updated history
      try {
        await writeMixHistory(currentHistory)
        setMixProgress('History playlist dan thumbnail disimpan')
      } catch (historyErr: any) {
        console.warn('[AUTOMIXER] Failed to save history:', historyErr)
        setMixProgress('History tidak dapat disimpan, tetapi build berhasil')
      }
      
      if (responseData.success && responseData.queueId) {
        setMixProgress('Request ditambahkan ke queue. Silakan cek tab Queue untuk melihat progress.')
        setInfo(`Video build dimulai dengan video thumbnail loop: ${selectedThumbnail.name}. Queue ID: ${responseData.queueId}`)
      } else {
        setInfo(`Video build berhasil dengan video thumbnail loop: ${selectedThumbnail.name}`)
      }
      
      setTimeout(() => {
        setMixProgress('')
      }, 3000)

    } catch (err: any) {
      console.error('[AUTOMIXER] Error building video:', err)
      setError(err.message || 'Gagal membangun video')
    } finally {
      setIsMixing(false)
    }
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
        🎵 Auto Mixer
      </h2>

      {/* Sources Directory Selection */}
      <div style={{
        padding: '1.5rem',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        background: '#f8f9fa'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Folder Sources</h3>
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
            onClick={openSourcesDirectoryPicker}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: loading ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {loading ? '⏳ Memindai...' : '📁 Pilih Folder Sources'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6c757d' }}>
          Pilih folder sources. Struktur yang diperlukan:<br/>
          <strong>1. Langsung:</strong> Folder yang dipilih langsung berisi subfolder "main" (wajib), "alter" (opsional), dan "thumbnail" (wajib)<br/>
          <strong>2. Bertingkat:</strong> Folder yang dipilih berisi beberapa subfolder, masing-masing memiliki "main" (wajib) dan "alter" (opsional), serta folder "thumbnail" (wajib) di root<br/>
          Folder "main" berisi file MP3 versi utama, folder "alter" berisi versi alternatif, folder "thumbnail" berisi file video loop (MP4, MKV, AVI, MOV, WEBM, M4V).
        </p>
      </div>

      {/* Audio Sources Info */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Sumber Audio Ditemukan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {audioSources.map((source, index) => (
              <div
                key={index}
                style={{
                  padding: '0.75rem',
                  background: 'white',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  📁 {source.name}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6c757d' }}>
                  Main: {source.mainFiles.length} file | 
                  Alter: {source.alterFiles.length} file
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thumbnail Info */}
      {thumbnailFiles.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Video Thumbnail Loop Tersedia</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>
              Total: {thumbnailFiles.length} video thumbnail loop
            </div>
            {selectedThumbnail && (
              <div style={{
                padding: '0.75rem',
                background: '#d4edda',
                borderRadius: '4px',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#155724' }}>
                  ✅ Video thumbnail loop yang akan digunakan:
                </div>
                <div style={{ fontSize: '0.875rem', color: '#155724' }}>
                  📹 {selectedThumbnail.name}
                </div>
              </div>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6c757d' }}>
            Sistem akan otomatis memilih video thumbnail loop yang belum pernah digunakan. Setiap video thumbnail hanya akan digunakan sekali.
          </p>
        </div>
      )}


      {/* Song Count Input */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Jumlah Lagu untuk Mixing</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{ fontWeight: 'bold', minWidth: '150px' }}>
              Jumlah Lagu:
            </label>
            <input
              type="number"
              min="1"
              value={songCount}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 1
                setSongCount(Math.max(1, value))
              }}
              style={{
                padding: '0.5rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '1rem',
                width: '100px'
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6c757d' }}>
            Masukkan jumlah lagu yang ingin digunakan untuk mixing. Sistem akan memastikan tidak ada duplikasi judul antara main dan alter dalam satu playlist.
          </p>
        </div>
      )}

      {/* Encoder and Preset Selection */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Encoder & Preset</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Encoder
              </label>
              <select
                value={encoder}
                onChange={(e) => {
                  setEncoder(e.target.value)
                  // Reset preset to default when encoder changes
                  if (e.target.value === 'cpu') {
                    setPreset('medium')
                  } else if (e.target.value === 'nvenc') {
                    setPreset('p4')
                  } else if (e.target.value === 'qsv') {
                    setPreset('medium')
                  } else if (e.target.value === 'amf') {
                    setPreset('balanced')
                  } else if (e.target.value === 'vaapi') {
                    setPreset('medium')
                  } else if (e.target.value === 'videotoolbox') {
                    setPreset('medium')
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              >
                <option value="cpu">CPU (libx264)</option>
                <option value="nvenc">NVIDIA GPU (NVENC)</option>
                <option value="qsv">Intel GPU (Quick Sync)</option>
                <option value="amf">AMD GPU (AMF)</option>
                <option value="vaapi">VAAPI (Linux)</option>
                <option value="videotoolbox">Apple GPU (VideoToolbox - M1/M2/M3/M4)</option>
              </select>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#6c757d' }}>
                Pilih encoder untuk rendering. GPU encoder lebih cepat tapi memerlukan hardware yang sesuai.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Preset
              </label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
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
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#6c757d' }}>
                Preset mempengaruhi kecepatan dan kualitas encoding. Lebih cepat = kualitas lebih rendah.
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Auto Mix Button */}
      {audioSources.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Auto Mix</h3>
          <button
            onClick={performAutoMix}
            disabled={isMixing || audioSources.length === 0 || songCount <= 0 || thumbnailFiles.length === 0}
            style={{
              padding: '1rem 2rem',
              background: isMixing || audioSources.length === 0 || songCount <= 0 || thumbnailFiles.length === 0 ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isMixing || audioSources.length === 0 || songCount <= 0 || thumbnailFiles.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              marginBottom: '1rem'
            }}
          >
            {isMixing ? '⏳ Memproses...' : '🎲 Generate Playlist Otomatis'}
          </button>
          {thumbnailFiles.length === 0 && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#dc3545' }}>
              ⚠️ Folder thumbnail wajib berisi file video loop sebelum generate playlist
            </p>
          )}
          {mixProgress && (
            <div style={{
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

      {/* Selected Playlist */}
      {selectedPlaylist.length > 0 && (
        <div style={{
          padding: '1.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          background: '#f8f9fa'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Playlist yang Dipilih</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {selectedPlaylist.map((playlistFile, index) => {
              const displayName = addIdentifierToFilename(playlistFile.file.name, playlistFile.isMain)
              return (
                <div
                  key={index}
                  style={{
                    padding: '0.75rem',
                    background: 'white',
                    borderRadius: '4px',
                    border: '1px solid #dee2e6'
                  }}
                >
                  <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>#{index + 1}</span>
                  <span>🎵 {displayName}</span>
                  <span style={{ 
                    marginLeft: '0.5rem', 
                    fontSize: '0.75rem', 
                    color: playlistFile.isMain ? '#28a745' : '#17a2b8',
                    fontWeight: 'bold'
                  }}>
                    ({playlistFile.isMain ? 'MAIN' : 'ALTER'})
                  </span>
                </div>
              )
            })}
          </div>
          <button
            onClick={buildVideoWithPlaylist}
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
            {isMixing ? '⏳ Membangun Video...' : '🎬 Build Video dengan Playlist Ini'}
          </button>
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

      {/* Info Message */}
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

