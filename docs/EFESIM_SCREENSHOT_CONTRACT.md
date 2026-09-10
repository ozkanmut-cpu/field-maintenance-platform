# EFESIM Screenshot Extraction Contract

## Scope

EFESIM screenshots are used only to prefill a prospect/customer identity during field flows. The extractor must read the customer header card, not the rest of the EFESIM menu.

No production screenshot, customer name, SAP number, token, credential or session data may be committed to this public repository.

## Expected layout

1. A blue application header containing `EFESİM`.
2. Immediately below it, the first white customer card.
3. Customer card line 1: SAP number, expected as 6-10 digits.
4. Customer card line 2: customer/business name.
5. Lower cards such as address/contact or inventory/activity menus are not identity fields.

## Extraction rules

- `sapNo`: digits only, length 6-10.
- `customerName`: text from the second line of the first customer card.
- Never infer missing values.
- Never use menu labels as the customer name.
- Low-confidence or layout-mismatched results are shown for manual correction, not silently committed.
- Extraction does not create a prospect by itself. Technician confirmation is required.
- Before prospect creation, an exact SAP-number check must run against both real points and candidate customers.

## Safe test example

Use fictional data in automated tests, for example:

```json
{
  "sapNo": "1234567",
  "customerName": "ÖRNEK TEST MARKET"
}
```

Do not add real customer screenshots or real SAP numbers to fixtures.

## Mobile UX

`Keşif / Kurma` → `Kayıtlı değil` → `EFESİM ekran görüntüsü` → extract → show SAP No + customer name → technician confirms/corrects → create candidate customer → record visit.
