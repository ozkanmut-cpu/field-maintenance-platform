# Mobile Nearby, Map, and Offline Maintenance Design

**Date:** 2026-09-18  
**Status:** Approved design, implementation pending  
**Repository:** `ozkanmut-cpu/field-maintenance-platform`

## Goal

Complete the remaining field usability work through item 7 while preserving the existing API, technician assignment rules, idempotency guarantees, and production-only hotfixes.

The result lets a technician:

- find points by current or former name in both admin and mobile search;
- view assigned points near the current location as a distance-sorted list;
- inspect the same nearby results on an in-app map;
- reopen the last successfully loaded tasks and customers without a network connection;
- record “maintenance completed” or “maintenance could not be completed” while offline; and
- automatically synchronize pending records when connectivity returns.

## Scope

The implementation covers these roadmap items:

1. Admin former-name/alias search.
2. Dedicated `YAKINIMDAKİLER` experience.
3. In-app map.
5. Offline point/task cache.
6. Offline maintenance operation queue.
7. Automatic synchronization and conflict handling.

“Favorites / pinned / recently used” is explicitly removed. Final Android APK distribution (roadmap item 8) is also excluded. CI may compile or export Android as a verification step, but no APK will be distributed.

## Architecture

The existing API remains authoritative. The mobile app adds a small local data layer around it:

- `api.ts` remains the authenticated HTTP boundary.
- A nearby API function consumes the existing `GET /points/nearby` PostGIS endpoint.
- A cache module owns versioned, user-scoped snapshots.
- An operation queue module owns versioned, user-scoped pending maintenance writes.
- A synchronization service replays queued operations and classifies outcomes.
- UI screens consume these focused modules instead of implementing storage or replay rules themselves.

AsyncStorage stores non-secret cached data and queue records. SecureStore continues to store only the access token. Connectivity events come from NetInfo. The map uses `react-native-maps`, installed in the Expo-compatible version.

All local keys include the authenticated user ID. Signing out clears that user's cached snapshots and queued data from active memory; queued writes remain on disk for the same user unless the user explicitly discards a terminal conflict. Another technician can never see or replay them.

## Admin Alias Search

The admin point type will include the aliases already returned by the points API. The normalized search haystack becomes:

- point code;
- current name;
- address;
- region; and
- all aliases/former names.

Filtering remains client-side and keeps the existing status and region filters. Turkish normalization follows the shared behavior already established in mobile search.

## Nearby List and Map

A dedicated `YAKINIMDAKİLER` screen requests foreground location permission, then calls `/points/nearby` with the device coordinates. Initial defaults are a 10 km radius and at most 100 results, within the endpoint's existing limits.

Each result includes point identity, display name, coordinates, assignment source, and server-computed distance. The list is ordered by `distanceMeters`; no local distance calculation overrides the PostGIS result.

The screen has list and map modes backed by one result set:

- list cards show name, code, distance, address/region when available, and directions;
- map markers select the matching point and expose the same detail/actions;
- refresh obtains a new location and a new server result;
- permission denial, disabled location services, no coordinates, empty results, and network errors have distinct user messages;
- when offline, the screen may display the most recent nearby result set with a visible “cached” state, but does not claim the old distances are current.

External directions remain available through the existing linking behavior.

## Offline Read Cache

The mobile app caches only the last successful snapshots needed for field work:

- technician dashboard/tasks;
- “My Customers”;
- most recent nearby response plus query origin and retrieval time.

A cache envelope contains `schemaVersion`, `userId`, `savedAt`, and `payload`. Reads reject a mismatched user or unsupported schema version.

Online refresh behavior is network-first: a successful response replaces the snapshot. A transport failure falls back to the snapshot and marks the UI as offline/cached. Authentication and authorization failures do not silently fall back because the session is no longer trustworthy.

Cached data has no hard expiry for display, but always shows the saved time when used offline. Mutating equipment details offline is not added in this scope.

## Offline Maintenance Queue

Only two existing actions are queueable:

- `POST /maintenance/complete`;
- `POST /maintenance/attempt`.

The full validated request body is created at action time, including captured location, device time, equipment values where applicable, assisted technician, and the original idempotency key. The same key is retained for every replay.

When online, the app first attempts the API call. A transport failure queues the operation and reports “saved on this device, waiting to sync.” When offline, it queues immediately. Capturing a valid current location remains mandatory; the queue never fabricates coordinates.

Each queue item contains:

- local operation ID;
- authenticated user ID;
- operation kind;
- immutable API payload and idempotency key;
- creation time;
- attempt count and last-attempt time;
- state: `PENDING`, `SYNCING`, or `CONFLICT`;
- sanitized error code/message for conflicts.

Queue persistence is atomic from the app's perspective: read-modify-write operations are serialized in one module to avoid duplicate or lost entries.

## Synchronization and Conflicts

Synchronization runs:

- after session restoration/login;
- when connectivity changes to online;
- after manual refresh; and
- immediately after a new operation is queued when a connection appears available.

Only one synchronization pass runs at a time. Records are processed FIFO. The service sends the original payload unchanged:

- success removes the item;
- a replay that the server resolves through the original idempotency key returns success and removes the item;
- a race-time duplicate response is treated as success only when the API returns the structured `IDEMPOTENCY_REPLAY` code; arbitrary 409 messages are never parsed as duplicates;
- timeout, DNS, connection, and 5xx failures remain `PENDING` for later retry;
- other 400/404/409/422 domain or validation failures become `CONFLICT`;
- 401/403 stops the pass and requires a valid session;
- an unexpected client error becomes `CONFLICT` rather than retrying forever.

The UI shows pending and conflict counts. Conflicts remain visible with their point/action/time and a safe explanation. The user can retry a conflict after refreshing server data or discard it with confirmation. Automatic synchronization never changes a queued payload, invents a replacement operation, or silently drops a conflict.

After successful replay, tasks/customers are refreshed when possible so stale cached work is replaced. A refresh failure does not resurrect an already synchronized operation.

## Error and Security Rules

- Tokens and credentials never enter AsyncStorage or logs.
- API error classification uses an explicit error type with HTTP status and optional structured code rather than parsing arbitrary message text.
- The maintenance endpoints return the structured `IDEMPOTENCY_REPLAY` code for race-time uniqueness conflicts; normal repeated keys continue to return the existing record successfully.
- Storage failures surface as user-visible errors; the app does not claim an operation was saved unless persistence succeeded.
- Concurrent sync triggers coalesce into one pass.
- Queue entries are isolated by user ID and cannot be submitted under another session.
- Existing server assignment, geolocation, role, and idempotency checks remain authoritative.
- Production deployment is selective; the dirty/diverged production checkout is never reset, cleaned, broadly checked out, or overwritten.

## Testing Strategy

Every implementation unit follows RED → expected failure → minimal GREEN → regression:

- pure tests for Turkish admin alias matching;
- API contract tests for nearby parameter encoding and typed responses;
- cache tests for versioning, user isolation, fallback, and malformed storage;
- queue tests for stable idempotency keys, FIFO ordering, serialization, and persistence failure;
- sync tests for success, duplicate/idempotent success, retryable errors, terminal conflicts, auth stop, and trigger coalescing;
- component tests for list/map switching and cached/pending/conflict states where the repository test setup supports them;
- TypeScript/lint, server/admin/mobile test suites, and Android export/build checks.

Each roadmap item is delivered through its own review and CI gate. A task is complete only after exact-SHA workflows report `completed/success`, it is merged, post-merge exact-SHA workflows report `completed/success`, and its selective production deployment is verified.

## Acceptance Criteria

- Admin point search finds a point by any alias/former name.
- `YAKINIMDAKİLER` displays only assigned active points returned by the existing endpoint and orders them by server distance.
- The in-app map and nearby list represent the same result set and selection.
- Tasks and customers remain readable from the last successful snapshot during a transport outage, clearly labeled cached.
- Completed and failed maintenance actions persist locally during an outage with their original idempotency keys.
- Connectivity restoration replays pending work once, FIFO, without duplicate server records.
- Retryable failures remain pending; terminal conflicts remain visible and are never silently deleted.
- Data and queued operations are isolated between technicians.
- Favorites/pinned/recent behavior is absent.
- No final APK distribution is performed.
