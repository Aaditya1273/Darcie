import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Darcie',
  description: 'AI workspace — search, research, generate, create.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
