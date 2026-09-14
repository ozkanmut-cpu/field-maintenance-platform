# AI TODO

Bu dosya Field Maintenance Platform'un yapay zekâ / karar destek backlog'unun tek kaynağıdır.

Amaç: ham nokta sayısını optimize eden bir sistem değil; ekipman yükü, coğrafya, geçmiş performans, veri kalitesi ve belirsizliği birlikte kullanan açıklanabilir bir saha karar destek sistemi kurmak.

## Temel ilkeler

- Ekipman-aware workload, ham nokta sayısından daha bilgilendirici kabul edilir; nokta sayısı yalnızca bağlamsal sinyaldir.
- Cooler/tower/tap/SmartTap etkileri keyfi sabit ağırlıklarla belirlenmez; gözlenen sonuçlardan kalibre edilir.
- Servis yükü ve seyahat yükü ayrı modellenir.
- Veri kalitesi zayıfsa difficulty/risk/capacity/recommendation çıktıları frenlenir veya düşük güvenle işaretlenir.
- AI çıktıları açıklanabilir olmalı: skorun/riskin nedenleri ve güven seviyesi gösterilmelidir.
- Sistem kullanıcı davranışını manipüle eden kara-kutu kararlar vermemeli; öneri üretmeli ve operasyonel karar admin/iş kuralında kalmalıdır.

## Mevcut temel — tamamlandı

- [x] Feature Store / haftalık feature snapshot altyapısı
- [x] Technician Baseline Engine
- [x] Point Difficulty Engine temel sürümü
- [x] Assigned Weekly Workload Engine
- [x] Weekly Workload Assessment
- [x] Geography feature hesapları
- [x] Geography clustering temel motoru
- [x] Data Maturity Engine
- [x] Cold-start Engine
- [x] Ekipman profilini point-difficulty için ana girdilerden biri yapma
- [x] Location coverage / equipment coverage / history depth sinyalleri
- [x] Admin AI Dashboard temel görünümü
- [x] Deterministik unit testler: baseline, workload, geography, clustering, maturity, cold-start, difficulty

## P0 — Mevcut AI temelini üretim seviyesine çıkar

- [ ] Point Difficulty Score'u ekipman + geçmiş süre/sonuç + coğrafya ile yeniden kalibre et
  - [x] Ekipman karması + outcome + coğrafya için empirical cohort calibration; gerçek servis süresi alanı henüz veri modelinde olmadığı için duration bileşeni açık kalır.
- [x] Equipment-profile confidence: completeness, verification age, verification history
- [x] Equipment-profile stability/change-rate feature per point
- [x] Equipment-change anomaly detection: olağandışı / tekrarlayan adet sıçramaları
- [x] Equipment data-quality brake: difficulty/capacity/risk/recommendation motorlarına ortak güven kapısı
- [x] Historical point-difficulty reconstruction: visit-level equipment snapshot kullanarak geçmiş skor üretimi
- [x] Cold-start cohortlarını maintenance type + equipment mix + geography ile zenginleştir
- [x] Technician capacity modelini equipment mix ile ayarla
- [x] Weekly workload'u service workload + travel workload olarak iki bileşene ayır
- [x] Travel workload: point-to-point distance, dispersion, isolated points, cluster fragmentation, technician work-area proximity
- [x] Route coherence metriği: eşit nokta sayısı yerine rota bütünlüğü + equipment workload dengesini değerlendir
- [x] AI maturity gating'i tüm AI çıktılarında zorunlu hale getir
- [x] Her skor/öneri için confidence + reason codes üret
- [x] Admin AI Dashboard'da “neden bu skor?” açıklaması göster

## P1 — Risk ve planlama motorları

- [x] AI Risk Engine
- [x] Period-end delay risk
- [x] Bakım gecikme riski: workload mix + equipment difficulty + geography + geçmiş performans
- [x] Technician overload / underload risk
- [x] Point-level service failure / repeated-attempt risk
- [x] Data-quality risk ve yanlış yönlendirme koruması
- [x] AI Planning Engine — V1 açıklanabilir, non-mutating öneri motoru
- [x] Technician workload/capacity analysis
- [x] Region health indicators
- [x] SmartClean approaching-window risk/priority
- [x] Recommendation ranking: equipment-heavy clusters + travel burden + technician capacity
- [x] Önerilerde mevcut bölge/görevlendirme/business-rule kısıtlarını hard constraint olarak uygula
- [x] AI önerisinin admin tarafından kabul/red sonucunu audit et
- [x] Recommendation feedback dataset oluştur

## P2 — Benzer dönem, simülasyon ve kalibrasyon

- [x] Similar Week matching: equipment mix + geographic dispersion + workload similarity
- [x] What-if simulator — V1 technician workload/risk simulation
- [x] What-if: equipment adet değişikliği
- [x] What-if: nokta ekleme/çıkarma — workload delta üzerinden
- [x] What-if: bölge/teknisyen değişikliği
  - [x] Teknisyen yerleşim karşılaştırması: aynı önerilen yük iki teknisyende simüle edilir; düşük post-change risk tercih sinyali olur, otomatik atama yapılmaz.
  - [x] Bölge değişikliği: bölgenin gerçek workload/equipment/geography vektörünü hedef teknisyene taşıyarak simüle et.
- [x] What-if: route/geography değişikliği
- [x] What-if çıktısı: workload delta + risk delta + confidence
- [x] Outcome validation pipeline
- [x] Equipment-type relative workload etkilerini gözlenen sonuçlardan kalibre et
- [ ] Travel-burden ağırlıklarını gözlenen süre/başarı sonuçlarından kalibre et
  - [x] Başarı/başarısızlık outcome etkisi ampirik olarak kalibre ediliyor; gerçek servis süresi veri modelinde olmadığı için duration bileşeni açık.
- [x] Calibration drift takibi
- [x] Model/heuristic versioning
- [x] Feature versioning
- [x] Backtest: geçmiş haftalarda öneri verilseydi sonuç ne olurdu?

## P3 — AI Location ve veri kalitesi

- [x] AI Location Engine
- [x] Learned canonical-location güvenini ziyaret geçmişiyle geliştirme
- [x] Co-located / alias işletmeler için identity confidence
- [x] İsim + adres + mesafe + geçmiş ziyaret kanıtını tek confidence modelinde birleştirme
- [x] Location contradiction detection
- [x] Implausible travel / suspicious batch skorunu geography modeline bağlama
- [x] AI Data Quality Engine
- [x] Missingness severity scoring
- [x] Contradictory point metadata detection
- [x] Stale equipment/location/profile detection
- [x] Duplicate candidate confidence'i mevcut fuzzy duplicate sisteminden AI data-quality katmanına besleme
- [x] Admin için “önce bunları düzelt” data-quality priority queue

## P4 — Operasyonel AI özetleri

- [x] Günlük teknisyen AI özeti: riskler, gecikenler, yüksek yük, rota anomalileri
- [x] Günlük admin AI özeti
- [x] Hafta/period sonu AI özeti
- [x] Region health trend
- [x] Technician capacity trend
- [x] Point difficulty trend
- [x] Equipment data-quality trend
- [x] Paperwork completion-time analitiğini risk sinyali olarak ekle
- [x] AI Dashboard tarihsel karşılaştırma
- [x] Export edilebilir AI/KPI raporu

## P5 — Test, güvenlik ve gözlemlenebilirlik

- [x] Risk Engine deterministik fixture testleri
- [x] Planning Engine deterministik fixture testleri
- [x] Similar Week testleri
- [x] What-if simulator — V1 technician workload/risk simulation testleri
- [x] Calibration/backtest testleri
- [x] Confidence/maturity gate testleri
- [x] Veri eksik/çelişkili/stale durum testleri
- [x] AI endpoint contract testleri
- [x] AI Dashboard smoke testi
  - [ ] AI Dashboard browser e2e testi
- [x] Feature snapshot reproducibility testi
- [x] Model/heuristic version bilgisini temel kullanıcıya açık AI çıktılarında ve snapshotlarda taşı
- [x] AI hesaplama süresi ve hata metriği
- [x] Risk/recommendation dağılım drift metriği

## Definition of Done — AI V1

AI V1 tamamlanmış sayılabilmesi için:

- [ ] Point difficulty, technician capacity ve travel burden üretimde birlikte çalışmalı
- [x] Risk Engine gerçek operasyonel risk skoru üretmeli
- [x] Planning Engine açıklanabilir öneriler üretmeli
- [x] Tüm AI çıktılarında maturity/confidence/reason codes bulunmalı
- [x] Düşük veri kalitesinde sistem güvenli biçimde öneriyi kısmalı
- [x] Similar Week ve What-if en az temel sürümde çalışmalı
- [x] Geçmiş veriyle backtest yapılabilmeli
- [x] Admin AI Dashboard sonuçları tarihsel olarak karşılaştırabilmeli
- [x] Kritik AI motorlarının otomatik testleri CI'da çalışmalı

## AI kapsamı dışında

- Arıza teşhisi / AI diagnosis
- Zorunlu fotoğraf analizi
- Bireysel ekipman/asset seviyesinde predictive maintenance
- Otomatik ve geri alınamaz personel kararı
