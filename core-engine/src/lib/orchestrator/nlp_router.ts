/**
 * NLP Router — classifies input before hitting the planner
 *
 * Fast path:  greeting / gratitude / simple chat → Conversation Agent (LLM, instant)
 * Slow path:  research / create / generate → Planner → Agents
 *
 * This makes Darcie feel responsive and human-like for casual inputs
 * while still routing complex tasks to the full agent pipeline.
 */

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
})

// ── Input classifier ──────────────────────────────────────────────
export type InputClass =
  | 'greeting'       // hi, hello, hey, good morning
  | 'gratitude'      // thanks, thank you, appreciate it
  | 'capability'     // what can you do, help, how does this work
  | 'conversational' // short casual chat, opinions, jokes
  | 'complex'        // anything that needs research/creation

const GREETING_WORDS = ['hi', 'hello', 'hey', 'hiya', 'howdy', 'sup', 'good morning', 'good evening', 'good afternoon', 'greetings', 'yo']
const GRATITUDE_WORDS = ['thanks', 'thank you', 'thank u', 'thx', 'ty', 'appreciate', 'cheers', 'great job', 'well done', 'awesome', 'perfect']
const CAPABILITY_WORDS = ['what can you do', 'what do you do', 'help me', 'how does this work', 'what are you', 'who are you', 'capabilities', 'features', 'what is darcie', 'tell me about yourself']

// Complex intent signals — these always go to the planner
const COMPLEX_SIGNALS = [
  /\b(search|find|look up|research|analyze|analyse)\b/i,
  /\b(create|make|build|generate|write|draft)\b/i,
  /\b(ppt|presentation|slides|powerpoint)\b/i,
  /\b(image|picture|photo|draw|visualize)\b/i,
  /\b(report|document|summary|summarize)\b/i,
  /\b(latest|news|current|today|2025|2024)\b/i,
  /\b(how to|explain|what is|define|difference between)\b/i,
  /\b(compare|versus|vs|pros and cons)\b/i,
]

export function classifyInput(query: string): InputClass {
  const q = query.trim().toLowerCase()

  // Always complex if it matches strong intent signals
  if (COMPLEX_SIGNALS.some(r => r.test(q))) return 'complex'

  // Long queries are almost always complex
  if (q.split(' ').length > 8) return 'complex'

  // Greeting check
  if (GREETING_WORDS.some(w => q === w || q.startsWith(w + ' ') || q.endsWith(' ' + w))) {
    return 'greeting'
  }

  // Gratitude check
  if (GRATITUDE_WORDS.some(w => q.includes(w))) return 'gratitude'

  // Capability check
  if (CAPABILITY_WORDS.some(w => q.includes(w))) return 'capability'

  // Short queries without complex signals → conversational
  if (q.length < 30) return 'conversational'

  return 'complex'
}

// ── Conversation Agent — LLM-powered, Darcie personality ─────────
const DARCIE_SYSTEM = `You are Darcie — a premium AI workspace assistant.

Personality:
- Smart, direct, slightly futuristic
- Never robotic or generic
- Confident and helpful
- Push the user forward — always end with what you can help them build

Capabilities you have:
- 🔍 Web search & research (real-time web crawling)
- 🔬 Deep research (multi-step synthesis with citations)
- 📊 PPT generation (full PowerPoint files, downloadable)
- 📑 Professional reports & presentations (styled, AI-generated)
- 🎨 Image generation (Stable Diffusion via ComfyUI)
- 🧠 Knowledge graph research (from your own documents)
- 📄 Google Sheets & Docs integration (read, edit, analyze)

Style rules:
- Be concise — max 3-4 sentences for casual replies
- Use bullet points only when listing capabilities or steps
- Never say "I'm just an AI" or "As an AI language model"
- Sound like a brilliant colleague, not a chatbot
- Always end with a forward-pushing question or suggestion`

export async function generateConversationalResponse(
  query: string,
  inputClass: InputClass,
  userId?: string
): Promise<string> {
  // Build a context-aware prompt based on input class
  let contextHint = ''
  if (inputClass === 'greeting') {
    contextHint = 'The user just greeted you. Give a warm, energetic intro that shows what Darcie can do. Make them excited to use it.'
  } else if (inputClass === 'gratitude') {
    contextHint = 'The user is thanking you. Acknowledge it briefly and pivot to what you can help them build next.'
  } else if (inputClass === 'capability') {
    contextHint = 'The user wants to know what you can do. Give a structured, impressive overview of Darcie\'s capabilities.'
  } else {
    contextHint = 'The user sent a short casual message. Respond naturally and guide them toward using Darcie\'s capabilities.'
  }

  try {
    const { text } = await generateText({
      model: groq.chat('llama-3.3-70b-versatile'),
      system: DARCIE_SYSTEM,
      prompt: `Context: ${contextHint}\n\nUser said: "${query}"\n\nRespond as Darcie:`,
      temperature: 0.8,
    })
    return text
  } catch {
    // Instant fallback — no LLM needed
    return getFallbackResponse(inputClass)
  }
}

function getFallbackResponse(inputClass: InputClass): string {
  switch (inputClass) {
    case 'greeting':
      return `Hey 👋 I'm Darcie — your AI workspace.\n\nI can help you:\n- 🔍 Search & research the web in real-time\n- 📊 Generate full PowerPoint presentations\n- 🎨 Create images with Stable Diffusion\n- 📑 Build professional reports\n- 🧠 Analyze your documents with knowledge graphs\n\nWhat are we building today?`
    case 'gratitude':
      return `Anytime 🚀 Ready when you are — what's next?`
    case 'capability':
      return `Here's what I can do:\n\n- **Web Search** — real-time crawling with citations\n- **Deep Research** — multi-step synthesis on any topic\n- **PPT Generation** — full PowerPoint files, downloadable\n- **Image Generation** — Stable Diffusion via ComfyUI\n- **Professional Reports** — styled AI presentations\n- **Document Analysis** — Google Sheets, Docs, knowledge graphs\n\nJust tell me what you want to build.`
    default:
      return `Tell me what you want to create — research, PPT, images, or analysis.`
  }
}
