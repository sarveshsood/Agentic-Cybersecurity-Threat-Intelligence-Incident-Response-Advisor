# OWASP LLM Top 10 — Alignment

| ID                            | Treatment                                |
|-------------------------------|------------------------------------------|
| LLM01 Prompt injection        | Untrusted logs; sanitize; HiTL           |
| LLM02 Insecure output         | JSON parse + citation filter             |
| LLM03 Training data poisoning | N/A hosted models                        |
| LLM04 Model DoS               | budgets/timeouts                         |
| LLM05 Supply chain            | pin deps; vendor diligence               |
| LLM06 Agency                  | no destructive tools                     |
| LLM07 System prompt leak      | low impact; don't put secrets in prompts |
| LLM08 Vector weakness         | hybrid + allow-list                      |
| LLM09 Misinformation          | grounding + human                        |
| LLM10 Theft                   | API keys vaulted                         |
