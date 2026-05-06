'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import s from './page.module.css'
import {
  Plus, Home, Layers, FolderOpen, LayoutGrid,
  Search, BookOpen, Presentation, FileText, ImageIcon, MessageSquare, Cpu,
  Send, Loader2, CheckCircle2, LogOut, AlertTriangle, RefreshCw,
  Copy, Check, Mic, Paperclip, User, PanelLeft, ChevronRight, X,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────
type TaskStatus = { type: string; query: string; done: boolean }
type Message = {
  id: string; role: 'user' | 'assistant'
  content: string; plan?: TaskStatus[]
  intent?: string; error?: boolean
  imagePreview?: string  // base64 data URL for user-uploaded images
}
type AuthUser = { id: string; email: string; name: string | null }

// ── Agent metadata ────────────────────────────────────────────────
const TASK_META: Record<string, { label: string; icon: React.ReactNode }> = {
  search:           { label: 'Web Search',      icon: <Search size={12} /> },
  deep_research:    { label: 'Deep Research',   icon: <BookOpen size={12} /> },
  research:         { label: 'Knowledge Graph', icon: <BookOpen size={12} /> },
  hybrid:           { label: 'Hybrid Research', icon: <BookOpen size={12} /> },
  ppt:              { label: 'Presentation',    icon: <Presentation size={12} /> },
  presenton_report: { label: 'Report',          icon: <FileText size={12} /> },
  generate_image:   { label: 'Image',           icon: <ImageIcon size={12} /> },
  image:            { label: 'Image',           icon: <ImageIcon size={12} /> },
}

const NAV_ITEMS = [
  { icon: <Home size={18} />,        label: 'Home',      href: null,         id: 'home' },
  { icon: <Layers size={18} />,      label: 'Agents',    href: null,         id: 'agents' },
  { icon: <FolderOpen size={18} />,  label: 'Files',     href: null,         id: 'files' },
  { icon: <LayoutGrid size={18} />,  label: 'Workspace', href: '/workspace', id: 'workspace' },
]

const SUGGESTIONS = [
  { label: 'Search the web',        q: 'What are the latest AI breakthroughs in 2025?' },
  { label: 'Create a presentation', q: 'Make a presentation about climate change with 8 slides' },
  { label: 'Generate an image',     q: 'Generate an image of a futuristic city at night' },
  { label: 'Deep research',         q: 'Deep research on quantum computing applications' },
  { label: 'Professional report',   q: 'Create a professional report on renewable energy trends' },
]

const CAPABILITIES = [
  { icon: <Search size={18} />,        label: 'Web Search',  bg: 'var(--cap-search)',   q: 'Search the web for latest AI news in 2025' },
  { icon: <BookOpen size={18} />,      label: 'Research',    bg: 'var(--cap-research)', q: 'Deep research on quantum computing applications' },
  { icon: <Presentation size={18} />,  label: 'Slides',      bg: 'var(--cap-slides)',   q: 'Make a presentation about climate change with 8 slides' },
  { icon: <FileText size={18} />,      label: 'Reports',     bg: 'var(--cap-reports)',  q: 'Create a professional report on renewable energy trends' },
  { icon: <ImageIcon size={18} />,     label: 'Images',      bg: 'var(--cap-images)',   q: 'Generate an image of a futuristic city at night' },
  { icon: <MessageSquare size={18} />, label: 'Chat',        bg: 'var(--cap-chat)',     q: 'Hello, what can you help me with?' },
  { icon: <Cpu size={18} />,           label: 'All Agents',  bg: 'var(--cap-agents)',   q: 'Show me everything you can do' },
]

// ── Code block ────────────────────────────────────────────────────
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div className={s.codeBlock}>
      <div className={s.codeHeader}>
        <span className={s.codeLang}>{lang || 'plaintext'}</span>
        <button className={s.codeCopy} onClick={copy}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className={s.codePre}><code>{code}</code></pre>
    </div>
  )
}

// ── Markdown ──────────────────────────────────────────────────────
function Markdown({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  let k = 0; const lines = text.split('\n'); let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim(); const code: string[] = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      nodes.push(<CodeBlock key={k++} code={code.join('\n')} lang={lang} />); i++; continue
    }
    if (line.startsWith('> ')) { nodes.push(<blockquote key={k++} className={s.mdQuote}>{il(line.slice(2))}</blockquote>); i++; continue }
    if (line.includes('|') && lines[i+1]?.match(/^\|[-| :]+\|$/)) {
      const heads = line.split('|').filter(c=>c.trim()).map(c=>c.trim()); i+=2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) { rows.push(lines[i].split('|').filter(c=>c.trim()).map(c=>c.trim())); i++ }
      nodes.push(<div key={k++} className={s.mdTableWrap}><table className={s.mdTable}><thead><tr>{heads.map((h,j)=><th key={j}>{il(h)}</th>)}</tr></thead><tbody>{rows.map((row,ri)=><tr key={ri}>{row.map((cell,ci)=><td key={ci}>{il(cell)}</td>)}</tr>)}</tbody></table></div>); continue
    }
    if (line.startsWith('### ')) { nodes.push(<h3 key={k++} className={s.mdH3}>{il(line.slice(4))}</h3>); i++; continue }
    if (line.startsWith('## '))  { nodes.push(<h2 key={k++} className={s.mdH2}>{il(line.slice(3))}</h2>); i++; continue }
    if (line.startsWith('# '))   { nodes.push(<h1 key={k++} className={s.mdH1}>{il(line.slice(2))}</h1>); i++; continue }
    if (line.match(/^[-*] /))    { nodes.push(<li key={k++} className={s.mdLi}>{il(line.slice(2))}</li>); i++; continue }
    if (line.match(/^\d+\. /))   { nodes.push(<li key={k++} className={s.mdLi}>{il(line.replace(/^\d+\. /,''))}</li>); i++; continue }
    if (line.startsWith('![')) { const m=line.match(/!\[([^\]]*)\]\(([^)]+)\)/); if(m) nodes.push(<img key={k++} src={m[2]} alt={m[1]} className={s.mdImg}/>); i++; continue }
    if (line.trim()==='---'||line.trim()==='***') { nodes.push(<hr key={k++} className={s.mdHr}/>); i++; continue }
    if (line.trim()) { nodes.push(<p key={k++} className={s.mdP}>{il(line)}</p>); i++; continue }
    i++
  }
  return <div className={s.mdRoot}>{nodes}</div>
}
function il(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|`[^`]+`)/).map((p,i)=>{
    if(p.startsWith('**')&&p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>
    if(p.startsWith('*')&&p.endsWith('*')&&p.length>2) return <em key={i}>{p.slice(1,-1)}</em>
    if(p.startsWith('`')&&p.endsWith('`')) return <code key={i} className={s.mdCode}>{p.slice(1,-1)}</code>
    const lm=p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if(lm) return <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer" className={s.mdLink}>{lm[1]}</a>
    return p
  })
}

// ── Copy button ───────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  return (
    <button className={s.copyBtn} onClick={copy}>
      {copied ? <Check size={12}/> : <Copy size={12}/>}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [activeTasks, setActiveTasks] = useState<TaskStatus[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('home')
  const [recentChats, setRecentChats] = useState<string[]>([])
  // Image upload state
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null)
  const [analyzingImage, setAnalyzingImage] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r=>r.json()).then(d=>{ if(d.user) setUser(d.user) }).catch(()=>{}).finally(()=>setAuthLoading(false))
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, activeTasks])

  useEffect(() => {
    const el = inputRef.current; if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [query])

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    setUser(null); setMessages([]); setConvId(null)
  }

  // ── Image upload handler ──────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const preview = ev.target?.result as string
      setPendingImage({ file, preview })
      // Pre-fill query if empty
      if (!query.trim()) setQuery('Analyze this image')
      inputRef.current?.focus()
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const clearPendingImage = () => setPendingImage(null)

  const submitWithImage = async (imageFile: File, imagePreview: string, prompt: string) => {
    setAnalyzingImage(true)
    setStatusText('Analyzing image...')
    const uid = crypto.randomUUID()
    const aid = crypto.randomUUID()
    const displayPrompt = prompt || 'Analyze this image'
    setMessages(prev => [...prev,
      { id: uid, role: 'user', content: displayPrompt, imagePreview },
      { id: aid, role: 'assistant', content: '' }
    ])
    setQuery('')
    setPendingImage(null)
    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      fd.append('prompt', displayPrompt)
      const res = await fetch('/api/analyze-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setMessages(prev => prev.map(m => m.id === aid
        ? { ...m, content: data.analysis }
        : m
      ))
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aid
        ? { ...m, content: `Image analysis failed: ${(err as Error).message}`, error: true }
        : m
      ))
    } finally {
      setAnalyzingImage(false)
      setStatusText('')
    }
  }

  const handleSSE = useCallback((ev: { type: string; data: Record<string, unknown> }, aid: string) => {
    switch (ev.type) {
      case 'status': setStatusText(ev.data.message as string); break
      case 'plan':
        setActiveTasks((ev.data.tasks as Array<{type:string;query:string}>).map(t=>({type:t.type,query:t.query,done:false}))); break
      case 'task_done':
        setActiveTasks(prev=>prev.map(t=>t.type===(ev.data.type as string)?{...t,done:true}:t)); break
      case 'response':
        setConvId(ev.data.conversationId as string)
        setMessages(prev=>prev.map(m=>m.id===aid?{...m,content:ev.data.text as string,intent:ev.data.intent as string,
          plan:(ev.data.plan as Array<{type:string;query:string}>)?.map(t=>({type:t.type,query:t.query,done:true}))}:m)); break
      case 'error':
        setMessages(prev=>prev.map(m=>m.id===aid?{...m,content:ev.data.message as string,error:true}:m)); break
    }
  }, [])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    // If there's a pending image, analyze it
    if (pendingImage) {
      await submitWithImage(pendingImage.file, pendingImage.preview, query)
      return
    }
    const q = query.trim(); if (!q || streaming) return
    setQuery(''); setStreaming(true); setStatusText(''); setActiveTasks([])
    const uid = crypto.randomUUID(); const aid = crypto.randomUUID()
    // Track recent chats
    setRecentChats(prev => [q.slice(0, 40) + (q.length > 40 ? '…' : ''), ...prev.filter(r => r !== q.slice(0, 40))].slice(0, 8))
    setMessages(prev=>[...prev,{id:uid,role:'user',content:q},{id:aid,role:'assistant',content:''}])
    try {
      const res = await fetch('/api/orchestrator', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({query:q, conversationId:convId??undefined}),
      })
      if (res.status===429) {
        const d=await res.json()
        setMessages(prev=>prev.map(m=>m.id===aid?{...m,content:d.error,error:true}:m)); return
      }
      if (!res.ok||!res.body) throw new Error(`HTTP ${res.status}`)
      const reader=res.body.getReader(); const dec=new TextDecoder(); let buf=''
      while(true) {
        const {done,value}=await reader.read(); if(done) break
        buf+=dec.decode(value,{stream:true})
        const lines=buf.split('\n'); buf=lines.pop()??''
        for(const line of lines) {
          if(!line.startsWith('data: ')) continue
          try { handleSSE(JSON.parse(line.slice(6)),aid) } catch { /* skip */ }
        }
      }
    } catch(err) {
      setMessages(prev=>prev.map(m=>m.id===aid?{...m,content:`Connection failed.\n\`${err}\``,error:true}:m))
    } finally { setStreaming(false); setStatusText(''); setActiveTasks([]) }
  }

  const retryMsg = (msgId: string) => {
    const idx=messages.findIndex(m=>m.id===msgId)
    const um=messages.slice(0,idx).reverse().find(m=>m.role==='user')
    if(um) { setQuery(um.content); setTimeout(()=>inputRef.current?.focus(),50) }
  }

  const isEmpty = messages.length === 0

  return (
    <div className={s.root}>
      {/* ── Sidebar — ChatGPT style, no topbar ──────────────── */}
      <nav className={`${s.sidebar} ${sidebarOpen ? s.sidebarOpen : ''}`}>

        {/* Top: logo + toggle */}
        <div className={s.sidebarTop}>
          <div className={s.sidebarLogo}>
            <div className={s.logoMark}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect width="16" height="16" rx="4" fill="#f5f5f5"/>
                <path d="M4 8h8M8 4v8" stroke="#161616" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className={s.logoText}>Darcie</span>
          </div>
          <button className={s.toggleBtn} onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?'Collapse sidebar':'Expand sidebar'}>
            <PanelLeft size={16}/>
          </button>
        </div>

        {/* New chat */}
        <button className={s.newChat} onClick={()=>{setMessages([]);setConvId(null)}}>
          <span className={s.newChatIcon}><Plus size={16}/></span>
          <span className={s.newChatLabel}>New chat</span>
        </button>

        {/* Nav */}
        <div className={s.navList}>
          {NAV_ITEMS.map(item => {
            const isActive = activeNav === item.id
            const cls = `${s.navItem} ${isActive ? s.navItemActive : ''}`
            if (item.href) return (
              <Link key={item.id} href={item.href} className={cls}>
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLabel}>{item.label}</span>
              </Link>
            )
            return (
              <button key={item.id} className={cls} onClick={()=>setActiveNav(item.id)}>
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLabel}>{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Recent chats — only meaningful when expanded */}
        {recentChats.length > 0 && (
          <div className={s.recentSection}>
            <p className={s.recentTitle}>Recents</p>
            {recentChats.map((title, i) => (
              <div key={i} className={s.recentItem}>{title}</div>
            ))}
          </div>
        )}

        {/* Bottom: user */}
        <div className={s.sidebarBottom}>
          {user ? (
            <div className={s.sidebarUser} onClick={signOut} title="Sign out">
              <div className={s.sidebarAvatar}>{(user.name?.[0]||user.email[0]).toUpperCase()}</div>
              <span className={s.sidebarUserName}>{user.name||user.email.split('@')[0]}</span>
            </div>
          ) : (
            <Link href="/signin" className={s.navItem}>
              <span className={s.navIcon}><User size={18}/></span>
              <span className={s.navLabel}>Sign in</span>
            </Link>
          )}
        </div>
      </nav>

      {/* ── Main content — full height, no topbar ───────────── */}
      <main className={s.main}>

        {/* Auth buttons float top-right */}
        {!authLoading && (
          <div className={s.mainTopRight}>
            {user ? (
              <div className={s.userRow}>
                <div className={s.userAvatar}>{(user.name?.[0]||user.email[0]).toUpperCase()}</div>
                <span className={s.userName}>{user.name||user.email}</span>
                <button className={s.iconBtn} onClick={signOut} title="Sign out"><LogOut size={14}/></button>
              </div>
            ) : (
              <div className={s.authBtns}>
                <Link href="/signin" className={s.btnGhost}>Sign in</Link>
                <Link href="/signup" className={s.btnSolid}>Get started</Link>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className={s.empty}>
            <div className={s.emptyInner}>
              <h1 className={s.emptyTitle}>What can I help you build?</h1>
              <p className={s.emptySubtitle}>Search the web, generate images, create presentations, and conduct deep research.</p>
              <div className={s.suggestions}>
                {SUGGESTIONS.map(({label,q})=>(
                  <button key={q} className={s.suggestion} onClick={()=>{setQuery(q);inputRef.current?.focus()}}>
                    <span>{label}</span>
                    <ChevronRight size={14} className={s.suggArrow}/>
                  </button>
                ))}
              </div>
              <div className={s.caps}>
                {CAPABILITIES.map(({icon, label, bg, q}) => (
                  <button
                    key={label}
                    className={s.cap}
                    style={{'--cap-bg': bg} as React.CSSProperties}
                    onClick={() => { setQuery(q); setTimeout(() => inputRef.current?.focus(), 50) }}
                  >
                    <div className={s.capIcon}>{icon}</div>
                    <span className={s.capLabel}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Thread */}
        {!isEmpty && (
          <div className={s.thread}>
            {messages.map((msg,idx)=>(
              <div key={msg.id} className={s.msgRow} style={{animationDelay:`${idx*15}ms`}}>
                {msg.role==='user' ? (
                  <div className={s.userMsg}>
                    {msg.imagePreview && (
                      <div className={s.userImageWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={msg.imagePreview} alt="Uploaded" className={s.userImage} />
                      </div>
                    )}
                    <p className={s.userText}>{msg.content}</p>
                  </div>
                ) : (
                  <div className={s.assistantMsg}>
                    {msg.plan && msg.plan.length>0 && (
                      <div className={s.trace}>
                        {msg.plan.map((t,i)=>{
                          const meta=TASK_META[t.type]
                          return (
                            <div key={i} className={`${s.traceItem} ${t.done?s.traceItemDone:''}`}>
                              {t.done ? <CheckCircle2 size={11}/> : <div className={s.traceDot}/>}
                              {meta?.icon}<span>{meta?.label||t.type}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {msg.content ? (
                      msg.error ? (
                        <div className={s.errorMsg}>
                          <div className={s.errorHead}><AlertTriangle size={14}/><span>Something went wrong</span></div>
                          <p className={s.errorBody}>{msg.content}</p>
                          <button className={s.retryBtn} onClick={()=>retryMsg(msg.id)}><RefreshCw size={12}/><span>Try again</span></button>
                        </div>
                      ) : (
                        <div className={s.responseMsg}>
                          <Markdown text={msg.content}/>
                          <div className={s.responseFoot}><CopyBtn text={msg.content}/></div>
                        </div>
                      )
                    ) : (
                      <div className={s.thinking}>
                        <div className={s.dots}><span/><span/><span/></div>
                        <span className={s.thinkingText}>{statusText||'Thinking'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {streaming && activeTasks.length>0 && (
              <div className={s.liveTrace}>
                {activeTasks.map((t,i)=>{
                  const meta=TASK_META[t.type]
                  return (
                    <div key={i} className={`${s.liveItem} ${t.done?s.liveItemDone:''}`}>
                      {t.done ? <CheckCircle2 size={11} className={s.doneIcon}/> : <Loader2 size={11} className={s.spin}/>}
                      {meta?.icon}
                      <span className={s.liveLabel}>{meta?.label||t.type}</span>
                      <span className={s.liveQuery}>{t.query.slice(0,60)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
        )}

        {/* Input */}
        <div className={s.inputArea}>
          <form className={s.inputForm} onSubmit={submit}>
            <div className={s.inputWrap}>
              {/* Image preview strip */}
              {pendingImage && (
                <div className={s.imagePreviewStrip}>
                  <div className={s.imagePreviewThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pendingImage.preview} alt="Upload preview" className={s.imageThumb} />
                    <button
                      type="button"
                      className={s.imageRemove}
                      onClick={clearPendingImage}
                      title="Remove image"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <span className={s.imagePreviewName}>{pendingImage.file.name}</span>
                </div>
              )}

              <textarea
                ref={inputRef}
                className={s.chatInput}
                placeholder={pendingImage ? 'Ask about this image...' : 'Ask anything...'}
                value={query}
                onChange={e=>setQuery(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()} }}
                rows={1}
                disabled={streaming || analyzingImage}
              />
              <div className={s.inputRow}>
                <div className={s.inputLeft}>
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleImageSelect}
                  />
                  <button
                    type="button"
                    className={`${s.inputAction} ${pendingImage ? s.inputActionActive : ''}`}
                    title="Attach image"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={14}/>
                  </button>
                  <button type="button" className={s.inputAction} title="Voice"><Mic size={14}/></button>
                </div>
                <div className={s.inputRight}>
                  <span className={s.inputHint}>Shift+Enter for new line</span>
                  <button
                    type="submit"
                    className={s.sendBtn}
                    disabled={(!query.trim() && !pendingImage) || streaming || analyzingImage}
                  >
                    {(streaming || analyzingImage) ? <Loader2 size={14} className={s.spin}/> : <Send size={14}/>}
                  </button>
                </div>
              </div>
            </div>
          </form>
          <p className={s.disclaimer}>Darcie can make mistakes. Verify important information.</p>
        </div>

      </main>
    </div>
  )
}
