# Teşkilat Yönetim Paneli (v3)

Kapalı devre, kurumsal Tanıtım ve Medya yönetim paneli.

## Özellikler
- Güvenli giriş (kullanıcı adı + şifre + özel anahtar)
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
- Admin: özel anahtarı ve herkesin şifresini değiştirebilir
- Açık/kurumsal lacivert tema

## Kurulum (Windows)
1. PowerShell aç, `cd Desktop\tm\panel`
2. `npm install`
3. `Copy-Item .env.example .env` sonra `notepad .env` ile düzenle
4. Haritayı ekle: `harita-indir.html`'i çift tıkla → indir → `turkiye.svg`'yi `public` klasörüne koy
5. `npm run seed`
6. `npm start`
7. Tarayıcıda http://localhost:3000

Node.js 22.5+ gereklidir (node:sqlite için).
