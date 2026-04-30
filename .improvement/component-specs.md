# Component Specs

## Global Glass Rules
- Panel wajib memakai kombinasi: `glass.panelBg` + `blur.panel` + `border.glassHighlight`.
- Setiap panel punya minimal 2 layer depth: base panel dan highlight/inner stroke.
- Teks di atas glass harus tetap tinggi kontras (jangan kurang dari `text.secondary`).

## Button
- Variants: `primary`, `secondary`, `ghost`, `danger`.
- Height: 40-44 px untuk desktop, 44-48 px untuk touch target mobile.
- Radius: gunakan `radius.md` atau `radius.lg`.
- State wajib: default, hover, active, disabled, loading.
- Aturan: hanya satu tombol `primary` dominan per section utama.
- `primary`: boleh pakai glow halus, jangan lebih terang dari konten utama.
- `secondary`: gunakan panel semi-transparan, bukan warna flat pekat.

## Input / Textarea
- Label selalu terlihat (jangan placeholder-only).
- Helper text opsional di bawah field.
- Error message ringkas dan spesifik.
- State wajib: default, focus, error, disabled.
- Focus ring harus kontras dan konsisten.
- Background input glass harus lebih solid dari card agar keterbacaan tinggi.
- Placeholder gunakan `text.muted`, jangan terlalu redup.

## Select / Dropdown
- Ukuran dan spacing setara dengan input.
- Isi menu mudah di-scan (hindari teks terlalu panjang).
- Searchable jika opsi > 8 item.
- Dropdown content gunakan blur lebih rendah dari modal agar tidak berlebihan.

## Card / Panel
- Dipakai untuk mengelompokkan step kerja.
- Header card berisi judul + deskripsi singkat.
- Footer card dipakai untuk action sekunder bila dibutuhkan.
- Gunakan elevation halus, jangan shadow berlebihan.
- Gunakan border putih tipis transparan untuk efek kaca.
- Hindari menumpuk lebih dari 3 panel glass besar dalam satu viewport.

## Tabs
- Maksimal 4-5 tab per baris utama.
- Tab aktif harus memiliki indikator visual jelas.
- Hindari nested tab bila bisa diganti section card.

## Modal / Dialog
- Gunakan hanya untuk aksi penting atau konfirmasi.
- Harus bisa ditutup dengan `Esc` dan close button.
- Action di footer: `secondary` (kiri) + `primary/danger` (kanan).
- Overlay pakai `glass.backdropTint` + `blur.overlay`.
- Body modal gunakan `blur.modal` dengan kontras teks lebih tinggi.

## Toast / Alert
- Toast untuk feedback non-blocking.
- Alert inline untuk error yang butuh tindakan.
- Durasi toast default 3-5 detik (kecuali error persisten).
- Toast glass harus tetap readable pada background kompleks.

## Data Row / List Item
- Elemen klikable minimal 44 px tinggi.
- Tampilkan metadata sekunder dengan kontras lebih rendah.
- Sediakan quick action tanpa mengganggu action utama.
