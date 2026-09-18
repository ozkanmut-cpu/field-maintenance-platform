# Admin Panel Redesign — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the secure admin shell and the first point-management workflow: read-only list, single-point detail, and guarded bulk operations.

**Architecture:** Keep `page.tsx` as the authenticated entry point. Replace opaque local screen state with typed `?section=` URL navigation. Split point finding, single-record editing, and bulk mutation into focused components while retaining the existing backend proxy and endpoints.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-admin-panel-redesign-design.md`

## Global Constraints

- Do not modify session endpoints or `/api/backend/[...path]` proxy behavior.
- Do not add a UI framework or invent a backend endpoint.
- `Noktalar` contains no inline mutation or bulk controls.
- Bulk uses only `SET_REGION`, `SET_STATUS`, `SET_STANDARD_WEEK`, and `SET_SMARTCLEAN` through `POST /points/bulk-update`.
- Region bulk payloads must exclude all Google, coordinates, location source, and confidence fields.
- Location approval remains independent from maintenance approval.
- No production deployment until the dirty production overlay is read and both branch and merged-main exact SHA CI succeed.

## Files

- Create `apps/admin/app/admin-navigation.ts`: typed sections, metadata, URL parser and builder.
- Create `apps/admin/app/admin-shell.tsx`: sidebar, topbar, breadcrumbs and collapse behavior.
- Create `apps/admin/app/admin-primitives.tsx`: page headers, metric/status and states.
- Create `apps/admin/app/point-list.tsx`: read-only finding surface.
- Create `apps/admin/app/point-detail-page.tsx`: guarded single-record detail/edit state.
- Create `apps/admin/app/bulk-operations.tsx`: select, preview, confirm, apply.
- Modify `apps/admin/app/page.tsx`, `operations.tsx`, and `globals.css`.
- Create targeted `*.smoke.test.mjs` files and `apps/admin/e2e/admin-navigation.spec.ts`.

### Task 1: Establish baseline and URL navigation registry

**Files:** Create `admin-navigation.ts`, `admin-navigation.smoke.test.mjs`; modify `apps/admin/package.json`.

- [ ] Write the failing test:

```js
test('restores deep point detail URL', () => {
  assert.deepEqual(parseAdminLocation('?section=point-detail&pointId=p-7&query=migros&page=3'), {
    section: 'point-detail', pointId: 'p-7', query: 'migros', page: '3',
  });
});
```

- [ ] Run `node --test apps/admin/app/admin-navigation.smoke.test.mjs`; expect missing module failure.
- [ ] Implement `AdminSection`, complete menu registry, `parseAdminLocation`, and stable `buildAdminLocation`; unknown sections resolve to dashboard.
- [ ] Run `node --test apps/admin/app/admin-navigation.smoke.test.mjs && npm run lint --workspace @fmp/admin`; expect pass.
- [ ] Commit `feat(admin): add URL navigation registry`.

### Task 2: Create accessible compact shell

**Files:** Create `admin-shell.tsx`, `admin-shell.smoke.test.mjs`; modify `globals.css`.

- [ ] Write a failing source-contract test for `aria-expanded`, `aria-current`, and `Menüyü Daralt`.
- [ ] Run it; expect missing file failure.
- [ ] Implement grouped navigation exactly as specified, localStorage collapse state, tooltip labels in collapsed mode, breadcrumb/title, ADMIN account and logout. Do not create global search.
- [ ] Add 250px/68px desktop shell, mobile drawer/compact behavior, visible focus, and horizontal table overflow.
- [ ] Run smoke + `npm run lint --workspace @fmp/admin`; expect pass.
- [ ] Commit `feat(admin): add grouped operations shell`.

### Task 3: Wire shell to URL state

**Files:** Modify `page.tsx`; create `page-navigation.smoke.test.mjs`.

- [ ] Write a failing test that requires `popstate`, `history.pushState`, and absence of the old literal `section` union state.
- [ ] Run it; expect failure on current page.
- [ ] Initialize navigation from `window.location.search`; use one navigate function; subscribe/unsubscribe `popstate`; retain all existing screen dispatch and session behavior. Remove standalone New User navigation and open it from Users.
- [ ] Run navigation tests + `npm run lint --workspace @fmp/admin`; expect pass.
- [ ] Commit `feat(admin): preserve navigation in URL`.

### Task 4: Extract read-only Points

**Files:** Create `point-list.tsx`, `point-list.smoke.test.mjs`; modify `operations.tsx`.

- [ ] Write a failing safety test asserting Detail exists while PATCH, `bulk-update`, and inline status selects do not.
- [ ] Run it; expect missing component failure.
- [ ] Implement URL-backed query/status/region/maintenance filters, compact listing columns, Detail links, New Point action outside the table, and a secondary Bulk Operations link.
- [ ] Remove `changePointStatus`, selections, inline edit controls, bulk toolbar, and permanent new point form from `operations.tsx`; retain dashboard, regions and attempts.
- [ ] Run smoke + lint; expect pass.
- [ ] Commit `feat(admin): make point list read only`.

### Task 5: Implement guarded Point Detail

**Files:** Create `point-detail-page.tsx`, `point-detail-page.smoke.test.mjs`; modify `page.tsx`, `operations.tsx`.

- [ ] Write a failing test requiring `useState(false)` edit mode plus `Düzenle`, `Kaydet`, `İptal`, and PATCH.
- [ ] Run it; expect missing component failure.
- [ ] Fetch `GET /points/:id`; render General, Location, Maintenance, Assignments, Equipment, Paperwork, Timeline, Audit tabs read-only by default.
- [ ] In edit mode expose only existing PATCH fields, submit minimal changed payload, reload on Save, reset from fetched snapshot on Cancel. Reuse aliases/equipment/timeline/assignment content but add no unsupported mutation.
- [ ] Change setup-pending actions into navigation links: general/assignment reasons to their tabs; routine/reference reasons to Maintenance.
- [ ] Run smoke + lint; expect pass.
- [ ] Commit `feat(admin): add guarded point detail editing`.

### Task 6: Implement controlled Bulk Operations

**Files:** Create `bulk-operations.tsx`, `bulk-operations.smoke.test.mjs`; modify `page.tsx`.

- [ ] Write a failing test for `Değişiklikleri Önizle`, `Uygulamayı Onayla`, `SET_REGION`, and exclusion of `canonicalLatitude`, `canonicalLongitude`, `googlePlaceId`, `locationSource`, and `locationConfidence`.
- [ ] Run it; expect missing component failure.
- [ ] Implement filter/select, exact selection count, supported action/value controls, old/new preview rows, explicit confirmation UI, POST, reload, and result summary. Region preview displays the location-preservation warning. A browser confirm alone is insufficient.
- [ ] Run smoke + lint; expect pass.
- [ ] Commit `feat(admin): isolate guarded bulk point operations`.

### Task 7: Regression and CI gate

**Files:** Create `apps/admin/e2e/admin-navigation.spec.ts`; modify existing e2e only if selectors changed.

- [ ] Add mocked Playwright cases for deep link, active/collapsed navigation, read-only list, detail URL, bulk preview-before-POST, and location approval not calling a maintenance review endpoint.
- [ ] Run `npm run lint --workspace @fmp/admin`, `npm run test:ai-smoke --workspace @fmp/admin`, and `npm run test:ai-e2e --workspace @fmp/admin`; expect pass.
- [ ] Run `npm test` and `npm run build --workspace @fmp/admin`; expect pass.
- [ ] Push `admin-panel-redesign`; query check-runs for the exact HEAD. Do not merge until every required job is `completed/success`.
- [ ] Commit `test(admin): cover redesigned operations workflow`.

### Task 8: Merge and production deployment

- [ ] When server access returns, read-only inspect production HEAD, `git status --short`, and file-level diff versus main; do not reset, clean, broad checkout, or bulk overwrite.
- [ ] Merge only after branch exact-SHA success; then verify merged main exact-SHA success.
- [ ] Selectively copy only reviewed non-conflicting admin files, build production, and restart only after a successful build. Record conflicts for reconciliation.
