export function createLayoutFeature(ctx) {
    const { state, actions, resimHTML, basHarfleri, kullaniciGorunenAd } = ctx;
    const excelStateSifirla = (...args) => actions.excelStateSifirla(...args);
    function profilBilgileriGoster() {
        document.getElementById('tb-ad').textContent = kullaniciGorunenAd(state.kullanici);
        document.getElementById('tb-gorev').textContent =
            state.kullanici.rol === 'admin'
                ? 'Tanıtım ve Medya Başkanı'
                : state.kullanici.gorev_adi || (state.kullanici.rol === 'yardimci' ? 'Yardımcı' : 'Kullanıcı');
        const av = document.getElementById('tb-avatar');
        av.innerHTML = '';
        const foto = resimHTML(
            state.kullanici.profil_foto,
            '',
            'width:100%;height:100%;border-radius:99px;object-fit:cover'
        );
        if (foto) {
            av.innerHTML = foto;
        } else av.textContent = basHarfleri(kullaniciGorunenAd(state.kullanici));
    }

    function modalKapat(id) {
        if (id === 'excel-modal') {
            excelStateSifirla(true);
            document.getElementById('excel-dosya').value = '';
            document.getElementById('excel-sonuc').innerHTML = '';
        }
        document.getElementById(id).classList.remove('aktif');
    }

    function sidebarTogla() {
        const sb = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const kapali = sb.classList.toggle('kapali');
        overlay.classList.toggle('aktif', !kapali);
        try {
            localStorage.setItem('sidebarKapali', kapali ? '1' : '0');
        } catch {}
    }

    function init() {
        profilBilgileriGoster();
        if (state.kullanici.rol === 'kullanici') {
            document.getElementById('menu-kullanicilar').style.display = 'none';
        } else {
            document.getElementById('gorev-ekle-btn').style.display = 'inline-flex';
            document.getElementById('chat-sifirla-btn').style.display = 'inline-flex';
        }
        try {
            const durum = localStorage.getItem('sidebarKapali');
            if (durum === '0') {
                document.getElementById('sidebar').classList.remove('kapali');
                document.getElementById('sidebar-overlay').classList.add('aktif');
            }
        } catch {}
        const navBtns = document.querySelectorAll('.sb-nav button, .sb-alt button');
        navBtns.forEach((b) => {
            b.addEventListener('click', () => {
                const sb = document.getElementById('sidebar');
                if (!sb.classList.contains('kapali')) {
                    setTimeout(() => sidebarTogla(), 150);
                }
            });
        });
    }

    return { actions: { profilBilgileriGoster, modalKapat, sidebarTogla }, init };
}
