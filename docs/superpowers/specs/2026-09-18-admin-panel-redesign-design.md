# Admin Panel Redesign

## Goal

Reorganize the existing admin panel into a compact desktop-first operations center without changing its authenticated backend-proxy contract, business rules, or real data sources.

## Non-negotiable constraints

- Keep `apps/admin/app/api/session/*` and `apps/admin/app/api/backend/[...path]/route.ts` behavior unchanged.
- Keep all existing real admin functions; do not add fictional settings, analytics, roles, notifications, or global search.
- Use the existing Next.js, React, CSS, and icon system; no UI framework dependency.
- Keep production untouched until its dirty/overlay state can be read, the candidate SHA has successful CI, and a file-level deploy diff is reviewed.
- The points list is read-only. A single-point mutation belongs in Point Detail. A multi-point mutation belongs only in Bulk Operations.
- A region change is organizational only: it must not clear or refresh Google Place, canonical coordinates, FIELD_CONFIRMED data, location source, or confidence.
- Approving a technician location is independent of maintenance outcome and must not reopen, reject, or otherwise alter maintenance/anomaly decisions.

## Navigation architecture

The existing single client page remains the auth boundary. Replace its opaque local `section` state with a typed central navigation registry and `?section=` URL state. Unknown values resolve to dashboard. The registry owns title, breadcrumb, group, icon, and optional badge identity. `history.pushState`/`popstate` synchronize click navigation and browser navigation; initial state comes from the URL, so refresh and deep links work without a risky nested-route migration.

Desktop shell uses a 250px dark/navy sidebar with expandable groups and a 68px collapsed state. Parent and child active states are derived from the registry. The topbar contains breadcrumb, current title, authenticated name, ADMIN role, account affordance, and logout. On small screens the same navigation becomes a drawer/compact control; wide tables remain horizontally scrollable.

Navigation groups:

- Ana Sayfa: Operasyon Dashboard.
- Operasyon: Bakım Takvimi/Yükümlülükler, Görevlendirmeler, Bakım Dışı Ziyaretler, Evrak Yönetimi.
- Onay & İnceleme: Yapılamadı Onayları; Konum & Anomali İnceleme.
- Nokta Yönetimi: Noktalar, Ayar Bekleyenler, Bölgeler, SAP/Google Eşleştirme, Mükerrer Noktalar, Nokta Timeline, Potansiyel Müşteriler, Toplu İşlemler.
- Raporlar & Analiz: KPI/Raporlama, Teknisyen Günlük Özeti, Sanal İstatistikçi.
- Entegrasyonlar: SAP Senkronizasyonu.
- Kullanıcı Yönetimi: Kullanıcılar, Yardım Yetkileri. New user is a primary action on Users.
- Sistem: İşlem Geçmişi.

## Shared UI system

Create focused components for the shell, sidebar groups/items, topbar/breadcrumb, page header, metric card, status badge, filters, loading/empty/error states, and tables. Styling is compact, navy sidebar plus white content, restrained radius and status colors, visible focus, semantic buttons/links, icon labels/tooltips, and no landing-page layout or fake trends.

Each screen uses page header, explanation, appropriate actions, filters, real summary metrics when available, content table/panels, and loading/empty/error treatment. Existing component-specific endpoint calls remain the source of truth.

## Points workflow

### Read-only list

`Noktalar` loads and filters existing `GET /points` data. It shows code, name, region, maintenance type, status, effective technician where available, location state, recent maintenance/next obligation where existing data permits, and Detail. It contains no editable inputs, status dropdowns, region controls, maintenance controls, location/equipment changes, or bulk toolbar. New Point opens a create modal/drawer or dedicated create state, and successful creation navigates to the created detail.

List UI state is encoded in URL parameters (query, filters, page) and list scroll position is retained in session memory, so Detail back navigation returns to the prior result context.

### Point Detail

Detail is selected through URL state (`section=point-detail&pointId=...`) and defaults to read-only. Header exposes critical identity, status, region, maintenance type, effective technician, and location provenance. Only an explicit Edit action exposes mutation controls; Save performs `PATCH /points/:id`, Cancel restores fetched state.

Tabs: General (including aliases), Location, Maintenance, Assignments, Equipment, Paperwork, Timeline, and Audit/History. Existing detail, alias, timeline, assignment, paperwork, obligation history, and audit endpoints are reused. Admin equipment display remains read-only unless the backend already supports a specific admin mutation.

### Setup queue and bulk operations

Setup Pending displays genuine reason codes and links to the correct Point Detail tab instead of inline prompts. Bulk Operations is its own screen backed by `POST /points/bulk-update`: find points, checkbox-select, choose supported action, choose value, preview old/new values and warnings, explicitly confirm, apply, show result. Supported actions only: region, status, STANDARD week, and SmartClean/reference date. The preview is client-side explanatory only; the existing backend remains authoritative. Existing audit output is surfaced after the operation; no synthetic audit endpoint is added.

## Existing screen migration

Dashboard uses the existing daily, period, KPI, and technician summary endpoints and links real queue metrics to relevant sections. The calendar, assignments, non-maintenance visits, paperwork, attempt review, anomaly/location review, location matching, duplicate suggestions, timeline, prospects, user/help management, audit, SAP status, KPI, and AI dashboard migrate as intact components into the shell. Copy is clarified but endpoint contracts and business logic are not rewritten.

`Yapılamadı Onayları` remains the only attempt approval flow. `Konum & Anomali İnceleme` explicitly states location confirmation does not decide maintenance; its distinct decisions remain "Sorun Yok", "Konumu Dışla", and "Takip Gerekli".

## Test strategy and delivery gates

Add targeted smoke/unit tests for URL navigation, menu state/collapse, read-only list contract, Point Detail edit/cancel/save behavior, setup-to-detail links, bulk preview/confirmation payloads, region-location invariant, and location-approval maintenance-state invariant. Preserve and run existing smoke/e2e tests, TypeScript check, and production build. A branch is not ready until the exact commit SHA has completed successful CI. Merge requires a second successful exact-main SHA. Production deploy is file-selective only after the production overlay inventory becomes available.

## Phasing

1. Shell/navigation/shared primitives and dashboard relocation.
2. Read-only Points, Point Detail, setup links, and Bulk Operations.
3. Operations and review screens migration plus business-rule regressions.
4. Point-management supporting screens, reports/AI, users/audit/SAP.
5. Responsive/accessibility sweep, full regression, CI, merge, then selective deploy when production access is restored.
