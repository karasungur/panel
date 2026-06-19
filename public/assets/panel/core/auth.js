import { guvenliId } from './format.js';

export function oturumBilgileriniTemizle() {
    localStorage.removeItem('kullanici');
    localStorage.removeItem('token');
}

export function loginSayfasinaGit() {
    oturumBilgileriniTemizle();
    window.location.href = '/';
}

export function kullaniciGecerliMi(kullanici) {
    return Boolean(kullanici && typeof kullanici === 'object' && guvenliId(kullanici.id));
}

export async function cikisYap() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    oturumBilgileriniTemizle();
    window.location.href = '/';
}
