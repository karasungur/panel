export function createMapFeature(ctx) {
    const { state, actions, metin, esc, guvenliId, resimHTML, toast, apicagir } = ctx;
    const baskanHucre = (...args) => actions.baskanHucre(...args);
    const sosyalHucre = (...args) => actions.sosyalHucre(...args);
    const ilDuzenle = (...args) => actions.ilDuzenle(...args);
    const ilceDuzenle = (...args) => actions.ilceDuzenle(...args);
    const ilKaydetTemel = (...args) => actions.ilKaydetBase(...args);
    const ilceKaydetTemel = (...args) => actions.ilceKaydetBase(...args);
    async function haritayiYukle() {
        state.haritaVeri = await apicagir('/api/iller/harita');
        if (!Array.isArray(state.haritaVeri)) return;
        const erisimli = state.haritaVeri.filter((i) => i.erisim);
        document.getElementById('kart-il').textContent = String(
            state.kullanici.rol === 'admin' ? state.haritaVeri.length : erisimli.length
        );
        let ti = 0;
        erisimli.forEach((i) => (ti += i.ilce_sayisi || 0));
        document.getElementById('kart-ilce').textContent = String(ti);
        // İstatistik API'den il başkan ve ilçe başkan sayılarını al
        try {
            const ist = await apicagir('/api/iller/istatistik');
            document.getElementById('kart-dolu').textContent = String(
                ist.baskanliIl != null ? ist.baskanliIl : state.haritaVeri.filter((i) => i.baskan_ad_soyad).length
            );
            const eIlceB = document.getElementById('kart-dolu-ilce');
            if (eIlceB) eIlceB.textContent = ist.baskanliIlce != null ? ist.baskanliIlce : '-';
        } catch {
            document.getElementById('kart-dolu').textContent = String(
                state.haritaVeri.filter((i) => i.baskan_ad_soyad).length
            );
        }
        if (!state.haritaYuklendi) {
            try {
                const r = await fetch('/turkiye.svg');
                if (!r.ok) throw new Error('yok');
                document.getElementById('harita-yer').innerHTML = await r.text();
                state.haritaYuklendi = true;
                haritaBoyaVeOlayla();
            } catch {
                document.getElementById('harita-mesaj').innerHTML =
                    'Harita dosyası (turkiye.svg) bulunamadı.<br>Lütfen public klasörüne ekleyin.';
            }
        } else haritaBoyaVeOlayla();
    }

    function haritaBoyaVeOlayla() {
        const svg = document.querySelector('#harita-yer svg');
        if (!svg) return;
        const pmap = {};
        state.haritaVeri.forEach((il) => (pmap[il.plaka] = il));
        const bilgi = document.getElementById('harita-bilgi');

        // Ayni plakaya sahip TUM g'leri grupla (Istanbul iki yakali olabilir vs.)
        const plakaGruplari = {};
        svg.querySelectorAll('g[data-plakakodu]').forEach((g) => {
            const p = parseInt(g.getAttribute('data-plakakodu'), 10);
            if (!plakaGruplari[p]) plakaGruplari[p] = [];
            plakaGruplari[p].push(g);
        });

        // Her plaka grubuna ortak renk + ortak olaylar
        Object.entries(plakaGruplari).forEach(([plakaStr, gListesi]) => {
            const plaka = parseInt(plakaStr, 10);
            const il = pmap[plaka];

            // Tum parcalari ayni renge boya
            gListesi.forEach((g) => {
                g.classList.remove('erisimli', 'dolu', 'grup-hover');
                if (il) {
                    if (il.baskan_ad_soyad) g.classList.add('dolu');
                    else if (il.erisim) g.classList.add('erisimli');
                }
            });

            const grupGoster = (e) => {
                if (!il) return;
                // Grup hover: tum parcalari ayni anda parlat
                gListesi.forEach((x) => x.classList.add('grup-hover'));
                const foto =
                    resimHTML(il.baskan_foto) ||
                    '<div class="bos-foto"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>';
                let ic = '<div class="il-ad">' + esc(il.il_adi) + '</div>';
                if (il.baskan_ad_soyad) {
                    ic +=
                        '<div class="baskan">' +
                        foto +
                        '<div><div class="baskan-ad">' +
                        esc(il.baskan_ad_soyad) +
                        '</div>' +
                        (il.baskan_telefon ? '<div class="baskan-tel">' + esc(il.baskan_telefon) + '</div>' : '') +
                        '</div></div>';
                } else {
                    ic +=
                        '<div class="baskan">' +
                        foto +
                        '<div class="baskan-ad" style="color:var(--secondary)">Başkan atanmamış</div></div>';
                }
                ic += '<div class="ilce-rozet"><b>' + esc(il.ilce_sayisi || 0) + '</b> ilçe</div>';
                bilgi.innerHTML = ic;
                bilgi.style.display = 'block';
                let x = e.clientX + 16,
                    y = e.clientY + 16;
                if (x + 240 > window.innerWidth) x = e.clientX - 246;
                if (y + 160 > window.innerHeight) y = e.clientY - 166;
                bilgi.style.left = x + 'px';
                bilgi.style.top = y + 'px';
            };

            const grupGizle = (e) => {
                // Asya'dan Avrupa'ya gecerken kapatma: relatedTarget ayni gruptaki bir parcaysa gizleme
                const r = e && e.relatedTarget;
                if (r && r.closest) {
                    const hedef = r.closest('g[data-plakakodu]');
                    if (hedef && parseInt(hedef.getAttribute('data-plakakodu'), 10) === plaka) return;
                }
                gListesi.forEach((x) => x.classList.remove('grup-hover'));
                bilgi.style.display = 'none';
            };

            const tikla = () => {
                if (!il) return;
                if (state.kullanici.rol !== 'admin' && !il.erisim) {
                    toast('Bu ile erişim yetkiniz yok.');
                    return;
                }
                haritaIlceAc(il.id, il.il_adi);
            };

            gListesi.forEach((g) => {
                g.onmousemove = grupGoster;
                g.onmouseleave = grupGizle;
                g.onclick = tikla;
            });
        });

        // ISTANBUL TEK PARCA: iki path'in arasindaki Bogaz cizgisini gizlemek icin
        // path'lerin stroke'unu kendi fill rengi yap, boylece bitisik gorunur
        const istgListesi = svg.querySelectorAll('g[data-plakakodu="34"]');
        istgListesi.forEach((g) => {
            g.querySelectorAll('path').forEach((p) => {
                p.style.stroke = 'none'; // kenarlarini tamamen kaldir, iki path birlesik gorunur
            });
        });
    }

    async function haritaIlceAc(il_id, il_adi) {
        const ilId = guvenliId(il_id);
        if (!ilId) return;
        const ilAdi = metin(il_adi);
        state.haritaSeciliIl = { id: ilId, adi: ilAdi };
        document.getElementById('harita-ilce-baslik').textContent = ilAdi + ' — İlçeler';
        document.getElementById('harita-ilce-paneli').style.display = 'block';

        // Il'in baskan bilgilerini de ozet olarak goster
        try {
            const il = await apicagir('/api/iller/' + ilId);
            const ozet = document.getElementById('harita-il-baskan-ozet');
            if (il && (il.baskan_ad_soyad || il.baskan_foto)) {
                ozet.innerHTML =
                    '<div style="background:var(--surface-low);padding:14px;border-radius:12px;display:flex;align-items:center;gap:14px"><div style="font-size:11px;color:var(--secondary);text-transform:uppercase;letter-spacing:.5px;font-weight:600;min-width:140px">İl Tanıtım ve Medya Başkanı</div>' +
                    baskanHucre(il) +
                    '<div style="margin-left:auto">' +
                    sosyalHucre(il) +
                    '</div></div>';
            } else {
                ozet.innerHTML =
                    '<div style="background:var(--surface-low);padding:14px;border-radius:12px;color:var(--secondary);font-size:13px">Bu ile henüz Tanıtım ve Medya Başkanı atanmamış.</div>';
            }
        } catch {
            document.getElementById('harita-il-baskan-ozet').innerHTML = '';
        }

        // Ilceleri yukle
        const ilceler = await apicagir('/api/ilceler?il_id=' + encodeURIComponent(ilId));
        const tb = document.getElementById('harita-ilce-tablosu');
        tb.innerHTML = '';
        if (!Array.isArray(ilceler) || !ilceler.length) {
            tb.innerHTML = '<tr><td colspan="4" class="bos-mesaj">Bu ile henüz ilçe eklenmemiş.</td></tr>';
        } else {
            ilceler.forEach((ic) => {
                const tr = document.createElement('tr');
                const icId = guvenliId(ic.id);
                tr.innerHTML =
                    '<td><b>' +
                    esc(ic.ilce_adi) +
                    '</b></td><td>' +
                    baskanHucre(ic) +
                    '</td><td>' +
                    sosyalHucre(ic) +
                    '</td>' +
                    '<td><button type="button" class="islem-btn" data-action-call="haritadaIlceDuzenle(' +
                    icId +
                    ')">Düzenle</button></td>';
                tb.appendChild(tr);
            });
        }

        // Asagi kaydir
        setTimeout(
            () => document.getElementById('harita-ilce-paneli').scrollIntoView({ behavior: 'smooth', block: 'start' }),
            100
        );
    }

    function haritaIlceKapat() {
        document.getElementById('harita-ilce-paneli').style.display = 'none';
        state.haritaSeciliIl = null;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function haritaIlceDuzenle() {
        if (!state.haritaSeciliIl) return;
        const ilId = guvenliId(state.haritaSeciliIl.id);
        if (!ilId) return;
        ilDuzenle(ilId);
    }

    async function haritadaIlceDuzenle(id) {
        if (!state.haritaSeciliIl) return;
        const icId = guvenliId(id);
        if (!icId) return;
        const ilId = guvenliId(state.haritaSeciliIl.id);
        if (!ilId) return;
        // Mevcut ilceDuzenle fonksiyonu seciliIlId'yi kullanir, gecici set edelim
        state.seciliIlId = ilId;
        state.seciliIlAdi = state.haritaSeciliIl.adi;
        document.getElementById('ilce-il-id').value = String(ilId);
        await ilceDuzenle(icId);
        document.getElementById('ilce-il-id').value = String(ilId);
        // Modal kapatildiginda haritadaki paneli yenilemek icin
        // ilceKaydet zaten ilSecVeIlceleriGoster cagiriyor, biz haritadan geliyoruz, geri yukleyelim
    }

    async function ilKaydetHaritaYenileyerek() {
        await ilKaydetTemel();
        if (state.haritaSeciliIl && document.getElementById('harita-ilce-paneli').style.display !== 'none') {
            haritaIlceAc(state.haritaSeciliIl.id, state.haritaSeciliIl.adi);
        }
    }

    async function ilceKaydetHaritaYenileyerek() {
        const il_id = guvenliId(document.getElementById('ilce-il-id').value);
        await ilceKaydetTemel();
        if (state.haritaSeciliIl && state.haritaSeciliIl.id === il_id) {
            haritaIlceAc(state.haritaSeciliIl.id, state.haritaSeciliIl.adi);
        }
    }

    return {
        actions: {
            haritayiYukle,
            haritaBoyaVeOlayla,
            haritaIlceAc,
            haritaIlceKapat,
            haritaIlceDuzenle,
            haritadaIlceDuzenle,
            ilKaydet: ilKaydetHaritaYenileyerek,
            ilceKaydet: ilceKaydetHaritaYenileyerek
        },
        pageLoaders: { harita: haritayiYukle }
    };
}
