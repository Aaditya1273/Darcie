import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
  compatibility: 'strict',
});

export class Synthesizer {
  /**
   * Aggregates tool outputs and synthesizes a final response.
   * @param query The original user query.
   * @param results The raw string outputs from various agents.
   * @returns A final Markdown-formatted string.
   */
  async synthesize(query: string, results: string[]): Promise<string> {
    const combinedResults = results.map((r, i) => `--- Result ${i + 1} ---\n${r}`).join("\n\n");

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `
You are the Output Synthesizer for Darcie.
The user asked: "${query}"

Here are the raw results from the execution agents:
${combinedResults}

Your job is to synthesize these results into a beautiful, highly readable, and professional response.
- Do NOT hallucinate. Only use the provided results.
- If a result is a URL to a generated PPT or Image, prominently display it as a markdown link or image tag.
- Use clean formatting (H2, H3, bullet points). Do not clutter the output.
      `
    });

    return text;
  }
}
