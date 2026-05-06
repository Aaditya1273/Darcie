/**
 * Synthesizer — turns agent results into a real AI explanation
 *
 * The key insight: the synthesizer must ACT LIKE AN EXPERT ANALYST,
 * not just reformat what agents returned. It should explain, connect
 * ideas, add context, and give the user genuine understanding.
 */

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
})

const glm = createOpenAI({
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: process.env.GLM_API_KEY,
})

const SYSTEM = `You are Darcie AI — an expert analyst and research assistant.

Your job is to synthesize information from multiple sources into a comprehensive, insightful response that genuinely helps the user understand the topic.

CRITICAL RULES:
1. EXPLAIN, don't just list. Give the user real understanding, not just facts.
2. NEVER output raw links as the main content. Links are only for references at the end.
3. Use the provided research as your knowledge base, but write like an expert explaining to a colleague.
4. Structure your response with clear sections using ## headers.
5. Include specific facts, numbers, and examples from the research.
6. If research is available, synthesize it into coherent paragraphs — don't just bullet-point everything.
7. End with a "Key Takeaways" section summarizing the most important points.
8. If a file was generated (PPT, image), highlight the download link prominently.
9. Minimum 150 words for any research query. Maximum 600 words.
10. Write in a clear, confident, expert tone — like a knowledgeable friend explaining something important.`

export class Synthesizer {
  async synthesize(query: string, results: string[]): Promise<string> {
    // Filter out empty/failed results
    const validResults = results.filter(r => r && r.trim().length > 20)

    if (validResults.length === 0) {
      return await this._directAnswer(query)
    }

    const combined = validResults
      .map((r, i) => `=== Research Source ${i + 1} ===\n${r}`)
      .join('\n\n')

    const prompt = `User's question: "${query}"

Research gathered from multiple sources:
${combined}

Now write a comprehensive, expert response that:
- Explains the topic clearly and thoroughly
- Uses the research facts but presents them as coherent explanation
- Does NOT just list links — explain what the research found
- Includes specific data points and examples
- Ends with Key Takeaways

Response:`

    // Tier 1: Groq (fast, free)
    try {
      const { text } = await generateText({
        model: groq.chat('llama-3.3-70b-versatile'),
        system: SYSTEM,
        prompt,
      })
      if (text && text.length > 50) return text
    } catch (e) {
      console.warn('[Synthesizer] Groq failed:', (e as Error).message?.slice(0, 80))
    }

    // Tier 2: Gemini 2.0 Flash
    try {
      const { google } = await import('@ai-sdk/google')
      const { generateText: gt } = await import('ai')
      const { text } = await gt({
        model: google('gemini-2.0-flash'),
        system: SYSTEM,
        prompt,
      })
      if (text && text.length > 50) return text
    } catch (e) {
      console.warn('[Synthesizer] Gemini failed:', (e as Error).message?.slice(0, 80))
    }

    // Tier 3: GLM-4
    try {
      const { text } = await generateText({
        model: glm.chat('glm-4-flash'),
        system: SYSTEM,
        prompt,
      })
      if (text && text.length > 50) return text
    } catch (e) {
      console.warn('[Synthesizer] GLM failed:', (e as Error).message?.slice(0, 80))
    }

    // Hard fallback: direct Groq answer ignoring failed research
    return await this._directAnswer(query)
  }

  private async _directAnswer(query: string): Promise<string> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY
    if (!GROQ_API_KEY) return `I couldn't find information about "${query}". Please try again.`

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `Answer this question thoroughly: ${query}` },
          ],
          temperature: 0.5,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`Groq ${res.status}`)
      const data = await res.json()
      return data.choices[0].message.content
    } catch {
      return `I encountered an issue processing your request about "${query}". Please try again.`
    }
  }
}
