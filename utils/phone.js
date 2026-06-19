function telefonNormalizeEt(deger) {
    if (deger === null || deger === undefined) return null;

    let rakam = String(deger).trim().replace(/\D/g, '');
    if (rakam.startsWith('0090') && rakam.length === 14) rakam = rakam.slice(4);
    else if (rakam.startsWith('90') && rakam.length === 12) rakam = rakam.slice(2);
    else if (rakam.startsWith('0') && rakam.length === 11) rakam = rakam.slice(1);

    if (!/^5\d{9}$/.test(rakam)) return null;
    return '+90' + rakam;
}

function telefonGecerliMi(deger) {
    return telefonNormalizeEt(deger) !== null;
}

function telefonFormatla(deger) {
    const telefon = telefonNormalizeEt(deger);
    if (!telefon) return '';

    const rakam = telefon.slice(3);
    return '0' + rakam.slice(0, 3) + '-' + rakam.slice(3, 6) + '-' + rakam.slice(6, 8) + '-' + rakam.slice(8);
}

function telefonSon10Hane(deger) {
    const telefon = telefonNormalizeEt(deger);
    return telefon ? telefon.slice(3) : '';
}

function telefonHatasi(deger) {
    if (telefonGecerliMi(deger)) return null;
    return 'Telefon numarası +90 ile başlayan geçerli bir GSM numarası olmalıdır.';
}

function kullaniciGorunenAd(kullanici, varsayilan = 'Kullanıcı') {
    if (!kullanici || typeof kullanici !== 'object') return varsayilan;
    return kullanici.ad_soyad || telefonFormatla(kullanici.telefon) || varsayilan;
}

module.exports = {
    telefonNormalizeEt,
    telefonGecerliMi,
    telefonFormatla,
    telefonSon10Hane,
    telefonHatasi,
    kullaniciGorunenAd
};
