# ACTIRA — Security Overview

---

## 1. Principles

Least privilege RBAC · secret minimization · human authority for critical AI · offline-safe CI

---

## 2. Identity & access

JWT HS256 · bcrypt · password policy · lockout · register always analyst · role gates

Gap: SSO/MFA (roadmap)

---

## 3. Secrets

No raw keys on GET settings · vault at rest · gitignore `.env` · detect-secrets baseline

---

## 4. Application security

ZIP bomb guards · constant-time ingest key · sanitized JWT errors · CORS allow-list

---

## 5. LLM security

Citation allow-list · grounding HiTL · no destructive SOAR tools · optional IoC redaction

---

## 6. Framework maps

NIST CSF · OWASP Top 10/API/LLM · CIS subset · ISO 27001 control themes · ATT&CK (content)

See `docs/compliance/`.

---

## 7. Production checklist

`ENV=production` · strong JWT · master key · seed off · Mongo auth · TLS edge

---

## 8. Reporting

SECURITY.md private disclosure — no public 0-days in issues.
