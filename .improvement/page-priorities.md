# Page Priorities for Redesign

## Tujuan
Mengerjakan redesign secara bertahap agar risiko rendah dan hasil cepat terlihat.

## Prioritas Eksekusi
1. `components/TemplateMixer.tsx`
   - Fokus: struktur layout, hierarchy, panel input, preview, action footer.
2. Halaman/komponen upload flow
   - Fokus: progress, status, dan error handling visual.
3. Halaman hasil output/render
   - Fokus: keterbacaan metadata, quick actions, dan state kosong.
4. Settings dan konfigurasi lanjutan
   - Fokus: konsistensi form, toggle, helper text.

## Definition of Done per Halaman
- Menggunakan design tokens dari `design-tokens.json`.
- Memiliki state default, loading, error, dan empty.
- Responsif minimal mobile/tablet/desktop.
- Tidak ada elemen dengan style inline acak di luar token.
