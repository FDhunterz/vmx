# Accessibility Checklist

## Visual
- Kontras teks minimum memenuhi WCAG AA.
- Jangan mengandalkan warna saja untuk status/error.
- Focus ring terlihat jelas di semua elemen interaktif.

## Keyboard
- Semua kontrol bisa diakses lewat keyboard.
- Urutan tab logis sesuai flow layar.
- Modal trap focus dan kembali ke trigger saat ditutup.

## Semantics
- Gunakan elemen semantik (`button`, `label`, `input`) dengan benar.
- Field form terkait label melalui `for`/`id` atau nesting valid.
- Ikon-only button harus punya `aria-label`.

## Feedback
- Error form dapat dibaca screen reader.
- Status penting (loading/success/error) diumumkan dengan tepat.

## Touch Targets
- Ukuran target klik/tap minimal 44x44 px.
