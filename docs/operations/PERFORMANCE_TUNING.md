# Performance Tuning

| Area       | Tuning                                                  |
|------------|---------------------------------------------------------|
| Embeddings | Keep `hash` for CI; warm sbert process for demos        |
| TI         | Enrichment cache TTL; limit IoCs per incident           |
| LLM        | Smaller model for bulk; prompt cache stable system      |
| Mongo      | Indexes on incident status/created_at (created at boot) |
| Upload     | Cap file sizes; batch wisely                            |
| Vector     | Reindex off-peak; dim consistency                       |

Run `python benchmarks/run_benchmarks.py --profile smoke` for local baselines.
