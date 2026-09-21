# Task 4 Report — Past-date Maintenance UX

## Status

Implemented and verified in the isolated
`docs/mobile-api-sap-reconciliation` worktree. The task commit is the commit
that contains this report, with subject:

`feat: harden past-date maintenance UX`

No production checkout, main branch, push, merge, deploy, credential, or
database operation was performed.

## Behavior delivered

- The maintenance date defaults to today.
- The minimum selectable date is Monday of the previous week.
- Earlier and future calendar dates remain visible but disabled.
- The date selector is an Android-compatible modal calendar.
- Android Back closes the calendar through `Modal.onRequestClose`.
- The calendar sheet uses the bottom safe-area inset above Android navigation.
- Past dates require a non-blank retrospective reason.
- Past-date requests carry no location, presence, accuracy, or GPS timestamps.
- Past-date API processing skips location evaluation, review, matching,
  anomaly scanning, and location learning.
- Saved past-date records return `pastDated: true`, write the same marker into
  the late-entry audit, and show an explicit historical success state.
- Today/normal maintenance, including the existing >250 m three-choice flow,
  remains unchanged.

## Changed files

- `apps/mobile/src/maintenance-date.ts`
- `apps/mobile/src/past-date-maintenance.unit.test.mjs`
- `apps/mobile/src/maintenance-date.smoke.test.mjs`
- `apps/mobile/src/CorporateApp.tsx`
- `apps/api/src/maintenance/maintenance-date-complete.spec.ts`
- `apps/api/src/maintenance/maintenance.service.ts`

## RED evidence

Mobile command:

```text
node --test apps/mobile/src/past-date-maintenance.unit.test.mjs \
  apps/mobile/src/maintenance-date.smoke.test.mjs
tests 5, pass 1, fail 4
```

Expected failures were the missing date-policy module, Android modal/safe-area
contract, and historical success marker.

The plan's generic API command could not run because `@fmp/api` has no
`test` lifecycle. A first direct invocation from repository root then failed
before assertions with `ERR_MODULE_NOT_FOUND` for the extensionless
`maintenance.service` import.

Root-cause hypothesis: the established ts-node runner requires the API
workspace as its current directory so its TypeScript/module configuration is
resolved consistently. The smallest runner-only check used the adjacent CI
pattern:

```text
cd apps/api
node --test --require ts-node/register \
  src/maintenance/maintenance-date-complete.spec.ts
tests 3, pass 1, fail 2
```

That reached the intended RED assertions: `pastDated` was undefined and a
whitespace-only retrospective reason was accepted.

## GREEN evidence

Focused mobile:

```text
node --test apps/mobile/src/past-date-maintenance.unit.test.mjs \
  apps/mobile/src/maintenance-date.smoke.test.mjs
tests 5, pass 5, fail 0
```

Focused API:

```text
cd apps/api
node --test --require ts-node/register \
  src/maintenance/maintenance-date-policy.spec.ts \
  src/maintenance/maintenance-date-complete.spec.ts
tests 6, pass 6, fail 0
```

The API test uses location-service spies and proves the call list stays empty
for a retrospective completion.

## Regression and build evidence

```text
node --test apps/mobile/src/*.test.mjs
tests 46, pass 46, fail 0

cd apps/api
node --test --require ts-node/register \
  src/maintenance/maintenance-date-policy.spec.ts \
  src/maintenance/maintenance-date-complete.spec.ts \
  src/maintenance/maintenance-location-policy.spec.ts \
  src/maintenance/maintenance-location-review.spec.ts \
  src/maintenance/partial-maintenance.spec.ts \
  src/maintenance/partial-maintenance-contract.spec.ts
tests 36, pass 36, fail 0

npm run lint -w @fmp/mobile
tsc --noEmit — pass

npm run lint -w @fmp/api
tsc --noEmit — pass

npm run bundle:android -w @fmp/mobile
Android Bundled, Expo export completed — pass

npm run build -w @fmp/api
nest build — pass

git diff --check
pass
```

## Review

Self-review was used because the assignment explicitly prohibits subagents.
The normal save function and >250 m Alert decision branch have no behavioral
diff. The past save function contains no Location API call, current-location
call, coordinate, accuracy, captured-at, or presence field. The API invokes
location policy and post-processing only when `locationRequired` is true.

No remaining Critical, Important, or Minor findings were identified.

## Concerns

- `adb` is not installed on the remote VDS (`command -v adb` returned
  `ADB_ABSENT`). Final emulator interaction/screenshots are therefore
  pending; none were fabricated.
- The repository has no aggregate API `npm test` script. Verification used
  the repository's established direct Node/ts-node runner for the six related
  suites, plus API type-check and build.
- Historical state uses the existing persisted `enteredLate` column and adds
  an explicit derived `pastDated` response/audit marker; no schema or
  migration was required.
