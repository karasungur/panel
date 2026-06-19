export function metin(v) {
    return v == null ? '' : String(v);
}

export function escapeHTML(v) {
    return metin(v).replace(
        /[&<>"']/g,
        (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );
}

export const esc = escapeHTML;

export function guvenliJsonParse(v, varsayilan) {
    try {
        return v ? JSON.parse(v) : varsayilan;
    } catch {
        return varsayilan;
    }
}

export function guvenliUrl(url) {
    const raw = metin(url).trim();
    if (!raw) return '';
    try {
        const u = new URL(raw, window.location.origin);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch {}
    return '';
}

export function resimUrl(url) {
    const u = guvenliUrl(url);
    if (!u) return '';
    return u;
}

export function guvenliRenk(renk, varsayilan = '#24467c') {
    const r = metin(renk).trim();
    return /^#[0-9a-f]{3,8}$/i.test(r) ? r : varsayilan;
}

export function guvenliId(v) {
    const n = Number.parseInt(v, 10);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function resimKaynakAta(el, url) {
    if (!el) return false;
    const u = resimUrl(url);
    if (u) {
        el.src = u;
        el.style.display = 'block';
        return true;
    }
    el.removeAttribute('src');
    el.style.display = 'none';
    return false;
}

export function resimHTML(url, className = '', style = '') {
    const u = resimUrl(url);
    if (!u) return '';
    return (
        '<img alt="" src="' +
        esc(u) +
        '"' +
        (className ? ' class="' + esc(className) + '"' : '') +
        (style ? ' style="' + esc(style) + '"' : '') +
        '>'
    );
}

export function guvenliHash(link) {
    const bolum = metin(link).split('#')[1] || '';
    return /^[A-Za-z0-9/_-]+$/.test(bolum) ? bolum : '';
}

export function guvenliExcelTip(tip) {
    return ['il', 'ilce', 'birlesik'].includes(tip) ? tip : 'il';
}

export function basHarfleri(ad) {
    if (!ad) return '?';
    return ad
        .split(' ')
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function telefonRakamlariniAl(deger) {
    let rakam = metin(deger).replace(/\D/g, '');
    if (rakam.startsWith('90') && rakam.length === 12) rakam = rakam.slice(2);
    else if (rakam.startsWith('0') && rakam.length === 11) rakam = rakam.slice(1);
    return rakam;
}

export function telefonGonderimDegeri(deger) {
    const rakam = telefonRakamlariniAl(deger);
    return /^5\d{9}$/.test(rakam) ? '+90' + rakam : '';
}

export function telefonGoster(deger) {
    const rakam = telefonRakamlariniAl(deger);
    if (!/^5\d{9}$/.test(rakam)) return '';
    return '0' + rakam.slice(0, 3) + '-' + rakam.slice(3, 6) + '-' + rakam.slice(6, 8) + '-' + rakam.slice(8);
}

export function kullaniciGorunenAd(k, varsayilan = 'Kullanıcı') {
    if (!k || typeof k !== 'object') return varsayilan;
    return metin(k.ad_soyad) || telefonGoster(k.telefon) || varsayilan;
}
