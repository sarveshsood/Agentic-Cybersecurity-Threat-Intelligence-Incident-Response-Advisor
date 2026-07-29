# Backend Architecture Guide

Version: 2.0

This document defines the canonical backend architecture for the ACTIRA Enterprise SOC Platform.

---

# Architecture Principles

The backend follows a **Modular Monolith** architecture.

Goals

- High cohesion
- Low coupling
- Clear module ownership
- Enterprise scalability
- Easy future extraction into microservices
- Stable APIs
- Strong security boundaries
- Testability

Business logic should remain independent from transport, storage, and UI.

---

# Technology Stack

- FastAPI
- Motor (MongoDB)
- Pydantic
- Python 3.12+
- AsyncIO
- Uvicorn
- JWT Authentication
- RBAC
- OpenAPI

---

# Repository Layout

```
backend/
│
├── server.py                 # FastAPI entry point
│
├── core/
│   ├── database.py
│   ├── services.py
│   ├── config.py
│   ├── dependencies.py
│   ├── logging.py
│   ├── security.py
│   ├── middleware.py
│   ├── exceptions.py
│   └── telemetry.py
│
├── routers/
│   ├── __init__.py
│   ├── auth.py
│   ├── logs.py
│   ├── incidents.py
│   ├── analytics.py
│   ├── review.py
│   ├── investigate.py
│   ├── settings.py
│   ├── roadmap.py
│   ├── audit.py
│   ├── kb.py
│   ├── search.py
│   ├── ai.py
│   ├── metrics.py
│   └── meta.py
│
├── services/
│
├── pipeline.py
├── auth.py
├── models.py
├── analytics.py
├── playbook_agent.py
├── enrichment.py
├── search.py
├── hitl_gate.py
├── review_queue.py
├── platform_settings.py
├── ...
│
├── scripts/
│
├── tests/
│
└── migrations/
```

---

# Responsibilities

## server.py

Responsible for

- FastAPI app
- Lifespan
- Middleware
- CORS
- Router registration
- Exception handlers
- Startup
- Shutdown

Should NOT contain

- Business logic
- Mongo queries
- AI logic

---

# core/

Contains shared infrastructure.

Examples

- Database
- Authentication helpers
- Dependency injection
- Configuration
- Logging
- Security
- Middleware
- Health checks
- Telemetry

Must not depend on feature routers.

---

# routers/

Responsible only for

- HTTP
- Validation
- Serialization
- Authentication
- Authorization
- Calling services

Routers should never implement business logic.

Maximum router complexity should remain minimal.

---

# Domain Modules

Domain modules own business logic.

Examples

```
pipeline.py

analytics.py

playbook_agent.py

review_queue.py

enrichment.py
```

Responsibilities

- Rules
- Processing
- AI
- Correlation
- Calculations

---

# Services

Reusable business services.

Examples

```
Notification

Audit

Search

Threat Intelligence

Knowledge Base

AI Provider

Platform Settings
```

Shared across routers.

---

# Data Access

All Mongo access should be

- Async
- Indexed
- Encapsulated

Avoid database code inside routers.

---

# Dependency Rules

Allowed

```
Router

↓

Service

↓

Domain Module

↓

Database
```

Never

```
Router

↓

Router
```

Never

```
Database

↓

Router
```

Never create circular dependencies.

---

# URL Structure

Canonical

```
/api/*
```

Versioned

```
/api/v1/*
```

Operations

```
/health

/ready

/metrics
```

Future

```
/api/v2/*
```

without breaking v1.

---

# API Versioning

Current

```
v1
```

Rules

Never break

```
/api
```

without migration.

---

# Adding a New Router

1.

Create

```
routers/new_feature.py
```

2.

Register

```
routers/__init__.py
```

3.

Mount

```
build_api_router()
```

4.

Generate OpenAPI

```
python backend/scripts/export_openapi.py
```

5.

Add tests

```
backend/tests/
```

6.

Update documentation.

---

# Authentication

All protected routes must use

- JWT
- Cookies
- RBAC
- Explicit dependencies

Never perform permission checks manually inside handlers.

---

# Error Handling

Use

- HTTPException
- Custom exceptions
- Structured errors

Never

- Return stack traces
- Return internal exception messages

---

# Logging

Every request should include

- Correlation ID
- User
- Request ID
- Route
- Duration

Never log

- Secrets
- Passwords
- Tokens

---

# Health Endpoints

Required

```
/health

/ready

/metrics
```

Verify

- Mongo
- AI Providers
- Queue
- Search
- Settings

---

# Background Jobs

Long-running work should use

- Async tasks
- Job queue
- Progress updates
- Cancellation support

Never block request threads.

---

# AI Modules

AI modules must

- Preserve evidence
- Preserve citations
- Preserve confidence
- Support human review
- Audit prompts
- Audit responses

Never fabricate evidence.

---

# Security

Modules handling

- Authentication
- Authorization
- Secrets
- Tokens

must remain isolated.

Never bypass RBAC.

---

# Testing

Every router should have

- Unit tests
- Integration tests
- Permission tests
- Error tests

Critical modules require

- Regression tests

---

# Performance

Use

- Async I/O
- Pagination
- Batch operations
- Mongo indexes
- Streaming when appropriate

Avoid

- N+1 queries
- Blocking calls
- Full collection scans

---

# OpenAPI

After API changes

```
python backend/scripts/export_openapi.py
```

Verify

- Request models
- Response models
- Examples
- Authentication

---

# Import Rules

Preferred

```python
from backend.auth import ...
from backend.pipeline import ...
```

Shared infrastructure

```python
from backend.core.database import db
from backend.core import services as svc
```

Avoid relative imports.

---

# Compatibility

Canonical startup

```bash
PYTHONPATH=. python -m uvicorn backend.server:app
```

Never document

```
server:app
```

inside

```
backend/
```

as the standard startup method.

---

# Future Scalability

Modules should be written so they can later become independent services without significant refactoring.

Avoid tightly coupling unrelated domains.

---

# Definition of Done

Backend work is complete only when

- Business logic implemented
- Async where appropriate
- RBAC enforced
- Validation complete
- Structured logging added
- Audit logging preserved
- OpenAPI updated
- Tests added
- Performance reviewed
- Security reviewed
- Documentation updated
- No circular dependencies
- Compatible with current API