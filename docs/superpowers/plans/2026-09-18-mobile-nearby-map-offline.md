# Mobile Nearby, Map, and Offline Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete roadmap items 1, 2, 3, 5, 6, and 7: admin alias search, nearby list, in-app map, offline read cache, offline maintenance queue, and automatic synchronization/conflict handling.

**Architecture:** Keep the existing API authoritative and add focused mobile modules for nearby data, versioned user-scoped snapshots, queued maintenance writes, and FIFO synchronization. Deliver each roadmap item through a separate branch/PR/CI/merge/selective-production gate so the next item always starts from verified `main`.

**Tech Stack:** Node.js 22, TypeScript 5.9, Next.js 15, Expo SDK 54, React Native 0.81.4, AsyncStorage 2.2.0, NetInfo 11.4.1, react-native-maps 1.20.1, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-18-mobile-nearby-map-offline-design.md`

## Global Constraints

- Do not implement favorites, pinned points, or recently used points.
- Do not perform roadmap item 8 or distribute a final APK. Android CI builds are verification only.
- Preserve the dirty/diverged production checkout and every production-only AI, SAP, mobile, and PostGIS hotfix.
- Never run `git reset --hard`, `git clean`, broad checkout, or wholesale production overwrite.
- Every roadmap item follows RED → expected failure → minimal GREEN → full regression → exact-SHA CI `completed/success` → merge → post-merge exact-SHA CI `completed/success` → selective production deploy.
- Never describe `queued` or `in_progress` CI as green or complete.
- Use Expo-compatible dependency versions: AsyncStorage `2.2.0`, NetInfo `11.4.1`, and react-native-maps `1.20.1`.
- Keep access tokens only in SecureStore; AsyncStorage contains non-secret, user-scoped cache and queue records.
- Keep the original idempotency key and payload unchanged for every queued replay.
- Start each task from the latest verified `main` in a fresh isolated worktree.

## File Structure

- `apps/admin/app/operations.tsx`: admin point type and alias-aware search haystack.
- `apps/admin/app/operations.search.smoke.test.mjs`: source contract for alias search.
- `apps/mobile/src/api.ts`: typed HTTP boundary, `ApiError`, transport classification, and nearby API.
- `apps/mobile/src/NearbyScreen.tsx`: nearby list/map presentation with one shared selection model.
- `apps/mobile/src/nearby.ts`: pure nearby query and view-model helpers.
- `apps/mobile/src/cache.ts`: versioned, user-scoped snapshot storage.
- `apps/mobile/src/offlineQueue.ts`: serialized persistent queue and immutable operation types.
- `apps/mobile/src/sync.ts`: single-flight FIFO replay and outcome classification.
- `apps/mobile/src/CorporateApp.tsx`: orchestration, navigation, offline status, and user feedback only.
- `apps/mobile/src/*.unit.test.mjs`: transpiled TypeScript unit tests using the established Node test pattern.
- `apps/mobile/src/*.smoke.test.mjs`: UI/source wiring contracts.
- `.github/workflows/operations-ci.yml`: admin search test gate.
- `.github/workflows/android-apk.yml`: all mobile unit/smoke test gates; build artifact remains CI-only.
- `docs/V1_TODO.md`: closes each accepted item and removes favorites from V1 scope.

---

### Task 1: Admin former-name alias search

**Files:**
- Create: `apps/admin/app/operations.search.smoke.test.mjs`
- Modify: `apps/admin/app/operations.tsx`
- Modify: `.github/workflows/operations-ci.yml`
- Modify: `docs/V1_TODO.md`

**Interfaces:**
- Consumes: `GET /points` records whose `aliases` property is `string[]`.
- Produces: admin filtering that includes `point.aliases` without changing status/region filtering.

- [ ] **Step 1: Write the failing source contract**

```js
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('admin point search includes former-name aliases', () => {
  assert.match(source, /type Point = \{[\s\S]*aliases\?: string\[\]/);
  assert.match(source, /\.\.\.\(point\.aliases \?\? \[\]\)/);
});
```

- [ ] **Step 2: Run RED and confirm the expected failure**

Run: `node --test apps/admin/app/operations.search.smoke.test.mjs`

Expected: FAIL because `Point` has no `aliases` and the search haystack does not spread aliases.

- [ ] **Step 3: Add the minimal alias-aware search**

```tsx
type Point = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  aliases?: string[];
  // existing fields remain unchanged
};

const searchValues = [
  point.code,
  point.name,
  point.address ?? '',
  point.region?.name ?? '',
  ...(point.aliases ?? []),
];
const searchOk = !q || searchValues.join(' ').toLocaleLowerCase('tr-TR').includes(q);
```

- [ ] **Step 4: Add the new smoke test to Operations CI**

Add the file to both workflow path filters and run:

```yaml
- name: Admin point operation smoke tests
  run: >-
    node --test
    apps/admin/app/operations.bulk.smoke.test.mjs
    apps/admin/app/operations.search.smoke.test.mjs
```

- [ ] **Step 5: Run GREEN and regression**

Run:

```bash
node --test apps/admin/app/operations.search.smoke.test.mjs apps/admin/app/operations.bulk.smoke.test.mjs
npm --prefix apps/admin run lint
npm --prefix apps/admin run build
```

Expected: all tests pass, TypeScript exits 0, Next.js build exits 0.

- [ ] **Step 6: Close only the admin search item in the roadmap**

Change the search line to `[x]`, state that admin and technician surfaces cover aliases, and remove the favorites/pinned/recent line from P1 and current priorities.

- [ ] **Step 7: Commit, review, CI, merge, and selective deploy**

```bash
git add apps/admin/app/operations.tsx apps/admin/app/operations.search.smoke.test.mjs .github/workflows/operations-ci.yml docs/V1_TODO.md
git commit -m "feat: search admin points by former names"
```

Request code review. Push a task-specific branch, open a PR, and require exact-SHA Operations CI plus any other triggered workflow to be `completed/success`. Merge, require the merge SHA workflows to be `completed/success`, then selectively patch only the admin files and roadmap document in production. Verify admin/API health without touching unrelated production files.

---

### Task 2: Dedicated `YAKINIMDAKİLER` list

**Files:**
- Create: `apps/mobile/src/nearby.ts`
- Create: `apps/mobile/src/nearby.unit.test.mjs`
- Create: `apps/mobile/src/nearby.smoke.test.mjs`
- Modify: `apps/mobile/src/api.ts`
- Modify: `apps/mobile/src/CorporateApp.tsx`
- Modify: `.github/workflows/android-apk.yml`
- Modify: `docs/V1_TODO.md`

**Interfaces:**
- Produces: `NearbyPoint`, `NearbyPointsResult`, `nearbyPoints(input, request?)`, `sortNearbyItems(items)`, and a `NEARBY` screen.
- `nearbyPoints(input: { latitude: number; longitude: number; radiusMeters?: number; limit?: number }, request?: <T>(path: string) => Promise<T>): Promise<NearbyPointsResult>` calls `/points/nearby` with encoded query parameters. The optional requester defaults to `jsonRequest` and exists only for deterministic contract tests.
- `sortNearbyItems(items: NearbyPoint[]): NearbyPoint[]` returns a copy ordered by `distanceMeters`, then name/code for deterministic ties.

- [ ] **Step 1: Write failing API and pure-helper tests**

Use the existing TypeScript transpilation helper pattern and assert:

```js
test('nearby query uses approved defaults and encodes coordinates', async () => {
  const paths = [];
  const result = await nearbyPoints(
    { latitude: 38.4192, longitude: 27.1287 },
    async path => { paths.push(path); return { count: 0, items: [] }; },
  );
  assert.equal(paths[0], '/points/nearby?latitude=38.4192&longitude=27.1287&radiusMeters=10000&limit=100');
  assert.equal(result.count, 0);
});

test('nearby results are ordered by server distance', () => {
  assert.deepEqual(sortNearbyItems([{ id: 'b', distanceMeters: 20 }, { id: 'a', distanceMeters: 10 }]).map(x => x.id), ['a', 'b']);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test apps/mobile/src/nearby.unit.test.mjs apps/mobile/src/nearby.smoke.test.mjs`

Expected: FAIL because the helper, API types, and `NEARBY` UI do not exist.

- [ ] **Step 3: Add typed nearby API and explicit HTTP errors**

```ts
export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) { super(message); }
  get isTransportFailure() { return this.status === undefined; }
}

export type NearbyPoint = {
  id: string; code: string; name: string; address: string | null;
  regionId: string | null; regionName: string | null;
  latitude: number; longitude: number; distanceMeters: number; assignmentSource: string;
};

export type NearbyPointsResult = {
  origin: { latitude: number; longitude: number };
  radiusMeters: number; limit: number; count: number; items: NearbyPoint[];
};
```

Make `jsonRequest` throw `ApiError` with HTTP status and optional `body.code`; wrap fetch exceptions as status-less `ApiError`. Add `nearbyPoints` with 10,000 m and 100-result defaults.

- [ ] **Step 4: Add the nearby screen and navigation**

Add `NEARBY` to `Screen`, a bottom navigation entry labeled `Yakınımdakiler`, and state for loading/error/results. On open/refresh, request foreground permission, require enabled services, capture balanced-accuracy coordinates, call `nearbyPoints`, and display distance-sorted cards with the existing directions action.

The smoke test must assert source contracts for `NEARBY`, `YAKINIMDAKİLER`, permission-denied copy, location-services-disabled copy, empty state, and `distanceMeters` rendering.

- [ ] **Step 5: Extend Android CI tests**

Run all mobile Node tests with one glob-safe explicit command:

```yaml
- name: Mobile unit and smoke tests
  run: node --test apps/mobile/src/*.test.mjs
```

- [ ] **Step 6: Run GREEN and regression**

```bash
node --test apps/mobile/src/*.test.mjs
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run bundle:android
```

Expected: tests, TypeScript, and Android export pass.

- [ ] **Step 7: Commit and pass the full delivery gate**

```bash
git add apps/mobile/src/api.ts apps/mobile/src/nearby.ts apps/mobile/src/nearby.unit.test.mjs apps/mobile/src/nearby.smoke.test.mjs apps/mobile/src/CorporateApp.tsx .github/workflows/android-apk.yml docs/V1_TODO.md
git commit -m "feat: add nearby technician point list"
```

Review, exact-SHA Android CI, merge, post-merge exact-SHA Android CI, then selectively deploy only mobile source/config/docs files. Do not distribute the generated APK.

---

### Task 3: In-app map sharing the nearby result set

**Files:**
- Create: `apps/mobile/src/NearbyScreen.tsx`
- Create: `apps/mobile/src/nearby-map.smoke.test.mjs`
- Modify: `apps/mobile/src/CorporateApp.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/android-apk.yml`
- Modify: `docs/V1_TODO.md`

**Interfaces:**
- Consumes: `NearbyPoint[]`, current origin, refresh callback, and existing directions callback from Task 2.
- Produces: `<NearbyScreen mode="LIST" | "MAP">` with one `selectedPointId` across list and map modes.

- [ ] **Step 1: Write the failing map wiring test**

```js
test('nearby screen uses one result set for list and map', () => {
  assert.match(source, /import MapView, \{ Marker \} from 'react-native-maps'/);
  assert.match(source, /mode.*'LIST'.*'MAP'/s);
  assert.match(source, /items\.map\(point =>.*<Marker/s);
  assert.match(source, /selectedPointId/);
  assert.match(source, /Yol tarifi/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test apps/mobile/src/nearby-map.smoke.test.mjs`

Expected: FAIL because `NearbyScreen.tsx` and `react-native-maps` are absent.

- [ ] **Step 3: Install the Expo SDK 54-compatible map library**

Run with `apps/mobile` as the working directory:

```bash
npx expo install react-native-maps@1.20.1
```

Verify `apps/mobile/package.json` and `package-lock.json` contain `react-native-maps` 1.20.1.

- [ ] **Step 4: Extract and implement `NearbyScreen`**

```tsx
export type NearbyScreenProps = {
  items: NearbyPoint[];
  origin: { latitude: number; longitude: number } | null;
  loading: boolean;
  cachedAt?: string;
  refresh(): void;
  directions(point: NearbyPoint): void;
};
```

Render LIST/MAP segmented controls. Map mode uses `MapView`, `Marker`, `showsUserLocation`, and an initial region derived from the current origin or first point. Marker press sets `selectedPointId`; the selected card below the map exposes point details and directions. Empty/error/location states remain outside the map.

- [ ] **Step 5: Wire `CorporateApp` to the extracted screen**

Replace only the nearby presentation block; retain Task 2's fetch/location orchestration and shared `NearbyPoint[]`. Do not duplicate API calls between list and map modes.

- [ ] **Step 6: Run GREEN and native build regression**

```bash
node --test apps/mobile/src/*.test.mjs
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run bundle:android
npx expo prebuild --platform android --no-install
```

Expected: tests/typecheck/export/prebuild pass and generated Android project resolves `react-native-maps`. Google Maps production credentials are configured only during the excluded distribution step; no key is committed.

- [ ] **Step 7: Commit and pass the full delivery gate**

```bash
git add apps/mobile/src/NearbyScreen.tsx apps/mobile/src/nearby-map.smoke.test.mjs apps/mobile/src/CorporateApp.tsx apps/mobile/package.json package-lock.json .github/workflows/android-apk.yml docs/V1_TODO.md
git commit -m "feat: add in-app nearby map"
```

Review, exact-SHA Android CI, merge, post-merge exact-SHA Android CI, and selectively deploy mobile source/dependency/docs files. Do not download, publish, or distribute the APK artifact.

---

### Task 5: Offline task/customer/nearby snapshots

**Files:**
- Create: `apps/mobile/src/cache.ts`
- Create: `apps/mobile/src/cache.unit.test.mjs`
- Create: `apps/mobile/src/offline-cache.smoke.test.mjs`
- Modify: `apps/mobile/src/CorporateApp.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `package-lock.json`
- Modify: `docs/V1_TODO.md`

**Interfaces:**
- Produces: `SnapshotKind = 'dashboard' | 'customers' | 'nearby'`, `writeSnapshot`, `readSnapshot`, and `networkFirst`.
- `writeSnapshot<T>(storage, userId, kind, payload, savedAt?): Promise<void>` writes a version-1 envelope.
- `readSnapshot<T>(storage, userId, kind): Promise<Snapshot<T> | null>` rejects malformed/version/user-mismatched envelopes by returning `null`.
- `networkFirst<T>(load, cached): Promise<{ data: T; source: 'network' | 'cache'; savedAt?: string }>` falls back only for `ApiError.isTransportFailure`.

- [ ] **Step 1: Write failing cache tests**

Cover exact key isolation, schema version, malformed JSON, mismatched `userId`, successful replacement, transport fallback, and refusal to fall back for HTTP 401/403/400.

```js
await writeSnapshot(storage, 'tech-a', 'customers', [{ id: 'p1' }], '2026-09-18T10:00:00.000Z');
assert.deepEqual((await readSnapshot(storage, 'tech-a', 'customers')).payload, [{ id: 'p1' }]);
assert.equal(await readSnapshot(storage, 'tech-b', 'customers'), null);
```

- [ ] **Step 2: Run RED**

Run: `node --test apps/mobile/src/cache.unit.test.mjs apps/mobile/src/offline-cache.smoke.test.mjs`

Expected: FAIL because cache APIs and dependency are absent.

- [ ] **Step 3: Install AsyncStorage and implement the cache module**

```bash
npx expo install @react-native-async-storage/async-storage@2.2.0
```

```ts
type Snapshot<T> = { schemaVersion: 1; userId: string; savedAt: string; payload: T };
const snapshotKey = (userId: string, kind: SnapshotKind) => `fmp.snapshot.v1.${userId}.${kind}`;
```

Run the install command with `apps/mobile` as the working directory. Use a structural guard for parsed envelopes and never store token/session data. Include a rejected-write test so storage failure cannot be mistaken for a saved snapshot.

- [ ] **Step 4: Integrate network-first loading**

For dashboard, customers, and nearby, write only successful network results. On transport failure, read the same user's snapshot, render it, and show `Çevrimdışı kayıt · <saved time>`. For nearby data, label cached distance as last-known rather than current. HTTP authentication/authorization/domain errors keep the current alert behavior and do not use cached data. If a network result is usable but snapshot persistence fails, keep the network result visible and show a storage warning. On sign-out, clear task/customer/nearby React state while retaining disk snapshots under the signed-out user's isolated key.

- [ ] **Step 5: Test and regress**

```bash
node --test apps/mobile/src/*.test.mjs
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run bundle:android
```

- [ ] **Step 6: Commit and pass the full delivery gate**

```bash
git add apps/mobile/src/cache.ts apps/mobile/src/cache.unit.test.mjs apps/mobile/src/offline-cache.smoke.test.mjs apps/mobile/src/CorporateApp.tsx apps/mobile/package.json package-lock.json docs/V1_TODO.md
git commit -m "feat: cache field data for offline reading"
```

Review, exact-SHA Android CI, merge, post-merge exact-SHA Android CI, and selectively deploy. Do not distribute APK output.

---

### Task 6: Persistent offline maintenance queue

**Files:**
- Create: `apps/mobile/src/offlineQueue.ts`
- Create: `apps/mobile/src/offlineQueue.unit.test.mjs`
- Create: `apps/mobile/src/offline-queue.smoke.test.mjs`
- Modify: `apps/mobile/src/api.ts`
- Modify: `apps/mobile/src/CorporateApp.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `package-lock.json`
- Modify: `docs/V1_TODO.md`

**Interfaces:**
- Produces: discriminated `QueuedOperation`, `enqueueOperation`, `listOperations`, `replaceOperations`, `discardOperation`, and `queueableMaintenanceCall`.
- Queue states are `PENDING | SYNCING | CONFLICT`; operations are `COMPLETE_MAINTENANCE | RECORD_ATTEMPT`.
- Every queue method requires `userId`; keys are `fmp.queue.v1.<userId>`.

- [ ] **Step 1: Write failing queue tests**

```js
const item = await enqueueOperation(storage, 'tech-a', {
  kind: 'RECORD_ATTEMPT',
  payload: { pointId: 'p1', idempotencyKey: 'attempt-fixed-key' },
});
assert.equal(item.payload.idempotencyKey, 'attempt-fixed-key');
assert.equal((await listOperations(storage, 'tech-a'))[0].state, 'PENDING');
assert.deepEqual(await listOperations(storage, 'tech-b'), []);
```

Also test FIFO order, concurrent enqueues through the serialized mutation chain, malformed storage, and write failure propagation.

- [ ] **Step 2: Run RED**

Run: `node --test apps/mobile/src/offlineQueue.unit.test.mjs apps/mobile/src/offline-queue.smoke.test.mjs`

Expected: FAIL because the queue APIs and UI state are absent.

- [ ] **Step 3: Install NetInfo and implement immutable queue records**

Run with `apps/mobile` as the working directory:

```bash
npx expo install @react-native-community/netinfo@11.4.1
```

```ts
export type QueuedOperation = {
  localId: string;
  userId: string;
  kind: 'COMPLETE_MAINTENANCE' | 'RECORD_ATTEMPT';
  payload: CompleteMaintenanceInput | MaintenanceAttemptInput;
  createdAt: string;
  attemptCount: number;
  lastAttemptAt?: string;
  state: 'PENDING' | 'SYNCING' | 'CONFLICT';
  error?: { status?: number; code?: string; message: string };
};
```

Create the payload and idempotency key before the first HTTP attempt. Serialize each user's read-modify-write mutation with a promise chain. Never mutate a stored payload during retries.

- [ ] **Step 4: Queue only transport failures or known-offline actions**

Refactor completion/attempt API input types into exported types. For each action: capture and validate current location, construct one immutable payload, attempt online submission, and enqueue that same payload only when NetInfo reports offline or `ApiError.isTransportFailure`. If persistence fails, show `İşlem bu cihaza kaydedilemedi`; never show a queued-success message.

Show `Cihazda bekliyor` plus a pending count. Completed maintenance navigates to success with a queued qualifier; an attempt retains the existing “task remains open” rule.

- [ ] **Step 5: Test and regress**

```bash
node --test apps/mobile/src/*.test.mjs
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run bundle:android
```

- [ ] **Step 6: Commit and pass the full delivery gate**

```bash
git add apps/mobile/src/offlineQueue.ts apps/mobile/src/offlineQueue.unit.test.mjs apps/mobile/src/offline-queue.smoke.test.mjs apps/mobile/src/api.ts apps/mobile/src/CorporateApp.tsx apps/mobile/package.json package-lock.json docs/V1_TODO.md
git commit -m "feat: queue maintenance actions offline"
```

Review, exact-SHA Android CI, merge, post-merge exact-SHA Android CI, and selective mobile deployment. Do not distribute the APK.

---

### Task 7: Automatic synchronization and visible conflicts

**Files:**
- Create: `apps/mobile/src/sync.ts`
- Create: `apps/mobile/src/sync.unit.test.mjs`
- Create: `apps/mobile/src/sync-status.smoke.test.mjs`
- Create: `apps/api/src/maintenance/maintenance-idempotency-response.spec.ts`
- Modify: `apps/api/src/maintenance/maintenance.service.ts`
- Modify: `apps/mobile/src/CorporateApp.tsx`
- Modify: `.github/workflows/reporting-ci.yml`
- Modify: `docs/V1_TODO.md`

**Interfaces:**
- Produces: `createSyncService(deps)` with `sync(userId): Promise<SyncSummary>` and single-flight behavior.
- `SyncSummary = { synced: number; pending: number; conflicts: number; authRequired: boolean }`.
- Retryable: transport/5xx. Auth stop: 401/403. Conflict: other 400/404/409/422. Structured `IDEMPOTENCY_REPLAY` is success.

- [ ] **Step 1: Write failing server idempotency-response test**

Assert that a Prisma `P2002` race from maintenance completion/attempt throws a `ConflictException` whose status is 409 and whose response body is:

```ts
{
  code: 'IDEMPOTENCY_REPLAY',
  message: 'Bu bakım kaydı zaten işlendi'
}
```

Normal pre-existing idempotency keys must continue returning the existing record with success.

- [ ] **Step 2: Write failing sync tests**

Use in-memory queue/API fakes and verify: FIFO; success removal; structured replay removal; transport/5xx returns to `PENDING`; validation becomes `CONFLICT`; 401/403 stops without processing later records; concurrent calls share one promise; payload/idempotency key remain byte-for-byte equivalent; successful replay followed by refresh failure does not restore the item.

- [ ] **Step 3: Run RED**

```bash
node --test --require ts-node/register apps/api/src/maintenance/maintenance-idempotency-response.spec.ts
node --test apps/mobile/src/sync.unit.test.mjs apps/mobile/src/sync-status.smoke.test.mjs
```

Expected: both commands fail for missing structured error and sync service.

- [ ] **Step 4: Add the structured race response**

Replace only `P2002` conflict construction in completion and attempt paths:

```ts
throw new ConflictException({
  code: 'IDEMPOTENCY_REPLAY',
  message: 'Bu bakım kaydı zaten işlendi',
});
```

Use the attempt-specific Turkish message in the attempt path. Add the new test file to Reporting CI's maintenance regression command and workflow path coverage is already satisfied by `apps/api/src/maintenance/**`.

- [ ] **Step 5: Implement single-flight FIFO sync using Task 6's NetInfo dependency**

```ts
export function createSyncService(deps: SyncDependencies) {
  let inFlight: Promise<SyncSummary> | null = null;
  return {
    sync(userId: string) {
      if (inFlight) return inFlight;
      inFlight = runSync(userId, deps).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
```

Before sending, mark the current record `SYNCING` and increment attempts. On completion apply the exact classification in Interfaces, persist after every transition, and stop on auth errors.

- [ ] **Step 6: Wire triggers and conflict UI**

Subscribe with `NetInfo.addEventListener`; invoke sync after session restore/login, on transition to reachable online, after manual refresh, and after enqueue if reachable. Unsubscribe on unmount and never replay another user's queue.

Display pending/conflict counts and a conflict panel with point/action/time/sanitized reason. Retry changes only state/error metadata back to `PENDING`; discard requires `Alert.alert` confirmation. A successful pass refreshes tasks/customers but does not re-add removed operations if refresh fails.

- [ ] **Step 7: Run task regression**

```bash
node --test --require ts-node/register apps/api/src/maintenance/maintenance-idempotency-response.spec.ts apps/api/src/maintenance/maintenance-revert.spec.ts apps/api/src/maintenance/maintenance-engine.service.spec.ts
node --test apps/mobile/src/*.test.mjs
npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run bundle:android
```

- [ ] **Step 8: Run complete repository-relevant regression**

```bash
npm --prefix apps/api run prisma:generate
node --test --require ts-node/register apps/api/src/points/*.spec.ts
node --test --require ts-node/register apps/api/src/maintenance/*.spec.ts
node --test apps/admin/app/*.smoke.test.mjs
node --test apps/mobile/src/*.test.mjs
npm --prefix apps/admin run lint
npm --prefix apps/admin run build
```

Use explicit known test file lists instead of a wildcard if Node treats unrelated integration tests as environment-dependent.

- [ ] **Step 9: Close the roadmap accurately**

Mark offline queue and auto-sync/conflict handling complete; keep final Android distribution as the only remaining mobile release action but do not execute it. Confirm favorites/pinned/recent remains absent rather than completed.

- [ ] **Step 10: Commit, review, CI, merge, selective deploy, and verify**

```bash
git add apps/api/src/maintenance/maintenance.service.ts apps/api/src/maintenance/maintenance-idempotency-response.spec.ts apps/mobile/src/sync.ts apps/mobile/src/sync.unit.test.mjs apps/mobile/src/sync-status.smoke.test.mjs apps/mobile/src/CorporateApp.tsx .github/workflows/reporting-ci.yml docs/V1_TODO.md
git commit -m "feat: synchronize queued maintenance safely"
```

Request final code review. Require exact-SHA Reporting CI and Android CI `completed/success`; merge; require both on the merge SHA `completed/success`. Selectively deploy only changed API/mobile/docs files, run the required service build/restart without overwriting production-only files, verify API health and logs, and confirm queued/offline behavior with non-destructive checks. Stop before final APK distribution.

## Completion Record

At the end, report for every task: PR number, head SHA, pre-merge successful workflows, merge SHA, post-merge successful workflows, selective production files/services, health evidence, and any intentionally deferred APK credential/distribution work. Do not mark the program complete if any required workflow is not `completed/success`.
