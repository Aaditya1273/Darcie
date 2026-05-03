/**
 * GraphRAGAgent — calls Microsoft GraphRAG bridge (port 8003)
 * GraphRAG builds a knowledge graph from documents and answers
 * queries using global/local graph traversal.
 *
 * Requires a pre-built index. If index not ready, falls back to
 * a graceful message telling the user to index documents first.
 */

const GRAPHRAG_URL = process.env.GRAPHRAG_URL || 'http://127.0.0.1:8003'

export class GraphRAGAgent {
  async execute(query: string, method: 'global' | 'local' = 'global'): Promise<string> {
    console.log(`[GraphRAGAgent] Knowledge graph query (${method}): ${query}`)

    // First check if index is ready
    try {
      const healthRes = await fetch(`${GRAPHRAG_URL}/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (healthRes.ok) {
        const health = await healthRes.json()
        if (!health.index_ready) {
          return (
            `### 📚 GraphRAG Index Not Ready\n\n` +
            `The knowledge graph hasn't been built yet for your documents.\n\n` +
            `To use deep research, first index your documents:\n` +
            `\`\`\`\nPOST http://localhost:8003/index/init\n{ "documents": ["your text..."] }\n\`\`\``
          )
        }
      }
    } catch {
      // Health check failed — GraphRAG bridge not running
      throw new Error('GraphRAG service not running. Start it via run.sh')
    }

    const res = await fetch(`${GRAPHRAG_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, method }),
      signal: AbortSignal.timeout(120_000), // graph queries can be slow
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`GraphRAG API ${res.status}: ${err}`)
    }

    const data = await res.json()
    return `### 🔬 Deep Knowledge Analysis\n\n${data.answer}`
  }
}
