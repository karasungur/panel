# Teşkilat Yönetim Paneli (v3)

Kapalı devre, kurumsal Tanıtım ve Medya yönetim paneli.

## Özellikler
- Güvenli giriş (kullanıcı adı + şifre)
- İnteraktif Türkiye haritası — il üzerine gelince başkan fotoğrafı, adı, telefonu ve ilçe sayısı
- İl tıklanınca aynı sayfada aşağı kayarak ilçeler açılır
- Çoklu il atama (bir kullanıcıya birden fazla il)
- İl/ilçe Tanıtım ve Medya Başkanı: ad-soyad, telefon, TC, fotoğraf
- Sosyal medya linkleri (Instagram, X, Facebook, TikTok)
- Excel içe aktarma (akıllı sütun tanıma) ve Excel dışa aktarma
- Kullanıcı yönetimi: görev adı, etiket rengi, isim-soyisim
- Görev sistemi: admin kullanıcılara görev atar
- Ortak ekip sohbeti (admin sıfırlayabilir)
- Profil: herkes kendi ad-soyad/kullanıcı adı/şifresini değiştirir
- Admin: herkesin şifresini değiştirebilir
- Açık/kurumsal lacivert tema

## Kurulum (Windows)
1. PowerShell aç, `cd Desktop\tm\panel`
2. `npm install`
3. `Copy-Item .env.example .env` sonra `notepad .env` ile düzenle
4. Haritayı ekle: `harita-indir.html`'i çift tıkla → indir → `turkiye.svg`'yi `public` klasörüne koy
5. `npm run seed`
6. `npm start`
7. Tarayıcıda http://localhost:3000

Node.js 22.13+ gereklidir (node:sqlite için).

## npm komutlari

| Komut | Aciklama |
| --- | --- |
| `npm start` | Uygulamayi baslatir. |
| `npm run migrate` | SQLite semasini ve kayitli migrationlari uygular. |
| `npm run seed` | Admin kullaniciyi ve temel il/ilce verilerini olusturur. |
| `npm run backup` | `panel.db` icin timestamp'li SQLite yedegi alir. |
| `npm run check` | Node surumu, env dokumani ve temel deploy dosyalarini kontrol eder. |
| `npm test` | `node:test` smoke testlerini calistirir. |

## Ortam degiskenleri

`.env.example` dosyasini `.env` olarak kopyalayip gercek degerlerle guncelleyin.

| Degisken | Zorunluluk | Aciklama |
| --- | --- | --- |
| `NODE_ENV` | Production'da zorunlu | `development` veya `production`. |
| `PORT` | Evet | HTTP portu. systemd arkasinda genelde `3000`. |
| `APP_ORIGIN` | Onerilir | Virgulle ayrilmis izinli CORS origin listesi. Bos ise sadece same-origin/no-origin istekler kabul edilir. |
| `TRUST_PROXY` | Onerilir | Reverse proxy arkasinda `1`. |
| `DATA_DIR` | Production'da zorunlu | `panel.db` ve upload verileri icin kalici dizin. |
| `BACKUP_DIR` | Production'da zorunlu | `npm run backup` ciktilari icin dizin. |
| `ADMIN_KULLANICI_ADI` | Evet | `npm run seed` ile olusturulan admin kullanici adi. |
| `ADMIN_SIFRE` | Evet | Ilk admin sifresi; production'da varsayilan kullanmayin. |
| `JWT_SECRET` | Evet | JWT imzalama anahtari; uzun ve rastgele olmali. |
| `GEMINI_AI_ENABLED` | Opsiyonel | `true` olmadikca Gemini destekli Excel analizi kapali kalir. |
| `GEMINI_API_KEY` | Opsiyonel | AI etkinse Gemini API anahtari. |
| `GEMINI_MODEL` | Opsiyonel | Varsayilan `gemini-2.0-flash`. |
| `GEMINI_TIMEOUT_MS` | Opsiyonel | Gemini istek zaman asimi; 1000-60000 ms arasi. |

## Test

Smoke testler Node'un yerlesik `node:test` kosucusunu kullanir:

```bash
npm test
```

Temel kapsam:
- `.env.example` dosyasinin runtime anahtarlarini belgeledigini kontrol eder.
- Gecici `DATA_DIR` ile uygulamayi acip `GET /api` icin HTTP 200 smoke testi yapar.

## Native Linux deploy

systemd ile Docker'siz deploy akisi icin [docs/systemd-deploy.md](docs/systemd-deploy.md) dosyasina bakin.
