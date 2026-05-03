export class ImageAgent {
  /**
   * Connects to the internal Python API that wraps ComfyUI.
   */
  async execute(prompt: string): Promise<string> {
    console.log(`[ImageAgent] Requesting visual asset for: ${prompt}`);
    
    try {
      const response = await fetch("http://127.0.0.1:8006/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      
      if (!response.ok) {
        throw new Error(`Image API failed with status: ${response.status}`);
      }

      const data = await response.json();
      return `![Generated Image](${data.image_url})`;
      
    } catch (error) {
      console.error("[ImageAgent] Execution failed:", error);
      throw error;
    }
  }
}
