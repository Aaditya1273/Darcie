/**
 * Synthesizer — combines all agent results into a final response
 *
 * Uses generateText (chat completions) — works on all providers.
 *
 * Primary:  Groq Llama 3.3 70B  (fast, free)
 * Fallback: Gemini 2.0 Flash
 * Final:    GLM-4 Flash (Zhipu, free)
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

const SYSTEM = `You are the Output Synthesizer for Darcie AI.
Combine the raw agent results into a single clean professional response.

Rules:
- Only use information from the provided results. Never hallucinate.
- If a result contains a download link or image URL, show it as a markdown link/image.
- Use clean markdown: ## headers, bullet points, **bold** for key terms.
- Merge overlapping results — don't repeat.
- If an agent failed, acknowledge it briefly and move on.
- Be concise and useful. No filler.`

export class Synthesizer {
  async synthesize(query: string, results: string[]): Promise<string> {
    const combined = results
      .map((r, i) => `--- Result ${i + 1} ---\n${r}`)
      .join('\n\n')

    const prompt = `User asked: "${query}"\n\nAgent Results:\n${combined}\n\nWrite the final response:`

    // Tier 1: Groq
    try {
      const { text } = await generateText({
        model: groq.chat('llama-3.3-70b-versatile'),
        system: SYSTEM,
        prompt,
      })
      return text
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
      return text
    } catch (e) {
      console.warn('[Synthesizer] Gemini failed:', (e as Error).message?.slice(0, 80))
    }

    // Tier 3: GLM-4 Flash (Zhipu, free)
    try {
      const { text } = await generateText({
        model: glm.chat('glm-4-flash'),
        system: SYSTEM,
        prompt,
      })
      return text
    } catch (e) {
      console.warn('[Synthesizer] GLM failed:', (e as Error).message?.slice(0, 80))
    }

    // Hard fallback — return raw results if all LLMs fail
    return results.join('\n\n---\n\n')
  }
}
