# Sample Threat Intelligence Context

| IoC                      | Type        | Mock score band | Notes                                  |
|--------------------------|-------------|-----------------|----------------------------------------|
| 203.0.113.10             | ip          | high            | AUTH abuse + scanner reputation (mock) |
| jndi:ldap://evil.example | url pattern | critical        | Log4Shell indicator                    |
| CVE-2021-44228           | cve         | critical        | KEV-relevant                           |

With empty TI keys, ACTIRA uses **mock enrichment** — say this out loud in demos.
