export function createProvinceFeature(ctx) {
    const { state, actions, metin, esc, guvenliUrl, guvenliId, resimKaynakAta, resimHTML, toast, val, apicagir } = ctx;
    const modalKapat = (...args) => actions.modalKapat(...args);
    const haritayiYukle = (...args) => actions.haritayiYukle(...args);
    function baskanHucre(o) {
        if (!o.baskan_ad_soyad && !o.baskan_foto) return '<span style="color:var(--outline)">—</span>';
        const foto =
            resimHTML(o.baskan_foto, 'baskan-foto') ||
            '<div class="baskan-bos"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>';
        let b = '<div class="baskan-bilgi"><b>' + esc(o.baskan_ad_soyad || '-') + '</b>';
        if (o.baskan_telefon) b += '<br>' + esc(o.baskan_telefon);
        if (o.baskan_tc) b += '<br>TC: ' + esc(o.baskan_tc);
        b += '</div>';
        return '<div class="baskan-hucre">' + foto + b + '</div>';
    }

    function sosyalHucre(o) {
        let h = '';
        const linkler = [
            [
                'instagram_url',
                'instagram',
                '<svg aria-hidden="true" focusable="false" style="width:14px;height:14px" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>'
            ],
            [
                'twitter_url',
                'twitter',
                '<svg aria-hidden="true" focusable="false" style="width:12px;height:12px" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
            ],
            [
                'facebook_url',
                'facebook',
                '<svg aria-hidden="true" focusable="false" style="width:14px;height:14px" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.8c4.56-.93 8-4.96 8-9.8z"/></svg>'
            ],
            [
                'tiktok_url',
                'tiktok',
                '<svg aria-hidden="true" focusable="false" style="width:14px;height:14px" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.18.96.96 2.25 1.48 3.59 1.61v3.92c-1.2-.02-2.39-.3-3.48-.82-.69-.33-1.32-.79-1.85-1.37v9.07c0 1.58-.33 3.16-1 4.57-.67 1.25-1.68 2.3-2.91 3.01-1.4.76-2.98 1.14-4.57 1.11-1.68.04-3.35-.38-4.79-1.25C1.61 23 1 21.6 1 20c0-1.6 1-3 2.5-3.8 1.4-.7 3.1-.7 4.5 0v3.8c-.8-.4-1.8-.4-2.5 0-.7.4-1 1.2-1 2 0 .8.3 1.6 1 2 .7.4 1.7.4 2.5 0 .7-.4 1-1.2 1-2V0c.01.02.01.02.02.02z"/></svg>'
            ]
        ];
        linkler.forEach(([alan, classIsmi, svg]) => {
            const url = guvenliUrl(o[alan]);
            if (url) {
                h +=
                    '<a href="' +
                    esc(url) +
                    '" target="_blank" rel="noopener noreferrer" class="sosyal-link ' +
                    classIsmi +
                    '" title="' +
                    classIsmi.charAt(0).toUpperCase() +
                    classIsmi.slice(1) +
                    '">' +
                    svg +
                    '</a>';
            }
        });
        return h || '<span style="color:var(--outline)">—</span>';
    }

    async function illeriYukle() {
        const iller = await apicagir('/api/iller');
        const tb = document.getElementById('il-tablosu');
        tb.innerHTML = '';
        if (!Array.isArray(iller) || !iller.length) {
            tb.innerHTML = '<tr><td colspan="5" class="bos-mesaj">Size atanmış il bulunmuyor.</td></tr>';
            return;
        }
        iller.forEach((il) => {
            const tr = document.createElement('tr');
            const ilId = guvenliId(il.id);
            const ilAdi = metin(il.il_adi);
            tr.innerHTML =
                '<td>' +
                esc(il.plaka || '-') +
                '</td>' +
                '<td><span class="il-link">' +
                esc(ilAdi) +
                '</span></td>' +
                '<td>' +
                baskanHucre(il) +
                '</td><td>' +
                sosyalHucre(il) +
                '</td>' +
                '<td><button type="button" class="islem-btn" data-action-call="ilDuzenle(' +
                ilId +
                ')">Düzenle</button></td>';
            tr.querySelector('.il-link').onclick = () => ilSecVeIlceleriGoster(ilId, ilAdi);
            tb.appendChild(tr);
        });
    }

    async function ilSecVeIlceleriGoster(il_id, il_adi) {
        const ilId = guvenliId(il_id);
        if (!ilId) return;
        state.seciliIlId = ilId;
        state.seciliIlAdi = metin(il_adi);
        document.getElementById('ilce-baslik').textContent = state.seciliIlAdi + ' — İlçeler';
        document.getElementById('ilce-bolumu').style.display = 'block';
        document.getElementById('ilce-il-id').value = String(ilId);
        document.getElementById('ilce-bolumu').scrollIntoView({ behavior: 'smooth' });
        const ilceler = await apicagir('/api/ilceler?il_id=' + encodeURIComponent(ilId));
        const tb = document.getElementById('ilce-tablosu');
        tb.innerHTML = '';
        if (!Array.isArray(ilceler) || !ilceler.length) {
            tb.innerHTML = '<tr><td colspan="4" class="bos-mesaj">Henüz ilçe eklenmemiş.</td></tr>';
            return;
        }
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
                '<td><button type="button" class="islem-btn" data-action-call="ilceDuzenle(' +
                icId +
                ')">Düzenle</button><button type="button" class="islem-btn sil-btn" data-action-call="ilceSil(' +
                icId +
                ')">Sil</button></td>';
            tb.appendChild(tr);
        });
    }

    async function ilDuzenle(id) {
        const ilId = guvenliId(id);
        if (!ilId) return;
        const il = await apicagir('/api/iller/' + ilId);
        document.getElementById('il-id').value = String(guvenliId(il.id));
        document.getElementById('il-modal-baslik').textContent = metin(il.il_adi) + ' — Düzenle';
        document.getElementById('il-baskan-ad').value = il.baskan_ad_soyad || '';
        document.getElementById('il-baskan-telefon').value = il.baskan_telefon || '';
        document.getElementById('il-baskan-tc').value = il.baskan_tc || '';
        document.getElementById('il-baskan-foto').value = il.baskan_foto || '';
        document.getElementById('il-instagram').value = il.instagram_url || '';
        document.getElementById('il-twitter').value = il.twitter_url || '';
        document.getElementById('il-facebook').value = il.facebook_url || '';
        document.getElementById('il-tiktok').value = il.tiktok_url || '';
        const o = document.getElementById('il-foto-oniz');
        resimKaynakAta(o, il.baskan_foto);
        document.getElementById('il-modal').classList.add('aktif');
    }

    async function ilKaydet() {
        const id = guvenliId(document.getElementById('il-id').value);
        if (!id) return;
        const body = {
            baskan_ad_soyad: val('il-baskan-ad'),
            baskan_telefon: val('il-baskan-telefon'),
            baskan_tc: val('il-baskan-tc'),
            baskan_foto: val('il-baskan-foto'),
            instagram_url: val('il-instagram'),
            twitter_url: val('il-twitter'),
            facebook_url: val('il-facebook'),
            tiktok_url: val('il-tiktok')
        };
        const s = await apicagir('/api/iller/' + id, 'PUT', body);
        if (s.hata) {
            toast(s.hata);
            return;
        }
        modalKapat('il-modal');
        illeriYukle();
        state.haritaYuklendi && haritayiYukle();
        toast('İl güncellendi.');
    }

    function ilceEkleModalAc() {
        if (!state.seciliIlId) {
            toast('Önce bir il seçin.');
            return;
        }
        document.getElementById('ilce-modal-baslik').textContent = state.seciliIlAdi + ' — İlçe Ekle';
        [
            'ilce-id',
            'ilce-adi',
            'ilce-baskan-ad',
            'ilce-baskan-telefon',
            'ilce-baskan-tc',
            'ilce-baskan-foto',
            'ilce-instagram',
            'ilce-twitter',
            'ilce-facebook',
            'ilce-tiktok'
        ].forEach((i) => (document.getElementById(i).value = ''));
        document.getElementById('ilce-il-id').value = String(guvenliId(state.seciliIlId));
        document.getElementById('ilce-foto-oniz').style.display = 'none';
        document.getElementById('ilce-modal').classList.add('aktif');
    }

    async function ilceDuzenle(id) {
        const icId = guvenliId(id);
        if (!icId) return;
        const ilceler = await apicagir('/api/ilceler?il_id=' + encodeURIComponent(guvenliId(state.seciliIlId)));
        const ic = Array.isArray(ilceler) ? ilceler.find((x) => guvenliId(x.id) === icId) : null;
        if (!ic) return;
        document.getElementById('ilce-modal-baslik').textContent = metin(ic.ilce_adi) + ' — Düzenle';
        document.getElementById('ilce-id').value = String(icId);
        document.getElementById('ilce-il-id').value = String(guvenliId(ic.il_id || state.seciliIlId));
        document.getElementById('ilce-adi').value = ic.ilce_adi;
        document.getElementById('ilce-baskan-ad').value = ic.baskan_ad_soyad || '';
        document.getElementById('ilce-baskan-telefon').value = ic.baskan_telefon || '';
        document.getElementById('ilce-baskan-tc').value = ic.baskan_tc || '';
        document.getElementById('ilce-baskan-foto').value = ic.baskan_foto || '';
        document.getElementById('ilce-instagram').value = ic.instagram_url || '';
        document.getElementById('ilce-twitter').value = ic.twitter_url || '';
        document.getElementById('ilce-facebook').value = ic.facebook_url || '';
        document.getElementById('ilce-tiktok').value = ic.tiktok_url || '';
        const o = document.getElementById('ilce-foto-oniz');
        resimKaynakAta(o, ic.baskan_foto);
        document.getElementById('ilce-modal').classList.add('aktif');
    }

    async function ilceKaydet() {
        const id = guvenliId(document.getElementById('ilce-id').value);
        const il_id = guvenliId(document.getElementById('ilce-il-id').value);
        const body = {
            il_id,
            ilce_adi: val('ilce-adi'),
            baskan_ad_soyad: val('ilce-baskan-ad'),
            baskan_telefon: val('ilce-baskan-telefon'),
            baskan_tc: val('ilce-baskan-tc'),
            baskan_foto: val('ilce-baskan-foto'),
            instagram_url: val('ilce-instagram'),
            twitter_url: val('ilce-twitter'),
            facebook_url: val('ilce-facebook'),
            tiktok_url: val('ilce-tiktok')
        };
        if (!il_id) {
            toast('İl seçimi geçersiz.');
            return;
        }
        if (!body.ilce_adi) {
            toast('İlçe adı gereklidir.');
            return;
        }
        let s;
        if (id) s = await apicagir('/api/ilceler/' + id, 'PUT', body);
        else s = await apicagir('/api/ilceler', 'POST', body);
        if (s.hata) {
            toast(s.hata);
            return;
        }
        modalKapat('ilce-modal');
        ilSecVeIlceleriGoster(il_id, state.seciliIlAdi);
        toast('Kaydedildi.');
    }

    async function ilceSil(id) {
        const icId = guvenliId(id);
        if (!icId || !confirm('Bu ilçeyi silmek istediğinize emin misiniz?')) return;
        const s = await apicagir('/api/ilceler/' + icId, 'DELETE');
        if (s.hata) {
            toast(s.hata);
            return;
        }
        ilSecVeIlceleriGoster(state.seciliIlId, state.seciliIlAdi);
    }

    async function baskanFotoSec(e, tip) {
        const f = e && e.target && e.target.files ? e.target.files[0] : null;
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
            const s = await apicagir('/api/yukle', 'POST', { dosya: r.result });
            if (s.hata) {
                toast(s.hata);
                return;
            }
            document.getElementById(tip + '-baskan-foto').value = s.url;
            const o = document.getElementById(tip + '-foto-oniz');
            resimKaynakAta(o, s.url);
        };
        r.readAsDataURL(f);
    }

    return {
        actions: {
            baskanHucre,
            sosyalHucre,
            illeriYukle,
            ilSecVeIlceleriGoster,
            ilDuzenle,
            ilKaydetBase: ilKaydet,
            ilceEkleModalAc,
            ilceDuzenle,
            ilceKaydetBase: ilceKaydet,
            ilceSil,
            baskanFotoSec
        },
        pageLoaders: { iller: illeriYukle }
    };
}
