# Task 5 Report — Android Back and Modal Semantics

## Status

Implemented and verified in the isolated
`docs/mobile-api-sap-reconciliation` worktree. The task commit is the commit
that contains this report, with subject:

`fix: handle Android back without unintended writes`

No production checkout, main branch, push, merge, deploy, secret, API, or
database operation was performed.

## Behavior delivered

- “Bakım yapılamadı” is an explicit React Native modal.
- Android Back, the close control, and “Vazgeç” dismiss it without selecting
  a reason or calling the attempt-record API.
- The >250 m/current-location decision is an explicit modal with the same
  dismissal semantics; only its two affirmative choices save.
- The existing calendar modal retains `onRequestClose` and bottom safe area.
- Android Back from the maintenance form clears pending form state and returns
  directly to İşler, even when the form was entered through Yardım Et.
- Android Back at the İşler root is consumed and cannot unintentionally exit.
- Other screens retain the existing previous-screen navigation behavior.

## Changed files

- `apps/mobile/src/CorporateApp.tsx`
- `apps/mobile/src/mobile-navigation.ts`
- `apps/mobile/src/mobile-navigation.unit.test.mjs`
- `apps/mobile/src/mobile-navigation.smoke.test.mjs`

## RED evidence

```text
node --test apps/mobile/src/mobile-navigation.unit.test.mjs
tests 8, pass 4, fail 4
```

All four required cases failed because `resolveHardwareBack` did not exist:
attempt modal, location modal, maintenance form → İşler, and root consumption.

The follow-on UI wiring smoke run failed 4/5 as expected because dialog state,
`onRequestClose`, and the modal-first hardware handler were absent.

## GREEN evidence

```text
node --test apps/mobile/src/mobile-navigation.unit.test.mjs \
  apps/mobile/src/mobile-navigation.smoke.test.mjs
tests 13, pass 13, fail 0
```

## Regression and build evidence

The first full run caught one source-boundary regression: the location-choice
helper was inside the past-date smoke test's protected source slice. Moving the
helper after `completeTask` restored the invariant without changing behavior.

```text
node --test apps/mobile/src/maintenance-date.smoke.test.mjs
tests 4, pass 4, fail 0

node --test apps/mobile/src/*.test.mjs
tests 53, pass 53, fail 0

npm run lint -w @fmp/mobile
tsc --noEmit — pass

npm run bundle:android -w @fmp/mobile
Android Bundled, Expo export completed — pass

git diff --check
pass
```

## Review and concerns

Self-review was used because the assignment explicitly prohibits subagents.
The attempt write remains reachable only after an explicit reason choice; the
location completion write remains reachable only after an explicit yes/no
choice. Calendar safe-area/back behavior and past-date, partial-maintenance,
non-maintenance, and API behavior have no functional changes.

No remaining Critical, Important, or Minor findings were identified.

`adb` is not installed on the remote device (`command -v adb` returned no
path), so emulator interaction evidence could not be gathered and none was
fabricated.

## Fix round 1/5 — exact location cancel copy

Reviewer finding: the >250 m dialog requires the three exact choices
“Evet, noktadayım”, “Hayır, ama bakımı yaptım”, and “İptal et”, while the
shared dialog hard-coded “Vazgeç”.

RED:

```text
node --test apps/mobile/src/mobile-navigation.smoke.test.mjs
tests 6, pass 5, fail 1
missing cancelLabel="İptal et" on the location dialog
```

Minimum fix:

- `DecisionModal` accepts an optional `cancelLabel`, defaulting to
  “Vazgeç” for attempted maintenance and any existing/default use.
- Only the location dialog passes `cancelLabel="İptal et"`.
- The label still invokes `onRequestClose`; Back/cancel cannot write.

GREEN and regressions:

```text
focused navigation/modal: tests 14, pass 14, fail 0
all mobile: tests 54, pass 54, fail 0
mobile TypeScript: pass
Expo Android export: pass
```
