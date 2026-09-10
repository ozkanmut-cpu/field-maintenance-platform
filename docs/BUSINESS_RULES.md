# V1 Business Rules

## Point status

- `ACTIVE`: working/selling point; maintenance required.
- `PASSIVE`: equipment still installed, point not selling; no maintenance obligation while passive.
- `CANCELLED`: equipment removed; operationally closed; no maintenance obligation.
- Only `ACTIVE` points generate maintenance obligations.
- Historical maintenance and status changes are never deleted.
- `PASSIVE -> ACTIVE` returns the point to planning.
- `CANCELLED -> ACTIVE` is admin-only and history remains.

## Assignment

- Every point belongs to one region.
- Every region has a designated technician.
- Normal assignment is inherited `Point -> Region -> Technician`.
- Point-specific technician assignment exists only as an exception.
- Temporary technician assignment may have an expiry/revert date.
- All assignment changes are audited.

## Standard maintenance

- A Standard point has fixed `maintenance_week = 1 | 2`.
- Frequency is every two weeks.
- No fixed weekday is required inside the assigned week.
- Late completion never shifts the assigned week.
- Never calculate Standard due as `last_completed_at + 14 days`.
- Admin may change Week 1 / Week 2; the change is audited.

## SmartClean

- SmartClean is separate from Standard and has no Week 1 / Week 2.
- Exact rule: `next_due = last valid actual maintenance date + 2 calendar months`.
- This is not 60 days.
- Late SmartClean completion shifts the next due because the actual valid completion date is the source.
- New SmartClean points without history require a configurable reference/start date.

## Priority

Priority is deterministic and must never be changed by AI:

1. Past-period overdue obligations.
2. Current-period Standard obligations and due SmartClean.
3. Completed work.

If multiple historical periods were missed, the technician can see one point row with an aggregate warning such as `3 periods overdue`, while reporting preserves each missed obligation historically.

## Maintenance completion

Normal `BAKIM YAPILDI`:
- captures current server/device time metadata,
- requires current device location service and permission,
- captures current location automatically,
- records expected obligation/period,
- records on-time/late classification,
- uses idempotency/duplicate protection.

If current location cannot be acquired, normal completion is blocked.

## Backdated maintenance

A technician may record a real maintenance later if they forgot to enter it at the time.

- `performed_at`: declared actual maintenance time/date.
- `recorded_at_server`: actual record creation time.
- `entered_late = true`.
- A short reason is required:
  - forgot to enter on time,
  - phone/internet problem,
  - other.
- The maintenance remains valid and closes the relevant obligation.
- It is automatically flagged as a backdated entry / review recommended.
- SmartClean next due uses `performed_at + 2 calendar months`.
- Current GPS captured during a later backdated entry is not historical maintenance-location evidence and cannot train/confirm canonical point location.

## Revert

- Technician can revert their own mistaken maintenance with confirmation.
- Admin can also revert/void.
- Revert never hard-deletes the visit.
- Reverted visit status is explicit (for example `REVERSED`).
- The obligation reopens.
- Reverted SmartClean visit is excluded from last valid maintenance.
- Reverted visits are hidden from technician daily history and paperwork gaps.

## Failed visit

Technician can record `BAKIM YAPILAMADI` with a short reason:
- business closed,
- authorized person unavailable,
- inaccessible,
- other.

This does not complete the obligation. The point remains due.

## Paperwork

For every valid maintenance:
- Service Slip: `PENDING | PRESENT | MISSING`
- Confirmation: `PENDING | PRESENT | MISSING`

Rules:
- New maintenance starts `PENDING`.
- Time passing never converts `PENDING` to `MISSING`.
- Only admin can mark `MISSING`.
- AI never decides `MISSING`.
- `MISSING` may later become `PRESENT`.
- All state changes are audited.
- Paperwork does not change maintenance validity and does not reopen maintenance obligations.
- Technician sees only admin-marked missing paperwork for their own valid maintenance.

## Location learning

- Visit GPS evidence and canonical point location are distinct.
- Strong nearby business-name/proximity matches can produce `GOOGLE_MATCH` evidence.
- Repeated consistent field visits can produce `FIELD_CONFIRMED` evidence.
- Manual location is possible for admin.
- Confidence: Unknown / Low / Medium / High / Verified.
- Weak evidence never silently overwrites a trusted canonical location.

## Anti-batch rule

If multiple different points are completed consecutively in a short period, especially with little actual GPS movement or implausible travel:
- maintenance remains valid unless separately reviewed,
- GPS remains audit evidence,
- that GPS evidence is ineligible for canonical location learning,
- the system creates a review suggestion rather than an accusation.

## AI boundaries

AI may:
- detect suspicious patterns,
- rank work within the same deterministic priority group,
- estimate workload/capacity,
- score location confidence,
- suggest probable duplicates/data anomalies,
- analyze paperwork trends.

AI must not:
- change point status,
- change Week 1/2,
- change SmartClean rules,
- mark maintenance completed,
- override overdue priority,
- decide paperwork is missing,
- delete/revert maintenance,
- change assignment,
- definitively label fraud,
- silently modify canonical data outside explicit confidence/admin rules.
