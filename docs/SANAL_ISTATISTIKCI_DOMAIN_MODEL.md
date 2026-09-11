# Sanal İstatistikçi — Domain Model

## Amaç

Sanal İstatistikçi, saha bakım sisteminin operasyonel source-of-truth tablolarını değiştirmeden haftalık analiz, risk, anomali, veri olgunluğu ve öneri üreten ayrı bir analitik domain olarak tasarlanır.

Temel sınır:

- Rules Engine gerçek operasyon kurallarını uygular.
- Sanal İstatistikçi operasyon verisini okur, türetilmiş analitik veriyi kendi tablolarında saklar.
- Sanal İstatistikçi bakım, atama, bölge, rut haftası, kullanıcı veya evrak durumunu değiştirmez.
- AI/analitik çıktılar gerçek operasyon kaydından ayrı tutulur.
- Geçmiş tahmin ve snapshot kayıtları geriye dönük overwrite edilmez.

## Haftalık zaman standardı

Analitik hafta ISO hafta mantığında Pazartesi 00:00–Pazar 23:59:59 olarak ele alınacaktır. Bu kavram `Point.maintenanceWeek` içindeki Standard Rut Haftası 1/2 ile aynı şey değildir ve birbirine bağlanmayacaktır.

Her haftalık analitik kayıt için en az şu alanlar bulunacaktır:

- `weekStart` — Pazartesi, date
- `weekEnd` — Pazar, date
- `isoYear`
- `isoWeek`
- `generatedAt`
- `modelVersionId`
- mümkün olduğunda `featureSnapshotId`

## Enum tasarımı

### AiEntityType
- SYSTEM
- TECHNICIAN
- REGION
- POINT
- WEEK

### AiMaturityState
- INACTIVE
- WARMING_UP
- ACTIVE
- RELIABLE

### AiConfidenceLevel
- UNKNOWN
- LOW
- MEDIUM
- HIGH

### AiSignalSeverity
- INFO
- LOW
- MEDIUM
- HIGH
- CRITICAL

### AiRiskType
İlk sürüm için genişletilebilir enum:
- WEEK_COMPLETION
- CARRYOVER
- WORKLOAD
- GEOGRAPHIC_OVERLOAD
- POINT_DIFFICULTY
- REPEATED_FAILURE
- DATA_QUALITY
- CASCADING_LOAD

### AiAnomalyType
- RAPID_MULTI_POINT
- IMPOSSIBLE_TRAVEL
- LOCATION_DEVIATION
- UNUSUAL_COMPLETION_PATTERN
- WORK_AREA_DEVIATION
- DATA_PATTERN

### AiRecommendationStatus
- OPEN
- ACCEPTED
- REJECTED
- NO_ACTION
- EXPIRED

### AiRecommendationType
- WORKLOAD_REVIEW
- GEOGRAPHIC_REBALANCE
- POINT_CLUSTER_REVIEW
- REGION_REVIEW
- DATA_QUALITY_REVIEW
- REPEATED_PROBLEM_REVIEW
- RISK_REVIEW

### AiOutcomeState
- PENDING
- CONFIRMED
- NOT_CONFIRMED
- INCONCLUSIVE

## Ana tablolar

### AiModelVersion
Sanal İstatistikçi algoritma/model sürümünü immutable şekilde tanımlar.

Alanlar:
- `id UUID PK`
- `name String`
- `version String`
- `engineType String` — deterministic/statistical/ml gibi
- `configuration Json`
- `featureSchemaVersion String`
- `active Boolean`
- `createdAt DateTime`
- `retiredAt DateTime?`

Kurallar:
- `name + version` unique.
- Eski tahminler yeni model sürümüne bağlanmaz.
- Bir sürüm emekliye ayrılabilir fakat silinmez.

### AiFeatureSnapshot
Feature Store'un haftalık immutable snapshot üst kaydıdır.

Alanlar:
- `id UUID PK`
- `weekStart Date`
- `weekEnd Date`
- `isoYear Int`
- `isoWeek Int`
- `schemaVersion String`
- `sourceCutoffAt DateTime`
- `generatedAt DateTime`
- `complete Boolean`
- `qualityScore Decimal?`
- `metadata Json?`

Kurallar:
- Aynı hafta için birden fazla snapshot üretilebilir; sonradan yeniden üretim eski snapshot'ı değiştirmez.
- Analiz kayıtları kullandıkları snapshot'a FK ile bağlanır.

### AiFeatureValue
Snapshot içindeki normalize edilmiş feature değerleri.

Alanlar:
- `id UUID PK`
- `snapshotId UUID FK -> AiFeatureSnapshot`
- `entityType AiEntityType`
- `entityId String?`
- `featureKey String`
- `numericValue Decimal?`
- `textValue String?`
- `jsonValue Json?`
- `confidence Decimal?`
- `sampleSize Int?`
- `createdAt DateTime`

Indexler:
- `(snapshotId, entityType, entityId)`
- `(snapshotId, featureKey)`
- mümkünse `(snapshotId, entityType, entityId, featureKey)` unique

Not: İlk iterasyonda feature set'i hızlı büyüyeceği için EAV-benzeri bu yapı esneklik sağlar. Sıcak/yoğun sorgulanan feature'lar daha sonra profil tablolarına kolon olarak promote edilebilir.

### AiDataMaturity
Her analitik modülün veri olgunluğunu tutar.

Alanlar:
- `id UUID PK`
- `moduleKey String`
- `entityType AiEntityType`
- `entityId String?`
- `state AiMaturityState`
- `score Decimal`
- `sampleSize Int`
- `qualityScore Decimal?`
- `coverageScore Decimal?`
- `accuracyScore Decimal?`
- `requirements Json`
- `missingRequirements Json?`
- `evaluatedAt DateTime`
- `snapshotId UUID? FK`

Amaç:
- Modüllerin otomatik olarak INACTIVE -> WARMING_UP -> ACTIVE -> RELIABLE geçmesini sağlamak.
- Veri miktarı tek başına yeterli değildir; kalite ve model başarısı da hesaba katılır.

### AiTechnicianProfile
Teknisyenin zaman içinde öğrenilen haftalık çalışma profilidir.

Alanlar:
- `id UUID PK`
- `technicianId UUID FK -> User`
- `snapshotId UUID FK`
- `weekStart Date`
- `baselineLoad Decimal?`
- `estimatedCapacity Decimal?`
- `workloadScore Decimal?`
- `geographicDispersionScore Decimal?`
- `completionRate Decimal?`
- `attemptRate Decimal?`
- `carryoverRate Decimal?`
- `actualRegionIds Json?`
- `workAreaProfile Json?`
- `sampleWeeks Int`
- `confidenceLevel AiConfidenceLevel`
- `createdAt DateTime`

Unique önerisi:
- `(snapshotId, technicianId)`

### AiPointProfile
Noktanın zaman içinde öğrenilen zorluk ve saha profilidir.

Alanlar:
- `id UUID PK`
- `pointId UUID FK -> Point`
- `snapshotId UUID FK`
- `weekStart Date`
- `difficultyScore Decimal?`
- `failureRate Decimal?`
- `repeatProblemScore Decimal?`
- `geographicAccessScore Decimal?`
- `expectedServiceEffort Decimal?`
- `visitCount Int`
- `attemptCount Int`
- `confidenceLevel AiConfidenceLevel`
- `factors Json?`
- `createdAt DateTime`

Not: Güvenilir gerçek servis süresi henüz source-of-truth'ta yoktur. `expectedServiceEffort` ilk aşamada süreymiş gibi yorumlanmayacak; mevcut gözlemlenebilir yük faktörlerinden türetilen göreli bir değer olacaktır.

### AiRegionProfile
Bölgenin haftalık coğrafi ve operasyonel profilidir.

Alanlar:
- `id UUID PK`
- `regionId UUID FK -> Region`
- `snapshotId UUID FK`
- `weekStart Date`
- `pointCount Int`
- `activePointCount Int`
- `geographicDispersionScore Decimal?`
- `workloadScore Decimal?`
- `completionRate Decimal?`
- `attemptRate Decimal?`
- `riskScore Decimal?`
- `neighborRegionIds Json?`
- `centroidLatitude Decimal?`
- `centroidLongitude Decimal?`
- `confidenceLevel AiConfidenceLevel`
- `createdAt DateTime`

### AiWeeklyAssessment
Bir haftanın Sanal İstatistikçi tarafından oluşturulan üst seviye değerlendirmesidir.

Alanlar:
- `id UUID PK`
- `snapshotId UUID FK`
- `modelVersionId UUID FK`
- `weekStart Date`
- `weekEnd Date`
- `isoYear Int`
- `isoWeek Int`
- `assessmentRevision Int`
- `overallScore Decimal?`
- `confidenceLevel AiConfidenceLevel`
- `plannedCount Int`
- `completedCount Int`
- `attemptCount Int`
- `remainingCount Int`
- `carryoverRisk Decimal?`
- `summary Json`
- `generatedAt DateTime`

Unique önerisi:
- `(weekStart, modelVersionId, snapshotId, assessmentRevision)`

Hafta içinde yeniden değerlendirme yeni revision oluşturur; eski değerlendirme overwrite edilmez.

### AiRiskSignal
Teknisyen, bölge, nokta veya hafta seviyesindeki risk sinyali.

Alanlar:
- `id UUID PK`
- `assessmentId UUID FK -> AiWeeklyAssessment`
- `riskType AiRiskType`
- `entityType AiEntityType`
- `entityId String?`
- `score Decimal`
- `severity AiSignalSeverity`
- `confidenceLevel AiConfidenceLevel`
- `evidence Json`
- `explanationCode String`
- `createdAt DateTime`

Not: `explanationCode` UI'da deterministic açıklama üretmek için kullanılacak; doğal dil/chat motoruna bağımlı olmayacak.

### AiAnomaly
Mevcut deterministic bakım anomaly flag'lerinden ayrı, Sanal İstatistikçi analitik anomalilerini saklar.

Alanlar:
- `id UUID PK`
- `assessmentId UUID? FK`
- `snapshotId UUID FK`
- `anomalyType AiAnomalyType`
- `entityType AiEntityType`
- `entityId String?`
- `score Decimal`
- `severity AiSignalSeverity`
- `confidenceLevel AiConfidenceLevel`
- `evidence Json`
- `reviewRequired Boolean @default(true)`
- `createdAt DateTime`

Sanal İstatistikçi buradan operasyonel `MaintenanceVisit.reviewRecommended` alanını doğrudan değiştirmeyecek.

### AiRecommendation
Sanal İstatistikçi önerisi. Production operasyon tablosuna write etkisi yoktur.

Alanlar:
- `id UUID PK`
- `assessmentId UUID FK`
- `type AiRecommendationType`
- `entityType AiEntityType`
- `entityId String?`
- `titleCode String`
- `problem Json`
- `evidence Json`
- `estimatedImpact Json?`
- `recommendation Json`
- `alternatives Json?`
- `confidenceLevel AiConfidenceLevel`
- `confidenceScore Decimal?`
- `status AiRecommendationStatus @default(OPEN)`
- `expiresAt DateTime?`
- `createdAt DateTime`

Kural:
- `AiRecommendation` hiçbir operasyon işlemini çalıştırmaz.
- UI'da yalnız İncele vardır; Apply/Uygula action'ı yoktur.

### AiRecommendationFeedback
Yöneticinin öneri hakkındaki geri bildirimidir; operasyon işlemi değildir.

Alanlar:
- `id UUID PK`
- `recommendationId UUID FK`
- `adminUserId UUID FK -> User`
- `status AiRecommendationStatus` — ACCEPTED/REJECTED/NO_ACTION
- `note String?`
- `createdAt DateTime`

Bu tablo model performansını ve fayda oranını ölçmek için kullanılacaktır.

### AiPredictionOutcome
Bir risk/tahminin daha sonra gerçekleşen sonuçla eşleştirilmesi.

Alanlar:
- `id UUID PK`
- `riskSignalId UUID? FK`
- `recommendationId UUID? FK`
- `outcomeState AiOutcomeState`
- `observedValue Json?`
- `expectedValue Json?`
- `evaluatedAt DateTime`
- `evaluationWindowStart DateTime?`
- `evaluationWindowEnd DateTime?`
- `metadata Json?`

Kural:
- Risk veya öneri taraflarından en az biri dolu olmalıdır; migration aşamasında CHECK constraint ile korunması değerlendirilecektir.

## İlişkiler

Mevcut source-of-truth tablolarıyla yalnız analitik referans ilişkileri kurulacaktır:

- `User -> AiTechnicianProfile[]`
- `User -> AiRecommendationFeedback[]` (admin feedback)
- `Point -> AiPointProfile[]`
- `Region -> AiRegionProfile[]`

AI tablolarına ilişkin relation alanlarının mevcut modellere eklenmesi operasyon mantığını değiştirmez.

`AiRiskSignal`, `AiAnomaly` ve `AiRecommendation` için farklı entity tiplerini tek tabloda desteklemek amacıyla `entityType + entityId` polymorphic referansı kullanılacaktır. Bunlar DB foreign key ile tek bir tabloya bağlanamaz; servis katmanında doğrulanacaktır. Profil tablolarında ise güçlü FK kullanılacaktır.

## Silme ve geçmiş koruma politikası

- Feature snapshot, weekly assessment, risk, anomaly ve prediction outcome kayıtları normal uygulama akışında hard-delete edilmez.
- Point/User/Region soft-delete veya pasif hale gelse bile geçmiş analitik kayıtlar korunur.
- Bu nedenle tarihsel analitik FK'lerde Cascade delete kullanılmayacaktır.
- Production retention politikası ileride ayrıca tanımlanabilir.

## Index stratejisi

İlk migration için kritik indexler:

- `AiFeatureSnapshot(weekStart, generatedAt)`
- `AiFeatureValue(snapshotId, entityType, entityId)`
- `AiFeatureValue(snapshotId, featureKey)`
- `AiDataMaturity(moduleKey, entityType, entityId)`
- `AiTechnicianProfile(technicianId, weekStart)`
- `AiPointProfile(pointId, weekStart)`
- `AiRegionProfile(regionId, weekStart)`
- `AiWeeklyAssessment(weekStart, generatedAt)`
- `AiRiskSignal(assessmentId, severity)`
- `AiRiskSignal(entityType, entityId, createdAt)`
- `AiAnomaly(entityType, entityId, createdAt)`
- `AiRecommendation(assessmentId, status)`
- `AiRecommendationFeedback(recommendationId, createdAt)`
- `AiPredictionOutcome(evaluatedAt)`

## Yetki sınırı

Sanal İstatistikçi servis katmanı için mimari kural:

### Okuyabilir
- User/technician durumları
- Region ve atamalar
- Point ve koordinatları
- MaintenanceObligation
- MaintenanceVisit
- MaintenanceAttempt
- PointAssignment
- yardım ilişkileri
- review/audit geçmişi
- prospect/non-maintenance visit verileri gerektiğinde

### Yazabilir
Yalnız `Ai*` domain tablolarına.

### Yazamaz
- users
- regions
- points
- point_assignments
- maintenance_obligations
- maintenance_visits
- maintenance_attempts
- paperwork durumları
- gerçek operasyon audit kararları

DB seviyesinde ayrı read-only/analytics DB role kullanımı ileriki güvenlik adımında ayrıca uygulanacaktır.

## Cold-start ve otomatik olgunlaşma desteği

Domain model başlangıçtan itibaren şu davranışı destekler:

1. Veri azsa `AiDataMaturity.state = INACTIVE/WARMING_UP`.
2. Yeterli örnek ve kalite oluşunca modül `ACTIVE` olur.
3. Gerçekleşen sonuçlarla doğruluk yeterince yükselirse `RELIABLE` olur.
4. Veri veya performans bozulursa seviye tekrar düşebilir.
5. Yeni teknisyen/nokta/bölgelerde cohort/company baseline kullanılabilir; bunun kaynağı `factors/metadata` içinde açıkça tutulur.

Bu sayede bütün altyapı ilk günden mevcuttur; yetenekler güvenilir veri geldikçe otomatik olarak etkinleşebilir.

## Sonraki adımlar için sözleşme

Bu doküman Adım 2'nin tasarım sözleşmesidir. Adım 3'te haftalık zaman standardı yardımcı fonksiyonları ve test sınırları netleştirilecektir. Prisma modellerinin schema'ya eklenmesi ve migration oluşturulması, veri modelinin uygulama aşamasında bu sözleşmeye göre yapılacaktır.
