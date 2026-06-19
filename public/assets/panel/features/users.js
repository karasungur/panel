export function createUsersFeature(ctx) {
    const {
        state,
        actions,
        esc,
        guvenliRenk,
        guvenliId,
        resimHTML,
        toast,
        val,
        basHarfleri,
        telefonRakamlariniAl,
        telefonGonderimDegeri,
        telefonGoster,
        kullaniciGorunenAd,
        apicagir,
        RENKLER
    } = ctx;
    const modalKapat = (...args) => actions.modalKapat(...args);
    const sonGorulduMetin = (...args) => actions.sonGorulduMetin(...args);
    const sonGorulduSinif = (...args) => actions.sonGorulduSinif(...args);
    async function kullanicilariYukle() {
        const ks = await apicagir('/api/kullanicilar');
        const tb = document.getElementById('kullanici-tablosu');
        tb.innerHTML = '';
        if (!Array.isArray(ks)) return;
        ks.forEach((k) => {
            let iller;
            if (k.rol === 'admin') iller = '<span style="color:var(--secondary)">Tüm iller (Yönetici)</span>';
            else if (k.rol === 'yardimci') iller = '<span style="color:var(--secondary)">Tüm iller (Yardımcı)</span>';
            else
                iller =
                    Array.isArray(k.iller) && k.iller.length
                        ? '<div class="il-etiketleri">' +
                          k.iller.map((i) => '<span class="il-etiket">' + esc(i.il_adi) + '</span>').join('') +
                          '</div>'
                        : '<span style="color:var(--outline)">İl atanmamış</span>';

            let gorevRozet;
            const renk = guvenliRenk(k.renk);
            if (k.rol === 'admin')
                gorevRozet = '<span class="rozet" style="background:#c1121f">Tanıtım ve Medya Başkanı</span>';
            else if (k.rol === 'yardimci')
                gorevRozet =
                    '<span class="rozet" style="background:#856404">Yardımcı</span>' +
                    (k.gorev_adi
                        ? ' <span class="gorev-rozet" style="background:' +
                          renk +
                          '22;color:' +
                          renk +
                          '">' +
                          esc(k.gorev_adi) +
                          '</span>'
                        : '');
            else
                gorevRozet =
                    '<span class="gorev-rozet" style="background:' +
                    renk +
                    '22;color:' +
                    renk +
                    '">' +
                    esc(k.gorev_adi || 'Kullanıcı') +
                    '</span>';

            const gorunenAd = kullaniciGorunenAd(k);
            const telefonMetni = telefonGoster(k.telefon);
            const avatar =
                resimHTML(k.profil_foto, 'baskan-foto', 'border-radius:99px') ||
                '<div class="avatar" style="width:38px;height:38px;background:' +
                    renk +
                    '22;color:' +
                    renk +
                    '">' +
                    esc(basHarfleri(gorunenAd)) +
                    '</div>';

            // Yardimci ya da kullanici, hedef admin DEGILSE etkilesim acik;
            // Yardimci admin'i etkileyemez (UI seviyesinde de gizleyelim, backend zaten engelliyor)
            const adminHedef = k.rol === 'admin';
            const yapanAdmin = state.kullanici.rol === 'admin';
            const kId = guvenliId(k.id);
            let islem = '';
            if (!adminHedef || yapanAdmin) {
                if (k.rol === 'kullanici') {
                    islem +=
                        '<button type="button" class="islem-btn" data-action-call="kullaniciDuzenle(' +
                        kId +
                        ')">Düzenle</button>';
                    islem +=
                        '<button type="button" class="islem-btn" data-action-call="kullaniciIllerDuzenle(' +
                        kId +
                        ')">İl Ata</button>';
                } else if (k.rol === 'yardimci') {
                    islem +=
                        '<button type="button" class="islem-btn" data-action-call="kullaniciDuzenle(' +
                        kId +
                        ')">Düzenle</button>';
                } else if (yapanAdmin) {
                    // admin de admin'i sadece sifre/silebilir? Kendisi degilse sifre degisebilir
                }
                islem +=
                    '<button type="button" class="islem-btn" data-action-call="kullaniciSifreModalAc(' +
                    kId +
                    ')">Şifre</button>';
                if (kId !== guvenliId(state.kullanici.id))
                    islem +=
                        '<button type="button" class="islem-btn sil-btn" data-action-call="kullaniciSil(' +
                        kId +
                        ')">Sil</button>';
            } else {
                islem = '<span style="color:var(--outline);font-size:12px">🔒 Yönetici hesabı</span>';
            }
            const sonGirisMetin = sonGorulduMetin(k.son_giris);
            const sonGirisSinif = sonGorulduSinif(k.son_giris);
            const sonGiris =
                '<span class="online-rozet ' +
                esc(sonGirisSinif) +
                '"><span class="nokta"></span>' +
                esc(sonGirisMetin) +
                '</span>';
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td><div class="baskan-hucre">' +
                avatar +
                '<div class="baskan-bilgi"><b>' +
                esc(gorunenAd) +
                '</b><br>' +
                esc(telefonMetni) +
                '</div></div></td>' +
                '<td>' +
                gorevRozet +
                '</td><td>' +
                iller +
                '</td><td>' +
                sonGiris +
                '</td><td>' +
                islem +
                '</td>';
            tb.appendChild(tr);
        });
    }

    function renkSecimDoldur(secili) {
        const k = document.getElementById('renk-secim');
        k.innerHTML = '';
        RENKLER.forEach((r) => {
            const d = document.createElement('div');
            d.className = 'renk-opsiyon' + (r === secili ? ' secili' : '');
            d.style.background = r;
            d.onclick = () => {
                document.querySelectorAll('#renk-secim .renk-opsiyon').forEach((x) => x.classList.remove('secili'));
                d.classList.add('secili');
                state.secilenRenk = r;
            };
            k.appendChild(d);
        });
    }

    async function ilSecimDoldur(seciliIdler = []) {
        const iller = await apicagir('/api/iller/harita');
        const k = document.getElementById('il-secim-kutu');
        k.innerHTML = '';
        if (!Array.isArray(iller)) return;
        const seciliSet = new Set(seciliIdler.map(guvenliId));
        iller.forEach((il) => {
            const ilId = guvenliId(il.id);
            const d = document.createElement('div');
            d.className = 'il-secim-satir';
            d.innerHTML =
                '<input type="checkbox" id="ils-' +
                ilId +
                '" value="' +
                ilId +
                '" ' +
                (seciliSet.has(ilId) ? 'checked' : '') +
                '><label for="ils-' +
                ilId +
                '">' +
                esc(il.plaka) +
                ' - ' +
                esc(il.il_adi) +
                '</label>';
            k.appendChild(d);
        });
    }

    function seciliIller() {
        return Array.from(document.querySelectorAll('#il-secim-kutu input:checked'))
            .map((c) => guvenliId(c.value))
            .filter(Boolean);
    }

    async function kullaniciEkleModalAc() {
        document.getElementById('kullanici-modal-baslik').textContent = 'Kullanıcı Ekle';
        document.getElementById('kullanici-id').value = '';
        document.getElementById('k-temel').style.display = 'block';
        document.getElementById('sifre-label').textContent = 'Şifre *';
        ['yeni-ad-soyad', 'yeni-telefon', 'yeni-sifre', 'yeni-gorev'].forEach(
            (i) => (document.getElementById(i).value = '')
        );
        // Rol secimi (sadece admin gorebilir)
        if (state.kullanici.rol === 'admin') {
            document.getElementById('rol-grubu').style.display = 'block';
            document.getElementById('yeni-rol').value = 'kullanici';
        } else {
            document.getElementById('rol-grubu').style.display = 'none';
        }
        state.secilenRenk = RENKLER[1];
        renkSecimDoldur(state.secilenRenk);
        await ilSecimDoldur([]);
        document.getElementById('kullanici-modal').classList.add('aktif');
    }

    async function kullaniciDuzenle(id) {
        const kId = guvenliId(id);
        const ks = await apicagir('/api/kullanicilar');
        const k = Array.isArray(ks) ? ks.find((x) => guvenliId(x.id) === kId) : null;
        if (!k) return;
        document.getElementById('kullanici-modal-baslik').textContent = 'Kullanıcı Düzenle';
        document.getElementById('kullanici-id').value = String(kId);
        document.getElementById('k-temel').style.display = 'block';
        document.getElementById('sifre-label').textContent = 'Yeni Şifre (boş = değişmez)';
        document.getElementById('yeni-ad-soyad').value = k.ad_soyad || '';
        document.getElementById('yeni-telefon').value = telefonRakamlariniAl(k.telefon);
        document.getElementById('yeni-sifre').value = '';
        document.getElementById('yeni-gorev').value = k.gorev_adi || '';
        // Rol secimi sadece admin'de gorunur, ve sadece admin OLMAYAN kullanicilarda
        if (state.kullanici.rol === 'admin' && k.rol !== 'admin') {
            document.getElementById('rol-grubu').style.display = 'block';
            document.getElementById('yeni-rol').value = k.rol;
        } else {
            document.getElementById('rol-grubu').style.display = 'none';
        }
        state.secilenRenk = k.renk || RENKLER[1];
        renkSecimDoldur(state.secilenRenk);
        await ilSecimDoldur((k.iller || []).map((i) => i.id));
        document.getElementById('kullanici-modal').classList.add('aktif');
    }

    async function kullaniciIllerDuzenle(id) {
        const kId = guvenliId(id);
        const ks = await apicagir('/api/kullanicilar');
        const k = Array.isArray(ks) ? ks.find((x) => guvenliId(x.id) === kId) : null;
        if (!k) return;
        document.getElementById('kullanici-modal-baslik').textContent = kullaniciGorunenAd(k) + ' — İl Ata';
        document.getElementById('kullanici-id').value = String(kId);
        document.getElementById('k-temel').style.display = 'none';
        await ilSecimDoldur((k.iller || []).map((i) => i.id));
        document.getElementById('kullanici-modal').classList.add('aktif');
    }

    async function kullaniciKaydet() {
        const id = guvenliId(document.getElementById('kullanici-id').value);
        const il_idleri = seciliIller();
        const temelGorunur = document.getElementById('k-temel').style.display !== 'none';
        const rolGorunur = document.getElementById('rol-grubu').style.display !== 'none';
        const seciliRol = rolGorunur ? val('yeni-rol') : null;
        if (id) {
            if (temelGorunur) {
                const body = {
                    ad_soyad: val('yeni-ad-soyad'),
                    telefon: telefonGonderimDegeri(val('yeni-telefon')),
                    gorev_adi: val('yeni-gorev'),
                    renk: state.secilenRenk
                };
                if (!body.telefon) {
                    toast('Geçerli telefon numarası girin.');
                    return;
                }
                if (seciliRol) body.rol = seciliRol;
                const s = await apicagir('/api/kullanicilar/' + id, 'PUT', body);
                if (s.hata) {
                    toast(s.hata);
                    return;
                }
                const sifre = val('yeni-sifre');
                if (sifre) {
                    const sifreSonuc = await apicagir('/api/kullanicilar/' + id + '/sifre', 'PUT', {
                        yeni_sifre: sifre
                    });
                    if (sifreSonuc.hata) {
                        toast(sifreSonuc.hata);
                        return;
                    }
                }
            }
            const ilSonuc = await apicagir('/api/kullanicilar/' + id + '/iller', 'PUT', { il_idleri });
            if (ilSonuc.hata) {
                toast(ilSonuc.hata);
                return;
            }
        } else {
            const body = {
                ad_soyad: val('yeni-ad-soyad'),
                telefon: telefonGonderimDegeri(val('yeni-telefon')),
                sifre: val('yeni-sifre'),
                gorev_adi: val('yeni-gorev'),
                renk: state.secilenRenk,
                il_idleri
            };
            if (seciliRol) body.rol = seciliRol;
            if (!body.telefon || !body.sifre) {
                toast('Geçerli telefon numarası ve şifre gereklidir.');
                return;
            }
            const s = await apicagir('/api/kullanicilar', 'POST', body);
            if (s.hata) {
                toast(s.hata);
                return;
            }
        }
        modalKapat('kullanici-modal');
        kullanicilariYukle();
        toast('Kaydedildi.');
    }

    function kullaniciSifreModalAc(id) {
        const kId = guvenliId(id);
        if (!kId) return;
        document.getElementById('ksifre-id').value = String(kId);
        document.getElementById('ksifre-yeni').value = '';
        document.getElementById('ksifre-modal').classList.add('aktif');
    }

    async function kullaniciSifreKaydet() {
        const id = guvenliId(document.getElementById('ksifre-id').value),
            ys = val('ksifre-yeni');
        if (!id || !ys) {
            toast('Yeni şifre girin.');
            return;
        }
        const s = await apicagir('/api/kullanicilar/' + id + '/sifre', 'PUT', { yeni_sifre: ys });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        modalKapat('ksifre-modal');
        toast('Şifre güncellendi.');
    }

    async function kullaniciSil(id) {
        const kId = guvenliId(id);
        if (!kId || !confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
        const s = await apicagir('/api/kullanicilar/' + kId, 'DELETE');
        if (s.hata) {
            toast(s.hata);
            return;
        }
        kullanicilariYukle();
    }

    return {
        actions: {
            kullanicilariYukle,
            renkSecimDoldur,
            ilSecimDoldur,
            seciliIller,
            kullaniciEkleModalAc,
            kullaniciDuzenle,
            kullaniciIllerDuzenle,
            kullaniciKaydet,
            kullaniciSifreModalAc,
            kullaniciSifreKaydet,
            kullaniciSil,
            ilSecimModalKapat() {
                document.getElementById('il-secim-modal')?.remove();
            }
        },
        pageLoaders: { kullanicilar: kullanicilariYukle }
    };
}
