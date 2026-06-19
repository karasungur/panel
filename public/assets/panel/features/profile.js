export function createProfileFeature(ctx) {
    const {
        state,
        actions,
        resimKaynakAta,
        toast,
        val,
        telefonRakamlariniAl,
        telefonGonderimDegeri,
        apicagir,
        loginSayfasinaGit
    } = ctx;
    const profilBilgileriGoster = (...args) => actions.profilBilgileriGoster(...args);

    function profilSayfasiDoldur() {
        document.getElementById('profil-ad-soyad').value = state.kullanici.ad_soyad || '';
        document.getElementById('profil-telefon').value = telefonRakamlariniAl(state.kullanici.telefon);
        document.getElementById('profil-foto').value = state.kullanici.profil_foto || '';
        const o = document.getElementById('profil-foto-oniz');
        resimKaynakAta(o, state.kullanici.profil_foto);
        hataTemizle();
    }

    async function profilFotoSec(e) {
        const f = e && e.target && e.target.files ? e.target.files[0] : null;
        if (!f) return;

        const spinner = document.getElementById('profil-foto-spinner');
        if (spinner) spinner.style.display = 'block';

        const r = new FileReader();
        r.onload = async () => {
            try {
                const s = await apicagir('/api/yukle', 'POST', { dosya: r.result });
                if (s.hata) {
                    toast(s.hata);
                    return;
                }
                document.getElementById('profil-foto').value = s.url;
                const o = document.getElementById('profil-foto-oniz');
                resimKaynakAta(o, s.url);
            } catch {
                toast('Yükleme sırasında hata oluştu.');
            } finally {
                if (spinner) spinner.style.display = 'none';
            }
        };
        r.readAsDataURL(f);
    }

    function profilFotoKaldir() {
        document.getElementById('profil-foto').value = '';
        const o = document.getElementById('profil-foto-oniz');
        resimKaynakAta(o, '');
        const fileInput = document.getElementById('profil-foto-input');
        if (fileInput) fileInput.value = '';
    }

    function hataTemizle() {
        document.querySelectorAll('#sayfa-profil .hata-metni').forEach((el) => (el.textContent = ''));
        document.querySelectorAll('#sayfa-profil .form-kontrol').forEach((el) => el.classList.remove('invalid'));
    }

    function hataSet(id, mesaj) {
        const el = document.getElementById('hata-' + id);
        if (el) el.textContent = mesaj;
        const input = document.getElementById(id);
        if (input) input.classList.add('invalid');
    }

    function hataTemizleTek(e) {
        const input = e.target;
        input.classList.remove('invalid');
        const errSpan = document.getElementById('hata-' + input.id);
        if (errSpan) errSpan.textContent = '';
    }

    async function profilKaydet() {
        hataTemizle();
        const adSoyad = val('profil-ad-soyad');
        const tel = val('profil-telefon');
        const body = {
            ad_soyad: adSoyad,
            telefon: telefonGonderimDegeri(tel),
            profil_foto: val('profil-foto')
        };
        let hasError = false;
        if (!adSoyad) {
            hataSet('profil-ad-soyad', 'Ad Soyad gereklidir.');
            hasError = true;
        }
        if (!body.telefon) {
            hataSet('profil-telefon', 'Geçerli telefon numarası girin.');
            hasError = true;
        }
        if (hasError) return;

        const s = await apicagir('/api/kullanicilar/profil/guncelle', 'PUT', body);
        if (s.hata) {
            toast(s.hata);
            return;
        }
        state.kullanici.ad_soyad = body.ad_soyad;
        state.kullanici.telefon = body.telefon;
        state.kullanici.profil_foto = body.profil_foto;
        localStorage.setItem('kullanici', JSON.stringify(state.kullanici));
        if (s.tekrar_giris_gerekli) {
            toast('Telefonunuz güncellendi. Lütfen tekrar giriş yapın.');
            setTimeout(loginSayfasinaGit, 900);
            return;
        }
        profilBilgileriGoster();
        toast('Profiliniz güncellendi.');
    }

    async function profilSifreDegistir() {
        hataTemizle();
        const es = val('profil-eski-sifre'),
            ys = val('profil-yeni-sifre'),
            yst = val('profil-yeni-sifre-tekrar');
        let hasError = false;
        if (!es) {
            hataSet('profil-eski-sifre', 'Mevcut şifre gereklidir.');
            hasError = true;
        }
        if (!ys) {
            hataSet('profil-yeni-sifre', 'Yeni şifre gereklidir.');
            hasError = true;
        }
        if (ys && ys.length < 4) {
            hataSet('profil-yeni-sifre', 'Yeni şifre en az 4 karakter olmalıdır.');
            hasError = true;
        }
        if (ys !== yst) {
            hataSet('profil-yeni-sifre-tekrar', 'Yeni şifreler eşleşmiyor.');
            hasError = true;
        }
        if (hasError) return;

        const s = await apicagir('/api/kullanicilar/profil/sifre', 'PUT', { eski_sifre: es, yeni_sifre: ys });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        document.getElementById('profil-eski-sifre').value = '';
        document.getElementById('profil-yeni-sifre').value = '';
        document.getElementById('profil-yeni-sifre-tekrar').value = '';
        toast('Şifreniz güncellendi. Lütfen tekrar giriş yapın.');
        setTimeout(loginSayfasinaGit, 900);
    }

    function sifreGozToggle(id) {
        const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
        if (!el) return;
        if (el.type === 'password') {
            el.type = 'text';
        } else {
            el.type = 'password';
        }
    }

    return {
        actions: {
            profilSayfasiDoldur,
            profilFotoSec,
            profilFotoKaldir,
            profilKaydet,
            profilSifreDegistir,
            sifreGozToggle,
            hataTemizleTek
        },
        pageLoaders: { profil: profilSayfasiDoldur }
    };
}
