# Silinebilir demo veri paketi

Bu paket yalnızca `__DEMO__ Mobil ve Admin Önizleme` bölgesinde, `DEMO-` nokta kodlarında ve `demo-` kullanıcı adlarında veri oluşturur. Gerçek SAP verisi veya gerçek bakım noktası üretmez.

## İçerik

- Açık bakım görevi, kısmi bakım ve geçmiş kaydı
- Eksik teyit, eksik servis fişi ve yönetici incelemesi bekleyen servis fişi
- Yapılamadı kaydı, bakım dışı ziyaret, alias, geçici atama ve yardım yetkisi
- Aktif, pasif ve iptal nokta örnekleri ile müşteri adayı

## Production işlemleri

Yalnız yetkili bakım penceresinde, API'nin çalıştığı ortamda çalıştırılır:

```bash
DEMO_TECHNICIAN_PASSWORD='<en az 16 karakter>' npm run demo:seed -w @fmp/api
npm run demo:purge -w @fmp/api
```

İlk komut paketi yeniden oluşturur. İkinci komut yalnız demo bölgesi, demo noktaları, demo kullanıcıları ve bunlara bağlı kayıtları siler.
