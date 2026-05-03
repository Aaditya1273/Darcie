import { Memory } from "mem0ai";

// Initialize Mem0 for native TS memory management
const memory = new Memory({
  config: {
    // We are going to use an in-memory or lightweight vector store for now
    // In production, configure Qdrant/Pinecone here as per mem0ai docs
    version: "v1.1"
  }
});

export interface StyleContext {
  colors: string;
  font: string;
  tone: string;
  preferences: string;
}

export class StyleMemory {
  private userId: string;

  constructor(userId: string = "default_user") {
    this.userId = userId;
  }

  /**
   * Adds the user's style preference based on their query or manual input.
   */
  async addPreference(preferenceText: string): Promise<void> {
    await memory.add(
      [{ role: "user", content: `I prefer my outputs formatted like this: ${preferenceText}` }],
      { user_id: this.userId }
    );
  }

  /**
   * Retrieves the combined style and formatting preferences for the user.
   */
  async getPreferencesContext(query: string): Promise<string> {
    try {
      const relevantMemories = await memory.search(query, {
        user_id: this.userId,
        limit: 5,
      });
      
      if (!relevantMemories || relevantMemories.length === 0) {
        return "No specific style preferences found. Use default professional tone and clean layout.";
      }

      const memoriesStr = relevantMemories
        .map((m: any) => `- ${m.memory}`)
        .join("\n");

      return `User Style Preferences:\n${memoriesStr}`;
    } catch (e) {
      console.warn("Failed to retrieve style memory:", e);
      return "Default style.";
    }
  }
}
