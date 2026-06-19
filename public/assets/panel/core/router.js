import { PANEL_SAYFALARI } from './state.js';

export function createRouter(pageLoaders) {
    function panelSayfasiAl() {
        if (window.location.pathname === '/panel.html') {
            const hash = window.location.hash.replace(/^#/, '');
            const hedef = PANEL_SAYFALARI.has(hash) ? hash : 'harita';
            window.location.replace('/panel/' + hedef);
            return hedef;
        }
        const parca = window.location.pathname.split('/').filter(Boolean).pop() || 'harita';
        return PANEL_SAYFALARI.has(parca) ? parca : 'harita';
    }

    function sayfaYukle(ad) {
        pageLoaders[ad]?.();
    }

    function sayfaAktifEt(ad) {
        const hedef = PANEL_SAYFALARI.has(ad) ? ad : 'harita';
        document.querySelectorAll('.sayfa').forEach((s) => {
            s.classList.remove('aktif');
        });
        document.querySelectorAll('.sb-nav button').forEach((b) => {
            b.classList.remove('aktif');
        });
        document.getElementById('sayfa-' + hedef).classList.add('aktif');
        const mb = document.getElementById('menu-' + hedef);
        if (mb) mb.classList.add('aktif');
        sayfaYukle(hedef);
    }

    function sayfaGoster(ad) {
        const hedef = PANEL_SAYFALARI.has(ad) ? ad : 'harita';
        const yol = '/panel/' + hedef;
        if (window.location.pathname !== yol) {
            window.history.pushState({ sayfa: hedef }, '', yol);
        }
        sayfaAktifEt(hedef);
    }

    return { actions: { sayfaGoster }, panelSayfasiAl, sayfaAktifEt, sayfaGoster };
}
