# Task 6 Report — Location-flow regression

## Runner gate and RED evidence

The first API command was run from the repository root:

`node --test --require ts-node/register apps/api/src/maintenance/maintenance-location-flow.spec.ts`

It failed before loading the test with
`ERR_MODULE_NOT_FOUND: Cannot find module .../maintenance.service`.
An adjacent existing API spec uses extensionless imports successfully when the
package working directory owns ts-node resolution. Hypothesis: invoking Node
from the repository root selected the root ESM package context instead of the
API package's CommonJS/ts-node context.

The same file was therefore run without code changes from `apps/api`:

`node --test --require ts-node/register src/maintenance/maintenance-location-flow.spec.ts`

This reached behavior: Evet passed, while Hayır failed because
`locationLearning.refreshPoint()` was called (expected false, actual true).
The mobile behavior test failed 4/4 on the missing real decision boundary,
before any production implementation was added.

## Minimal GREEN

- Added a real mobile decision boundary for past-date, trusted <=250 m, and
  current-date mismatch paths.
- The mismatch dialog renders, in order, `Evet, noktadayım`,
  `Hayır, ama bakımı yaptım`, and `İptal et`.
- Both confirmation paths save exactly once; cancel/close/back performs no
  persistence.
- Captured accuracy is propagated as received; no sentinel such as 999 exists.
- False presence persists a valid completed visit and completed obligation,
  but skips both point-location refresh and Google place matching. The anomaly
  scan remains safe because it filters false-presence visits.
- Past dates still save without GPS and refresh the task list without location.

Focused GREEN:
- mobile location flow: 4/4
- API location flow: 2/2

## Regression evidence

- all mobile tests: 58/58 pass
- all API maintenance specs: 120/120 pass
- mobile TypeScript: pass
- API TypeScript: pass
- API Nest build: pass
- Expo Android export: pass
- `git diff --check`: pass

No APK was published and no emulator evidence was fabricated. The Android
export was a local compile/bundle verification only.

## Scope and review

Changed only the mobile location decision boundary, its mobile regression
test, the API maintenance post-processing gate, its API regression test, and
this report. Existing unrelated untracked reports were preserved and are not
part of the task commit.

Self-review found no Critical, Important, or Minor issue. The mismatch path
always leaves the visit status `VALID` and the obligation `COMPLETED`;
location evidence affects review/learning only, never maintenance completion.
No production, main, push, merge, deploy, credential, mockup, guide, or APK
publication action was performed.
