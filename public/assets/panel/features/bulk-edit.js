export function createBulkEditFeature(ctx) {
    const { state, actions, esc, resimUrl, guvenliId, resimKaynakAta, toast, apicagir } = ctx;
    const modalKapat = (...args) => actions.modalKapat(...args);
    const illeriYukle = (...args) => actions.illeriYukle(...args);
    const ilSecVeIlceleriGoster = (...args) => actions.ilSecVeIlceleriGoster(...args);
    const haritayiYukle = (...args) => actions.haritayiYukle(...args);
    async function topluIlModalAc() {
        const iller = await apicagir('/api/iller');
        if (!Array.isArray(iller) || !iller.length) {
            toast('İl bulunamadı.');
            return;
        }
        const tbody = document.querySelector('#toplu-il-tablo tbody');
        tbody.innerHTML = '';
        iller.forEach((il) => {
            const ilId = guvenliId(il.id);
            if (ilId) {
                const tr = document.createElement('tr');
                const fotoUrl = resimUrl(il.baskan_foto);
                tr.dataset.id = String(ilId);
                tr.innerHTML =
                    '<td>' +
                    esc(il.il_adi) +
                    '</td>' +
                    '<td><input type="text" name="baskan_ad_soyad" value="' +
                    esc(il.baskan_ad_soyad) +
                    '"></td>' +
                    '<td><input type="text" name="baskan_telefon" value="' +
                    esc(il.baskan_telefon) +
                    '"></td>' +
                    '<td><input type="text" name="baskan_tc" value="' +
                    esc(il.baskan_tc) +
                    '" maxlength="11"></td>' +
                    '<td class="foto-hucre"><img src="' +
                    esc(fotoUrl) +
                    '" alt="" style="display:' +
                    (fotoUrl ? 'block' : 'none') +
                    '" data-foto><input type="hidden" name="baskan_foto" value="' +
                    esc(il.baskan_foto) +
                    '"><label class="foto-btn">📷<input type="file" accept="image/*" style="display:none" data-change-call="topluFotoSec(this)"></label></td>' +
                    '<td><input type="text" name="instagram_url" value="' +
                    esc(il.instagram_url) +
                    '"></td>' +
                    '<td><input type="text" name="twitter_url" value="' +
                    esc(il.twitter_url) +
                    '"></td>' +
                    '<td><input type="text" name="facebook_url" value="' +
                    esc(il.facebook_url) +
                    '"></td>' +
                    '<td><input type="text" name="tiktok_url" value="' +
                    esc(il.tiktok_url) +
                    '"></td>';
                tbody.appendChild(tr);
            }
        });
        document.getElementById('toplu-il-modal').classList.add('aktif');
    }

    async function topluIlKaydet() {
        const satirlar = [];
        document.querySelectorAll('#toplu-il-tablo tbody tr').forEach((tr) => {
            const ilId = guvenliId(tr.dataset.id);
            if (ilId) {
                const obj = { id: ilId };
                tr.querySelectorAll('input[name]').forEach((inp) => {
                    obj[inp.name] = inp.value.trim();
                });
                satirlar.push(obj);
            }
        });
        const s = await apicagir('/api/iller/toplu', 'POST', { satirlar });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        modalKapat('toplu-il-modal');
        toast(s.guncellenen + ' il güncellendi.');
        illeriYukle();
        haritayiYukle();
    }

    async function topluIlceModalAc() {
        if (!state.seciliIlId) {
            toast('Önce bir il seçin.');
            return;
        }
        document.getElementById('toplu-ilce-baslik').textContent = state.seciliIlAdi + ' — Toplu İlçe Düzenle';
        const ilId = guvenliId(state.seciliIlId);
        document.getElementById('toplu-ilce-il-id').value = String(ilId);
        const ilceler = await apicagir('/api/ilceler?il_id=' + encodeURIComponent(ilId));
        const tbody = document.querySelector('#toplu-ilce-tablo tbody');
        tbody.innerHTML = '';
        (Array.isArray(ilceler) ? ilceler : []).forEach((ic) => topluIlceSatirEkle(tbody, ic));
        topluIlceSatirEkle(tbody, null);
        document.getElementById('toplu-ilce-modal').classList.add('aktif');
    }

    function topluIlceSatirEkle(tbody, ic) {
        const tr = document.createElement('tr');
        const icId = guvenliId(ic && ic.id);
        if (icId) tr.dataset.id = String(icId);
        const fotoUrl = resimUrl(ic && ic.baskan_foto);
        const adHucre = ic ? esc(ic.ilce_adi) : '<input type="text" name="ilce_adi" placeholder="+ Yeni ilçe adı">';
        tr.innerHTML =
            '<td>' +
            adHucre +
            '</td>' +
            '<td><input type="text" name="baskan_ad_soyad" value="' +
            esc(ic && ic.baskan_ad_soyad) +
            '"></td>' +
            '<td><input type="text" name="baskan_telefon" value="' +
            esc(ic && ic.baskan_telefon) +
            '"></td>' +
            '<td><input type="text" name="baskan_tc" value="' +
            esc(ic && ic.baskan_tc) +
            '" maxlength="11"></td>' +
            '<td class="foto-hucre"><img src="' +
            esc(fotoUrl) +
            '" alt="" style="display:' +
            (fotoUrl ? 'block' : 'none') +
            '" data-foto><input type="hidden" name="baskan_foto" value="' +
            esc(ic && ic.baskan_foto) +
            '"><label class="foto-btn">📷<input type="file" accept="image/*" style="display:none" data-change-call="topluFotoSec(this)"></label></td>' +
            '<td><input type="text" name="instagram_url" value="' +
            esc(ic && ic.instagram_url) +
            '"></td>' +
            '<td><input type="text" name="twitter_url" value="' +
            esc(ic && ic.twitter_url) +
            '"></td>' +
            '<td><input type="text" name="facebook_url" value="' +
            esc(ic && ic.facebook_url) +
            '"></td>' +
            '<td><input type="text" name="tiktok_url" value="' +
            esc(ic && ic.tiktok_url) +
            '"></td>';
        tbody.appendChild(tr);
        if (!ic) {
            const inp = tr.querySelector('input[name="ilce_adi"]');
            if (inp) {
                inp.addEventListener('input', () => {
                    if (inp.value.trim() && tr === tbody.lastElementChild) {
                        topluIlceSatirEkle(tbody, null);
                    }
                });
            }
        }
    }

    async function topluIlceKaydet() {
        const il_id = guvenliId(document.getElementById('toplu-ilce-il-id').value);
        const satirlar = [];
        document.querySelectorAll('#toplu-ilce-tablo tbody tr').forEach((tr) => {
            const obj = {};
            const icId = guvenliId(tr.dataset.id);
            if (icId) obj.id = icId;
            tr.querySelectorAll('input[name]').forEach((inp) => {
                obj[inp.name] = inp.value.trim();
            });
            if (!obj.id && !obj.ilce_adi) return;
            satirlar.push(obj);
        });
        const s = await apicagir('/api/ilceler/toplu', 'POST', { il_id, satirlar });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        modalKapat('toplu-ilce-modal');
        toast((s.guncellenen || 0) + ' güncellendi, ' + (s.eklenen || 0) + ' yeni eklendi.');
        if (state.seciliIlId) ilSecVeIlceleriGoster(state.seciliIlId, state.seciliIlAdi);
        haritayiYukle();
    }

    async function topluFotoSec(input) {
        const f = input.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
            const s = await apicagir('/api/yukle', 'POST', { dosya: r.result });
            if (s.hata) {
                toast(s.hata);
                return;
            }
            const td = input.closest('td');
            td.querySelector('input[type="hidden"]').value = s.url;
            const img = td.querySelector('img[data-foto]');
            resimKaynakAta(img, s.url);
        };
        r.readAsDataURL(f);
    }

    return {
        actions: { topluIlModalAc, topluIlKaydet, topluIlceModalAc, topluIlceSatirEkle, topluIlceKaydet, topluFotoSec }
    };
}
