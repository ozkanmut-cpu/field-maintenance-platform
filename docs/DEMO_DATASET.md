# Silinebilir önizleme veri paketi

Bu paket yalnızca `Kordon Operasyon Bölgesi` içindeki `KOR-` nokta kodlarında ve `ozge.kaya` / `can.durmaz` kullanıcılarında veri oluşturur. Gerçek SAP verisi veya gerçek bakım noktası üretmez.

## İçerik

- 11 nokta: aktif, pasif, iptal; Standard ve Smart Clean karışımı
- 7 bakım kaydı: açık görev, kısmi bakım, geçmiş tarihli kayıt ve konum incelemesi
- Tüm evrak statüleri: bekliyor, var, eksik, yönetici incelemesi ve onaylandı
- Yapılamadı, bakım dışı ziyaret, alias, geçici atama, yardım yetkisi ve müşteri adayı

Her kayıt yalnız önizleme amacıyla oluşturulur; kullanıcı arayüzünde “Demo” adı görünmez.

## Production işlemleri

Yalnız yetkili bakım penceresinde, API'nin çalıştığı ortamda çalıştırılır:

```bash
DEMO_TECHNICIAN_PASSWORD='<en az 16 karakter>' npm run demo:seed -w @fmp/api
npm run demo:purge -w @fmp/api
```

İlk komut paketi yeniden oluşturur. İkinci komut yalnız Kordon Operasyon Bölgesi, ona bağlı noktalar, iki önizleme kullanıcısı ve ilişkili kayıtları siler.

<!-- CI tetikleme kaydı: 2026-09-21 -->
