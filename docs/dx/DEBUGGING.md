# Enterprise Debugging Guide

This guide defines the standard debugging process for the ACTIRA Enterprise SOC Platform.

---

# Debugging Principles

## Always

- Reproduce the issue before fixing it.
- Identify the root cause.
- Preserve business logic.
- Preserve security controls.
- Preserve audit logging.
- Preserve existing APIs.
- Preserve RBAC.
- Preserve workflows.
- Preserve data contracts.
- Preserve data-testid attributes.
- Add regression tests after fixing defects.
- Document root cause for recurring issues.

## Never

- Disable authentication.
- Disable authorization.
- Hardcode configuration.
- Commit debugging code.
- Commit secrets.
- Print sensitive information.
- Ignore warnings.
- Hide exceptions.
- Swallow errors silently.

---

# Repository Verification

Verify:

- Correct branch
- Latest changes pulled
- Python version
- Node version
- Virtual environment
- npm packages installed
- Mongo running
- Docker containers healthy
- Environment variables loaded

---

# Backend Debugging

## Start Backend

```bash
uvicorn backend.server:app \
  --host 0.0.0.0 \
  --port 8001 \
  --reload \
  --log-level debug
```

Never launch from:

```
backend/
```

Always launch from:

```
Repository Root
```

---

## IDE Configuration

### PyCharm

Module

```
uvicorn
```

Arguments

```
backend.server:app
--host 0.0.0.0
--port 8001
--reload
```

Working Directory

```
Repository Root
```

Environment

```
PYTHONPATH=<Repository Root>
```

---

### VS Code

launch.json

Module

```
uvicorn
```

Arguments

```
backend.server:app
```

cwd

```
Repository Root
```

Never

```
server:app
```

inside

```
backend/
```

---

# Backend Health Checks

Verify:

✓ /api/health

✓ /api/ready

✓ Mongo connectivity

✓ AI providers

✓ Scheduler

✓ Background jobs

✓ Review Queue

✓ Search index

✓ Analytics

✓ Threat Intelligence

✓ Audit logging

---

# Backend Loggers

Watch:

```
actira

api

pipeline

job_queue

auth

audit

security

analytics

playbook

llm

search

review_queue
```

Increase verbosity

```
DEBUG
```

or

```
TRACE
```

---

# Logging Standards

Always use structured logging.

Include

- Correlation ID
- Request ID
- User
- Endpoint
- Method
- Entity
- Duration
- Status

Never log

- Passwords
- JWT
- Cookies
- Secrets
- API Keys
- OAuth Tokens
- Refresh Tokens
- Personal Data

Always use

```
redact_for_log()
```

---

# MongoDB Debugging

Verify

Connection

Collections

Indexes

Slow Queries

Aggregation

Connection Pool

TTL Indexes

Replica Status

Collections

```
users

roles

sessions

incidents

alerts

cases

reviews

audit_logs

settings

jobs

playbooks

analytics

knowledge

search
```

Useful

```
db.currentOp()

db.serverStatus()

db.collection.explain()

db.collection.getIndexes()
```

---

# API Debugging

Verify

- Request Body
- Response Body
- Headers
- Cookies
- Status Codes
- CORS
- CSRF
- Authentication
- Authorization
- Validation
- Correlation IDs

Common

400

Validation

401

Authentication

403

Authorization

404

Route

409

Conflict

422

Validation

429

Rate Limit

500

Server Error

502

Proxy

504

Timeout

---

# AI Provider Debugging

Verify

Provider

Model

API Key

Quota

Rate Limits

Prompt

Retrieved Context

Grounding

Embeddings

Citations

Confidence

Latency

Token Usage

Cost

Retry

Fallback

Supported Providers

- OpenAI
- Anthropic
- Groq
- Ollama
- Local Models

Common Problems

401

Invalid Key

403

Permission

404

Model

429

Rate Limited

500

Provider Failure

---

# Pipeline Debugging

Pipeline Order

```
Upload

↓

Parse

↓

Normalize

↓

Threat Intelligence

↓

Enrichment

↓

Correlation

↓

Investigation

↓

AI Analysis

↓

Playbook

↓

Review Queue

↓

Approval

↓

Export
```

Check

Pipeline status

Job progress

Retries

Exceptions

Timeouts

Partial failures

---

# Review Queue

Verify

Pending

Approved

Rejected

Locked

Concurrent Reviews

Reviewer Assignment

Approval History

Audit Trail

---

# Authentication

Verify

JWT

Cookies

Refresh

Session

SameSite

Secure

Domain

Expiration

RBAC

Permissions

Never disable authentication.

---

# Security Debugging

Verify

RBAC

CORS

CSRF

Headers

Secure Cookies

Input Validation

Output Encoding

Rate Limits

Audit Logs

Security Events

Never bypass security.

---

# Frontend Debugging

Verify

Console

Network

Application

Cookies

Storage

React Query

Theme

Performance

Accessibility

Feature Flags

---

# Browser Developer Tools

Use

Network

Performance

Memory

Application

Sources

Lighthouse

Rendering

Coverage

---

# React DevTools

Inspect

Component Tree

Hooks

Context

Props

State

Render Count

Profiler

---

# Common Frontend Problems

White Screen

- Console Errors
- Missing Imports
- Routing
- Theme Provider

API Failures

- Backend URL
- CORS
- Cookies
- Authentication

Infinite Render

- useEffect
- Dependencies
- State Updates

Broken Layout

- CSS Variables
- Theme Tokens
- Responsive Grid

---

# Theme Debugging

Verify

Light Mode

Dark Mode

System Mode

CSS Variables

Tokens

Typography

Spacing

Borders

Icons

Never hardcode colors.

---

# Tooltip Debugging

Every page must verify

✓ Page Header

✓ Page Actions

✓ KPI Cards

✓ Charts

✓ Buttons

✓ Icons

✓ Tabs

✓ Sub-tabs

✓ Filters

✓ Drawers

✓ Dialogs

✓ Modals

✓ Forms

✓ Table Columns

✓ Badges

✓ Status Pills

✓ Empty States

No UI ships without contextual help.

---

# Table Debugging

Verify

Sorting

Multi Sort

Filtering

Search

Pagination

Sticky Headers

Column Resize

Column Visibility

Selection

Export

Responsive

Performance

Virtualization

Loading

Empty State

---

# Chart Debugging

Verify

Legends

Tooltips

Token Colors

Dark Mode

Light Mode

Drilldown

Export

Responsive

Hover

Accessibility

---

# Search Debugging

Verify

Global Search

Filters

Suggestions

Recent Searches

Saved Searches

Pagination

Relevance

Ranking

Latency

---

# Analytics Debugging

Verify

KPIs

Charts

Trend Calculations

Time Range

Aggregation

Drilldowns

Exports

Caching

---

# AI Investigator Debugging

Verify

Prompt

Context

Evidence

MITRE Mapping

Reasoning

Confidence

Citations

Affected Assets

Timeline

Recommendations

Approval Gate

Human Override

Never allow hallucinated evidence.

---

# Docker Debugging

Verify

Containers

Networks

Volumes

Mongo

Frontend

Backend

Worker

Logs

Useful Commands

```bash
docker compose ps

docker compose logs

docker compose logs backend

docker compose logs frontend

docker compose logs mongo
```

---

# Performance Debugging

Measure

Dashboard Load

API Latency

Search

Chart Rendering

Table Rendering

Bundle Size

Memory

CPU

React Re-renders

Use

React Profiler

Chrome Performance

Lighthouse

Mongo Explain

---

# CI/CD Debugging

Verify

Lint

Formatting

Unit Tests

Integration Tests

Build

Docker

Security Scan

Dependency Scan

Coverage

Artifacts

Deployment

---

# Production Debugging

Never debug directly in production.

Use

- Logs
- Metrics
- Traces
- Dashboards
- Audit Logs
- Health Endpoints

Verify

CPU

Memory

Disk

Mongo

Workers

Queue

LLM Latency

API Latency

Network

---

# Observability

Every request should include

- Correlation ID
- Request ID
- User ID
- Session ID
- Trace ID

Monitor

- Errors
- Warnings
- Latency
- Throughput
- Availability
- Queue Length
- AI Usage
- Cache Hit Ratio

---

# Common Breakpoints

| Symptom | File |
|----------|------|
| Authentication Loop | backend/auth.py |
| Empty Playbook | backend/playbook_agent.py |
| Mock Threat Intel | backend/enrichment.py |
| Review Queue | backend/review_queue.py |
| HITL Approval | backend/hitl_gate.py |
| Search | backend/search.py |
| Analytics | backend/analytics.py |
| Pipeline | backend/pipeline.py |
| Settings | backend/platform_settings.py |
| API Startup | backend/server.py |

---

# Offline Testing

```bash
FORCE_MOCK_TI=true ENV=test pytest backend/tests/test_hardening.py -n 0
```

---

# Root Cause Analysis

Every production bug should document

- Issue Summary
- Root Cause
- Impact
- Detection Method
- Resolution
- Regression Test Added
- Preventive Action
- Documentation Updated

---

# Definition of Debug Complete

A defect is considered fixed only when:

- Root cause identified
- Root cause documented
- Regression tests added
- Unit tests pass
- Integration tests pass
- No security regression
- No performance regression
- No accessibility regression
- No UI regression
- No API regression
- Audit logging verified
- Documentation updated
- Light mode verified
- Dark mode verified
- Responsive layouts verified
- Existing workflows preserved
- Existing test IDs preserved
- Code reviewed
- Production ready