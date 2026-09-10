# SAP Connector

Future Efes SAP Web CRM confirmation synchronization service.

Expected approach:
- browser automation rather than direct HTTP/API
- Playwright + Firefox when SAP UI compatibility requires Firefox
- authorized login/session only
- no CAPTCHA bypass
- credentials/session secrets stored outside git
- deduplicate using SAP confirmation identifiers when available
- confident matches update confirmation status
- ambiguous matches go to admin review

This service is intentionally deferred until the core V1 maintenance platform is stable.
