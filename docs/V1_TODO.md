# V1 TODO

## P0 — Core operating system

- [ ] Monorepo/package manager setup
- [ ] Backend API foundation
- [ ] Admin web foundation
- [ ] Technician mobile foundation
- [ ] PostgreSQL/PostGIS migrations
- [ ] Authentication and role authorization
- [ ] Audit log foundation
- [ ] Device/server time metadata
- [ ] Region CRUD
- [ ] Region technician assignment
- [ ] Temporary technician assignment
- [ ] Point-specific technician exception
- [ ] Point CRUD
- [ ] Point ACTIVE/PASSIVE/CANCELLED lifecycle
- [ ] Standard Week 1/2 schedule engine
- [ ] SmartClean +2 calendar-month schedule engine
- [ ] Maintenance obligation generation/history
- [ ] Past-period-overdue-first priority engine
- [ ] Technician dashboard counters/lists
- [ ] Point detail minimal UX
- [ ] `BAKIM YAPILDI`
- [ ] Mandatory current-location acquisition
- [ ] Completion idempotency / duplicate protection
- [ ] Backdated maintenance entry + short reason
- [ ] Backdated-entry review flag and location-learning exclusion
- [ ] Maintenance revert without hard delete
- [ ] Technician daily history
- [ ] Service slip status lifecycle
- [ ] Confirmation status lifecycle
- [ ] Admin-only MISSING decision
- [ ] Technician missing-paperwork queue

## P1 — Field intelligence and operations

- [ ] `BAKIM YAPILAMADI` visit attempt
- [ ] Canonical point location model
- [ ] Location evidence model
- [ ] Nearby Google/Places matching abstraction
- [ ] Fuzzy name/alias matching
- [ ] Repeated-field location confidence
- [ ] Anti-batch / implausible travel detection
- [ ] Location-learning eligibility gate
- [ ] `YAKINIMDAKILER`
- [ ] Map screen
- [ ] Search by point code/name/address/region/old name
- [ ] Favorites / pinned / recent
- [ ] Admin dashboard
- [ ] Unified point chronology
- [ ] Review-required queue
- [ ] CSV/Excel point import with validation report
- [ ] Bulk region/status/week/SmartClean operations
- [ ] Bulk paperwork status operations
- [x] Point equipment profile: cooler/tower/tap/SmartTap counts
- [x] Technician `Müşterilerim` equipment entry before maintenance
- [x] Maintenance-time equipment verification/correction
- [x] Immutable visit-level equipment snapshot and audit trail
- [ ] Offline point cache
- [ ] Offline maintenance queue
- [ ] Auto-sync / conflict handling

## P2 — Background intelligence, reporting and automation

- [ ] AI Risk Engine
- [ ] AI Planning Engine
- [ ] AI Location Engine
- [ ] AI Data Quality Engine
- [ ] Point Difficulty Score using equipment profile as primary workload features
- [ ] Treat expert prior as fixed domain knowledge: equipment-aware workload is more informative than raw point count; point count remains contextual only
- [ ] Learn relative workload impact among cooler/tower/tap/SmartTap types from observed outcomes rather than hard-coding arbitrary per-equipment weights
- [ ] Equipment-profile confidence: completeness, verification age and verification history
- [ ] Equipment-profile stability/change-rate feature per point
- [ ] Equipment-change anomaly detection for implausible or repeated count swings
- [ ] Equipment data-quality brake for difficulty/capacity/risk/recommendation engines
- [ ] Historical point-difficulty reconstruction from visit-level equipment snapshots
- [ ] Cold-start cohorts incorporating maintenance type + equipment profile when sample size is sufficient
- [ ] Technician capacity model adjusted for equipment mix, not only point count
- [ ] Decompose weekly workload into service workload and travel workload; do not collapse both into raw point count
- [ ] Travel workload features from point-to-point distance, geographic dispersion, isolated points, cluster fragmentation and technician work-area proximity
- [ ] Prefer route-coherent equipment workload over equalized point counts when evaluating workload balance
- [ ] Weekly workload engine using equipment-weighted point difficulty + geographic/travel burden
- [ ] Risk prediction using workload mix + equipment difficulty + geography + past performance
- [ ] Recommendation ranking aware of equipment-heavy clusters, travel burden and technician capacity
- [ ] Similar Week matching using equipment-mix + geographic-dispersion similarity
- [ ] What-if simulator inputs for equipment-count changes, route/geography changes and resulting workload/risk delta
- [ ] Outcome validation should calibrate equipment-type and travel-burden weights; it must not be used to decide whether raw point count is preferable to the equipment-aware domain model
- [ ] AI maturity gating based on equipment-profile coverage, location coverage and verified-history depth
- [ ] Period-end delay risk
- [ ] Technician workload/capacity analysis
- [ ] Region health indicators
- [ ] SmartClean approaching windows
- [ ] Paperwork completion-time analytics
- [ ] Daily technician summary
- [ ] Daily admin summary
- [ ] Period/week-end admin summary
- [ ] KPI/reporting module
- [ ] Future SAP confirmation synchronization interface
- [ ] Playwright + Firefox SAP connector proof-of-concept

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
