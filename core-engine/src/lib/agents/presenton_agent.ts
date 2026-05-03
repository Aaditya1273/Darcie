export class PresentonAgent {
  /**
   * Connects to the internal Python API that wraps the master presenton repository.
   */
  async execute(topic: string, context: string = ""): Promise<string> {
    console.log(`[PresentonAgent] Requesting professional report generation for: ${topic}`);
    
    try {
      const response = await fetch("http://127.0.0.1:8005/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, context }),
      });
      
      if (!response.ok) {
        throw new Error(`Presenton API failed with status: ${response.status}`);
      }

      const data = await response.json();
      return `[Professional Report Generated]\nFile saved at: ${data.file_path}`;
      
    } catch (error) {
      console.error("[PresentonAgent] Execution failed:", error);
      throw error;
    }
  }
}
