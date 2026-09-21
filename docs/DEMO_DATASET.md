# Resetlenebilir mobil mockup veri paketi

Bu paket yalnızca local test/mock veritabanında çalışır. Production runtime, production ortam adı, uzak veritabanı hostu veya `_mockup` / `_test` ile bitmeyen veritabanı adları reddedilir.

## Sınırlandırılmış kayıtlar

- `Kordon Operasyon Bölgesi` ve yalnız `KOR-` noktaları
- `mockup.ozge.kaya` / `mockup.can.durmaz` teknik kullanıcıları; ekranda sırasıyla Özge Kaya ve Can Durmaz görünür
- Can Durmaz → Özge Kaya Yardım Et yetkisi
- Kısmi bakım (4/5, 1 eksik, yükümlülük tamamlandı), geçmiş tarih, gerçekçi konum kararı, yapılamadı, yardım, bakım dışı ziyaret ve evrak inceleme state'leri
- Doğal müşteri/işletme adları; kullanıcıya görünen kayıtlarda `Demo` ifadesi yoktur

Reset yalnız bu isimli kayıtların ilişkilerini siler ve aynı paketi yeniden kurar. Operational kayıtlara, SAP verisine, API contract'larına veya production veritabanına bağlanmaz.

## Local mockup komutu

Açık onay, local host ve test/mock veritabanı zorunludur:

```bash
MOCKUP_DATASET=mobile-evidence NODE_ENV=test \
DATABASE_URL='postgresql://<local-user>:<local-password>@127.0.0.1:5432/field_maintenance_mockup' \
MOCKUP_TECHNICIAN_PASSWORD='<en az 16 karakter>' \
npm run mockup:reset -w @fmp/api
```

Yalnız isimli paketi silmek için aynı güvenli environment ile `npm run mockup:purge -w @fmp/api` çalıştırılır. Bu komutlar ambient `.env` dosyası yüklemez; gerekli ortam değişkenleri açıkça verilmelidir.
