# VDS Admin API Entegrasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aktif VDS sürümünü, admin redesign ve gereken gerçek API/migration sözleşmeleriyle tek güvenli yayın haline getirmek.

**Architecture:** `rescue/vds-active-20260922` temel daldır. Admin UI yalnız doğrulanmış DTO alanlarını tüketir; eksik alanlar API servis/DTO katmanında eklenir ve migrationlar ayrı doğrulanır. Her task kendi RED/GREEN testi ve bağımsız review ile tamamlanır.

**Tech Stack:** Next.js/React, NestJS, Prisma, Node test, Playwright, React Native/Android.

**Spec:** `docs/superpowers/specs/2026-09-22-vds-admin-integration-design.md`

## Global Constraints
- Aktif VDS iş akışları korunur; eski build/yedek klasörleri commit veya deploy girdisi değildir.
- SAP, canlı DB/API ve migrationlar UI kolaylığı için değiştirilmez; değişiklik gerekiyorsa sözleşme ve testle kanıtlanır.
- UI APIde olmayan alanı varsaymaz; audit, yetki ve satır-kapsamlı kararlar korunur.
- Her task RED -> minimal GREEN -> regresyon -> explicit commit sırasını izler.

## Review Focus
- `paperwork-history` zarfı `{ visit, history }` olduğunda audit paneli çökmez.
- Aynı satırda iki karar eşzamanlı gönderilemez.
- Nokta timeline yalnız `{ items }` gerçek biçimiyle çalışır.
- Migration uygulanmış ve uygulanmamış ortamda API hata metni kullanıcıyı yanıltmaz.
- VDS deploy sonrası admin API proxy ve mobil APK aynı commit sözleşmesini kullanır.

---

### Task 1: Sözleşme envanteri ve aktif davranış testi

**Files:**
- Modify: `apps/admin/app/paperwork-management.tsx`, `point-detail-page.tsx`, `operations.tsx`
- Modify: `apps/api/src/maintenance/maintenance.service.ts`, `point-timeline.service.ts`, `maintenance.controller.ts`
- Test: ilgili `*.smoke.test.mjs` ve API `*.spec.ts`

- [ ] API endpoint/DTO/alan matrisi çıkar: UI fetch URL, response type, servis select alanı ve audit etkisini tek test fixtureında yaz.
- [ ] Eksik alan için RED API sözleşme testi yaz; örnek: `expect(response).toEqual(expect.objectContaining({ history: expect.any(Array) }))`.
- [ ] Testi çalıştır ve eksik alanın kırmızı olduğunu doğrula.
- [ ] Minimal DTO/select/controller değişikliğiyle sözleşmeyi sağla; UIyi yalnız bu alanları kullanacak biçimde güncelle.
- [ ] API ve UI sözleşme testlerini çalıştır, commit: `feat(api): align admin decision contracts`.

### Task 2: Fiş/Teyit Merkezi gerçek veri entegrasyonu

**Files:**
- Modify: `apps/admin/app/paperwork-management.tsx`
- Modify: `apps/api/src/maintenance/maintenance.service.ts`, `maintenance.controller.ts`, `dto/complete-service-slip-review.dto.ts`
- Test: `paperwork-*.test.mjs`, API review specs

- [ ] RED: gerçek `{ visit, history }`, MISSING nötr gösterim ve satır kilidi testlerini yaz.
- [ ] RED koşusunu kaydet.
- [ ] API kaynak/teyit alanlarını yalnız kalıcı ve auditlenebilir biçimde sun; UIde per-row busy ve retry uygula.
- [ ] Focused testler, lint ve TypeScripti çalıştır.
- [ ] Commit: `feat(paperwork): integrate real review contract`.

### Task 3: Nokta, Onay ve operasyon bağlamı

**Files:**
- Modify: `apps/admin/app/point-list.tsx`, `point-detail-page.tsx`, `operations.tsx`, `anomaly-review.tsx`
- Modify: `apps/api/src/maintenance/point-timeline.service.ts`, `maintenance-anomaly.service.ts`, `apps/api/src/points/points.service.ts`
- Test: point/operations smoke ve `navigation-point-redesign.spec.ts`

- [ ] RED: `{ items }` timeline, bakım derin bağlantısı, filtre kalıcılığı ve yalnız satır güncellemesi testlerini yaz.
- [ ] RED koşusunu kaydet.
- [ ] Gerçek servis yanıtlarını UIye bağla; eksik bağlam alanını DTOdan ekle; tahmini veri üretme.
- [ ] Node/Playwright focused testlerini çalıştır.
- [ ] Commit: `feat(admin): integrate point and operations context`.

### Task 4: Migration ve mobil/API uyumluluğu

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, gerekli yeni migration klasörü
- Modify: `apps/mobile/src/api.ts`, `CorporateApp.tsx` yalnız sözleşme değişmişse
- Test: Prisma/API specs ve Android build

- [ ] RED: migration öncesi/sonrası API davranışı ve mobil hata işleme testi yaz.
- [ ] RED koşusunu kaydet.
- [ ] Additive migration ve geriye uyumlu DTO dönüşümü uygula; veri silme veya SAP değişikliği yapma.
- [ ] API testleri, Prisma generate/migrate doğrulaması ve Android debug build çalıştır.
- [ ] Commit: `feat(api): preserve mobile contract through admin integration`.

### Task 5: Birleşik yayın adayı ve canlı doğrulama

**Files:**
- Modify: yalnız birleşik test/CI veya deploy manifesti gerekirse
- Test: tüm admin/API/mobil testleri, production build, Playwright, VDS health smoke

- [ ] Rescue tabanına Task 1-4 commitlerini sırayla al; çakışmayı davranış testleriyle çöz.
- [ ] Tüm suitei RED olmayan sonuçla çalıştır: admin node tests, API tests, TypeScript, lint, Next build, Playwright, Android build.
- [ ] Bağımsız reviewer ile API/UI/migration ve deploy diffini incelet.
- [ ] GitHub main merge/push; VDS deploy; `GET /health`, admin login, karar/audit ve mobil API smoke kontrollerini çalıştır.
- [ ] Deploy commitini ve sağlık çıktısını kaydet.

## Self-review
- Specteki aktif davranış korunumu Task 1 ve 5te; gerçek sözleşme Task 1-3te; migration Task 4te; yayın doğrulaması Task 5tedir.
- Placeholder ve belirsiz task bulunmamaktadır; tüm review-focus maddeleri Task 1-5 testlerine bağlanmıştır.
