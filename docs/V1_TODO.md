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

> Scope: only the admin panel's visual design and user experience. Backend contracts, CI/release mechanics, SAP, database and mobile work are deliberately outside this TODO.

### Visual direction

- [ ] Use the approved easy-to-use visual language: calm deep-navy navigation, bright white content surfaces, generous whitespace, clear blue primary actions and restrained green/amber/red statuses.
- [ ] Keep desktop navigation wide and text-visible by default. Every group and submenu label remains visible; tablet and phone use a readable drawer rather than icon-only navigation.
- [ ] Apply one consistent hierarchy across the entire admin: breadcrumb → title → short purpose → one primary action → content.
- [ ] Use shared spacing, typography, panel, card, badge/chip, button, filter, table, dialog, loading, empty, error and success styles. Avoid screen-specific ad-hoc visuals.
- [ ] Keep controls legible and touch-friendly; preserve visible focus, semantic labels and horizontal table scrolling.

### Dashboard and reports

- [ ] Redesign Operations Dashboard as a task-first home: at most three real priority metrics, a prominent “Bugünün işleri” queue, compact technician activity and one obvious primary action.
- [ ] Give KPI/Raporlama, Teknisyen Günlük Özeti and Sanal İstatistikçi the same card hierarchy, calm density and readable drill-down patterns.
- [ ] Replace dense visual noise with progressive disclosure: summaries first, details only when the user asks for them.

### Operations and review

- [ ] Redesign Bakım Takvimi, Görevlendirmeler, Bakım Dışı Ziyaretler and Evrak Yönetimi with shared page headers, filter bars, selection feedback, readable tables and clear action priority.
- [ ] Redesign Yapılamadı, Konum & Anomali and fiş/teyit review surfaces so the current decision, its consequence and the next action are immediately understandable.
- [ ] Standardize loading, no-result, error and completed states across these screens.

### Point management

- [ ] Redesign Noktalar, Ayar Bekleyenler, Bölgeler, SAP/Google, Mükerrer Noktalar, Timeline and Prospects as consistent list-to-detail journeys with search/filter context visibly preserved.
- [ ] Redesign Nokta Detay to the approved mockup: point identity and three critical statuses at the top, one primary “Düzenle” action, secondary “Geri dön”, and clear Genel/Konum/Bakım/Atamalar/Evrak/Timeline/Audit tabs.
- [ ] Make point detail sections skimmable: compact information groups, aliases as chips, short recent activity and detail-on-demand instead of a dense wall of fields.

### Bulk operations

- [ ] Redesign Toplu İşlemler around the approved safety flow: Filtre → Seçim → Önizleme → Açık onay → Uygulama → Audit.
- [ ] Keep filter controls compact and understandable; show selected count persistently while selecting points.
- [ ] Make preview unmistakable: current value → new value, affected count and warnings live in a separate confirmation panel.
- [ ] Require a highly visible acknowledgement before the primary apply action; show the audit result as the final state.

### Users and system

- [ ] Bring Kullanıcılar, Yardım Yetkileri, SAP Senkronizasyonu and İşlem Geçmişi into the same shared visual system.
- [ ] Make filter-heavy and audit-heavy pages easy to scan with clear labels, readable JSON/detail panels and keyboard-friendly controls.

### Responsive visual quality

- [ ] Validate every redesigned screen at desktop, tablet and phone widths.
- [ ] On narrow screens, preserve label visibility in the drawer, stack actions/filters naturally, prevent button overflow and keep dialogs/table regions usable.

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
