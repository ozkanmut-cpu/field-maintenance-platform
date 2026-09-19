# Mobile Field Flow Simplification Implementation Plan

**Goal:** Make technician maintenance entry faster by removing routine technical information and by treating missing equipment as an editable zero-value first visit.

## Ordered TODO

- [x] 1. Simplify shared mobile header and login
  - Move logout into profile/account action; remove it from working screens.
  - Keep login credentials at the top of the login screen; remove explanatory/technical copy.
  - Update mobile accessibility smoke coverage for the changed controls.

- [x] 2. Simplify the Jobs screen
  - Make help mode a selector under “Kendi İşlerim”; remove the large standalone “Yardım Et” action.
  - Reduce task-card content to status, name, code/region, meaningful equipment warning and open detail affordance.

- [x] 3. Make addresses actionable and hide technical location data
  - Show saved address and “Yol Tarifi” in task/customer detail.
  - Remove visible coordinates, match source, confidence and ordinary location-review warnings.
  - Preserve existing backend location capture/review rules; show a short decision prompt only when a confirmation is genuinely required on save.

- [x] 4. Replace missing-equipment confirmation with zero-based entry
  - When any equipment field is absent, initialize all four counters at zero and open the compact stepper editor immediately.
  - Do not offer “Bilgiler doğru” for an incomplete profile.
  - Keep zero/non-negative-integer validation, idempotency and frozen retry payload behavior.

- [x] 5. Make known-equipment maintenance one-touch
  - Show the four stored counts as a compact summary.
  - Make “Bakımı Kaydet” the only primary action; retain a small “Düzenle” action for changes.
  - Do not show a diff unless the technician has changed a count.

- [x] 6. Remove child-screen navigation clutter
  - Hide the bottom tab bar in task detail, completion, failed-maintenance and customer detail.
  - Preserve explicit back navigation and sticky primary actions.

- [x] 7. Add targeted regression tests
  - Missing equipment starts from four zeros and cannot use the confirmation shortcut.
  - Stored equipment submits directly without entering edit mode.
  - Address/directions are visible while coordinates and location-source copy are not.
  - Routine completion hides location-review copy; a genuinely required confirmation still occurs at save.
  - Login/header and child-screen navigation meet accessibility expectations.

- [ ] 8. Validate and distribute
  - Run mobile unit/smoke tests, mobile TypeScript lint, API maintenance regression and Android APK workflow.
  - Update draft PR #54 and issue a replacement test APK only after exact-SHA Android CI succeeds.

- [x] 9. Add short post-save undo protection
  - After a successful maintenance save, offer a time-limited “Geri Al” action that uses the existing revert endpoint.
  - Keep destructive confirmation for a completed/revisited revert outside the short post-save window.

- [x] 10. Shorten failed-maintenance reporting
  - Present the four existing reasons as large single-tap choices.
  - Reveal the optional note field only for “Diğer”; retain existing backend reason/note behavior.

- [x] 11. Strengthen field feedback and search clarity
  - Show inline retry state when a save or load fails, without making the technician guess whether data was lost.
  - Indicate the matching customer identifier in search results when the match is alias, code, region or address rather than the visible name.
  - Keep overdue/weekly priority before distance; use distance only to order equal-priority work.

- [x] 12. Keep secondary actions out of the primary maintenance path
  - Add optional customer call action only when the backend exposes a valid customer phone number.
  - Keep customer-equipment administration distinct from fast maintenance entry.
  - Reduce successful-maintenance feedback to point name, confirmation and “Sonraki İşe Geç”.

- [x] 13. Add compact account/profile surface
  - Move logout, user identity and application version into a small profile/account surface.
  - Do not reintroduce these controls into work, task-detail or completion headers.

## Constraints

- Do not change maintenance engine, assignment rules, location-review rules, API idempotency or production.
- Do not merge or deploy without separate approval.
