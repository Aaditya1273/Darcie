'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertTriangle, ArrowLeft, Mail, Lock } from 'lucide-react'
import s from './auth.module.css'

// ── Dark geometric polygon art (SVG) ─────────────────────────────
function GeometricArt() {
  return (
    <svg className={s.leftArt} viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a1a1a"/>
          <stop offset="100%" stopColor="#0a0a0a"/>
        </linearGradient>
        <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a2a2a"/>
          <stop offset="100%" stopColor="#111111"/>
        </linearGradient>
        <linearGradient id="g3" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#333333"/>
          <stop offset="100%" stopColor="#0d0d0d"/>
        </linearGradient>
        <linearGradient id="g4" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#222222"/>
          <stop offset="100%" stopColor="#141414"/>
        </linearGradient>
        <linearGradient id="g5" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#3a3a3a"/>
          <stop offset="100%" stopColor="#0f0f0f"/>
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="600" height="900" fill="#0a0a0a"/>

      {/* Large polygons — dark facets */}
      <polygon points="0,0 280,0 180,200 0,150" fill="url(#g2)" opacity="0.9"/>
      <polygon points="280,0 600,0 600,180 350,220" fill="url(#g3)" opacity="0.85"/>
      <polygon points="0,150 180,200 120,400 0,350" fill="url(#g4)" opacity="0.9"/>
      <polygon points="180,200 350,220 300,450 120,400" fill="url(#g1)" opacity="0.95"/>
      <polygon points="350,220 600,180 580,420 300,450" fill="url(#g5)" opacity="0.8"/>
      <polygon points="0,350 120,400 80,600 0,550" fill="url(#g3)" opacity="0.9"/>
      <polygon points="120,400 300,450 250,650 80,600" fill="url(#g2)" opacity="0.85"/>
      <polygon points="300,450 580,420 560,660 250,650" fill="url(#g4)" opacity="0.9"/>
      <polygon points="0,550 80,600 60,780 0,750" fill="url(#g5)" opacity="0.85"/>
      <polygon points="80,600 250,650 200,850 60,780" fill="url(#g1)" opacity="0.9"/>
      <polygon points="250,650 560,660 600,900 200,850" fill="url(#g3)" opacity="0.85"/>
      <polygon points="0,750 60,780 0,900" fill="url(#g2)" opacity="0.9"/>
      <polygon points="600,0 600,180 700,80" fill="url(#g4)" opacity="0.7"/>

      {/* Mid-layer facets for depth */}
      <polygon points="150,50 320,30 260,180 140,160" fill="url(#g5)" opacity="0.5"/>
      <polygon points="320,30 520,60 480,200 260,180" fill="url(#g1)" opacity="0.45"/>
      <polygon points="50,220 200,240 170,380 30,360" fill="url(#g3)" opacity="0.5"/>
      <polygon points="200,240 380,260 340,420 170,380" fill="url(#g2)" opacity="0.45"/>
      <polygon points="380,260 560,240 540,400 340,420" fill="url(#g4)" opacity="0.5"/>
      <polygon points="40,440 180,460 150,600 20,580" fill="url(#g5)" opacity="0.45"/>
      <polygon points="180,460 360,480 320,640 150,600" fill="url(#g1)" opacity="0.5"/>
      <polygon points="360,480 540,460 520,620 320,640" fill="url(#g3)" opacity="0.45"/>
      <polygon points="60,660 220,680 190,820 40,800" fill="url(#g2)" opacity="0.5"/>
      <polygon points="220,680 420,700 380,860 190,820" fill="url(#g4)" opacity="0.45"/>
      <polygon points="420,700 580,680 600,900 380,860" fill="url(#g5)" opacity="0.5"/>

      {/* Highlight edges — subtle bright lines */}
      <line x1="0" y1="150" x2="180" y2="200" stroke="#3a3a3a" strokeWidth="0.5" opacity="0.6"/>
      <line x1="180" y1="200" x2="350" y2="220" stroke="#3a3a3a" strokeWidth="0.5" opacity="0.6"/>
      <line x1="350" y1="220" x2="600" y2="180" stroke="#444444" strokeWidth="0.5" opacity="0.5"/>
      <line x1="120" y1="400" x2="300" y2="450" stroke="#333333" strokeWidth="0.5" opacity="0.6"/>
      <line x1="300" y1="450" x2="580" y2="420" stroke="#333333" strokeWidth="0.5" opacity="0.5"/>
      <line x1="80" y1="600" x2="250" y2="650" stroke="#3a3a3a" strokeWidth="0.5" opacity="0.6"/>
      <line x1="250" y1="650" x2="560" y2="660" stroke="#333333" strokeWidth="0.5" opacity="0.5"/>
      <line x1="60" y1="780" x2="200" y2="850" stroke="#3a3a3a" strokeWidth="0.5" opacity="0.6"/>
    </svg>
  )
}

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) { setError('Please agree to the terms and conditions'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid credentials'); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      {/* ── Left: dark geometric art ── */}
      <div className={s.left}>
        <GeometricArt />
        <div className={s.leftBrand}>
          <div className={s.leftLogo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect width="16" height="16" rx="4" fill="rgba(255,255,255,0.9)"/>
              <path d="M4 8h8M8 4v8" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className={s.leftLogoText}>Darcie</span>
        </div>
      </div>

      {/* ── Right: form ── */}
      <div className={s.right}>
        <div className={s.form}>
          <h1 className={s.title}>Welcome Back !</h1>
          <p className={s.subtitle}>Sign in to your account</p>

          <form onSubmit={submit}>
            <div className={s.fields}>
              <div className={s.fieldGroup}>
                <label className={s.label}>Email</label>
                <div className={s.inputWrap}>
                  <div className={s.inputIcon}><Mail size={15} /></div>
                  <input
                    className={s.input}
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className={s.fieldGroup}>
                <label className={s.label}>Password</label>
                <div className={s.inputWrap}>
                  <div className={s.inputIcon}><Lock size={15} /></div>
                  <input
                    className={s.input}
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <label className={s.terms}>
              <input
                type="checkbox"
                className={s.checkbox}
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
              />
              <span className={s.termsText}>I agree with terms and conditions</span>
            </label>

            {error && (
              <div className={s.error}>
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className={s.btn} disabled={loading}>
              {loading ? <Loader2 size={15} className={s.spin} /> : 'Sign In'}
            </button>
          </form>

          <div className={s.divider}>
            <div className={s.dividerLine} />
            <span className={s.dividerText}>or continue with</span>
            <div className={s.dividerLine} />
          </div>

          {/* Social placeholders — same style as reference */}
          <div className={s.socials}>
            <button className={s.socialBtn} title="Google" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" opacity="0.9"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity="0.7"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity="0.8"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity="0.9"/>
              </svg>
            </button>
            <button className={s.socialBtn} title="GitHub" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </button>
            <button className={s.socialBtn} title="Apple" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            </button>
          </div>

          <p className={s.switchText}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className={s.switchLink}>Sign up</Link>
          </p>

          <Link href="/" className={s.backLink}>
            <ArrowLeft size={12} />
            Back to Darcie
          </Link>
        </div>
      </div>
    </div>
  )
}
