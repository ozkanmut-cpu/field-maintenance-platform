# Initial V1 Data Model

This is the first implementation-oriented model. Names may change as migrations and API contracts are built.

## Core entities

### users
- id
- name
- role (`ADMIN`, `TECHNICIAN`)
- active
- created_at / updated_at

### devices
- id
- user_id
- device_identifier
- first_seen_at / last_seen_at
- metadata JSONB

### regions
- id
- code
- name
- active
- created_at / updated_at

### region_assignments
- id
- region_id
- technician_id
- starts_at
- ends_at nullable
- assignment_type (`PRIMARY`, `TEMPORARY`)
- created_by

### points
- id
- point_code unique
- current_name
- address
- region_id
- status (`ACTIVE`, `PASSIVE`, `CANCELLED`)
- maintenance_type (`STANDARD`, `SMARTCLEAN`)
- maintenance_week nullable (`1`, `2`)
- smartclean_reference_date nullable
- canonical_location geography(Point,4326) nullable
- location_source nullable (`GOOGLE_MATCH`, `FIELD_CONFIRMED`, `MANUAL`)
- location_confidence nullable
- google_place_id nullable
- google_business_name nullable
- verified_at nullable
- deleted_at nullable
- created_at / updated_at

### point_aliases
- id
- point_id
- alias
- source
- valid_from / valid_to nullable

### point_assignment_exceptions
- id
- point_id
- technician_id
- starts_at
- ends_at nullable
- reason nullable
- created_by

### point_status_history
- id
- point_id
- old_status
- new_status
- changed_by
- changed_at
- reason nullable

### point_schedule_history
- id
- point_id
- old_maintenance_type
- new_maintenance_type
- old_week nullable
- new_week nullable
- old_smartclean_reference_date nullable
- new_smartclean_reference_date nullable
- changed_by
- changed_at

## Maintenance

### maintenance_obligations
Historical expected work records.
- id
- point_id
- obligation_type (`STANDARD`, `SMARTCLEAN`)
- cycle_key unique per point/period
- period_start
- period_end
- due_date nullable
- priority_class
- status (`DUE`, `OVERDUE`, `COMPLETED`, `CANCELLED_BY_STATUS_CHANGE`)
- completed_visit_id nullable
- created_at

For Standard, `cycle_key` represents the fixed assigned biweekly period. Standard generation must never be driven by `last_completed_at + 14 days`.

### maintenance_visits
- id
- point_id
- technician_id
- obligation_id nullable
- status (`VALID`, `REVERSED`)
- performed_at
- recorded_at_server
- device_time nullable
- entered_late boolean
- late_entry_minutes nullable
- late_entry_reason nullable
- latitude nullable
- longitude nullable
- gps_accuracy_m nullable
- location_captured_at nullable
- location_learning_eligible boolean
- on_time boolean nullable
- suspicious_batch boolean default false
- review_recommended boolean default false
- review_reason nullable
- idempotency_key unique
- reversed_at nullable
- reversed_by nullable
- created_at

### maintenance_attempts
For `BAKIM YAPILAMADI`.
- id
- point_id
- technician_id
- attempted_at
- reason
- latitude / longitude nullable
- gps_accuracy_m nullable
- created_at

## Paperwork

### maintenance_documents
One row per maintenance visit.
- id
- maintenance_visit_id unique
- service_slip_status (`PENDING`, `PRESENT`, `MISSING`)
- confirmation_status (`PENDING`, `PRESENT`, `MISSING`)
- service_slip_changed_at nullable
- confirmation_changed_at nullable
- service_slip_external_id nullable
- confirmation_external_id nullable

Status transitions are audited separately. Only admin may set `MISSING`.

## Location intelligence

### point_location_evidence
- id
- point_id
- maintenance_visit_id nullable
- evidence_type (`VISIT_GPS`, `GOOGLE_MATCH`, `FIELD_CONFIRMATION`, `MANUAL`)
- location geography(Point,4326)
- confidence_score nullable
- source_name nullable
- google_place_id nullable
- eligible_for_learning boolean
- exclusion_reason nullable
- captured_at

### location_match_attempts
- id
- point_id
- maintenance_visit_id nullable
- query_name
- candidate_place_id nullable
- candidate_name nullable
- distance_m nullable
- name_similarity nullable
- confidence_score nullable
- accepted boolean
- created_at

## Review / audit

### review_flags
- id
- entity_type
- entity_id
- flag_type
- severity
- reason
- source (`RULE`, `AI`)
- status (`OPEN`, `RESOLVED`, `DISMISSED`)
- created_at
- resolved_at nullable
- resolved_by nullable

### audit_log
- id
- actor_user_id nullable
- action
- entity_type
- entity_id
- old_values JSONB nullable
- new_values JSONB nullable
- metadata JSONB nullable
- server_time

## Key constraints

- `STANDARD` => maintenance_week is 1 or 2; SmartClean reference fields are not used for scheduling.
- `SMARTCLEAN` => maintenance_week is null.
- Only valid, non-reversed visits can satisfy obligations.
- Reverted visits cannot remain the SmartClean last-valid source.
- Backdated-entry current GPS cannot be eligible for historical point-location learning.
- Paperwork `MISSING` is an admin decision, never an elapsed-time rule.
- Critical operational history is never hard-deleted by normal application flows.
