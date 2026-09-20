# Field Maintenance Platform — Connection Paths and Operating Model

> Scope: repository, CI, Remote Desktop Commander (RDC), VDS production, SAP runtime and selective release flow.
>
> Security: this document intentionally contains no password, access token, private key, cookie, database URL or SAP credential. Secrets stay only in their approved runtime stores.

## 1. System map

| Surface | Canonical location | Purpose |
|---|---|---|
| Source repository | `https://github.com/ozkanmut-cpu/field-maintenance-platform` | Source of truth for application code, documentation, pull requests and CI |
| Main integration branch | `main` | Only merge target and production release source |
| API | `apps/api` | NestJS API and Prisma/PostGIS schema |
| Admin | `apps/admin` | Next.js desktop-first admin UI |
| Mobile | `apps/mobile` | Technician application; APK is built in GitHub Actions, not on VDS |
| AI service | `services/ai` | Decision-support service; may not mutate deterministic states |
| Production host | `srv.field-maintenance-prod.com` | VDS production machine |
| Production application | `/opt/field-maintenance/app` | Live application checkout and runtime artifacts |
| SAP runtime | `/opt/field-maintenance/sap-runtime` | Isolated SAP browser automation runtime |

## 2. Approved connection paths

### GitHub

1. Work begins from the verified current GitHub `main` SHA.
2. Create an isolated branch/worktree for a task.
3. Open a pull request against `main`.
4. CI must pass for the exact PR head SHA.
5. Merge to `main`.
6. CI must also pass for the exact merge SHA before any production release.

GitHub is the source-of-truth path. Repository access is performed through the configured GitHub integration or repository-scoped deploy key/App credentials. Do not place personal tokens in source files, shell history, logs or this document.

### ChatGPT → RDC → VDS

The primary production-management path is:

`ChatGPT → Remote Desktop Commander → srv.field-maintenance-prod.com shell`

RDC is the approved way to inspect VDS state, build a staging candidate and perform controlled service actions. The RDC agent is managed by systemd on VDS and should remain enabled; do not replace it with an ad-hoc remote-control process.

Direct SSH is not the normal operating path. If it is unavailable, do not invent a bypass or block a safe RDC-supported workflow. SSH endpoint details are intentionally omitted from day-to-day instructions because they are not required for normal work.

### VDS → GitHub

The VDS has a repository-scoped GitHub deploy-key/App route for task-relevant read/write operations. It must be used only for this repository and never substituted with copied PATs or passwords.

## 3. Production services and smoke endpoints

| Component | Service / endpoint | Expected check |
|---|---|---|
| Admin | `field-maintenance-admin.service` | active; `http://127.0.0.1:3001/` returns 200 |
| API | `field-maintenance-api.service` | active; `http://127.0.0.1:3000/api/health` returns 200 |
| Public admin | `https://field-maintenance-prod.com/` | expected public response after release |
| SAP runtime | `/opt/field-maintenance/sap-runtime` | scheduler/audit healthy; handled independently from web artifact |
| Database | production PostgreSQL/PostGIS | do not probe or mutate without a task-specific migration/test gate |

Only restart the service affected by a verified release. An admin-only release restarts only `field-maintenance-admin.service`; it does not restart API, SAP or database services.

## 4. CI and exact-SHA gates

Required release logic:

1. Reproduce the issue with a focused RED test where behavior changes.
2. Implement the minimum GREEN change.
3. Run relevant smoke/E2E tests, type checks and production build.
4. Push PR branch.
5. Wait for the exact PR head SHA CI result to be `completed/success`.
6. Merge.
7. Wait for the exact `main` merge SHA CI result to be `completed/success`.
8. Build an isolated candidate from that exact merge SHA.
9. Perform selective production deploy.
10. Run production smoke and record the active build identity.

`queued` and `in_progress` are never release success.

Core CI includes the exact-main SHA gate and PostGIS validation. The browser contract covers Chromium admin behavior and Firefox SAP DOM behavior. Other workflow gates run when their path rules apply.

## 5. Selective production release model

Production is intentionally treated as a dirty/overlay environment. Its local hotfixes and runtime-specific files must survive releases.

Never run:

- `git reset --hard`
- `git clean`
- broad `git checkout`
- blind `git pull`
- wholesale source overwrite
- unreviewed destructive database operations

Release procedure:

1. Inventory current VDS tracked/untracked differences and service health.
2. Three-way compare the exact GitHub target, VDS overlay and candidate scope.
3. Keep production-only behavior unless the GitHub target already contains an equivalent verified implementation.
4. Build in a separate staging directory under `/opt/field-maintenance/staging`, never in the live application path.
5. Verify source identity, lint/type checks, targeted tests and production build.
6. Deploy only the required artifact/files. For admin UI, normally only `apps/admin/.next`.
7. Atomically exchange the live artifact, retain the prior artifact in a timestamped backup directory.
8. Restart only the relevant systemd service after build success.
9. Smoke root, target route and API health.
10. Keep rollback path and active/previous build IDs in the release record.

No database migration is applied merely because code exists. A migration needs its own exact-SHA CI, real PostGIS validation and a reviewed production migration plan.

## 6. SAP operating boundary

SAP uses Firefox and Playwright as the current automation direction. Legacy coordinate/xdotool flows are not the basis for new development.

The guarded sequence is:

`download → validation → dry-run → real sync → audit → logout`

For the SAP data chain:

1. Export 1
2. download and validate
3. Export 2
4. download and validate
5. Cooler Movement Report
6. download and validate
7. normalize/retain data for later authorized business logic

The chain is fail-closed: a failed stage prevents the next data pull. Credentials are stored only in the VDS SAP runtime secret store and are never copied into chat, GitHub or documentation.

## 7. Mobile and APK boundary

Mobile work continues on the existing mobile UX code and uses GitHub Actions for Android artifacts. VDS is not an Android build machine. APK distribution remains separate from admin/API selective releases.

## 8. Working rules for every task

- Prefer independent parallel development clusters, but serialize merge and production deploy.
- Do not ask again for a decision already documented in the project notes or source history.
- Record genuine product decisions under `KARAR BEKLEYENLER`; do not block unrelated work.
- Preserve the admin rule: desktop defaults to a wide sidebar with icons and labels; tablet/phone drawer keeps group and submenu text visible.
- Use real backend metrics and real error/loading/empty states; never substitute placeholder data.
- Keep Smart Clean final business logic blocked until the authorized real Export 2 and Cooler Movement data decision is made.

## 9. Release record template

For each material release, record:

- task and PR
- PR head SHA and exact merge SHA
- PR CI and merge-SHA CI status
- staged artifact/build ID and checksum when applicable
- files/services changed
- preserved backup location
- production smoke results
- known risks, anomalies and remaining decisions
