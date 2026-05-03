export class GraphRAGAgent {
  /**
   * Connects to the internal Python GraphRAG API that wraps the master graphrag repository.
   */
  async execute(query: string): Promise<string> {
    console.log(`[GraphRAGAgent] Requesting deep graph query for: ${query}`);
    
    try {
      const response = await fetch("http://127.0.0.1:8003/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`GraphRAG API failed with status: ${response.status}`);
      }

      const data = await response.json();
      return `[GraphRAG Deep Analysis]\n${data.answer}`;
      
    } catch (error) {
      console.error("[GraphRAGAgent] Execution failed:", error);
      throw error;
    }
  }
}
