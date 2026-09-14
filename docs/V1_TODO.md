# V1 TODO

> Last synchronized with `main` and current production state: 2026-09-14.
> `[x]` means implemented and present in the current system. Open items are still missing, incomplete, or intentionally left for a later pass.

## P0 — Core operating system

- [x] Monorepo/package manager setup
- [x] Backend API foundation
- [x] Admin web foundation
- [x] Technician mobile foundation
- [ ] PostgreSQL/PostGIS migrations — PostgreSQL/Prisma migrations are active; PostGIS itself is not yet used
- [x] Authentication and role authorization
- [x] Audit log foundation
- [x] Device/server time metadata
- [x] Region CRUD
- [x] Region technician assignment
- [x] Temporary technician assignment
- [x] Point-specific technician exception
- [x] Point CRUD
- [x] Point ACTIVE/PASSIVE/CANCELLED lifecycle
- [x] Standard Week 1/2 schedule engine
- [x] SmartClean +2 calendar-month schedule engine
- [x] Maintenance obligation generation/history
- [x] Past-period-overdue-first priority engine
- [x] Technician dashboard counters/lists
- [x] Point detail minimal UX
- [x] `BAKIM YAPILDI`
- [x] Mandatory current-location acquisition
- [x] Completion idempotency / duplicate protection
- [x] Backdated maintenance entry + short reason
- [x] Backdated-entry review flag and location-learning exclusion
- [x] Maintenance revert without hard delete
- [x] Technician daily history
- [x] Service slip status lifecycle
- [x] Confirmation status lifecycle
- [x] Admin-only MISSING decision
- [x] Technician missing-paperwork queue

## P1 — Field intelligence and operations

- [x] `BAKIM YAPILAMADI` visit attempt
- [x] Canonical point location model
- [x] Location evidence model
- [x] Nearby Google/Places matching abstraction
- [x] Fuzzy name/alias matching
- [x] Repeated-field location confidence
- [x] Anti-batch / implausible travel detection
- [x] Location-learning eligibility gate
- [x] Distance-aware task ordering — overdue first, then nearest-to-farthest within each priority group
- [ ] Dedicated `YAKINIMDAKILER` screen
- [ ] Map screen — directions/open-in-map exists, but no dedicated in-app map screen yet
- [ ] Search by point code/name/address/region/old name — admin supports code/name/address/region; mobile Jobs/My Customers supports name/code/region; old-name/address coverage is not complete on mobile
- [ ] Favorites / pinned / recent
- [x] Admin dashboard
- [x] Unified point chronology
- [x] Review-required queue
- [x] CSV/Excel point import with validation/setup-pending flow
- [ ] Bulk region/status/week/SmartClean operations — individual/admin setup flows exist; full bulk operation set is not complete
- [x] Bulk paperwork status operations
- [x] Point equipment profile: cooler/tower/tap/SmartTap counts
- [x] Technician `Müşterilerim` equipment entry before maintenance
- [x] Maintenance-time equipment verification/correction
- [x] Immutable visit-level equipment snapshot and audit trail
- [x] Technician Jobs search
- [x] Technician My Customers search
- [ ] Offline point cache
- [ ] Offline maintenance queue
- [ ] Auto-sync / conflict handling

## P2 — Reporting and automation

AI / karar destek backlog'u ayrı tutulur: [AI_TODO.md](./AI_TODO.md)

- [ ] Paperwork completion-time analytics
- [ ] Daily technician summary
- [ ] Daily admin summary
- [ ] Period/week-end admin summary
- [ ] KPI/reporting module
- [ ] SAP confirmation synchronization — production runtime is working every 10 minutes with normal `Operasyon → Hizmet teyitleri` search, 14-day window, product 203, max 1000 and date-scoped DB deletion; repository integration/Prisma merge still needs to be completed before this is closed
- [x] SAP Web CRM browser automation proof-of-concept — superseded by the working production automation; Playwright + Firefox specifically is no longer required

## Current near-term priorities

1. Keep Android APK CI green and distribute the latest `fıçıbakım` release build.
2. Finish repository-side SAP confirmation integration (`SapConfirmation` Prisma model/migration/runtime branch) without disturbing the dirty production checkout.
3. Complete mobile search coverage if address/old-name search is required on technician screens.
4. Decide whether V1 needs a dedicated `YAKINIMDAKILER`/map UI or the current distance-aware Jobs list + external directions is sufficient.
5. Add offline cache/queue/sync only if field connectivity requirements make it necessary for V1.
6. Start reporting/KPI work after SAP and mobile stabilization.

## Explicitly out of V1

- Per-asset equipment inventory/tracking beyond point-level counts
- Serpentine/cooler/tower/SmartTap individual asset hierarchy
- Barcode workflow
- Asset movement / depot stock
- Fault tickets
- Repair diagnosis/workflow
- Parts tracking
- Repair costs
- AI diagnosis
- Mandatory photos
- Mandatory technical checklists
