# KPI Reporting Module Implementation Plan

> Execute inline with superpowers:executing-plans and test-driven-development. Existing isolated worktree verified with using-git-worktrees.

**Goal:** Give admins a date-range KPI report with daily trends, technician breakdown and clear help attribution.
**Architecture:** KpiReportingService reads Prisma and a read-only historical MaintenanceEngineService snapshot. A dedicated admin panel is embedded in Operations; no database migration.
**Tech Stack:** NestJS, Prisma, TypeScript, React/Next.js, node:test.
**Spec:** User's 2026-09-17 continuation report plus metric definitions below.

## Global Constraints
- Worktree /tmp/fmp-kpi-reporting; branch feat/kpi-reporting-module.
- Production /opt/field-maintenance/app source stays untouched until feature and post-merge exact-SHA CI completed/success.
- No mobile, schema, migration, dependency upgrade or SAP automation changes.
- Istanbul calendar days, 1–180 inclusive, default last 30 days including today; future end rejected.
- Only currently VALID maintenance contributes to activity KPIs.
- Reports must not write to the database, including indirect engine calls.
- Protect production-only changes with per-file blob comparison and backup; no reset/clean/broad checkout.
- Production lint/build must pass before restart.

## Metric contract
- completedMaintenance counts performed work, including help given, once per actor.
- ownMaintenance excludes work performed for a different technician.
- helpedMaintenance/helpedAttempts count actor work for another technician.
- receivedHelpMaintenance/receivedHelpAttempts count work by another actor for the selected responsible technician.
- attemptCount counts actor attempts. Success rate is completed / (completed + attempts) * 100, one decimal; null when denominator is zero. This is an activity success rate, not route compliance.
- Non-maintenance and prospect visits use their actor; enteredLate counts VALID actor maintenance.
- Paperwork counts current status of the period's actor maintenance; UI explicitly says current status.
- currentOpen/overdueOpen are separate end-date buckets; unassignedOpen is their unassigned subset.
- Daily trend includes zero-activity days. Technician rows include inactive technicians with historical activity.
- Snapshot uses existing historical resolution semantics, current point eligibility, effective assignment at end date. It is reconstructed, not an immutable historical ledger.
- Read-only snapshot synthesizes missing standard cycles in memory and excludes already persisted cycles, including resolved cycles; it must not upsert.

### Task 1: Backend report and read-only snapshot
**Files:** create apps/api/src/maintenance/kpi-reporting.service.ts and kpi-reporting.spec.ts; modify maintenance-engine.service.ts, maintenance-engine.service.spec.ts, maintenance.module.ts, maintenance.controller.ts and controller test constructors where required.
**Interface:** KpiReportingService.report({from?, to?, technicianId?}, now = new Date()); GET maintenance/admin-kpi-reporting (ADMIN only).
- [ ] Write KPI fixtures: t1 own, t1 helping t2, t2 helping t1, reversed visit, range boundary, empty day, unassigned open.
- [ ] Assert all-actor count 3 and filtered t1 count 2, own count 1, helped 1, received 1; no double count.
- [ ] Assert dates, 180 accepted/181 rejected, invalid/reversed/future rejected, 30-day default, empty rate null.
- [ ] Write real engine test: read-only snapshot with unmaterialized standard cycle returns open work and performs zero upserts; resolved existing cycle stays excluded.
- [ ] Run node --test --require ts-node/register src/maintenance/kpi-reporting.spec.ts src/maintenance/maintenance-engine.service.spec.ts in apps/api; record expected RED.
- [ ] Implement strict input validation before reads and minimal typed aggregation.
- [ ] Add explicit readOnly snapshot option, preserving default engine behavior. Derive missing cycles in memory by reusing existing schedule helpers.
- [ ] Register provider/export and inject controller; enforce ADMIN route.
- [ ] Run backend tests and API typecheck.

### Task 2: Admin KPI panel
**Files:** create apps/admin/app/kpi-reporting.tsx and kpi-reporting.smoke.test.mjs; modify operations.tsx.
**Interface:** KpiReportingPanel({technicians}); mount only on dashboard, so re-entry fetches again.
- [ ] Add smoke tests before UI implementation; verify missing panel fails.
- [ ] Test rendered report labels, encoded date/technician request, empty/error states and stale-request cleanup.
- [ ] Implement date controls defaulting to last 30 Istanbul dates, optional technician, refresh.
- [ ] Clear result on filter changes; abort old requests and prevent stale response/error/finally updates.
- [ ] Show activity metrics, help counts, paperwork, end-date open work, daily table and technician table.
- [ ] Display success-rate denominator and current-paperwork / reconstructed-snapshot meaning.
- [ ] Mount panel in dashboard and run smoke tests and admin typecheck.

### Task 3: Regression, review and feature CI
**Files:** .github/workflows/reporting-ci.yml, docs/V1_TODO.md.
- [ ] Include new backend and admin tests plus new admin panel path in push/PR CI filters.
- [ ] Run all reporting and operations regression tests, API/admin lint and builds, git diff --check.
- [ ] Review diff for security, input validation, arithmetic, stale UI, no mobile/schema/secret changes.
- [ ] Commit/push feature, open PR and wait for exact feature SHA Reporting and Operations CI completed/success.
- [ ] Only after verification gates update V1_TODO KPI checkbox; re-run final exact-SHA CI if this creates another commit.

### Task 4: Merge and selective deploy
- [ ] Review final PR diff and merge authorized task; read main SHA and wait for exact-SHA workflows completed/success.
- [ ] Compare changed source files with feature base and production files, preserve production-only changes.
- [ ] Back up target source, API dist and admin .next, record hashes and rollback paths.
- [ ] Deploy only changed runtime source and TODO; production API/admin lint and builds must all pass.
- [ ] Restart only API/admin services; verify health 200/DB ok, admin 200, unauthenticated KPI 401.
- [ ] Run KPI smoke with database read-only transaction / user and confirm contract, range and no writes.
- [ ] Inspect bounded journals, service restart counts, SAP timer health without changing SAP.
- [ ] Verify deployed source hashes against merged blobs and clean task worktree/branch only after success.

## Initial evidence
- main 8ee0a04786575815b646395eb65e52b4956e54f2 freshly read through GitHub.
- Operations CI 35185774565 and Reporting CI 35185774677 completed/success.
- Worktree HEAD matches; clean at resume; plan file was absent (handoff said partial header).
