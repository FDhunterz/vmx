# VMX - Video Mixer

Aplikasi video mixer berbasis Next.js untuk menggabungkan audio dengan black screen atau video loop menggunakan backend API.

## Fitur

- 🎵 Upload multiple audio files
- 📹 Upload video untuk mode video loop
- ↕️ Reorder urutan audio files
- 🎲 Randomize urutan audio files
- 🎬 Build video dengan black screen atau video loop
- ⚙️ Konfigurasi API URL (untuk deploy ke cloud)
- 💾 Download hasil video yang sudah dibuat

## Teknologi

- Next.js 14
- React 18
- TypeScript
- Backend API (C++ server di http://localhost:8080)

## Instalasi

1. Install dependencies:
```bash
npm install
```

2. (Opsional) Buat file `.env.local` untuk mengatur API URL:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

3. Pastikan backend API server berjalan di `http://localhost:8080`

4. Jalankan development server:
```bash
npm run dev
```

5. Buka browser di [http://localhost:3000](http://localhost:3000)

## Cara Menggunakan

1. Pastikan backend API server berjalan (lihat status di bagian atas halaman)
2. Pilih mode: **Black Screen** (audio saja) atau **Video Loop** (video + audio)
3. Upload file audio (dan video jika mode video-loop)
4. Atur urutan file dengan tombol ↑/↓ atau klik **Randomize Urutan** untuk mengacak
5. (Opsional) Atur opsi build (width, height, fps) untuk mode black-screen
6. Klik **Build Video** untuk memproses
7. Tunggu proses selesai, video akan otomatis terdownload

## Deploy ke Cloud (Tanpa Install di Mac)

### Opsi 1: Deploy ke Vercel (Gratis)

1. **Deploy Frontend (Next.js):**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel
   ```

2. **Set Environment Variable di Vercel:**
   - Masuk ke dashboard Vercel
   - Pilih project
   - Settings → Environment Variables
   - Tambahkan: `NEXT_PUBLIC_API_URL` = URL backend API Anda

3. **Deploy Backend API:**
   - Deploy backend API ke server/VPS yang mendukung C++
   - Atau gunakan service seperti Railway, Render, atau DigitalOcean
   - Pastikan CORS sudah dikonfigurasi di backend

4. **Konfigurasi API URL:**
   - Setelah deploy, gunakan tombol **⚙️ Config** di aplikasi
   - Masukkan URL backend API yang sudah di-deploy
   - Klik **Simpan**

### Opsi 2: Build Static Export

```bash
# Build untuk production
npm run build

# Export static files
npm run export  # (perlu tambahkan script di package.json)
```

### Opsi 3: Menggunakan Konfigurasi Manual

1. Buka aplikasi di browser
2. Klik tombol **⚙️ Config** di bagian status API
3. Masukkan URL backend API (contoh: `https://api.example.com`)
4. Klik **Simpan**
5. URL akan tersimpan di localStorage browser

## Catatan

- Format output: **MP4** (H.264 codec)
- Backend API harus mendukung CORS untuk request dari browser
- Untuk production, pastikan backend API di-deploy dan dapat diakses dari internet
- API URL dapat diatur via:
  - Environment variable: `NEXT_PUBLIC_API_URL`
  - UI Config (disimpan di localStorage)
  - Default: `http://localhost:8080`

