# Test fixtures (`tests/data`)

Representative offline datasets for parsers, IoC extraction, uploads, and edge cases.

| Path                        | Purpose                                        |
|-----------------------------|------------------------------------------------|
| `logs/`                     | Apache, syslog, DNS, firewall, proxy, CEF, CSV |
| `cloud/`                    | CloudTrail, Azure Activity, O365 samples       |
| `edr/`                      | Defender, CrowdStrike, Carbon Black stubs      |
| `iocs/`                     | CSV/JSON indicator samples                     |
| `mitre/`                    | Technique + CVE stubs                          |
| `sigma/`, `yara/`           | Rule stubs                                     |
| `ti/`                       | Threat feed JSONL                              |
| `edge/`                     | Empty, malformed, duplicate, large, corrupted  |
| `packages/multi_source.zip` | Multi-file ingest package                      |

All content is **synthetic** (RFC 5737 documentation IPs, example domains). Safe for CI.
