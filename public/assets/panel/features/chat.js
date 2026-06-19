export function createChatFeature(ctx) {
    const { state, esc, guvenliRenk, toast, basHarfleri, kullaniciGorunenAd, apicagir, resimHTML } = ctx;
    function chatPollingBaslat() {
        if (state.chatInterval) return;
        state.chatInterval = setInterval(() => {
            const el = document.getElementById('sayfa-chat');
            if (el && el.classList.contains('aktif')) chatYukle();
        }, 2000);
    }

    async function chatYukle() {
        const k = document.getElementById('chat-mesajlar');
        if (!k) return;

        chatPollingBaslat();

        const ms = await apicagir('/api/chat');
        if (!Array.isArray(ms)) return;

        const msgKey = ms.map((m) => m.id + '-' + (m.profil_foto || '')).join(',');
        if (state.chatLastMsgKey === msgKey) {
            return;
        }

        const isAtBottom = k.scrollHeight - k.scrollTop - k.clientHeight < 50;
        const isFirstLoad = k.children.length === 0;
        const previousScrollTop = k.scrollTop;

        k.innerHTML = '';
        ms.forEach((m) => {
            const benim = m.kullanici_id === state.kullanici.id;
            const d = document.createElement('div');
            d.className = 'chat-msg' + (benim ? ' benim' : '');
            const renk = guvenliRenk(m.renk);
            const av =
                resimHTML(m.profil_foto, 'avatar', 'width:34px;height:34px;border-radius:50%;object-fit:cover') ||
                '<div class="avatar" style="width:34px;height:34px;font-size:12px;background:' +
                    renk +
                    '22;color:' +
                    renk +
                    '">' +
                    esc(basHarfleri(kullaniciGorunenAd(m))) +
                    '</div>';
            const t = new Date((m.tarih || '').replace(' ', 'T') + 'Z').toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const gonderenHTML = benim
                ? ''
                : '<div class="gonderen" style="color:' + renk + '">' + esc(kullaniciGorunenAd(m)) + '</div>';
            d.innerHTML =
                av +
                '<div class="balon">' +
                gonderenHTML +
                '<div class="metin">' +
                esc(m.metin) +
                '</div><div class="zaman">' +
                esc(t) +
                '</div></div>';
            k.appendChild(d);
        });

        state.chatLastMsgKey = msgKey;

        if (isAtBottom || isFirstLoad || state.chatJustSent) {
            k.scrollTop = k.scrollHeight;
            state.chatJustSent = false;
        } else {
            k.scrollTop = Math.min(previousScrollTop, Math.max(0, k.scrollHeight - k.clientHeight));
        }
    }

    async function chatGonder() {
        const i = document.getElementById('chat-input');
        const m = i.value.trim();
        if (!m) return;
        i.value = '';
        state.chatJustSent = true;
        const s = await apicagir('/api/chat', 'POST', { metin: m });
        if (s.hata) {
            toast(s.hata);
            state.chatJustSent = false;
            return;
        }
        chatYukle();
    }

    async function chatSifirla() {
        if (!confirm('Tüm sohbet silinecek. Emin misiniz?')) return;
        const s = await apicagir('/api/chat', 'DELETE');
        if (s.hata) {
            toast(s.hata);
            return;
        }
        const k = document.getElementById('chat-mesajlar');
        if (k) k.innerHTML = '';
        state.chatLastMsgKey = null;
        chatYukle();
        toast('Sohbet sıfırlandı.');
    }

    return {
        actions: { chatYukle, chatGonder, chatSifirla },
        pageLoaders: { chat: chatYukle }
    };
}
