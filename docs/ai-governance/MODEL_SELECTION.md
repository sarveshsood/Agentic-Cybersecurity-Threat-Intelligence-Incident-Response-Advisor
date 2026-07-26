# Model Selection

| Use case               | Recommendation                     |
|------------------------|------------------------------------|
| Executive demo quality | Claude Sonnet-class / GPT-class    |
| Cost-sensitive bulk    | Smaller OpenAI/Gemini/Groq models  |
| Offline CI             | No live LLM — golden/template path |
| Embeddings CI          | `hash`                             |
| Embeddings quality     | `sbert` `BAAI/bge-small-en-v1.5`   |

Selection criteria: quality, latency, cost, data retention policy of vendor, region, JSON reliability.
