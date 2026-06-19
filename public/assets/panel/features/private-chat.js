export function createPrivateChatFeature(ctx) {
    const {
        state,
        metin,
        esc,
        guvenliRenk,
        guvenliId,
        resimHTML,
        toast,
        basHarfleri,
        telefonGoster,
        kullaniciGorunenAd,
        apicagir
    } = ctx;
    async function chatAciciTogla() {
        state.chatAciciAcik = !state.chatAciciAcik;
        const p = document.getElementById('chat-acici-panel');
        p.classList.toggle('aktif', state.chatAciciAcik);
        if (state.chatAciciAcik) await chatKisileriYukle();
    }

    function chatAciciKapat() {
        state.chatAciciAcik = false;
        document.getElementById('chat-acici-panel').classList.remove('aktif');
    }

    function sonGorulduMetin(sonGiris) {
        if (!sonGiris) return 'Henüz giriş yapmadı';
        const t = new Date(metin(sonGiris).replace(' ', 'T') + 'Z');
        if (Number.isNaN(t.getTime())) return '';
        const fark = (Date.now() - t.getTime()) / 60000; // dakika
        if (fark < 5) return 'Çevrimiçi';
        if (fark < 60) return Math.floor(fark) + ' dk önce';
        if (fark < 1440) return Math.floor(fark / 60) + ' saat önce';
        return t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }

    function sonGorulduSinif(sonGiris) {
        if (!sonGiris) return '';
        const t = new Date(metin(sonGiris).replace(' ', 'T') + 'Z');
        if (Number.isNaN(t.getTime())) return '';
        const fark = (Date.now() - t.getTime()) / 60000;
        if (fark < 5) return 'online';
        if (fark < 60) return 'yakin';
        return '';
    }

    async function chatKisileriYukle() {
        try {
            const [sohbetler, tumKullanicilar] = await Promise.all([
                apicagir('/api/ozel-mesaj/sohbetler'),
                apicagir('/api/ozel-mesaj/kullanicilar')
            ]);
            // Birlestir: once aktif sohbetler, sonra hic mesajlasmadigi diger kisiler
            const sohbetDizi = Array.isArray(sohbetler) ? sohbetler : [];
            const kullaniciDizi = Array.isArray(tumKullanicilar) ? tumKullanicilar : [];
            const aktifIds = new Set(sohbetDizi.map((s) => guvenliId(s.kisi_id)));
            const digerleri = kullaniciDizi.filter((k) => !aktifIds.has(guvenliId(k.id)));
            state.chatKisilerListesi = [
                ...sohbetDizi,
                ...digerleri.map((k) => ({ ...k, kisi_id: k.id, okunmamis: 0 }))
            ];
            chatKisileriListele();
        } catch {
            document.getElementById('chat-acici-liste').innerHTML =
                '<p style="text-align:center;color:var(--outline);padding:20px;font-size:13px">Yüklenemedi.</p>';
        }
    }

    function chatKisileriListele() {
        const arama = (document.getElementById('chat-arama-input')?.value || '').toLowerCase().trim();
        const liste = document.getElementById('chat-acici-liste');
        let kisiler = state.chatKisilerListesi;
        if (arama) {
            kisiler = kisiler.filter(
                (k) =>
                    (k.ad_soyad || '').toLowerCase().includes(arama) ||
                    telefonGoster(k.telefon).toLowerCase().includes(arama) ||
                    (k.telefon || '').toLowerCase().includes(arama)
            );
        }
        if (!kisiler.length) {
            liste.innerHTML =
                '<p style="text-align:center;color:var(--outline);padding:20px;font-size:13px">Kişi bulunamadı.</p>';
            return;
        }
        liste.innerHTML = '';
        kisiler.forEach((k) => {
            const onlineSinif = sonGorulduSinif(k.son_giris);
            const onlineMetin = sonGorulduMetin(k.son_giris);
            const renk = guvenliRenk(k.renk);
            const kisiId = guvenliId(k.kisi_id);
            const av =
                resimHTML(k.profil_foto, 'avatar', 'border-radius:50%;object-fit:cover') ||
                '<div class="avatar" style="background:' +
                    renk +
                    '22;color:' +
                    renk +
                    '">' +
                    esc(basHarfleri(kullaniciGorunenAd(k))) +
                    '</div>';
            const onlineNokta = onlineSinif === 'online' ? '<span class="online-nokta"></span>' : '';
            const sonMesaj = metin(k.son_mesaj);
            const durumMetin = sonMesaj ? sonMesaj.substring(0, 40) + (sonMesaj.length > 40 ? '...' : '') : onlineMetin;
            const durumSinif = k.son_mesaj ? '' : onlineSinif;
            const rozet = k.okunmamis > 0 ? '<span class="kisi-rozet">' + esc(k.okunmamis) + '</span>' : '';
            const d = document.createElement('div');
            d.className = 'chat-kisi-kart';
            d.innerHTML =
                '<div style="position:relative;width:40px;height:40px">' +
                av +
                onlineNokta +
                '</div>' +
                '<div class="kisi-bilgi"><div class="kisi-ad">' +
                esc(kullaniciGorunenAd(k)) +
                '</div>' +
                '<div class="kisi-durum ' +
                esc(durumSinif) +
                '">' +
                esc(durumMetin) +
                '</div></div>' +
                rozet;
            d.onclick = () => {
                sohbetAc(kisiId, kullaniciGorunenAd(k), renk, k.son_giris);
                chatAciciKapat();
            };
            liste.appendChild(d);
        });
    }

    function chatKisilerFiltrele() {
        chatKisileriListele();
    }

    async function sohbetAc(kisiId, kisiAdi, renk, sonGiris) {
        const kisiIdSafe = guvenliId(kisiId);
        if (!kisiIdSafe) return;
        const kisiAdiMetin = metin(kisiAdi);
        const renkSafe = guvenliRenk(renk);
        // Zaten acik mi?
        if (state.acikSohbetler[kisiIdSafe]) {
            // Digerlerini kucult (mobilde odaklanilan tek kalsin)
            if (window.innerWidth < 600) {
                Object.keys(state.acikSohbetler).forEach((id) => {
                    if (guvenliId(id) !== kisiIdSafe) {
                        state.acikSohbetler[id].pencere.classList.add('kucuk');
                    }
                });
            }
            const p = state.acikSohbetler[kisiIdSafe].pencere;
            p.classList.remove('kucuk');
            sohbetOdaklan(kisiIdSafe);
            return;
        }

        // Mobilde tek pencere gosterimi icin digerlerini kucult
        if (window.innerWidth < 600) {
            Object.keys(state.acikSohbetler).forEach((id) => {
                state.acikSohbetler[id].pencere.classList.add('kucuk');
            });
        }

        // Yeni pencere olustur
        const pencere = document.createElement('div');
        pencere.className = 'sohbet-pencere';
        pencere.dataset.kisiId = String(kisiIdSafe);
        pencere.innerHTML =
            '<div class="sohbet-baslik" data-action-call="sohbetKucult(' +
            kisiIdSafe +
            ')">' +
            '<div class="avatar" style="background:' +
            renkSafe +
            '33">' +
            esc(basHarfleri(kisiAdiMetin)) +
            '</div>' +
            '<div class="b-bilgi">' +
            '<div class="b-ad">' +
            esc(kisiAdiMetin) +
            '</div>' +
            '<div class="b-durum" id="sohbet-durum-' +
            kisiIdSafe +
            '">' +
            esc(sonGorulduMetin(sonGiris)) +
            '</div>' +
            '</div>' +
            '<div class="b-aksiyon">' +
            '<button type="button" data-sohbet-sil data-action-call="sohbetSil(event, ' +
            kisiIdSafe +
            ')" title="Sohbeti sil"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>' +
            '<button type="button" data-action-call="sohbetKucult(event, ' +
            kisiIdSafe +
            ')" title="Küçült"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M19 13H5v-2h14v2z"/></svg></button>' +
            '<button type="button" data-action-call="sohbetKapat(event, ' +
            kisiIdSafe +
            ')" title="Kapat"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
            '</div>' +
            '</div>' +
            '<div class="sohbet-icerik" id="sohbet-icerik-' +
            kisiIdSafe +
            '"></div>' +
            '<div class="sohbet-input-bar">' +
            '<input type="text" id="sohbet-input-' +
            kisiIdSafe +
            '" placeholder="Mesaj yaz..." data-keydown-call="sohbetTusBas(event,' +
            kisiIdSafe +
            ')" data-input-call="sohbetYazilmaBildir(' +
            kisiIdSafe +
            ')">' +
            '<button type="button" data-action-call="sohbetGonder(' +
            kisiIdSafe +
            ')" title="Gönder"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
            '</div>';
        document.getElementById('acik-sohbetler').appendChild(pencere);
        state.acikSohbetler[kisiIdSafe] = { pencere, son_mesaj_id: 0, yaziyor_timer: null, kisiAdi: kisiAdiMetin };

        // Mesajlari yukle
        await sohbetMesajlariYukle(kisiIdSafe);
        sohbetOdaklan(kisiIdSafe);
    }

    async function sohbetMesajlariYukle(kisiId, sessizce) {
        try {
            const kisiIdSafe = guvenliId(kisiId);
            if (!kisiIdSafe) return;
            const m = await apicagir('/api/ozel-mesaj/' + kisiIdSafe);
            const i = document.getElementById('sohbet-icerik-' + kisiIdSafe);
            if (!i || !Array.isArray(m)) return;

            const isAtBottom = i.scrollHeight - i.scrollTop - i.clientHeight < 50;
            const isFirstLoad = i.children.length === 0;

            // Yaziyor satirini koru, yeni mesajlari ekle veya tum listeyi tazele
            if (!sessizce || !state.acikSohbetler[kisiIdSafe] || state.acikSohbetler[kisiIdSafe].son_mesaj_id === 0) {
                // Tam yenile
                i.innerHTML = '';
                m.forEach((msj) => sohbetMesajEkle(i, msj, kisiIdSafe));
            } else {
                // Sadece yeni mesajlari ekle
                const yeni = m.filter((msj) => guvenliId(msj.id) > state.acikSohbetler[kisiIdSafe].son_mesaj_id);
                yeni.forEach((msj) => sohbetMesajEkle(i, msj, kisiIdSafe));
                if (yeni.length) {
                    if (isAtBottom || state.acikSohbetler[kisiIdSafe].justSent) {
                        i.scrollTop = i.scrollHeight;
                        state.acikSohbetler[kisiIdSafe].justSent = false;
                    }
                }
            }
            if (m.length) state.acikSohbetler[kisiIdSafe].son_mesaj_id = Math.max(...m.map((msj) => guvenliId(msj.id)));
            if (!sessizce || isFirstLoad || state.acikSohbetler[kisiIdSafe]?.justSent) {
                i.scrollTop = i.scrollHeight;
                if (state.acikSohbetler[kisiIdSafe]) {
                    state.acikSohbetler[kisiIdSafe].justSent = false;
                }
            }

            // Yaziyor durumunu kontrol et
            await sohbetYaziyorKontrol(kisiIdSafe);
        } catch {}
    }

    function sohbetMesajEkle(container, msj, kisiId) {
        const benim = msj.gonderen_id === state.kullanici.id;
        const mesajId = guvenliId(msj.id);
        const kisiIdSafe = guvenliId(kisiId);
        const d = document.createElement('div');
        d.className = 's-mesaj-wrap ' + (benim ? 'benim-wrap' : 'karsi-wrap');
        d.dataset.id = String(mesajId);
        const t = new Date((msj.tarih || '').replace(' ', 'T') + 'Z').toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        // Okundu gostergesi sadece kendi mesajlarimizda
        let okunduIkon = '';
        if (benim) {
            if (msj.okundu) {
                // Cift mavi tik
                okunduIkon = ' <span class="s-okundu okundu-evet" title="Okundu">✓✓</span>';
            } else {
                // Tek gri tik
                okunduIkon = ' <span class="s-okundu" title="Gönderildi">✓</span>';
            }
        }
        d.innerHTML =
            '<div class="s-mesaj ' +
            (benim ? 'benim' : 'karsi') +
            '">' +
            '<div>' +
            esc(msj.metin) +
            '</div>' +
            '<div class="s-zaman">' +
            esc(t) +
            okunduIkon +
            '</div>' +
            '</div>' +
            '<button type="button" class="s-mesaj-sil" data-action-call="mesajSil(' +
            mesajId +
            ',' +
            kisiIdSafe +
            ')" title="Mesajı sil">×</button>';
        // Yaziyor satiri varsa onun ustune ekle
        const yz = container.querySelector('.yaziyor-gosterge');
        if (yz) container.insertBefore(d, yz);
        else container.appendChild(d);
    }

    async function sohbetYaziyorKontrol(kisiId) {
        try {
            const kisiIdSafe = guvenliId(kisiId);
            if (!kisiIdSafe) return;
            const r = await apicagir('/api/ozel-mesaj/yaziyor/' + kisiIdSafe);
            const i = document.getElementById('sohbet-icerik-' + kisiIdSafe);
            if (!i) return;
            const mevcut = i.querySelector('.yaziyor-gosterge');
            if (r && r.yaziyor) {
                if (!mevcut) {
                    const d = document.createElement('div');
                    d.className = 'yaziyor-gosterge';
                    d.innerHTML =
                        '<span>Yazıyor</span><div class="nokta"><span></span><span></span><span></span></div>';
                    i.appendChild(d);
                    i.scrollTop = i.scrollHeight;
                }
            } else if (mevcut) {
                mevcut.remove();
            }
        } catch {}
    }

    function sohbetYazilmaBildir(kisiId) {
        const kisiIdSafe = guvenliId(kisiId);
        if (!kisiIdSafe) return;
        // Aşırı bildirim yapmamak için son 2 sn de bildirdiysek tekrar etmesin
        if (state.yazilmaBildirTimer) return;
        state.yazilmaBildirTimer = setTimeout(() => {
            state.yazilmaBildirTimer = null;
        }, 2000);
        apicagir('/api/ozel-mesaj/yaziyor/' + kisiIdSafe, 'PUT').catch(() => {});
    }

    function sohbetTusBas(e, kisiId) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sohbetGonder(kisiId);
        }
    }

    async function sohbetGonder(kisiId) {
        const kisiIdSafe = guvenliId(kisiId);
        if (!kisiIdSafe) return;
        const inp = document.getElementById('sohbet-input-' + kisiIdSafe);
        if (!inp) return;
        const metin = inp.value.trim();
        if (!metin) return;
        inp.value = '';
        if (state.acikSohbetler[kisiIdSafe]) {
            state.acikSohbetler[kisiIdSafe].justSent = true;
        }
        const s = await apicagir('/api/ozel-mesaj', 'POST', { alici_id: kisiIdSafe, metin });
        if (s.hata) {
            toast(s.hata);
            if (state.acikSohbetler[kisiIdSafe]) {
                state.acikSohbetler[kisiIdSafe].justSent = false;
            }
            return;
        }
        await sohbetMesajlariYukle(kisiIdSafe, true);
        inp.focus();
    }

    function sohbetKucult(e, kisiId) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (kisiId === undefined) kisiId = e;
        const kisiIdSafe = guvenliId(kisiId);
        if (!state.acikSohbetler[kisiIdSafe]) return;
        state.acikSohbetler[kisiIdSafe].pencere.classList.toggle('kucuk');
    }

    function sohbetKapat(e, kisiId) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (kisiId === undefined) kisiId = e;
        const kisiIdSafe = guvenliId(kisiId);
        if (!state.acikSohbetler[kisiIdSafe]) return;
        state.acikSohbetler[kisiIdSafe].pencere.remove();
        delete state.acikSohbetler[kisiIdSafe];
    }

    async function sohbetSil(e, kisiId, kisiAdi) {
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        } else {
            kisiAdi = kisiId;
            kisiId = e;
        }
        const kisiIdSafe = guvenliId(kisiId);
        if (!kisiIdSafe) return;
        const kisiAdiMetin = metin(kisiAdi || state.acikSohbetler[kisiIdSafe]?.kisiAdi);
        if (
            !confirm(
                kisiAdiMetin + ' ile olan tüm sohbeti silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.'
            )
        )
            return;
        const r = await apicagir('/api/ozel-mesaj/sohbet/' + kisiIdSafe, 'DELETE');
        if (r.hata) {
            toast(r.hata);
            return;
        }
        // Pencereyi kapat
        sohbetKapat(kisiIdSafe);
        toast('Sohbet silindi.');
        chatBalonYenile();
    }

    async function mesajSil(mesajId, kisiId) {
        const mesajIdSafe = guvenliId(mesajId),
            kisiIdSafe = guvenliId(kisiId);
        if (!mesajIdSafe || !kisiIdSafe || !confirm('Bu mesajı silmek istediğinize emin misiniz?')) return;
        const r = await apicagir('/api/ozel-mesaj/mesaj/' + mesajIdSafe, 'DELETE');
        if (r.hata) {
            toast(r.hata);
            return;
        }
        // Sohbeti yenile
        if (state.acikSohbetler[kisiIdSafe]) {
            state.acikSohbetler[kisiIdSafe].son_mesaj_id = 0;
            await sohbetMesajlariYukle(kisiIdSafe);
        }
    }

    function sohbetOdaklan(kisiId) {
        const kisiIdSafe = guvenliId(kisiId);
        setTimeout(() => {
            const inp = document.getElementById('sohbet-input-' + kisiIdSafe);
            if (inp) inp.focus();
            const i = document.getElementById('sohbet-icerik-' + kisiIdSafe);
            if (i) i.scrollTop = i.scrollHeight;
        }, 50);
    }

    async function chatBalonYenile() {
        // Acik sohbetlerin mesajlarini tazele
        const acikIdler = Object.keys(state.acikSohbetler).map(Number);
        for (const id of acikIdler) {
            if (state.acikSohbetler[id] && !state.acikSohbetler[id].pencere.classList.contains('kucuk')) {
                await sohbetMesajlariYukle(id, true);
            } else if (state.acikSohbetler[id]) {
                // Kucult halindeyse sadece yaziyor durumu yeterli
                await sohbetYaziyorKontrol(id);
            }
        }
        // Toplam okunmamis sayisi
        try {
            const r = await apicagir('/api/ozel-mesaj/okunmamis/toplam');
            const rozet = document.getElementById('chat-acici-rozet');
            if (r && r.okunmamis > 0) {
                rozet.textContent = r.okunmamis > 99 ? '99+' : r.okunmamis;
                rozet.style.display = 'flex';
            } else {
                rozet.style.display = 'none';
            }
        } catch {}
        // Acik panel varsa kisi listesini de yenile
        if (state.chatAciciAcik) await chatKisileriYukle();
    }

    function chatBalonSisteminiBaslat() {
        chatBalonYenile();
        if (state.chatPollInterval) clearInterval(state.chatPollInterval);
        state.chatPollInterval = setInterval(chatBalonYenile, 2000);
    }

    function init() {
        chatBalonSisteminiBaslat();
    }

    return {
        actions: {
            chatAciciTogla,
            chatAciciKapat,
            sonGorulduMetin,
            sonGorulduSinif,
            chatKisileriYukle,
            chatKisileriListele,
            chatKisilerFiltrele,
            sohbetAc,
            sohbetMesajlariYukle,
            sohbetMesajEkle,
            sohbetYaziyorKontrol,
            sohbetYazilmaBildir,
            sohbetTusBas,
            sohbetGonder,
            sohbetKucult,
            sohbetKapat,
            sohbetSil,
            mesajSil,
            sohbetOdaklan,
            chatBalonYenile,
            chatBalonSisteminiBaslat
        },
        init
    };
}
