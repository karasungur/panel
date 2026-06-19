const MIN_PAROLA_UZUNLUK = 10;
const MIN_ADMIN_PAROLA_UZUNLUK = 12;
const MIN_JWT_SECRET_UZUNLUK = 32;

const PLACEHOLDER_PATTERN =
    /(admin123|changeme|change-me|change_me|degistir|değiştir|example|gizli|placeholder|secret|varsayilan|varsayılan)/i;

const ZAYIF_PAROLALAR = new Set([
    'admin',
    'admin123',
    'password',
    'password123',
    'panel',
    'qwerty',
    'test',
    '123456',
    '12345678',
    '123456789'
]);

const ZAYIF_JWT_SECRETLERI = new Set([
    'varsayilan-gizli-anahtar-degistirin',
    'cok-gizli-jwt-anahtari-degistirin',
    'degistirilecek-uzun-rastgele-jwt-secret',
    'change-me',
    'changeme'
]);

function metin(value) {
    return String(value || '').trim();
}

function placeholderMi(value) {
    return !metin(value) || PLACEHOLDER_PATTERN.test(metin(value));
}

function parolaHatasi(parola, options = {}) {
    const password = metin(parola);
    const minLength = options.admin ? MIN_ADMIN_PAROLA_UZUNLUK : MIN_PAROLA_UZUNLUK;
    const username = metin(options.kullaniciAdi).toLowerCase();
    const normalized = password.toLowerCase();

    if (password.length < minLength) {
        return `Şifre en az ${minLength} karakter olmalıdır.`;
    }
    if (ZAYIF_PAROLALAR.has(normalized) || placeholderMi(password)) {
        return 'Şifre varsayılan veya kolay tahmin edilebilir olmamalıdır.';
    }
    if (username && normalized === username) {
        return 'Şifre kullanıcı adı ile aynı olamaz.';
    }
    return null;
}

function jwtSecretHatasi(secret) {
    const value = metin(secret);
    const normalized = value.toLowerCase();
    if (value.length < MIN_JWT_SECRET_UZUNLUK) {
        return `JWT_SECRET en az ${MIN_JWT_SECRET_UZUNLUK} karakter olmalıdır.`;
    }
    if (ZAYIF_JWT_SECRETLERI.has(normalized) || placeholderMi(value)) {
        return 'JWT_SECRET placeholder/default olmayan rastgele bir değer olmalıdır.';
    }
    return null;
}

function productionTrustProxyHatasi(value) {
    return metin(value).toLowerCase() === 'true'
        ? 'Production için TRUST_PROXY=true kullanmayın; sayısal hop değeri kullanın.'
        : null;
}

module.exports = {
    MIN_PAROLA_UZUNLUK,
    MIN_ADMIN_PAROLA_UZUNLUK,
    MIN_JWT_SECRET_UZUNLUK,
    parolaHatasi,
    jwtSecretHatasi,
    productionTrustProxyHatasi
};
