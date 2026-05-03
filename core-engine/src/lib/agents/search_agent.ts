export class SearchAgent {
  /**
   * Connects to the internal Python crawler API that wraps the master crawl4ai repository.
   */
  async execute(url: string): Promise<string> {
    console.log(`[SearchAgent] Requesting clean markdown from master crawler for: ${url}`);
    
    try {
      const response = await fetch("http://127.0.0.1:8001/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        throw new Error(`Crawler API failed with status: ${response.status}`);
      }

      const data = await response.json();
      return data.markdown;
      
    } catch (error) {
      console.error("[SearchAgent] Execution failed:", error);
      throw error;
    }
  }
}
