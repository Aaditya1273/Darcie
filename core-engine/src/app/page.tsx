"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { 
  Plus, Home, PocketKnife, Network, Users, Folder, MoreHorizontal, 
  Sparkles, Presentation, Grid3X3, FileText, PenTool, MessageSquare, 
  Image as ImageIcon, Music, Video, Link, Mic, Play, User 
} from "lucide-react";

export default function Page() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isThinking) return;
    
    setIsThinking(true);
    setResponse(null);
    
    try {
      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      
      const data = await res.json();
      setResponse(data.response || "Something went wrong.");
    } catch (err) {
      setResponse("Failed to connect to Darcie Orchestrator.");
    } finally {
      setIsThinking(false);
      setQuery("");
    }
  };

  return (
    <div className={styles.layout}>
      {/* Top Navbar */}
      <header className={styles.topNav}>
        <div className={styles.topNavLeft}>
          <div className={styles.navLogo}><Sparkles size={16} color="#ccc" /></div>
        </div>
        <div className={styles.topNavCenter}>
          <span>A new version of this workspace is available. Refresh to update.</span>
          <button className={styles.btnText}>Later</button>
          <button className={styles.btnPrimary}>Refresh Now</button>
        </div>
        <div className={styles.topNavRight}>
          <button className={styles.btnSecondary}>Sign in</button>
          <button className={styles.btnSecondary}>Sign up</button>
        </div>
      </header>

      <div className={styles.bodyWrapper}>
        {/* Sidebar - Genspark Slim Navigation */}
        <aside className={styles.sidebar}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, alignItems: 'center' }}>
            <button className={styles.navItem} style={{ marginBottom: '16px' }}>
              <Plus size={24} color="#ccc" />
              <span style={{ marginTop: '8px' }}>New</span>
            </button>
            <button className={`${styles.navItem} ${styles.navItemActive}`}>
              <div className={styles.navIcon} style={{ background: '#333', borderRadius: '8px', width: '32px', height: '32px' }}>
                <Home size={18} color="#fff" />
              </div>
              <span style={{ marginTop: '4px' }}>Home</span>
            </button>
            <button className={styles.navItem}>
              <div className={styles.navIcon}><PocketKnife size={22} color="#ccc" /></div>
              <span>Claw</span>
            </button>
            <button className={styles.navItem}>
              <div className={styles.navIcon}><Network size={22} color="#ccc" /></div>
              <span>Workflows</span>
            </button>
            <button className={styles.navItem}>
              <div className={styles.navIcon}><Users size={22} color="#ccc" /></div>
              <span>Teams</span>
            </button>
            <button className={styles.navItem}>
              <div className={styles.navIcon}><Folder size={22} color="#ccc" /></div>
              <span>Drive</span>
            </button>
            <button className={styles.navItem}>
              <div className={styles.navIcon}><MoreHorizontal size={22} color="#ccc" /></div>
              <span>More</span>
            </button>
          </div>
          
          <button className={styles.navItem} style={{ paddingBottom: '16px' }}>
            <div className={styles.navIcon}><User size={22} color="#ccc" /></div>
          </button>
        </aside>

        {/* Main Content Interface */}
        <main className={styles.main}>
          
          {!response && !isThinking ? (
            <>
              <div className={styles.header}>
                <h1 className={styles.title}>Darcie AI Workspace 1.0</h1>
                <span className={styles.versionBadge}><PocketKnife size={16} /></span>
              </div>

              <div className={styles.searchContainer}>
                <form className={styles.searchBox} onSubmit={handleSubmit}>
                  <textarea
                    className={styles.textarea}
                    placeholder="Ask anything, create anything"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <div className={styles.searchActions}>
                    <div className={styles.leftActions}>
                      <button type="button" className={styles.actionIconBtn}><Plus size={16} /></button>
                      <button type="button" className={styles.actionIconBtn}><Link size={16} /></button>
                      <button type="button" className={styles.actionBtn}><Sparkles size={14} /> Ultra</button>
                    </div>
                    <div className={styles.rightActions}>
                      <button type="button" className={styles.actionIconBtn}><Mic size={16} /></button>
                      <button type="submit" className={styles.speakBtn} disabled={!query.trim()}>
                        <Play size={14} fill="currentColor" /> Speak
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              <div className={styles.agentsRow}>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#5e2a2a', borderRadius: '16px', width: '64px' }}><PocketKnife size={20} color="#ff8e8e" /></div>
                  <span className={styles.agentLabel}>Darcie Claw</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#5e432a' }}><Presentation size={20} color="#ffdfb3" /></div>
                  <span className={styles.agentLabel}>AI Slides</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#2a5e37' }}><Grid3X3 size={20} color="#b3ffcc" /></div>
                  <span className={styles.agentLabel}>AI Sheets</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#2a445e' }}><FileText size={20} color="#b3dfff" /></div>
                  <span className={styles.agentLabel}>AI Docs</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#3a2a5e' }}><PenTool size={20} color="#d4b3ff" /></div>
                  <span className={styles.agentLabel}>AI Designer</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#33405b' }}>
                    <MessageSquare size={20} color="#bccfff" />
                    <span className={styles.agentTag}>Unlimited</span>
                  </div>
                  <span className={styles.agentLabel}>AI Chat</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#453859' }}>
                    <ImageIcon size={20} color="#dcc3ff" />
                    <span className={styles.agentTag}>Unlimited</span>
                  </div>
                  <span className={styles.agentLabel}>AI Image</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#4d3266' }}><Music size={20} color="#e5c2ff" /></div>
                  <span className={styles.agentLabel}>AI Music</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#664d32' }}><Video size={20} color="#ffdfb3" /></div>
                  <span className={styles.agentLabel}>AI Video</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#224433' }}><FileText size={20} color="#b3ffcc" /></div>
                  <span className={styles.agentLabel}>AI Meeting Notes</span>
                </div>
                <div className={styles.agentItem}>
                  <div className={styles.agentIconWrapper} style={{ background: '#222' }}><Sparkles size={20} color="#ccc" /></div>
                  <span className={styles.agentLabel}>All Agents</span>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.searchContainer} style={{ position: 'sticky', top: 0, zIndex: 10, paddingTop: '20px' }}>
               <form className={styles.searchBox} onSubmit={handleSubmit} style={{ background: '#1a1a1a' }}>
                  <textarea
                    className={styles.textarea}
                    placeholder="Ask anything, create anything"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ height: '32px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
               </form>
            </div>
          )}

          {isThinking && (
            <div className={styles.responseArea}>
              <p>Darcie is thinking...</p>
            </div>
          )}

          {response && (
            <div className={styles.responseArea}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{response}</div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
