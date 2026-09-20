# V1 TODO

> Last synchronized with `main` and current production state: 2026-09-18.
> `[x]` means implemented and present in the current system. Open items are still missing, incomplete, or intentionally left for a later pass.

## P0 — Core operating system

- [x] Monorepo/package manager setup
- [x] Backend API foundation
- [x] Admin web foundation
- [x] Technician mobile foundation
- [x] PostgreSQL/PostGIS migrations — point coordinates now project into indexed PostGIS geography and power the technician-only nearby-points API
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
- [x] Dedicated `YAKINIMDAKİLER` screen — foreground location permission/services checks, assigned active points, server-distance ordering and directions
- [x] Map screen — list and map share one nearby result set, selected marker details and directions
- [x] Search by point code/name/address/region/old name — admin and technician surfaces cover aliases
- [x] Admin dashboard
- [x] Unified point chronology
- [x] Review-required queue
- [x] CSV/Excel point import with validation/setup-pending flow
- [x] Bulk region/status/week/SmartClean operations — admin can atomically update selected points with per-point audit logging and guarded region/status/Standard-week/SmartClean actions
- [x] Bulk paperwork status operations
- [x] Point equipment profile: cooler/tower/tap/SmartTap counts
- [x] Technician `Müşterilerim` equipment entry before maintenance
- [x] Maintenance-time equipment verification/correction
- [x] Immutable visit-level equipment snapshot and audit trail
- [x] Technician Jobs search
- [x] Technician My Customers search

## P2 — Reporting and automation

AI / karar destek V1 kapsamı tamamlandı; kapanış ve doğrulama kaydı: [AI_TODO.md](./AI_TODO.md) (108/108).

- [x] Paperwork completion-time analytics — admin analytics measures document-arrival and status-resolution time from server-recorded maintenance time, with median/P90 and pending-age buckets
- [x] Daily technician summary — admin drill-down reports one technician’s Istanbul business day with own maintenance/attempt/visit/prospect activity, historical open-work snapshot, paperwork status and explicit help-given/help-received separation
- [x] Daily admin summary — admin dashboard shows selected-day field activity, open/current/overdue/unassigned work, paperwork backlog and technician-level distribution
- [x] Period/week-end admin summary — admin dashboard aggregates Monday–Sunday Istanbul field activity with week-end open/overdue/unassigned work and technician-level distribution
- [x] KPI/reporting module — admin date-range report covers activity success, field visits, late entry, help given/received, current paperwork status, daily and technician trends, and read-only end-date open-work snapshots
- [x] SAP confirmation synchronization — production runtime runs every 10 minutes with normal `Operasyon → Hizmet teyitleri` search, 14-day window, product 203, max 1000, date-scoped DB deletion and guarded logout; repository integration is merged to `main` and production-verified
- [x] SAP Web CRM browser automation proof-of-concept — superseded by the working production automation; Playwright + Firefox specifically is no longer required


## Active TODO — Full admin visual redesign

> Added: 2026-09-20. This is not a dashboard-only polish task. The current admin is functionally mature but still visually uses the prior compact corporate theme. The target is one consistent desktop-first operations UI across every admin section, while preserving the existing real API contracts, business rules and completed workflows.

### Delivery rules

- [ ] Keep the existing single-page auth boundary, typed URL navigation and real backend metrics; do not introduce fake KPI/trend data.
- [ ] Adopt the approved mockup direction: deep navy desktop sidebar with logo, icon and readable text labels; grouped navigation is visible by default, and tablet/phone drawer always retains group and submenu labels. Icon-only is never the default experience.
- [ ] Preserve all existing endpoint contracts, permissions, audit behavior, point-list read-only rule and bulk-operation safeguards.
- [ ] Use one shared component/style system for loading, empty, error and success states; do not create one-off screen styling.
- [ ] Maintain keyboard access, visible focus, semantic tables/captions, horizontal table scroll and responsive action/filter wrapping.

### Shared foundation

- [ ] Redesign app shell to the mockup standard: 260–280 px visible-label navy sidebar, simple Fıçıbakım mark, compact account area, low-noise topbar, breadcrumb, page title and one contextual primary action.
- [ ] Establish shared visual primitives matching the mockups: spacious white panels, 8 px rhythm, strong title hierarchy, restrained blue/green/amber/red chips, clear search/filter toolbar, table selection summary, dialogs and loading/empty/error/success states.
- [ ] Refresh typography, spacing, elevation, border/radius, state colors and interaction feedback consistently in globals.css without changing domain behavior. Use the approved family: navy #0F4C81, action blue #2563EB, success #16A34A, warning #F59E0B, error #EF4444, background #F8FAFC and white cards.
- [ ] Add visual/regression coverage for desktop, tablet drawer and phone layouts, including a clean-session desktop navigation test (no persisted collapsed sidebar state).

### Screen migration clusters

- [ ] Dashboard and reporting: Operations Dashboard follows the mockup’s task-first layout—maximum three high-priority real metrics, a “Bugünün işleri” queue, compact technician activity and one clear primary action. KPI/Raporlama, Technician Daily Summary and Sanal İstatistikçi receive the same hierarchy, explainable states and drill-down affordances.
- [ ] Operations: Bakım Takvimi, Görevlendirmeler, Bakım Dışı Ziyaretler and Evrak Yönetimi receive consistent page headers, filters, tables, selection/preview/confirmation states and narrow-screen behavior.
- [ ] Approval & review: Yapılamadı, Konum & Anomali and fiş/teyit review states receive clear decision hierarchy; location confirmation remains explicitly independent from maintenance approval.
- [ ] Point management: Noktalar, Nokta Detay, Ayar Bekleyenler, Bölgeler, SAP/Google, Mükerrer Noktalar, Timeline and Prospects receive consistent list → detail context, tabs, read-only/edit states. Nokta Detay follows the mockup: identity/status summary at top, one “Düzenle” action, secondary “Geri dön”, and Genel/Konum/Bakım/Atamalar/Evrak/Timeline/Audit tabs.
- [ ] Toplu İşlemler follows the approved safe mockup exactly: Filtre → Seçim → Önizleme → Açık onay → Uygulama → Audit. Keep selected-count summary, visible current → new value preview, affected-point count, warning, mandatory acknowledgement and audit confirmation visibly separate from the selection table.
- [ ] Users and system: Kullanıcılar, Yardım Yetkileri, SAP Sync and Audit receive the same visual system, deep-link-friendly state and accessible detail/filter surfaces.

### Verification and release

- [ ] Work each independent visual cluster in parallel only where source files do not overlap; keep merge and production deployment serialized.
- [ ] For every behavior-affecting change: RED test, minimal GREEN change, relevant smoke/E2E, admin type check and production build.
- [ ] Require exact PR SHA CI success and exact merge-SHA CI success before release; queued/in-progress is not success.
- [ ] Build the candidate admin artifact in an isolated staging directory from the exact merge SHA; deploy only the Next artifact atomically, preserve prior artifact, restart only field-maintenance-admin.service, then run root/dashboard/API production smoke.
- [ ] Do not touch API, SAP runtime, DB migrations or mobile artifacts unless a specific visual change demonstrably requires it.

## Current near-term priorities

Non-mobile work is intentionally scheduled first. Mobile-specific work stays at the end of the current V1 queue.

1. Keep Android APK CI green. Final APK distribution is excluded from the current V1 scope.

AI V1 (108/108) and SAP synchronization are closed and are not part of this execution queue.

## Explicitly out of V1

- Per-asset equipment inventory/tracking beyond point-level counts
- Serpentine/cooler/tower/SmartTap individual asset hierarchy
- Barcode workflow
- Asset movement / depot stock
- Fault tickets
- Repair diagnosis/workflow
- Parts tracking
- Repair costs
- Offline point cache, maintenance queue, and auto-sync/conflict handling
- Final APK distribution
- AI diagnosis
- Mandatory photos
- Mandatory technical checklists
