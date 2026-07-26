# AI Risk Register

| ID    | Risk                           | L | I | Treatment                                 |
|-------|--------------------------------|---|---|-------------------------------------------|
| AI-01 | Prompt injection via logs      | M | H | Data-as-untrusted; no tool exec; HiTL     |
| AI-02 | Hallucinated IR steps          | M | H | Citations + grounding + review            |
| AI-03 | Secret exfiltration in prompts | L | H | Redact options; vault; no keys in prompts |
| AI-04 | Cost runaway                   | M | M | Token budget; model choice                |
| AI-05 | Overreliance by juniors        | M | M | UX labels; training; HiTL                 |
| AI-06 | Vendor model change            | M | M | Multi-provider; golden regression         |
