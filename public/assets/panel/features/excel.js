export function createExcelFeature(ctx) {
    const { state, actions, esc, guvenliId, guvenliExcelTip, toast, apicagir, loginSayfasinaGit } = ctx;
    const modalKapat = (...args) => actions.modalKapat(...args);
    const illeriYukle = (...args) => actions.illeriYukle(...args);
    const ilSecVeIlceleriGoster = (...args) => actions.ilSecVeIlceleriGoster(...args);
    function excelStateSifirla(requestIdArtir) {
        if (requestIdArtir !== false) state.excelState.requestId++;
        state.excelState.importId = '';
        state.excelState.tip = state.excelTip;
        state.excelState.uygulanabilir = false;
        const btn = document.getElementById('excel-uygula-btn');
        if (btn) {
            btn.style.display = 'none';
            btn.disabled = false;
        }
    }

    function excelModalAc(tip) {
        state.excelTip = guvenliExcelTip(tip);
        excelStateSifirla(true);
        document.getElementById('excel-modal-baslik').textContent =
            (state.excelTip === 'il' ? 'İl' : 'İlçe') + ' Excel Yükle';
        document.getElementById('excel-dosya').value = '';
        document.getElementById('excel-sonuc').innerHTML = '';
        document.getElementById('sablon-link').onclick = (e) => {
            e.preventDefault();
            sablonIndir(state.excelTip);
        };
        document.getElementById('excel-modal').classList.add('aktif');
    }

    async function sablonIndir(tip) {
        const guvenliTip = guvenliExcelTip(tip);
        let r;
        try {
            r = await fetch('/api/excel/sablon?tip=' + encodeURIComponent(guvenliTip), {
                credentials: 'include'
            });
        } catch {
            toast('Şablon indirilemedi.');
            return;
        }
        if (r.status === 401) {
            loginSayfasinaGit();
            return;
        }
        if (!r.ok) {
            toast('Şablon indirilemedi.');
            return;
        }
        const blob = await r.blob();
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        a.download = 'sablon-' + guvenliTip + '.xlsx';
        a.click();
        URL.revokeObjectURL(u);
    }

    async function excelOnizle() {
        const f = document.getElementById('excel-dosya').files[0];
        const istekId = ++state.excelState.requestId;
        const istekTip = guvenliExcelTip(state.excelTip);
        state.excelState.importId = '';
        state.excelState.tip = istekTip;
        state.excelState.uygulanabilir = false;
        document.getElementById('excel-uygula-btn').style.display = 'none';
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.xlsx')) {
            excelStateSifirla(true);
            document.getElementById('excel-dosya').value = '';
            document.getElementById('excel-sonuc').innerHTML =
                '<p style="color:var(--error)">Lütfen indirilen .xlsx şablonunu yükleyin.</p>';
            return;
        }
        document.getElementById('excel-sonuc').innerHTML = '<p style="color:var(--secondary)">Analiz ediliyor...</p>';
        const r = new FileReader();
        r.onload = async () => {
            if (istekId !== state.excelState.requestId || istekTip !== guvenliExcelTip(state.excelTip)) return;
            let s;
            try {
                s = await apicagir('/api/excel/onizle', 'POST', { dosya: r.result, tip: istekTip });
            } catch {
                if (istekId !== state.excelState.requestId) return;
                excelStateSifirla(false);
                document.getElementById('excel-sonuc').innerHTML =
                    '<p style="color:var(--error)">Excel dosyası analiz edilemedi.</p>';
                return;
            }
            if (istekId !== state.excelState.requestId || istekTip !== guvenliExcelTip(state.excelTip)) return;
            if (s.hata) {
                excelStateSifirla(false);
                document.getElementById('excel-sonuc').innerHTML =
                    '<p style="color:var(--error)">' + esc(s.hata) + '</p>';
                return;
            }
            state.excelState.importId = s.importId || '';
            state.excelState.tip = guvenliExcelTip(s.tip || s.sablon || istekTip);
            state.excelState.uygulanabilir = Boolean(
                s.uygulanabilir && state.excelState.importId && state.excelState.tip === istekTip
            );
            let h =
                '<div style="background:var(--success-bg);color:var(--success);padding:10px;border-radius:8px;font-size:13px;margin-bottom:10px"><b>' +
                esc(s.toplam) +
                '</b> kayıt önizlendi.</div>';
            if (s.sorunlar && s.sorunlar.length) {
                h +=
                    '<div style="background:var(--error-container);color:var(--on-error-container);padding:10px;border-radius:8px;font-size:12px;margin-bottom:10px"><b>' +
                    esc(s.sorunlar.length) +
                    ' satırda sorun:</b><br>' +
                    s.sorunlar
                        .slice(0, 8)
                        .map((p) => (Number(p.satir) > 0 ? 'Satır ' + esc(p.satir) : 'Genel') + ': ' + esc(p.sorun))
                        .join('<br>') +
                    '</div>';
            }
            if (!state.excelState.uygulanabilir) {
                h +=
                    '<div style="background:var(--error-container);color:var(--on-error-container);padding:10px;border-radius:8px;font-size:12px;margin-bottom:10px">Kritik sorunlar giderilmeden içe aktarma yapılamaz.</div>';
            }
            document.getElementById('excel-sonuc').innerHTML = h;
            if (state.excelState.uygulanabilir) document.getElementById('excel-uygula-btn').style.display = 'block';
        };
        r.onerror = () => {
            if (istekId !== state.excelState.requestId) return;
            excelStateSifirla(false);
            document.getElementById('excel-sonuc').innerHTML =
                '<p style="color:var(--error)">Excel dosyası okunamadı.</p>';
        };
        r.readAsDataURL(f);
    }

    async function excelUygula() {
        const importId = state.excelState.importId;
        const tip = guvenliExcelTip(state.excelTip);
        if (!state.excelState.uygulanabilir || !importId || state.excelState.tip !== tip) {
            excelStateSifirla(false);
            toast('Güncel bir Excel önizlemesi bulunamadı.');
            return;
        }
        const istekId = state.excelState.requestId;
        const btn = document.getElementById('excel-uygula-btn');
        btn.disabled = true;
        let s;
        try {
            s = await apicagir('/api/excel/uygula', 'POST', {
                importId,
                tip
            });
        } catch {
            btn.disabled = false;
            toast('Excel içe aktarma uygulanamadı.');
            return;
        }
        if (istekId !== state.excelState.requestId || importId !== state.excelState.importId) return;
        btn.disabled = false;
        if (s.hata) {
            excelStateSifirla(false);
            toast(s.hata);
            return;
        }
        excelStateSifirla(false);
        modalKapat('excel-modal');
        toast(s.mesaj || s.basarili + ' kayıt güncellendi.');
        illeriYukle();
        if (state.seciliIlId) ilSecVeIlceleriGoster(state.seciliIlId, state.seciliIlAdi);
    }

    async function excelDisaAktar(tip, ilIds) {
        // Menüleri kapat
        document.querySelectorAll('.indir-menu').forEach((m) => (m.style.display = 'none'));
        const guvenliTip = guvenliExcelTip(tip);
        let url = '/api/excel/disa-aktar?tip=' + encodeURIComponent(guvenliTip);
        if (ilIds && ilIds.length) url += '&il_ids=' + ilIds.map(guvenliId).filter(Boolean).join(',');
        let r;
        try {
            r = await fetch(url, { credentials: 'include' });
        } catch {
            toast('Excel oluşturulamadı.');
            return;
        }
        if (r.status === 401) {
            loginSayfasinaGit();
            return;
        }
        if (!r.ok) {
            toast('Excel oluşturulamadı.');
            return;
        }
        const blob = await r.blob();
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        let dosyaAdi = 'iller.xlsx';
        if (guvenliTip === 'ilce') dosyaAdi = 'ilceler.xlsx';
        else if (guvenliTip === 'birlesik') dosyaAdi = 'iller-ve-ilceler.xlsx';
        a.download = dosyaAdi;
        a.click();
        URL.revokeObjectURL(u);
        toast('Excel indirildi.');
    }

    function indirMenuTogla(id) {
        const menu = document.getElementById(id);
        const aktif = menu.style.display === 'block';
        document.querySelectorAll('.indir-menu').forEach((m) => (m.style.display = 'none'));
        menu.style.display = aktif ? 'none' : 'block';
    }

    async function ilSeciminiIndir() {
        document.querySelectorAll('.indir-menu').forEach((m) => (m.style.display = 'none'));
        const iller = await apicagir('/api/iller');
        if (!Array.isArray(iller) || !iller.length) {
            toast('İl listesi alınamadı.');
            return;
        }
        // Önceki modal varsa kaldır
        const eski = document.getElementById('il-secim-modal');
        if (eski) eski.remove();
        const m = document.createElement('div');
        m.id = 'il-secim-modal';
        m.className = 'modal-bg aktif';
        m.innerHTML =
            '<div class="modal genis">' +
            '<h3>İl Seçimi</h3>' +
            '<p style="font-size:13px;color:var(--secondary);margin-bottom:12px">İndirmek istediğiniz illeri seçin:</p>' +
            '<div style="display:flex;gap:8px;margin-bottom:12px">' +
            '<button type="button" class="btn btn-ikincil" data-action-call="ilSecHepsi(true)" style="font-size:12px;padding:6px 12px">Hepsini Seç</button>' +
            '<button type="button" class="btn btn-ikincil" data-action-call="ilSecHepsi(false)" style="font-size:12px;padding:6px 12px">Seçimi Temizle</button>' +
            '</div>' +
            '<div style="max-height:400px;overflow-y:auto;border:1px solid var(--outline-variant);border-radius:8px;padding:10px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px">' +
            iller
                .map(
                    (il) =>
                        '<label style="display:flex;align-items:center;gap:6px;padding:4px;font-size:13px;cursor:pointer"><input type="checkbox" class="il-secim-cb" value="' +
                        guvenliId(il.id) +
                        '"><span>' +
                        esc(il.plaka) +
                        ' - ' +
                        esc(il.il_adi) +
                        '</span></label>'
                )
                .join('') +
            '</div></div>' +
            '<div class="modal-btnlar" style="margin-top:14px">' +
            '<button type="button" class="kaydet" data-action-call="ilSecimGonder(\'il\')">İl Bilgilerini İndir</button>' +
            '<button type="button" class="kaydet" data-action-call="ilSecimGonder(\'birlesik\')" style="background:var(--primary-container)">İl + İlçeleri (Birleşik) İndir</button>' +
            '<button type="button" class="iptal" data-action-call="ilSecimModalKapat()">İptal</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(m);
    }

    function ilSecHepsi(secili) {
        document.querySelectorAll('.il-secim-cb').forEach((cb) => (cb.checked = secili));
    }

    async function ilSecimGonder(tip) {
        const secili = Array.from(document.querySelectorAll('.il-secim-cb:checked'))
            .map((cb) => guvenliId(cb.value))
            .filter(Boolean);
        if (!secili.length) {
            toast('Lütfen en az 1 il seçin.');
            return;
        }
        await excelDisaAktar(tip, secili);
        document.getElementById('il-secim-modal').remove();
    }

    async function tekIlIndir(tip) {
        if (!state.haritaSeciliIl || !state.haritaSeciliIl.id) {
            toast('Önce bir il seçin.');
            return;
        }
        await excelDisaAktar(tip, [state.haritaSeciliIl.id]);
    }

    function init() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.indir-wrap')) {
                document.querySelectorAll('.indir-menu').forEach((m) => (m.style.display = 'none'));
            }
        });
    }

    return {
        actions: {
            excelStateSifirla,
            excelModalAc,
            sablonIndir,
            excelOnizle,
            excelUygula,
            excelDisaAktar,
            indirMenuTogla,
            ilSeciminiIndir,
            ilSecHepsi,
            ilSecimGonder,
            tekIlIndir
        },
        init
    };
}
