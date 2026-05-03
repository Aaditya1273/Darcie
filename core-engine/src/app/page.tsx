'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './page.module.css'
import {
  Plus, Home, PocketKnife, Network, Folder, MoreHorizontal,
  Sparkles, Presentation, FileText, MessageSquare,
  Image as ImageIcon, Video, Link, Mic, Send, User,
  Search, Brain, Cpu, Loader2, CheckCircle2, X,
  LogOut, AlertTriangle, RefreshCw, LayoutDashboard,
} from 'lucide-react'
import NextLink from 'next/link'

// ── Types ─────────────────────────────────────────────────────────
type TaskStatus = { type: string; query: string; done: boolean }
type Message = {
  id: string; role: 'user' | 'assistant'
  content: string; plan?: TaskStatus[]
  intent?: string; error?: boolean
}
type AuthUser = { id: string; email: string; name: string | null }
type AuthMode = 'idle' | 'signin' | 'signup'

// ── Constants ─────────────────────────────────────────────────────
const TASK_ICONS: Record<string, React.ReactNode> = {
  search: <Search size={13} />, deep_research: <Brain size={13} />,
  research: <Brain size={13} />, hybrid: <Brain size={13} />,
  ppt: <Presentation size={13} />, presenton_report: <FileText size={13} />,
  generate_image: <ImageIcon size={13} />, image: <ImageIcon size={13} />,
}
const TASK_LABELS: Record<string, string> = {
  search: 'Web Search', deep_research: 'Deep Research',
  research: 'Knowledge Graph', hybrid: 'Hybrid Research',
  ppt: 'Generating PPT', presenton_report: 'Generating Presentation',
  generate_image: 'Generating Image', image: 'Generating Image',
}
const QUICK_ACTIONS = [
  { label: '🔍 Search the web', q: 'What are the latest AI breakthroughs in 2025?' },
  { label: '📊 Make a PPT', q: 'Make a PPT about climate change with 8 slides' },
  { label: '🎨 Generate image', q: 'Generate an image of a futuristic city at night' },
  { label: '🔬 Deep research', q: 'Deep research on quantum computing applications' },
  { label: '📑 Create report', q: 'Create a professional report on renewable energy trends' },
]

// ── Markdown renderer ─────────────────────────────────────────────
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const els: React.ReactNode[] = []
  let k = 0
  for (const line of lines) {
    if (line.startsWith('### ')) els.push(<h3 key={k++} className={styles.mdH3}>{inlineRender(line.slice(4))}</h3>)
    else if (line.startsWith('## ')) els.push(<h2 key={k++} className={styles.mdH2}>{inlineRender(line.slice(3))}</h2>)
    else if (line.startsWith('# ')) els.push(<h1 key={k++} className={styles.mdH1}>{inlineRender(line.slice(2))}</h1>)
    else if (line.match(/^[-*] /)) els.push(<li key={k++} className={styles.mdLi}>{inlineRender(line.slice(2))}</li>)
    else if (line.startsWith('![')) {
      const m = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
      if (m) els.push(<img key={k++} src={m[2]} alt={m[1]} className={styles.mdImg} />)
    }
    else if (line.trim() === '---') els.push(<hr key={k++} className={styles.mdHr} />)
    else if (line.trim()) els.push(<p key={k++} className={styles.mdP}>{inlineRender(line)}</p>)
  }
  return <div className={styles.mdRoot}>{els}</div>
}

function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`)/)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className={styles.mdCode}>{p.slice(1, -1)}</code>
    const lm = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (lm) return <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer" className={styles.mdLink}>{lm[1]}</a>
    return p
  })
}

// ── Auth Modal ────────────────────────────────────────────────────
function AuthModal({ mode, onClose, onSuccess }: {
  mode: 'signin' | 'signup'
  onClose: () => void
  onSuccess: (user: AuthUser) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin'
      const body = mode === 'signup' ? { email, password, name } : { email, password }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); return }
      // Fetch user info
      const me = await fetch('/api/auth/me')
      const meData = await me.json()
      if (meData.user) onSuccess(meData.user)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{mode === 'signup' ? 'Create account' : 'Sign in'}</h2>
          <button onClick={onClose} className={styles.modalClose}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className={styles.modalForm}>
          {mode === 'signup' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Name</label>
              <input className={styles.formInput} type="text" placeholder="Your name"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Email</label>
            <input className={styles.formInput} type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Password</label>
            <input className={styles.formInput} type="password"
              placeholder={mode === 'signup' ? 'Min 8 characters' : 'Your password'}
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && (
            <div className={styles.formError}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <button type="submit" className={styles.formSubmit} disabled={loading}>
            {loading ? <Loader2 size={15} className={styles.spin} /> : (mode === 'signup' ? 'Create account' : 'Sign in')}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [activeTasks, setActiveTasks] = useState<TaskStatus[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('idle')
  const [authLoading, setAuthLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check session on mount
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) setUser(d.user)
    }).catch(() => {}).finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTasks])

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    setUser(null)
    setMessages([])
    setConversationId(null)
  }

  const handleSSEEvent = useCallback((event: { type: string; data: Record<string, unknown> }, assistantId: string) => {
    switch (event.type) {
      case 'status':
        setStatusText(event.data.message as string)
        break
      case 'plan':
        setActiveTasks((event.data.tasks as Array<{ type: string; query: string }>)
          .map(t => ({ type: t.type, query: t.query, done: false })))
        break
      case 'task_done':
        setActiveTasks(prev => prev.map(t =>
          t.type === (event.data.type as string) ? { ...t, done: true } : t))
        break
      case 'response':
        setConversationId(event.data.conversationId as string)
        setMessages(prev => prev.map(m => m.id === assistantId ? {
          ...m,
          content: event.data.text as string,
          intent: event.data.intent as string,
          plan: (event.data.plan as Array<{ type: string; query: string }>)
            ?.map(t => ({ type: t.type, query: t.query, done: true })),
        } : m))
        break
      case 'error':
        setMessages(prev => prev.map(m => m.id === assistantId
          ? { ...m, content: event.data.message as string, error: true } : m))
        break
    }
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = query.trim()
    if (!q || isStreaming) return

    setQuery('')
    setIsStreaming(true)
    setStatusText('Connecting...')
    setActiveTasks([])

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: q }
    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, conversationId: conversationId ?? undefined }),
      })

      if (res.status === 429) {
        const data = await res.json()
        setMessages(prev => prev.map(m => m.id === assistantId
          ? { ...m, content: data.error, error: true } : m))
        return
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try { handleSSEEvent(JSON.parse(line.slice(6)), assistantId) } catch { /* skip */ }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: `Could not reach Darcie. Is the server running?\n\`${err}\``, error: true } : m))
    } finally {
      setIsStreaming(false)
      setStatusText('')
      setActiveTasks([])
    }
  }

  const retry = (content: string) => {
    setQuery(content)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const isEmpty = messages.length === 0

  return (
    <div className={styles.layout}>
      {/* Auth modal */}
      {authMode !== 'idle' && (
        <AuthModal
          mode={authMode as 'signin' | 'signup'}
          onClose={() => setAuthMode('idle')}
          onSuccess={u => { setUser(u); setAuthMode('idle') }}
        />
      )}

      {/* Top bar */}
      <header className={styles.topNav}>
        <div className={styles.topNavLeft}>
          <div className={styles.navLogo}><Sparkles size={15} /></div>
          <span className={styles.navBrand}>Darcie</span>
        </div>
        <div className={styles.topNavRight}>
          {authLoading ? null : user ? (
            <>
              <span className={styles.userEmail}>{user.name || user.email}</span>
              <button className={styles.btnIcon} onClick={signOut} title="Sign out">
                <LogOut size={15} />
              </button>
            </>
          ) : (
            <>
              <button className={styles.btnSecondary} onClick={() => setAuthMode('signin')}>Sign in</button>
              <button className={styles.btnPrimary} onClick={() => setAuthMode('signup')}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <div className={styles.bodyWrapper}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTop}>
            <button className={styles.navItem} onClick={() => { setMessages([]); setConversationId(null) }}>
              <Plus size={20} /><span>New</span>
            </button>
            <button className={`${styles.navItem} ${styles.navItemActive}`}>
              <Home size={18} /><span>Home</span>
            </button>
            <button className={styles.navItem}><PocketKnife size={18} /><span>Claw</span></button>
            <button className={styles.navItem}><Network size={18} /><span>Flows</span></button>
            <button className={styles.navItem}><Folder size={18} /><span>Drive</span></button>
            <NextLink href="/workspace" className={styles.navItem} style={{ textDecoration: 'none' }}>
              <LayoutDashboard size={18} /><span>Workspace</span>
            </NextLink>
            <button className={styles.navItem}><MoreHorizontal size={18} /><span>More</span></button>
          </div>
          <button className={styles.navItem} onClick={() => !user && setAuthMode('signin')}>
            <User size={18} />
          </button>
        </aside>

        {/* Main */}
        <main className={styles.main}>
          {isEmpty && (
            <div className={styles.emptyState}>
              <h1 className={styles.title}>Darcie AI Workspace</h1>
              <p className={styles.subtitle}>Search, research, generate images, create presentations — all in one place.</p>
              <div className={styles.quickActions}>
                {QUICK_ACTIONS.map(({ label, q }) => (
                  <button key={q} className={styles.quickChip}
                    onClick={() => { setQuery(q); textareaRef.current?.focus() }}>
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.agentsRow}>
                {[
                  { icon: <Search size={17} />, label: 'Web Search', color: '#1e3a5f' },
                  { icon: <Brain size={17} />, label: 'Deep Research', color: '#2a1e5f' },
                  { icon: <Presentation size={17} />, label: 'AI Slides', color: '#3d2a1e' },
                  { icon: <FileText size={17} />, label: 'AI Report', color: '#1e3d2a' },
                  { icon: <ImageIcon size={17} />, label: 'AI Image', color: '#3d1e3a' },
                  { icon: <Video size={17} />, label: 'AI Video', color: '#3d3a1e' },
                  { icon: <MessageSquare size={17} />, label: 'AI Chat', color: '#1e2a3d' },
                  { icon: <Cpu size={17} />, label: 'All Agents', color: '#222' },
                ].map(({ icon, label, color }) => (
                  <div key={label} className={styles.agentItem}>
                    <div className={styles.agentIcon} style={{ background: color }}>{icon}</div>
                    <span className={styles.agentLabel}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isEmpty && (
            <div className={styles.thread}>
              {messages.map(msg => (
                <div key={msg.id} className={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                  {msg.role === 'user' ? (
                    <p className={styles.userText}>{msg.content}</p>
                  ) : (
                    <div>
                      {/* Plan pills */}
                      {msg.plan && msg.plan.length > 0 && (
                        <div className={styles.planRow}>
                          {msg.plan.map((t, i) => (
                            <span key={i} className={`${styles.planPill} ${t.done ? styles.planPillDone : ''}`}>
                              {t.done ? <CheckCircle2 size={11} /> : <Loader2 size={11} className={styles.spin} />}
                              {TASK_ICONS[t.type]}
                              {TASK_LABELS[t.type] || t.type}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Content or loading */}
                      {msg.content ? (
                        msg.error ? (
                          <div className={styles.errorBox}>
                            <AlertTriangle size={15} className={styles.errorIcon} />
                            <p className={styles.errorText}>{msg.content}</p>
                            <button className={styles.retryBtn} onClick={() => retry(messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(msg))?.content ?? '')}>
                              <RefreshCw size={13} /> Retry
                            </button>
                          </div>
                        ) : (
                          <div className={styles.responseBox}>
                            <Markdown text={msg.content} />
                          </div>
                        )
                      ) : (
                        <div className={styles.thinkingBox}>
                          <Loader2 size={13} className={styles.spin} />
                          <span>{statusText || 'Thinking...'}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Live task progress */}
              {isStreaming && activeTasks.length > 0 && (
                <div className={styles.liveProgress}>
                  <p className={styles.liveStatus}>{statusText}</p>
                  {activeTasks.map((t, i) => (
                    <div key={i} className={styles.liveTask}>
                      {t.done
                        ? <CheckCircle2 size={12} className={styles.taskDone} />
                        : <Loader2 size={12} className={`${styles.spin} ${styles.taskPending}`} />}
                      <span className={t.done ? styles.taskLabelDone : styles.taskLabel}>
                        {TASK_ICONS[t.type]} {TASK_LABELS[t.type] || t.type}
                      </span>
                      <span className={styles.taskQuery}>— {t.query.slice(0, 55)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className={styles.inputDock}>
            <form className={styles.inputBox} onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                placeholder="Ask anything, create anything..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                rows={1}
                disabled={isStreaming}
              />
              <div className={styles.inputActions}>
                <div className={styles.inputLeft}>
                  <button type="button" className={styles.iconBtn} title="Attach"><Plus size={14} /></button>
                  <button type="button" className={styles.iconBtn} title="URL"><Link size={14} /></button>
                  <button type="button" className={styles.pillBtn}><Sparkles size={12} /> Ultra</button>
                </div>
                <div className={styles.inputRight}>
                  <button type="button" className={styles.iconBtn} title="Voice"><Mic size={14} /></button>
                  <button type="submit" className={styles.sendBtn} disabled={!query.trim() || isStreaming}>
                    {isStreaming ? <Loader2 size={13} className={styles.spin} /> : <Send size={13} />}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}
