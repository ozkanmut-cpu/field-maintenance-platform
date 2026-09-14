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
- [x] Equipment-profile confidence: completeness, verification age, verification history
- [x] Equipment-profile stability/change-rate feature per point
- [x] Equipment-change anomaly detection: olağandışı / tekrarlayan adet sıçramaları
- [ ] Equipment data-quality brake: difficulty/capacity/risk/recommendation motorlarına ortak güven kapısı
- [x] Historical point-difficulty reconstruction: visit-level equipment snapshot kullanarak geçmiş skor üretimi
- [x] Cold-start cohortlarını maintenance type + equipment mix + geography ile zenginleştir
- [x] Technician capacity modelini equipment mix ile ayarla
- [x] Weekly workload'u service workload + travel workload olarak iki bileşene ayır
- [ ] Travel workload: point-to-point distance, dispersion, isolated points, cluster fragmentation, technician work-area proximity
- [ ] Route coherence metriği: eşit nokta sayısı yerine rota bütünlüğü + equipment workload dengesini değerlendir
- [ ] AI maturity gating'i tüm AI çıktılarında zorunlu hale getir
- [ ] Her skor/öneri için confidence + reason codes üret
- [ ] Admin AI Dashboard'da “neden bu skor?” açıklaması göster

## P1 — Risk ve planlama motorları

- [ ] AI Risk Engine
- [ ] Period-end delay risk
- [ ] Bakım gecikme riski: workload mix + equipment difficulty + geography + geçmiş performans
- [ ] Technician overload / underload risk
- [x] Point-level service failure / repeated-attempt risk
- [ ] Data-quality risk ve yanlış yönlendirme koruması
- [x] AI Planning Engine — V1 açıklanabilir, non-mutating öneri motoru
- [x] Technician workload/capacity analysis
- [ ] Region health indicators
- [ ] SmartClean approaching-window risk/priority
- [ ] Recommendation ranking: equipment-heavy clusters + travel burden + technician capacity
- [x] Önerilerde mevcut bölge/görevlendirme/business-rule kısıtlarını hard constraint olarak uygula
- [ ] AI önerisinin admin tarafından kabul/red sonucunu audit et
- [ ] Recommendation feedback dataset oluştur

## P2 — Benzer dönem, simülasyon ve kalibrasyon

- [x] Similar Week matching: equipment mix + geographic dispersion + workload similarity
- [x] What-if simulator — V1 technician workload/risk simulation
- [x] What-if: equipment adet değişikliği
- [x] What-if: nokta ekleme/çıkarma — workload delta üzerinden
- [ ] What-if: bölge/teknisyen değişikliği
- [x] What-if: route/geography değişikliği
- [x] What-if çıktısı: workload delta + risk delta + confidence
- [ ] Outcome validation pipeline
- [ ] Equipment-type relative workload etkilerini gözlenen sonuçlardan kalibre et
- [ ] Travel-burden ağırlıklarını gözlenen süre/başarı sonuçlarından kalibre et
- [ ] Calibration drift takibi
- [ ] Model/heuristic versioning
- [ ] Feature versioning
- [ ] Backtest: geçmiş haftalarda öneri verilseydi sonuç ne olurdu?

## P3 — AI Location ve veri kalitesi

- [ ] AI Location Engine
- [ ] Learned canonical-location güvenini ziyaret geçmişiyle geliştirme
- [ ] Co-located / alias işletmeler için identity confidence
- [ ] İsim + adres + mesafe + geçmiş ziyaret kanıtını tek confidence modelinde birleştirme
- [ ] Location contradiction detection
- [ ] Implausible travel / suspicious batch skorunu geography modeline bağlama
- [ ] AI Data Quality Engine
- [ ] Missingness severity scoring
- [ ] Contradictory point metadata detection
- [ ] Stale equipment/location/profile detection
- [ ] Duplicate candidate confidence'i mevcut fuzzy duplicate sisteminden AI data-quality katmanına besleme
- [ ] Admin için “önce bunları düzelt” data-quality priority queue

## P4 — Operasyonel AI özetleri

- [ ] Günlük teknisyen AI özeti: riskler, gecikenler, yüksek yük, rota anomalileri
- [ ] Günlük admin AI özeti
- [ ] Hafta/period sonu AI özeti
- [ ] Region health trend
- [ ] Technician capacity trend
- [ ] Point difficulty trend
- [ ] Equipment data-quality trend
- [ ] Paperwork completion-time analitiğini risk sinyali olarak ekle
- [ ] AI Dashboard tarihsel karşılaştırma
- [ ] Export edilebilir AI/KPI raporu

## P5 — Test, güvenlik ve gözlemlenebilirlik

- [x] Risk Engine deterministik fixture testleri
- [x] Planning Engine deterministik fixture testleri
- [x] Similar Week testleri
- [x] What-if simulator — V1 technician workload/risk simulation testleri
- [ ] Calibration/backtest testleri
- [ ] Confidence/maturity gate testleri
- [ ] Veri eksik/çelişkili/stale durum testleri
- [ ] AI endpoint contract testleri
- [ ] AI Dashboard smoke/e2e testi
- [ ] Feature snapshot reproducibility testi
- [ ] Model/heuristic version bilgisini her AI çıktısına ekle
- [ ] AI hesaplama süresi ve hata metriği
- [ ] Risk/recommendation dağılım drift metriği

## Definition of Done — AI V1

AI V1 tamamlanmış sayılabilmesi için:

- [ ] Point difficulty, technician capacity ve travel burden üretimde birlikte çalışmalı
- [ ] Risk Engine gerçek operasyonel risk skoru üretmeli
- [ ] Planning Engine açıklanabilir öneriler üretmeli
- [ ] Tüm AI çıktılarında maturity/confidence/reason codes bulunmalı
- [ ] Düşük veri kalitesinde sistem güvenli biçimde öneriyi kısmalı
- [ ] Similar Week ve What-if en az temel sürümde çalışmalı
- [ ] Geçmiş veriyle backtest yapılabilmeli
- [ ] Admin AI Dashboard sonuçları tarihsel olarak karşılaştırabilmeli
- [ ] Kritik AI motorlarının otomatik testleri CI'da çalışmalı

## AI kapsamı dışında

- Arıza teşhisi / AI diagnosis
- Zorunlu fotoğraf analizi
- Bireysel ekipman/asset seviyesinde predictive maintenance
- Otomatik ve geri alınamaz personel kararı
