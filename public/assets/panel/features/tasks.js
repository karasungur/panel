export function createTasksFeature(ctx) {
    const { state, actions, metin, esc, guvenliId, toast, val, telefonGoster, kullaniciGorunenAd, apicagir } = ctx;
    const modalKapat = (...args) => actions.modalKapat(...args);
    const bildirimleriYenile = (...args) => actions.bildirimleriYenile(...args);
    async function gorevleriYukle() {
        const gs = await apicagir('/api/gorevler');
        const l = document.getElementById('gorev-liste');
        l.innerHTML = '';
        if (!Array.isArray(gs) || !gs.length) {
            l.innerHTML = '<p class="bos-mesaj">Henüz görev yok.</p>';
            return;
        }
        const yetkili = state.kullanici.rol === 'admin' || state.kullanici.rol === 'yardimci';
        const kategoriEtiket = {
            sosyal_medya: '📱 Sosyal Medya',
            organizasyon: '🎪 Organizasyon',
            raporlama: '📊 Raporlama',
            iletisim: '📞 İletişim',
            diger: '📌 Diğer'
        };
        const oncelikEtiket = { acil: '🚨 Acil', normal: 'Normal', dusuk: 'Düşük' };
        const tekrarEtiket = { haftalik: '🔁 Haftalık', aylik: '🔁 Aylık' };

        gs.forEach((g) => {
            const tamam = g.durum === 'tamamlandi';
            const d = document.createElement('div');
            d.className = 'gorev-kart' + (tamam ? ' tamam' : '');
            const gorevId = guvenliId(g.id);

            // Kime atandı (yetkili görüyor)
            const kime = yetkili && g.telefon ? '<div class="kime">→ ' + esc(kullaniciGorunenAd(g)) + '</div>' : '';
            // Kim atadı (kullanıcı görüyor)
            const kimden =
                !yetkili && (g.olusturan_ad_soyad || g.olusturan_telefon)
                    ? '<div class="gorev-olusturan">↗ ' +
                      esc(g.olusturan_ad_soyad || telefonGoster(g.olusturan_telefon)) +
                      ' tarafından atandı</div>'
                    : '';

            // Meta bilgiler
            const oncelik = ['acil', 'normal', 'dusuk'].includes(g.oncelik) ? g.oncelik : 'normal';
            let meta = '<div class="gorev-meta">';
            meta +=
                '<span class="gorev-rozet-oncelik ' +
                oncelik +
                '">' +
                esc(oncelikEtiket[oncelik] || 'Normal') +
                '</span>';
            if (g.kategori)
                meta +=
                    '<span class="gorev-rozet-kategori">' +
                    (kategoriEtiket[g.kategori] || kategoriEtiket.diger) +
                    '</span>';
            if (g.tekrar && g.tekrar !== 'tek')
                meta += '<span class="gorev-rozet-tekrar">' + (tekrarEtiket[g.tekrar] || '') + '</span>';
            if (g.son_tarih) {
                const st = new Date(metin(g.son_tarih).replace(' ', 'T'));
                const simdi = new Date();
                const fark = (st.getTime() - simdi.getTime()) / (1000 * 60 * 60 * 24); // gün cinsinden
                let sinif = '';
                if (!tamam && fark < 0) sinif = 'gecmis';
                else if (!tamam && fark < 1) sinif = 'yakin';
                const tarihStr = Number.isNaN(st.getTime())
                    ? ''
                    : st.toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                      });
                meta +=
                    '<span class="gorev-son-tarih ' +
                    sinif +
                    '"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>' +
                    esc(tarihStr) +
                    '</span>';
            }
            meta += '</div>';

            d.innerHTML =
                '<div class="bilgi"><h4>' +
                esc(g.baslik) +
                '</h4>' +
                (g.aciklama ? '<p>' + esc(g.aciklama) + '</p>' : '') +
                kime +
                kimden +
                meta +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' +
                '<span class="durum-rozet ' +
                (tamam ? 'durum-tamam' : 'durum-bekliyor') +
                '">' +
                (tamam ? 'Tamamlandı' : 'Bekliyor') +
                '</span>' +
                '<div><button type="button" class="islem-btn" data-action-call="gorevDurum(' +
                gorevId +
                ",'" +
                (tamam ? 'bekliyor' : 'tamamlandi') +
                '\')">' +
                (tamam ? 'Geri Al' : 'Tamamla') +
                '</button>' +
                (yetkili
                    ? '<button type="button" class="islem-btn sil-btn" data-action-call="gorevSil(' +
                      gorevId +
                      ')">Sil</button>'
                    : '') +
                '</div></div>';
            l.appendChild(d);
        });
    }

    async function gorevEkleModalAc() {
        const ks = await apicagir('/api/kullanicilar');
        const sel = document.getElementById('gorev-kullanici');
        sel.innerHTML = '';
        (Array.isArray(ks) ? ks : [])
            .filter((k) => k.rol !== 'admin')
            .forEach((k) => {
                const o = document.createElement('option');
                o.value = String(guvenliId(k.id));
                o.textContent = kullaniciGorunenAd(k);
                sel.appendChild(o);
            });
        document.getElementById('gorev-baslik').value = '';
        document.getElementById('gorev-aciklama-input').value = '';
        document.getElementById('gorev-oncelik').value = 'normal';
        document.getElementById('gorev-kategori').value = 'diger';
        document.getElementById('gorev-son-tarih').value = '';
        document.getElementById('gorev-tekrar').value = 'tek';
        document.getElementById('gorev-modal').classList.add('aktif');
    }

    async function gorevKaydet() {
        const sonTarih = val('gorev-son-tarih');
        const body = {
            kullanici_id: guvenliId(val('gorev-kullanici')),
            baslik: val('gorev-baslik'),
            aciklama: val('gorev-aciklama-input'),
            oncelik: val('gorev-oncelik'),
            kategori: val('gorev-kategori'),
            tekrar: val('gorev-tekrar'),
            son_tarih: sonTarih ? sonTarih.replace('T', ' ') + ':00' : null
        };
        if (!body.baslik) {
            toast('Başlık gereklidir.');
            return;
        }
        if (!body.kullanici_id) {
            toast('Kullanıcı seçin.');
            return;
        }
        const s = await apicagir('/api/gorevler', 'POST', body);
        if (s.hata) {
            toast(s.hata);
            return;
        }
        modalKapat('gorev-modal');
        gorevleriYukle();
        toast('Görev atandı.');
    }

    async function gorevDurum(id, durum) {
        const gorevId = guvenliId(id);
        const durumSafe = ['bekliyor', 'tamamlandi'].includes(durum) ? durum : '';
        if (!gorevId || !durumSafe) return;
        const s = await apicagir('/api/gorevler/' + gorevId + '/durum', 'PUT', { durum: durumSafe });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        gorevleriYukle();
        bildirimleriYenile();
    }

    async function gorevSil(id) {
        const gorevId = guvenliId(id);
        if (!gorevId || !confirm('Görevi sil?')) return;
        const s = await apicagir('/api/gorevler/' + gorevId, 'DELETE');
        if (s.hata) {
            toast(s.hata);
            return;
        }
        gorevleriYukle();
    }

    return {
        actions: { gorevleriYukle, gorevEkleModalAc, gorevKaydet, gorevDurum, gorevSil },
        pageLoaders: { gorevler: gorevleriYukle }
    };
}
