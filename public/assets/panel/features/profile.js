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
    }

    async function profilFotoSec(e) {
        const f = e && e.target && e.target.files ? e.target.files[0] : null;
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
            const s = await apicagir('/api/yukle', 'POST', { dosya: r.result });
            if (s.hata) {
                toast(s.hata);
                return;
            }
            document.getElementById('profil-foto').value = s.url;
            const o = document.getElementById('profil-foto-oniz');
            resimKaynakAta(o, s.url);
        };
        r.readAsDataURL(f);
    }

    async function profilKaydet() {
        const body = {
            ad_soyad: val('profil-ad-soyad'),
            telefon: telefonGonderimDegeri(val('profil-telefon')),
            profil_foto: val('profil-foto')
        };
        if (!body.telefon) {
            toast('Geçerli telefon numarası girin.');
            return;
        }
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
        const es = val('profil-eski-sifre'),
            ys = val('profil-yeni-sifre');
        if (!es || !ys) {
            toast('Eski ve yeni şifre gereklidir.');
            return;
        }
        const s = await apicagir('/api/kullanicilar/profil/sifre', 'PUT', { eski_sifre: es, yeni_sifre: ys });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        document.getElementById('profil-eski-sifre').value = '';
        document.getElementById('profil-yeni-sifre').value = '';
        toast('Şifreniz güncellendi. Lütfen tekrar giriş yapın.');
        setTimeout(loginSayfasinaGit, 900);
    }

    return {
        actions: { profilSayfasiDoldur, profilFotoSec, profilKaydet, profilSifreDegistir },
        pageLoaders: { profil: profilSayfasiDoldur }
    };
}
