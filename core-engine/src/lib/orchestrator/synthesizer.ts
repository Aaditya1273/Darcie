/**
 * Synthesizer — combines all agent results into a final response
 *
 * Primary:  Groq Llama 3.3 70B (fast, free tier)
 * Fallback: Google Gemini 1.5 Flash
 * Final:    LLM7 Llama 3.3 70B (free)
 */

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
})

const llm7 = createOpenAI({
  baseURL: process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1',
  apiKey: process.env.LLM7_API_KEY,
})

const SYSTEM_PROMPT = `You are the Output Synthesizer for Darcie AI.
Your job is to combine raw agent results into a single, clean, professional response.

Rules:
- ONLY use information from the provided results. Never hallucinate.
- If a result contains a download link or image URL, display it prominently as a markdown link/image.
- Use clean markdown: headers (##), bullet points, bold for key terms.
- If multiple results cover the same topic, merge them — don't repeat.
- If a result says an agent failed, acknowledge it briefly and move on.
- Keep the response focused and useful. No filler phrases.`

export class Synthesizer {
  async synthesize(query: string, results: string[]): Promise<string> {
    const combinedResults = results
      .map((r, i) => `--- Agent Result ${i + 1} ---\n${r}`)
      .join('\n\n')

    const prompt = `User asked: "${query}"\n\nAgent Results:\n${combinedResults}\n\nSynthesize a final response:`

    // Tier 1: Groq
    try {
      const { text } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        system: SYSTEM_PROMPT,
        prompt,
      })
      return text
    } catch (e) {
      console.warn('[Synthesizer] Groq failed, trying Gemini...', e)
    }

    // Tier 2: Gemini Flash
    try {
      const { google } = await import('@ai-sdk/google')
      const { generateText: gt } = await import('ai')
      const { text } = await gt({
        model: google('gemini-1.5-flash-latest'),
        system: SYSTEM_PROMPT,
        prompt,
      })
      return text
    } catch (e) {
      console.warn('[Synthesizer] Gemini failed, trying LLM7...', e)
    }

    // Tier 3: LLM7 (always free)
    const { generateText: gt } = await import('ai')
    const { text } = await gt({
      model: llm7('llama-3.3-70b-instruct'),
      system: SYSTEM_PROMPT,
      prompt,
    })
    return text
  }
}
