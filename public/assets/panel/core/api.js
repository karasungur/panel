export function createApi(loginSayfasinaGit) {
    return async function apicagir(url, method = 'GET', body = null) {
        /** @type {RequestInit & { headers: Record<string, string> }} */
        const ayar = { method, credentials: 'include', headers: {} };
        if (body !== null && body !== undefined) {
            ayar.headers['Content-Type'] = 'application/json';
            ayar.body = JSON.stringify(body);
        }
        let c;
        try {
            c = await fetch(url, ayar);
        } catch {
            return { hata: 'Sunucuya bağlanılamadı.' };
        }
        if (c.status === 401) {
            loginSayfasinaGit();
            return { hata: 'Oturum süresi doldu.' };
        }
        let veri;
        try {
            const tip = c.headers.get('content-type') || '';
            veri = tip.includes('application/json') ? await c.json() : null;
        } catch {
            veri = null;
        }
        if (!c.ok) {
            const hata = veri && (veri.hata || veri.error || veri.mesaj);
            return { hata: hata || 'İstek başarısız. (' + c.status + ')' };
        }
        return veri == null ? {} : veri;
    };
}
