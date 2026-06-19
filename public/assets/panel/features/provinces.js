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
            ['instagram_url', 'IG'],
            ['twitter_url', 'X'],
            ['facebook_url', 'FB'],
            ['tiktok_url', 'TT']
        ];
        linkler.forEach(([alan, etiket]) => {
            const url = guvenliUrl(o[alan]);
            if (url)
                h +=
                    '<a href="' +
                    esc(url) +
                    '" target="_blank" rel="noopener noreferrer" class="sosyal-link">' +
                    etiket +
                    '</a>';
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
