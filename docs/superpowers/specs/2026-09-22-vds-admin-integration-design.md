# VDS Aktif Sürüm + Admin Redesign Entegrasyon Tasarımı

## Amaç
VDSde aktif kullanılan uygulama davranışını koruyarak admin redesignini, gerektirdigi API/servis/DTO/migration degisiklikleriyle birlikte tek, test edilebilir ve deploy edilebilir sürüme birleştirmek.

## Kaynaklar ve taban
- Temel: rescue/vds-active-20260922 (aktif VDS kaynakları).
- Admin UI kaynağı: feat/admin-uiux-mockups.
- GitHub main güncel değişiklikleri de birleşik sürümde korunur.
- Eski .next, dist ve backup klasörleri kaynak değildir; commitlenmez veya deploy girdisi yapılmaz.

## Karar kuralları
- Çatışmalar dosya tercihleriyle değil, davranış ve API sözleşmesiyle çözülür.
- UI gerçek API alanı olmayan bir bilgiyi göstermez; gerekli alan yoksa API katmanına açıkça eklenir ve test edilir.
- Admin tekil kararları satır kapsamlıdır; audit bağlamı, yetki ve hata davranışı korunur.
- SAP, canlı DB/API, mobil iş akışları ve migrationlar regresyon testleri olmadan değiştirilemez.

## Entegrasyon akışı
1. API sözleşme envanteri: Fiş/Teyit, Nokta Detay, Onaylar, Anomali, Atama, Audit ve SAP/Google ekranlarının istek/yanıtları çıkarılır.
2. Çakışma çözümü: aktif VDS davranışı ile redesign davranışı birleştirilir; eksik DTO/servis/migrationlar eklenir.
3. TDD: her sözleşme için önce kırmızı test, sonra minimal çözüm ve regresyon.
4. Birleşik doğrulama: admin, API, migration, mobil ve APK build; prod benzeri VDS sağlık kontrolleri.
5. Yayın: önce GitHub main, sonra VDS deploy; deploy sonrası admin/API/mobil smoke kontrolleri.

## Başarı ölçütleri
- Aktif VDS fonksiyonları kaybolmaz.
- Redesign ekranları gerçek API sözleşmeleriyle çalışır.
- Migrationlar uygulanabilir ve geri döndürülemez veri riski taşımaz.
- Test/build/sağlık kontrolleri yeşildir; main ve VDS aynı committe çalışır.

## Kapsam dışı
- Yeni ürün fonksiyonu eklemek.
- SAP iş kuralını veya canlı veriyi UI isteği uğruna değiştirmek.
