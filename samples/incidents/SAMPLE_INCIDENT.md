# Sample Incident Narrative (for slides)

**Title:** SSH brute force leading to Log4Shell exploitation attempt

**Summary:** Multiple failed SSH authentications from `203.0.113.10` against bastion hosts, followed by HTTP requests
containing JNDI lookup strings consistent with CVE-2021-44228 probing on an internal app tier.

**Techniques (illustrative):** T1110 Brute Force · T1190 Exploit Public-Facing Application

**Playbook focus:** Block source, lock accounts, patch/mitigate Log4j, hunt JNDI, review egress.
