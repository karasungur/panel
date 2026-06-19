const PANEL_LINK_SAYFALARI = new Set(['harita', 'iller', 'gorevler', 'chat', 'kullanicilar', 'profil', 'notlar']);

export function createNotificationsFeature(ctx) {
    const { state, actions, metin, esc, guvenliId, kullaniciGorunenAd, toast, apicagir } = ctx;
    const sayfaGoster = (...args) => actions.sayfaGoster(...args);

    function bildirimHedefiAl(link) {
        const raw = metin(link).trim();
        if (!raw || typeof window === 'undefined' || !window.location) return { hash: '', sayfa: '' };

        try {
            const u = new URL(raw, window.location.origin);
            if (u.origin !== window.location.origin) return { hash: '', sayfa: '' };

            const hashBolum = u.hash.replace(/^#/, '');
            const hash = /^[A-Za-z0-9/_-]+$/.test(hashBolum) ? hashBolum : '';
            const parcalar = u.pathname.split('/').filter(Boolean);
            let sayfa = '';

            if (hash && PANEL_LINK_SAYFALARI.has(hash)) {
                sayfa = hash;
            } else if (parcalar[0] === 'panel' && parcalar.length === 2 && PANEL_LINK_SAYFALARI.has(parcalar[1])) {
                sayfa = parcalar[1];
            } else if (u.pathname === '/panel' || u.pathname === '/panel/') {
                sayfa = 'harita';
            }

            return { hash, sayfa };
        } catch {
            return { hash: '', sayfa: '' };
        }
    }

    async function mesajBildirimSohbetiniAc(hash) {
        const eslesme = /^chat-balon-(\d+)$/.exec(hash);
        if (!eslesme || typeof actions.sohbetAc !== 'function') return false;

        const kisiId = guvenliId(eslesme[1]);
        if (!kisiId) return false;

        try {
            if (typeof actions.chatKisileriYukle === 'function') await actions.chatKisileriYukle();
            const kisiler = Array.isArray(state.chatKisilerListesi) ? state.chatKisilerListesi : [];
            const kisi = kisiler.find((k) => guvenliId(k.kisi_id || k.id) === kisiId);
            if (!kisi) return false;

            await actions.sohbetAc(kisiId, kullaniciGorunenAd(kisi), kisi.renk, kisi.son_giris);
            return true;
        } catch {
            return false;
        }
    }

    async function bildirimLinkiniAc(b) {
        const hedef = bildirimHedefiAl(b.link);
        let yonlendirildi = false;

        if (hedef.hash) location.hash = hedef.hash;
        if (hedef.sayfa) {
            sayfaGoster(hedef.sayfa);
            yonlendirildi = true;
        }

        if (b.tip === 'mesaj_yeni') {
            const sohbetHashMi = /^chat-balon-\d+$/.test(hedef.hash);
            const sohbetAcildi = sohbetHashMi ? await mesajBildirimSohbetiniAc(hedef.hash) : false;
            if (sohbetAcildi) return true;
            if (!yonlendirildi && sohbetHashMi) {
                sayfaGoster('chat');
                return true;
            }
        }

        if (!yonlendirildi && b.tip && b.tip.includes('gorev')) {
            sayfaGoster('gorevler');
            return true;
        }

        return yonlendirildi;
    }

    async function bildirimSisteminiBaslat() {
        // Tarayici push bildirim izni iste
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                try {
                    const izin = await Notification.requestPermission();
                    state.pushIzni = izin === 'granted';
                } catch {}
            } else {
                state.pushIzni = Notification.permission === 'granted';
            }
        }
        // Ilk yukleme
        await bildirimleriYenile(true);
        // Her 20 saniyede bir kontrol et
        if (state.bildirimIntervalId) clearInterval(state.bildirimIntervalId);
        state.bildirimIntervalId = setInterval(() => bildirimleriYenile(false), 2000);
    }

    async function bildirimleriYenile(ilkYukleme) {
        try {
            const d = await apicagir('/api/bildirimler');
            if (!d || !Array.isArray(d.bildirimler)) return;

            // Rozet
            const rozet = document.getElementById('bildirim-rozet');
            if (d.okunmamis > 0) {
                rozet.textContent = d.okunmamis > 99 ? '99+' : d.okunmamis;
                rozet.style.display = 'flex';
            } else {
                rozet.style.display = 'none';
            }

            // Liste
            const liste = document.getElementById('bildirim-liste');
            if (!d.bildirimler.length) {
                liste.innerHTML = '<p class="bildirim-bos">Henüz bildirim yok.</p>';
            } else {
                liste.innerHTML = '';
                d.bildirimler.forEach((b) => {
                    const k = document.createElement('div');
                    k.className = 'bildirim-kart' + (b.okundu ? '' : ' okunmamis');
                    const tarih = new Date((b.olusturulma_tarihi || '').replace(' ', 'T') + 'Z');
                    const tarihStr = Number.isNaN(tarih.getTime())
                        ? ''
                        : tarih.toLocaleDateString('tr-TR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                          });
                    const bId = guvenliId(b.id);
                    k.innerHTML =
                        '<button type="button" class="b-sil" data-action-call="bildirimSil(event, ' +
                        bId +
                        ')" title="Sil">×</button>' +
                        '<div class="b-baslik">' +
                        esc(b.baslik) +
                        '</div>' +
                        (b.icerik ? '<div class="b-icerik">' + esc(b.icerik) + '</div>' : '') +
                        '<div class="b-tarih">' +
                        esc(tarihStr) +
                        '</div>';
                    k.onclick = async () => {
                        if (!b.okundu) await apicagir('/api/bildirimler/' + bId + '/okundu', 'PUT');
                        bildirimPanelKapat();
                        bildirimleriYenile(false);
                        await bildirimLinkiniAc(b);
                    };
                    liste.appendChild(k);
                });
            }

            // Yeni gelen bildirimleri tarayicidan goster (ilk yukleme degilse)
            if (!ilkYukleme && state.pushIzni) {
                const yeniler = d.bildirimler.filter((b) => b.id > state.bildirimSonId && !b.okundu);
                yeniler.forEach((b) => {
                    try {
                        new Notification(metin(b.baslik), {
                            body: metin(b.icerik),
                            icon: '/favicon.ico',
                            tag: 'bildirim-' + guvenliId(b.id)
                        });
                    } catch {}
                });
            }
            if (d.bildirimler.length)
                state.bildirimSonId = Math.max(state.bildirimSonId, ...d.bildirimler.map((b) => guvenliId(b.id)));
        } catch {}
    }

    function bildirimPanelTogla() {
        const p = document.getElementById('bildirim-panel');
        p.classList.toggle('aktif');
        if (p.classList.contains('aktif')) bildirimleriYenile(false);
    }

    function bildirimPanelKapat() {
        document.getElementById('bildirim-panel').classList.remove('aktif');
    }

    async function bildirimleriTumOkundu() {
        await apicagir('/api/bildirimler/okundu', 'PUT');
        bildirimleriYenile(false);
        toast('Tüm bildirimler okundu olarak işaretlendi.');
    }

    async function bildirimSil(e, id) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (id === undefined) id = e;
        const bId = guvenliId(id);
        if (!bId) return;
        await apicagir('/api/bildirimler/' + bId, 'DELETE');
        bildirimleriYenile(false);
    }

    async function bildirimleriTumSil() {
        if (!confirm('Tüm bildirimleri silmek istediğinize emin misiniz?')) return;
        await apicagir('/api/bildirimler', 'DELETE');
        bildirimleriYenile(false);
        toast('Tüm bildirimler silindi.');
    }

    function init() {
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('bildirim-wrap');
            if (wrap && e.target instanceof Node && !wrap.contains(e.target)) {
                bildirimPanelKapat();
            }
        });
        bildirimSisteminiBaslat();
    }

    return {
        actions: {
            bildirimSisteminiBaslat,
            bildirimleriYenile,
            bildirimPanelTogla,
            bildirimPanelKapat,
            bildirimleriTumOkundu,
            bildirimSil,
            bildirimleriTumSil
        },
        init
    };
}
