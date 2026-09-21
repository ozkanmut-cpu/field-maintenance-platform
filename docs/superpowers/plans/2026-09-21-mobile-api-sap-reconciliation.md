# Mobile, API, SAP ve DB Eşitleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Son indirme APK'sını güvenli biçimde geliştirirken API, DB ve SAP'i seçilen otoritelerle uyumlu tek release'e taşımak.

**Architecture:** Mobil baseline doğrulanmış son APK kaynaklarından gelir. API contract'ları DB migration'larından önce testlenir; SAP üç-aşamalı runner ayrı, seçici runtime artifact'i olarak dağıtılır. Admin artifact'i korunur.

**Tech Stack:** React Native/Expo, TypeScript, NestJS, Prisma/PostgreSQL, Node test runner, Playwright/Firefox, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-mobile-api-sap-reconciliation-design.md`

## Global Constraints

- Production checkout'a reset, clean, broad checkout veya wholesale overwrite uygulanmaz.
- Secret, keystore ve SAP credential Git'e veya loglara yazılmaz.
- DB yalnız ileri migration/backfill alır; mevcut canlı veri silinmez.
- Admin canlı artifact'i tekrar dağıtılmaz; contract ve smoke ile korunur.
- Her değişiklik RED → beklenen failure → minimal GREEN → regresyon ile yapılır.
- PR ve merge SHA CI `completed/success` olmadan production deploy yoktur.

## Review Focus

- Tekrarlanan idempotency key aynı kısmi bakım veya ziyaret için ikinci audit/record üretmemeli.
- Geçmiş tarihli istek konum alanlarıyla gelse bile API konum değerlendirmesi/öğrenmesi yapmamalı.
- Görselsiz müşteri kaydı yok ziyareti açıklama yoksa reddedilmeli; açıklama varsa kaydolmalı.
- Android geri tuşu açık dialogu kapatmalı fakat başarıyla tamamlanan kaydı geri almamalı.
- SAP secondary source doğrulama hatası Export 1 DB sync'ini engellemeli.

---

### Task 1: APK baseline ve kaynak manifesti

**Files:**
- Create: `ops/release/mobile-apk-manifest.json`
- Modify: `.github/workflows/android-apk.yml`
- Test: `apps/mobile/src/mobile-release-baseline.smoke.test.mjs`

**Produces:** `assertMobileReleaseManifest()` ile APK hash/sürüm/package/imza ve kaynak SHA doğrulaması.
- [ ] **Step 1: Write failing baseline test**

```js
assert.equal(manifest.apk.sha256, installedApk.sha256);
assert.equal(manifest.versionCode, installedApk.versionCode);
```

- [ ] **Step 2: Run test and record expected baseline failure or missing manifest.**

Run: `node --test apps/mobile/src/mobile-release-baseline.smoke.test.mjs`

- [ ] **Step 3: Implement manifest generator without reading or writing secret values.**

- [ ] **Step 4: Rebuild, install the release APK in the emulator, then run the baseline test.**

- [ ] **Step 5: Commit.** `git commit -m "chore: record released mobile baseline"`

### Task 2: Partial-maintenance API and DB contract

**Files:**
- Modify: `apps/api/src/maintenance/dto/complete-maintenance.dto.ts`
- Modify: `apps/api/src/maintenance/maintenance.service.ts`
- Modify: `apps/api/src/maintenance/maintenance-engine.service.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/maintenance/partial-maintenance-contract.spec.ts`
- Test: `apps/api/src/maintenance/partial-maintenance.spec.ts`

**Produces:** `complete()` kısmi bakımı sayısal adetlerden türetir, artık `partialMaintenanceConfirmed` alanını reddeder, summary/audit yazar ve yükümlülüğü kapatır.

- [ ] **Step 1: Add failing contract tests: mobil payload alanı göndermez; DTO eski alanı reddeder; açıklama present/absent, audit, closed obligation ve normal-maintenance regression korunur.**

- [ ] **Step 2: Run:** `node --test --require ts-node/register src/maintenance/partial-maintenance-contract.spec.ts`; **Expected:** mevcut DTO eski alanı kabul eder veya servis kısmi kaydı eski onay alanı olmadan reddeder.

- [ ] **Step 3: Eski DTO alanını ve servis bağımlılığını kaldır; invariant, transaction writes ve count-derived partial semantics'i koru.**

- [ ] **Step 4: Run API unit/integration suites and inspect the persisted `4/5 · 1 eksik` projection.**

- [ ] **Step 5: Commit.** `git commit -m "fix: align partial maintenance contract"`
### Task 3: Bakım dışı ziyaret contract ve mobil akış

**Files:**
- Modify: `apps/api/src/maintenance/dto/non-maintenance-visit.dto.ts`
- Modify: `apps/api/src/maintenance/non-maintenance-visit.service.ts`
- Modify: `apps/api/src/maintenance/maintenance.controller.ts`
- Modify: `apps/mobile/src/api.ts`
- Modify: `apps/mobile/src/CorporateApp.tsx`
- Create: `apps/api/src/maintenance/non-maintenance-visit.contract.spec.ts`
- Create: `apps/mobile/src/non-maintenance-visit.smoke.test.mjs`

**Produces:** `recordNonMaintenanceVisit()` accepts point/no-point, all 10 types, visual or fallback note and creates independent history/audit.

- [ ] **Step 1: Write failing API table-driven test for all 10 visit types plus point/no-point, visual/fallback and idempotency.**

- [ ] **Step 2: Run:** `node --test apps/api/src/maintenance/non-maintenance-visit.contract.spec.ts`; **Expected:** missing type/route/form behavior fails.

- [ ] **Step 3: Implement enum/DTO/service/audit behavior; forbid creation of maintenance visit or obligation mutation.**

- [ ] **Step 4: Write failing mobile test asserting İşler entry, distance sort, search, customerless option, type picker and success/history copy.**

- [ ] **Step 5: Implement the smallest mobile screen state and API call; use image fallback note without blocking save.**

- [ ] **Step 6: Run API + mobile tests, emulator scenario and normal-maintenance regression; commit `feat: add non-maintenance visit flow`.**