import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { ChatMemory } from '../memory/chat_memory';

// Production-grade Groq configuration (Llama 3.1 70B)
// Groq is chosen for its extreme speed and reliable OpenAI compatibility.
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
  compatibility: 'strict', 
});

const llm7 = createOpenAI({
  baseURL: process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1',
  apiKey: process.env.LLM7_API_KEY,
  compatibility: 'strict',
});

const TaskSchema = z.object({
  type: z.enum(['search', 'ppt', 'image', 'hybrid', 'research', 'deep_research', 'presenton_report', 'generate_image']),
  query: z.string().describe('The specific query or prompt for this task'),
  styleContext: z.string().optional().describe('Any specific style guidelines to apply to this task'),
});

const PlanSchema = z.object({
  intent: z.string().describe('The detected intent of the user'),
  tasks: z.array(TaskSchema).describe('The sequence of tasks to execute'),
});

export type Task = z.infer<typeof TaskSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export class Planner {
  private chatMemory: ChatMemory;

  constructor(userId: string = "default_user") {
    this.chatMemory = new ChatMemory(userId);
  }

  async plan(query: string): Promise<Plan> {
    let userStyleContext = "";
    try {
       userStyleContext = await this.chatMemory.getContext(query);
    } catch (e) {
       console.warn("[Planner] Memory subsystem offline.");
    }

    try {
      // Primary Brain: Groq Llama 3.3 70B (Latest Flagship)
      const { object } = await generateObject({
        model: groq('llama-3.3-70b-versatile', {
           structuredOutputs: false, 
        }),
        schema: PlanSchema,
        prompt: `
You are the Brain of Darcie, an elite 'Input -> Thinking -> Output' engine.
Your job is to analyze the user's query and generate a precise execution plan.

Available Tools:
- search: Fast web search for answering questions.
- deep_research: Multi-step profound research using Perplexica.
- research: Deep context extraction using knowledge graphs (GraphRAG).
- ppt: Generating a PowerPoint presentation.
- presenton_report: Generate a professional, highly-styled research document (Presenton).
- generate_image: Generate visual assets (ComfyUI).

User Query: "${query}"
User Memory Context: "${userStyleContext}"

Rules:
1. Deconstruct the user query into a sequence of necessary tasks.
2. If they ask for a PPT, you likely need a 'search' task first to get data, then a 'ppt' task to format it.
3. Pass the relevant User Style Memory context directly into the tasks that require formatting.
        `,
      });

      return object;
    } catch (error) {
      console.error("[Planner] Groq failed. Executing Tier-2 failover to Gemini...", error);
      
      try {
        const { google } = await import('@ai-sdk/google');
        const { generateObject: go } = await import('ai');
        
        const { object } = await go({
          model: google('gemini-1.5-flash-latest'),
          schema: PlanSchema,
          prompt: `Analyze the following query and break it into a sequence of tasks: "${query}"`,
        });
        return object;
      } catch (fallbackError) {
        console.error("[Planner] Gemini failed. Executing Tier-3 Ultimate failover to LLM7...", fallbackError);
        
        const { generateObject: go } = await import('ai');
        const { object } = await go({
          model: llm7('llama-3.3-70b-instruct'),
          schema: PlanSchema,
          prompt: `Analyze the following query and break it into a sequence of tasks: "${query}"`,
        });
        return object;
      }
    }
  }
}
