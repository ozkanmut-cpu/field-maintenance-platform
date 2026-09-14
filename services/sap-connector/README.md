# SAP Connector

Production automation for Efes SAP Web CRM confirmation synchronization.

## Mandatory SAP flow

The browser automation must always use:

`Operasyon -> Hizmet teyitleri -> normal arama`

Do **not** use the saved search / `TÜMÜ`. SAP has a saved-search export layout bug that drops `Nokta Kodu`.

Search criteria:

- record date: last 14 days
- product id: `203`
- maximum results: `1000`
- `Nokta Kodu` must be present in the export

## Runtime layout

Production runtime lives outside the Git checkout at `/opt/field-maintenance/sap-runtime`.

Tracked source files in this directory are deployed there as:

- `pull_teyit_203.py`
- `sap_auto_login.py`
- `sync_teyit_db.js`

The production launcher `/usr/local/bin/sap-teyit-203` points to `pull_teyit_203.py`.

Firefox/Gecko runs under Xvfb display `:99`. The systemd service uses `flock` so two sync runs cannot overlap.

## Credentials

Credentials are never committed. Production reads:

`/opt/field-maintenance/sap-runtime/.sap_credentials`

Expected keys are `SAP_USERNAME` and `SAP_PASSWORD`. The file must remain root-owned and mode `0600`.

Do not print credentials in logs or source code.

## Database synchronization safety

SAP confirmation id (`Tanıtıcı`) is the primary key.

For each validated CSV:

- new id -> INSERT
- changed id -> UPDATE
- unchanged id -> no write
- missing id -> DELETE only when its `record_date` is inside the incoming CSV coverage window
- records older than the CSV's oldest `Kayıt tarihi` are never deleted

The sync aborts before mutation when:

- a required column is missing
- `Nokta Kodu` is missing
- a confirmation id is missing or duplicated
- the export contains fewer than 100 rows
- the date range is suspicious

Database writes and protected deletes run inside one Prisma transaction.

## Scheduling

`systemd/sap-teyit-sync.service` and `systemd/sap-teyit-sync.timer` run the pull + DB sync every 10 minutes. The service is oneshot with a 180-second timeout.

Runtime exports, screenshots, logs, browser state and `.sap_credentials` must stay outside Git.
