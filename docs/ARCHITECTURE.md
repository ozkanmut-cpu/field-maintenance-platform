# V1 Architecture

## Goals

The technician experience must remain extremely simple. Business rules are deterministic. AI runs in the background and only produces suggestions, confidence scores and review flags.

## High-level topology

```text
Technician Mobile App
        |
        v
Backend API  <------ Admin Web
        |
        +------ PostgreSQL + PostGIS
        |
        +------ Background Jobs
        |
        +------ AI Engines
        |
        +------ Future SAP Connector
```

Production target:
- Ubuntu 24.04 LTS
- Docker
- PostgreSQL + PostGIS
- Backend API
- Admin Web
- Background workers
- Reverse proxy / TLS
- Off-site backups

The future SAP browser automation may run on a separate Windows host/VM with Playwright + Firefox if SAP compatibility requires it.

## Applications

### `apps/api`
Owns authentication, authorization, point/region data, maintenance rules, visit recording, audit, paperwork states and API contracts.

### `apps/admin`
Admin dashboard for points, regions, assignments, schedules, paperwork, review flags, reports and chronology.

### `apps/mobile`
Technician application. Minimal workflow, offline cache/queue, location capture, due lists, history and paperwork gaps.

## Services

### `services/ai`
Background operational intelligence only. No natural-language/chat UI.

Four conceptual engines:
1. Risk Engine
2. Planning Engine
3. Location Engine
4. Data Quality Engine

AI never overrides deterministic scheduling, point status, paperwork missing state or maintenance validity.

### `services/sap-connector`
Future integration service. Expected strategy is browser automation with Playwright + Firefox. It should only use authorized sessions and must never store credentials in git.

## Data principles

- PostgreSQL is the source of truth.
- PostGIS stores canonical point geography and location evidence.
- Historical events are immutable/audited where practical.
- Critical records use soft delete or explicit state transitions, not normal hard deletion.
- Server timestamps and device timestamps are stored separately where relevant.
- Idempotency is required for mobile maintenance completion and offline sync.
- Point canonical location and visit GPS evidence are separate concepts.

## Priority pipeline

1. Deterministic business rules generate/identify obligations.
2. Past-period overdue work is always first.
3. Current-period work and due SmartClean follow.
4. AI may rank only within the same deterministic priority class.

## Security

- Public repository: no production secrets or real customer data.
- Secrets supplied by deployment environment only.
- Least-privilege DB/application users.
- TLS for production traffic.
- Audit privileged mutations.
- SAP sessions/credentials remain outside repository and application logs.
