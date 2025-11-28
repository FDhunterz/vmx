import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VMX - Video Mixer',
  description: 'Aplikasi video mixer untuk menggabungkan beberapa video',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}

