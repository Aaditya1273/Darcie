'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, Loader2, CheckCircle2, AlertTriangle, RefreshCw,
  FileSpreadsheet, FileText, X, ChevronLeft, ChevronRight,
  Download, Sparkles, ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────
interface Slide { title: string; content: string; type: string; bulletPoints?: string[]; html?: string }
interface Message {
  id: string; role: 'user' | 'assistant'; content: string
  slides?: Slide[]; hasSlides?: boolean; error?: boolean
}

// ── Slide viewer ──────────────────────────────────────────────────
function SlideViewer({ slides }: { slides: Slide[] }) {
  const [idx, setIdx] = useState(0)
  const slide = slides[idx]

  const downloadPPT = async () => {
    const res = await fetch('/api/workspace/export-ppt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides }),
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'presentation.pptx'
    document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove()
  }

  return (
    <div style={{ marginTop: 16, border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden', background: '#111' }}>
      {/* Slide display */}
      <div style={{ height: 360, overflow: 'hidden', position: 'relative' }}>
        {slide?.html ? (
          <div dangerouslySetInnerHTML={{ __html: slide.html }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ padding: 32, color: '#ccc' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>{slide?.title}</h2>
            <p style={{ color: '#aaa' }}>{slide?.content}</p>
          </div>
        )}
      </div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #1f1f1f', background: '#0d0d0d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: idx === 0 ? '#444' : '#ccc', borderRadius: 6, padding: '4px 10px', cursor: idx === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: '#666' }}>{idx + 1} / {slides.length}</span>
          <button onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1}
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: idx === slides.length - 1 ? '#444' : '#ccc', borderRadius: 6, padding: '4px 10px', cursor: idx === slides.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={14} />
          </button>
          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: 4 }}>
            {slides.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3, background: i === idx ? '#60a5fa' : '#333', border: 'none', cursor: 'pointer', transition: 'all 200ms' }} />
            ))}
          </div>
        </div>
        <button onClick={downloadPPT}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          <Download size={13} /> Download PPTX
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function WorkspacePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [showDoc, setShowDoc] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const detectUrls = (text: string) => {
    const sheetMatch = text.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+[^\s]*/)
    const docMatch = text.match(/https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+[^\s]*/)
    if (sheetMatch) { setSheetUrl(sheetMatch[0]); setShowSheet(true); setShowDoc(false) }
    if (docMatch) { setDocUrl(docMatch[0]); setShowDoc(true); setShowSheet(false) }
  }

  const getEmbedUrl = (url: string, type: 'sheet' | 'doc') => {
    if (type === 'sheet') {
      const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
      return `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing&widget=true&headers=false`
    }
    const id = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    return `https://docs.google.com/document/d/${id}/edit?usp=sharing`
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = input.trim()
    if (!q || loading) return

    detectUrls(q)
    setInput('')
    setLoading(true)

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: q }
    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: q,
          conversationHistory: history,
          sheetUrl: showSheet ? sheetUrl : undefined,
          docUrl: showDoc ? docUrl : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        content: data.response,
        slides: data.slides,
        hasSlides: data.hasSlides,
      } : m))
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: String(err), error: true } : m))
    } finally {
      setLoading(false)
    }
  }

  const S: React.CSSProperties = { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', color: '#fff', ...S }}>
      {/* Main chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginRight: (showSheet || showDoc) ? 480 : 0, transition: 'margin 300ms' }}>
        {/* Header */}
        <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #1f1f1f', background: '#111', flexShrink: 0 }}>
          <Link href="/" style={{ color: '#666', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Back
          </Link>
          <div style={{ width: 1, height: 16, background: '#2a2a2a' }} />
          <Sparkles size={14} color="#60a5fa" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e5e5' }}>Workspace — SuperAgent</span>
          <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>Google Sheets · Docs · Slides · Web Search</span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', gap: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.03em' }}>Super Agent</h1>
              <p style={{ color: '#555', fontSize: 14, textAlign: 'center', maxWidth: 440 }}>
                Paste a Google Sheets or Docs URL to connect it. Ask for presentations, data analysis, document editing, or web research.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
                {[
                  'Create a 6-slide presentation about AI trends in 2025',
                  'Summarize the data in my Google Sheet',
                  'Search for the latest news on renewable energy',
                  'Update my Google Doc with a project summary',
                ].map(p => (
                  <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus() }}
                    style={{ background: '#141414', border: '1px solid #2a2a2a', color: '#aaa', padding: '8px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', margin: msg.role === 'user' ? '0 24px 0 0' : '0 0 0 24px' }}>
              {msg.role === 'user' ? (
                <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '16px 16px 4px 16px', padding: '12px 16px' }}>
                  <p style={{ color: '#e5e5e5', fontSize: 14, lineHeight: 1.6 }}>{msg.content}</p>
                </div>
              ) : (
                <div>
                  {msg.content ? (
                    msg.error ? (
                      <div style={{ background: '#1a0d0d', border: '1px solid #3a1a1a', borderRadius: '4px 16px 16px 16px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171' }}>
                          <AlertTriangle size={14} />
                          <span style={{ fontSize: 13 }}>{msg.content}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '4px 16px 16px 16px', padding: '16px 20px' }}>
                        <p style={{ color: '#c4c4c4', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                        {msg.hasSlides && msg.slides && msg.slides.length > 0 && (
                          <SlideViewer slides={msg.slides} />
                        )}
                      </div>
                    )
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#555', fontSize: 13, padding: '12px 0' }}>
                      <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                      <span>Thinking...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 24px 20px', flexShrink: 0, background: 'linear-gradient(to top, #0a0a0a 70%, transparent)' }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, padding: '12px 14px', maxWidth: 760, margin: '0 auto' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder="Ask anything, paste a Google Sheets/Docs URL, or request a presentation..."
              rows={1}
              disabled={loading}
              style={{ background: 'transparent', border: 'none', color: '#e5e5e5', fontSize: 14, outline: 'none', resize: 'none', minHeight: 22, maxHeight: 160, width: '100%', lineHeight: 1.5, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="submit" disabled={!input.trim() || loading}
                style={{ background: input.trim() && !loading ? '#fff' : '#222', color: input.trim() && !loading ? '#000' : '#555', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed' }}>
                {loading ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={13} />}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Google Sheet sidebar */}
      {showSheet && sheetUrl && (
        <div style={{ position: 'fixed', right: 0, top: 0, width: 480, height: '100%', background: '#fff', borderLeft: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={16} color="#16a34a" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Google Sheet</span>
              <span style={{ fontSize: 11, color: '#16a34a' }}>● Connected</span>
            </div>
            <button onClick={() => setShowSheet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}><X size={16} /></button>
          </div>
          <iframe src={getEmbedUrl(sheetUrl, 'sheet')} style={{ flex: 1, border: 'none' }} title="Google Sheet" />
        </div>
      )}

      {/* Google Doc sidebar */}
      {showDoc && docUrl && (
        <div style={{ position: 'fixed', right: 0, top: 0, width: 480, height: '100%', background: '#fff', borderLeft: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={16} color="#2563eb" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Google Doc</span>
              <span style={{ fontSize: 11, color: '#2563eb' }}>● Connected</span>
            </div>
            <button onClick={() => setShowDoc(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}><X size={16} /></button>
          </div>
          <iframe src={getEmbedUrl(docUrl, 'doc')} style={{ flex: 1, border: 'none' }} title="Google Doc" />
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
