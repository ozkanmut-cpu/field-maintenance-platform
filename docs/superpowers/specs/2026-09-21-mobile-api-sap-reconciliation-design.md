# Mobile, API, SAP ve DB Eşitleme Tasarımı

## Amaç

İndirme sayfasındaki son APK'yı mobil davranış otoritesi, canlı admin release'ini admin otoritesi, `main`deki üç-aşamalı SAP zincirini SAP otoritesi ve canlı PostgreSQL verisini veri otoritesi kabul ederek tek, izlenebilir bir release hattı kurmak.

Bu tasarım production kaynak ağacını sıfırlamaz veya bütün halinde kopyalamaz. Her bileşen yalnız seçilmiş kaynak ve contract kanıtı ile ilerler.

## Kaynak Otoriteleri

| Alan | Otorite | Koruma |
|---|---|---|
| Mobil | İndirme sayfasında yayınlanan son APK | SHA-256, package, versionCode, versionName, imza ve emülatör davranışı |
| Admin | Canlıdaki admin artifact | Tekrar deploy edilmez; contract ve smoke ile korunur |
| SAP | `main/runtime/sap` | Üç kaynaklı fail-closed zincir |
| DB | Canlı PostgreSQL | Veri korunur, yalnız ileri migration/backfill |
| API | Uzlaştırılmış release dalı | Mobil, admin, SAP ve DB sözleşmelerini aynı anda karşılar |

## Başlangıç Manifesti

Her çalışmada aşağıdaki değerler kaydedilir: `main` SHA, production artifact hashleri, APK hash/sürümü, API build SHA, SAP runtime hash'i, DB migration listesi, SAP teyit sayısı/tarih aralığı ve geri dönüş artifact yolları.

Keystore, token, parola, private key veya SAP credential bu manifestte veya Git'te yer almaz.

## Mobil Baseline

İndirme sayfasındaki APK önce indirilebilirlik, SHA, package, sürüm ve imza ile doğrulanır. APK'nın kaynak karşılığı yalnız kanıtlanan production mobil/native dosyalarından izole worktree'ye seçilerek alınır; rastgele production değişikliği taşınmaz.

Baseline APK emülatöre kurulur. Açılış, giriş, İşler, bakım ve Geçmiş akışları kanıtlanmadan yeni mobil geliştirme başlamaz.
## API ve DB Contract Çekirdeği

Önce API/DB contract testleri RED durumunda yazılır. Mobil ekranlar yalnız bu sözleşmeler GREEN olduktan sonra bağlanır.

### Kısmi bakım

Mobil ve API aynı alan setini kullanır. `partialMaintenanceConfirmed` DTO tarafından kabul edilir. Toplam soğutucu, bakımı yapılan soğutucu, eksik adet, teknisyen, tarih/saat ve isteğe bağlı açıklama atomik kaydedilir.

Kısmi bakım açık görev bırakmaz; audit kaydı ve gerçek başarı sonucu üretir. Geçmiş özeti `4/5 soğutucu bakım · 1 eksik` gibi kesin sayısal gösterim kullanır. Normal bakım path'i ayrı contract ile korunur.

### Bakım dışı ziyaret

Akış yalnız İşler içinde bulunur. Yakınlığa göre sıralı/aranabilir müşteri seçimi, `Müşteri kaydı yok`, on zorunlu ziyaret türü, EFESİM görseli veya görsel yoksa açıklama fallback'i sağlanır.

Ziyaret bakım kaydı değildir. Kendine ait audit, başarı ve Geçmiş satırı üretir; bakım yükümlülüğünü veya bakım durumunu değiştirmez.

### Geçmiş tarih ve konum

Android takvim varsayılan olarak bugünü açar ve geçen haftanın pazartesinden önce seçim kabul etmez. Geçmiş tarihli kayıtta neden zorunludur.

Geçmiş tarih seçildiğinde istemci konum toplamaz; API konum değerlendirme, doğrulama ve öğrenme yapmaz. Kayıt `pastDated` işaretiyle auditlenir.

Güncel tarihli kayıtta 250 m üzeri üç karar korunur: `Evet, noktadayım`, `Hayır, ama bakımı yaptım`, `İptal et`. Son seçenek kayıt yaratmaz; ikinci seçenek GPS öğrenmesine girmez.

## Android Etkileşim Politikası

Bakım yapılamadı, konum ve diğer dialoglar Android geri tuşuyla kapanır. İptal/kapanma kalıcı kayıt yaratmaz. Form geri davranışı İşler listesine döner; ana ekran geri tuşu uygulamayı istemsiz kapatmaz.
## SAP ve Veri Güncelleme

Canlıdaki tek-aşamalı teyit runner'ı, `main`deki üç aşamalı zincirle değiştirilir:

1. Export 1: normal teyit araması, son 14 gün, ürün 203, en çok 1000 kayıt.
2. Export 2: aynı arama/tarih, ürün filtresiz, en çok 2000 kayıt.
3. Soğutucu Hareket Raporu: son 14 gün, bayi/alt bayi/nokta 5000013, en çok 5000 kayıt.

Her kaynak indirilip CSV doğrulaması ve immutable raw/normalize metadata kaydı tamamlanmadan bir sonraki aşama çalışmaz. Üç aşamadan biri başarısızsa Export 1 iş verisi DB'ye yazılmaz.

Mevcut `sap_confirmations` verisi korunur. Yeni `sap_import_runs` ledger ve evidence/reconciliation kayıtları idempotent backfill ile oluşturulur. Geriye dönük silme veya toplu overwrite yapılmaz.

## Test Kanıtı

Her değişiklik RED → beklenen failure → minimal GREEN → ilgili regresyon izler.

- DTO ve API contract: kısmi bakım, normal bakım, geçmiş tarih, konum, on ziyaret türü.
- Integration: mobil → API → DB → audit → Geçmiş.
- SAP: üç-aşama sırası, fail-closed, CSV doğrulama, import ledger ve idempotency.
- Mobil: Android geri/modal, safe-area, tarih aralığı, konum çağrısı olmaması.
- Gerçek APK/emülatör: kısmi bakım, geçmiş tarih, konum, yapılamadı, Yardım Et, bakım dışı ziyaret ve Eksikler kanıtları.

Mockup seed gerçek veriden izoledir, tek komutla silinip kurulur, doğal müşteri isimleri kullanır ve Can Durmaz → Özge Kaya yardım yetkisini korur.

## Kılavuz

Kılavuz ancak tüm blocker'lar kapandıktan ve gerçek APK ekranları alındıktan sonra güncellenir. Sadece mobil APK ekranları, ilgili kullanım adımı içinde kullanılır; admin/web ekranı ve bağımsız ekran galerisi kullanılmaz.
## Release ve Geri Dönüş

Çalışmalar bağımsız worktree'lerde paralel geliştirilir; merge ve production dağıtımı sıralıdır.

1. APK baseline ve contract çekirdeği.
2. DB forward migration ve staging backfill.
3. API selective artifact dağıtımı.
4. SAP runtime/timer selective dağıtımı.
5. Yeni APK build, imza/sürüm kanıtı ve indirme sayfası güncellemesi.
6. Gerçek ekran kanıtları ve kılavuz güncellemesi.

Her PR head SHA CI ve merge SHA CI `completed/success` olmadan bir sonraki release kapısına geçmez. Production checkout'a reset, clean, broad checkout veya wholesale overwrite uygulanmaz.

Her production adımında mevcut artifact yedeklenir, yalnız ilgili servis restart edilir. Admin artifact'i korunur; API/SAP değişiklikleri admin smoke ile kontrol edilir.

Final doğrulama: API/mobile smoke, SAP üç-aşama sonucu, DB import ledger, APK HTTP 200 ve emülatör kurulumu, mockup akışları, kılavuz görselleri HTTP 200.

## Kapsam Dışı

SAP credential değişikliği, SAP iş kurallarının yeniden yorumlanması, canlı verinin silinmesi, admin görsel release'inin geri alınması ve üretim checkout'unun kaynak olarak toptan Git'e alınması kapsam dışıdır.

## Karar Durumu

APK otoritesi indirme sayfasındaki son APK'dır. Hash birebir yeniden üretilemiyorsa kabul zinciri package/versionCode/versionName/imza, kanıtlanmış kaynak commit'i ve emülatör davranış testlerinden oluşur.
