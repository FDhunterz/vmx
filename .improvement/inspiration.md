# UI Inspiration Notes

Gunakan file ini untuk menyimpan referensi visual dan alasan adopsi.

## Referensi Utama
- Lovable (landing + builder): layout modern, CTA kuat, dan sectioning jelas.
- Linear (app): hierarchy yang konsisten, density rapi, dan panel clean.
- Vercel Dashboard: tipografi bersih, warna netral, fokus pada konten.
- Raycast / Arc visual language: layering, glow halus, dan depth premium.

## Apa yang Diadopsi
- Visual hierarchy kuat melalui ukuran teks + kontras panel.
- Komposisi card modular untuk alur kerja berbasis langkah.
- Tombol primer selalu menonjol di area action.
- Empty/loading/error state dibuat elegan dan informatif.
- Panel glass semi-transparan dengan blur moderat.
- Border highlight tipis untuk efek permukaan kaca.
- Accent glow lokal pada elemen aktif (bukan global).

## Apa yang Dihindari
- Tampilan form panjang tanpa grouping.
- Terlalu banyak border tebal dan warna kontras acak.
- CTA primer lebih lemah dari elemen sekunder.
- Efek blur berlebihan sampai performa turun.
- Warna gradient terlalu ramai dalam satu panel.

## Checklist Sebelum Implementasi
- Apakah layar punya satu fokus utama?
- Apakah user paham next action dalam 3 detik?
- Apakah komponen konsisten dengan token?
- Apakah state UX lengkap untuk kondisi gagal/loading?
- Apakah panel glass tetap terbaca di layar terang dan gelap?
- Apakah blur dan shadow masih terasa ringan di laptop menengah?
