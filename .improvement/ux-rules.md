# UX Rules

## Form & Validation
- Validasi ringan saat mengetik, validasi penuh saat submit.
- Tampilkan error dekat field terkait, bukan hanya toast global.
- Gunakan bahasa yang actionable: jelaskan apa yang harus diperbaiki.

## Loading States
- Gunakan skeleton untuk area konten utama.
- Tombol submit menampilkan spinner + label proses (`Processing...`).
- Cegah double submit saat request berlangsung.

## Empty States
- Jelaskan konteks kosong dan langkah berikutnya.
- Sertakan satu CTA utama yang relevan.

## Error Handling
- Error teknis ditampilkan ramah (tanpa stack mentah).
- Berikan opsi retry jika memungkinkan.
- Simpan input user jika submit gagal (jangan hilang).

## Critical Actions
- Aksi destruktif wajib dialog konfirmasi.
- Teks konfirmasi harus eksplisit (apa yang akan dihapus/diubah).

## Feedback & Status
- Gunakan status visual yang konsisten (success/warning/error/info).
- Untuk proses panjang, tampilkan progress atau step indicator.

## Interaction Quality
- Hover/focus/active harus terasa responsif (<250ms).
- Hindari layout shift mendadak saat data muncul.
