# Mobile

Technician mobile application workspace (Expo / React Native).

Primary UX:
- overdue-first assigned work
- current-period work
- minimal point detail
- `BAKIM YAPILDI`
- current location capture
- backdated entry with short reason
- `BAKIM YAPILAMADI`
- non-maintenance visits: Arıza / Keşif / Kurma / Sökme
- own daily history
- admin-marked missing paperwork queue
- nearby/map helpers
- offline cache and sync

## Unregistered point flow

The first implemented mobile flow is EFESIM-first candidate creation:

1. Technician selects an EFESIM screenshot.
2. App captures current GPS.
3. API extracts SAP No + customer name from the EFESIM customer card.
4. API checks for an existing Point / Prospect by SAP No.
5. If no duplicate exists, API tries Google Places around the field GPS using the EFESIM name.
6. Strong Google match -> technician confirms or rejects the suggested business.
7. No strong match / rejected match -> technician continues with manual customer-name confirmation.
8. Address is never editable. It is stored only when verified from Google Places. Without a Google match it stays null.
9. Candidate can then receive only Keşif or Kurma visits.

Environment values for local Expo development:

```text
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000/api
EXPO_PUBLIC_TECHNICIAN_ID=<development-technician-uuid>
```

Do not commit real technician IDs, credentials, API keys, screenshots, SAP/customer exports, or production data.
