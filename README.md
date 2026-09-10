# Field Maintenance Platform

Field maintenance operations platform for periodic draught-system maintenance workflows.

## V1 scope

V1 focuses only on maintenance operations. Equipment inventory, fault tickets, repairs, parts, barcode/asset movement and mandatory technical checklists are intentionally out of scope.

Core concepts:
- Point (`Nokta`) belongs to a Region (`Bölge`).
- Region owns the normal technician assignment; point-level assignment is only an exception.
- Point status: `ACTIVE`, `PASSIVE`, `CANCELLED`.
- Only active points generate maintenance obligations.
- Standard maintenance: fixed Week 1 / Week 2 cadence; late completion never shifts the assigned week.
- SmartClean maintenance: next due = last valid actual maintenance date + 2 calendar months.
- Past-period overdue work is always the highest priority.
- Technician flow is intentionally minimal: see assigned work and press `BAKIM YAPILDI`.
- Current device location is mandatory for normal completion and is captured automatically.
- Backdated maintenance is allowed with a short reason and is always flagged for review.
- Service slip / confirmation states start as `PENDING`; only admin can mark `MISSING`.
- Reverted maintenance is never hard-deleted.
- AI is background-only: risk, planning, location intelligence and data quality suggestions. It never overrides deterministic business rules.

## Repository layout

```text
apps/
  api/        Backend API
  admin/      Admin web application
  mobile/     Technician mobile application
services/
  ai/         Background intelligence services
  sap-connector/  Future Efes SAP browser automation service
docs/         Architecture, business rules and backlog
```

## Planned stack

- PostgreSQL + PostGIS
- TypeScript backend (NestJS/Fastify decision to be finalized in implementation)
- React/Next.js admin
- React Native mobile
- Docker / Docker Compose
- Ubuntu 24.04 LTS production server
- Future SAP connector: Playwright + Firefox on a separate host if required

## Local infrastructure

Copy `.env.example` to `.env` and adjust local-only values.

```bash
docker compose up -d
```

Never commit real credentials, SAP sessions, API keys, production customer data, `.env` files or server secrets.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md)
- [`docs/V1_TODO.md`](docs/V1_TODO.md)
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
