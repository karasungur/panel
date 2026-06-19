export function createChatFeature(ctx) {
    const { state, esc, guvenliRenk, toast, basHarfleri, kullaniciGorunenAd, apicagir } = ctx;
    async function chatYukle() {
        const ms = await apicagir('/api/chat');
        const k = document.getElementById('chat-mesajlar');
        k.innerHTML = '';
        if (Array.isArray(ms))
            ms.forEach((m) => {
                const benim = m.kullanici_id === state.kullanici.id;
                const d = document.createElement('div');
                d.className = 'chat-msg' + (benim ? ' benim' : '');
                const renk = guvenliRenk(m.renk);
                const av =
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
                d.innerHTML =
                    av +
                    '<div class="balon"><div class="gonderen" style="color:' +
                    renk +
                    '">' +
                    esc(kullaniciGorunenAd(m)) +
                    '</div><div class="metin">' +
                    esc(m.metin) +
                    '</div><div class="zaman">' +
                    esc(t) +
                    '</div></div>';
                k.appendChild(d);
            });
        k.scrollTop = k.scrollHeight;
        if (!state.chatInterval)
            state.chatInterval = setInterval(() => {
                if (document.getElementById('sayfa-chat').classList.contains('aktif')) chatYukle();
            }, 2000);
    }

    async function chatGonder() {
        const i = document.getElementById('chat-input');
        const m = i.value.trim();
        if (!m) return;
        i.value = '';
        const s = await apicagir('/api/chat', 'POST', { metin: m });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        chatYukle();
    }

    async function chatSifirla() {
        if (!confirm('Tüm sohbet silinecek. Emin misiniz?')) return;
        await apicagir('/api/chat', 'DELETE');
        chatYukle();
        toast('Sohbet sıfırlandı.');
    }

    return {
        actions: { chatYukle, chatGonder, chatSifirla },
        pageLoaders: { chat: chatYukle }
    };
}
