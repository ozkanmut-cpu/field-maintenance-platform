# SAP runtime

The production runner uses one authenticated Firefox/Playwright session and executes the SAP sources in a fail-closed order:

1. Export 1 — normal `Operasyon → Hizmet teyitleri` search, last 14 days, product `203`, maximum `1000`.
2. Export 2 — the same normal search and date range, product blank, maximum `2000`.
3. Cooler Movement Report — `Raporlar → Soğutucu Hareket Raporu`, start date today minus 14 days, end date today, dealer/subcontractor/point `5000013`, maximum `5000`.
4. Existing Export 1 dry-run and real database synchronization.

Every source must download and validate successfully before the next source starts. Export 1 database synchronization therefore does not run when Export 2 or the Cooler Movement Report fails validation or persistence.

Export 2 and Cooler Movement data are stored below `/opt/field-maintenance/sap-runtime/secondary-sources` in separate source directories. Each acquisition creates:

- an immutable raw CSV copy;
- a normalized JSON document;
- source name, acquisition timestamp, 14-day date range, SHA-256 checksum and row count metadata.

These two secondary sources are acquisition-only. The runtime does not use them to update maintenance, confirmation, service-slip or Smart Clean state. Their future business interpretation requires a separate product decision after real source data has been inspected.

The Playwright installation remains runtime-owned at `/tmp/pw-firefox-test/node_modules/playwright`. It is loaded only by the executable `main()` path, allowing the pure validation, persistence and chain tests to run without production browser dependencies.
