export class PPTAgent {
  /**
   * Connects to the internal Python PPT API that wraps the master ppt-master repository.
   */
  async execute(topic: string, slideCount: number = 5): Promise<string> {
    console.log(`[PPTAgent] Requesting PPT generation for topic: ${topic}`);
    
    try {
      const response = await fetch("http://127.0.0.1:8002/generate-ppt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, slide_count: slideCount }),
      });
      
      if (!response.ok) {
        throw new Error(`PPT API failed with status: ${response.status}`);
      }

      const data = await response.json();
      return `### 📊 Presentation Ready\n\nYour professional PPT about "${topic}" has been generated.\n\n[Download Presentation](http://localhost:8002${data.download_url})`;
      
    } catch (error) {
      console.error("[PPTAgent] Execution failed:", error);
      throw error;
    }
  }
}
