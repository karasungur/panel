export function createNotesFeature(ctx) {
    const { state, esc, guvenliId, toast, apicagir } = ctx;

    async function notlariYukle() {
        try {
            const yanit = await apicagir('/api/notlar');
            state.notlar = Array.isArray(yanit) ? yanit : [];
        } catch {
            state.notlar = [];
        }
        notlariListele();
        if (state.notlar.length && !state.aktifNot) {
            notSec(state.notlar[0].id);
        } else if (!state.notlar.length) {
            document.getElementById('notlar-bos').style.display = 'flex';
            document.getElementById('notlar-editor-icerik').style.display = 'none';
            const editorWrap = document.getElementById('sayfa-notlar');
            if (editorWrap) editorWrap.classList.remove('editor-aktif');
            state.aktifNot = null;
        }
    }

    function notlariListele() {
        const l = document.getElementById('notlar-liste-icerik');
        l.innerHTML = '';
        if (!state.notlar.length) {
            l.innerHTML =
                '<p style="text-align:center;color:var(--outline);padding:20px;font-size:13px">Henüz not yok</p>';
            return;
        }
        state.notlar.forEach((n) => {
            const k = document.createElement('div');
            const notId = guvenliId(n.id);
            k.className = 'not-kart' + (state.aktifNot && guvenliId(state.aktifNot.id) === notId ? ' aktif' : '');
            const oniz = (n.icerik || '')
                .replace(/<[^>]+>/g, '')
                .trim()
                .substring(0, 80);
            const tarih = new Date((n.guncellenme_tarihi || '').replace(' ', 'T') + 'Z');
            const tarihStr = Number.isNaN(tarih.getTime())
                ? ''
                : tarih.toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                  });
            k.innerHTML =
                '<div class="not-baslik">' +
                esc(n.baslik || 'Başlıksız') +
                '</div>' +
                (oniz ? '<div class="not-onizleme">' + esc(oniz) + '</div>' : '') +
                '<div class="not-tarih">' +
                esc(tarihStr) +
                '</div>' +
                '<button type="button" class="not-sil" data-action-call="notSil(event, ' +
                notId +
                ')" title="Notu Sil"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>';
            k.onclick = () => notSec(notId);
            l.appendChild(k);
        });
    }

    async function notSec(id) {
        const notId = guvenliId(id);
        if (!notId) return;
        const secimSeq = ++state.notSecimSeq;
        const oncekiNotId = state.aktifNot ? guvenliId(state.aktifNot.id) : 0;
        if (oncekiNotId && oncekiNotId !== notId) {
            await notBekleyenKaydiFlushEt();
            state.notKaydetSeq++;
        }
        if (secimSeq !== state.notSecimSeq) return;
        const n = state.notlar.find((x) => guvenliId(x.id) === notId);
        if (!n) return;
        state.aktifNot = n;
        document.getElementById('notlar-bos').style.display = 'none';
        document.getElementById('notlar-editor-icerik').style.display = 'flex';
        document.getElementById('not-baslik').value = n.baslik || '';
        document.getElementById('not-icerik').innerHTML = n.icerik || '';

        // Show check icon in state
        document.getElementById('not-kaydet-durum').innerHTML = 'Kayıtlı <span class="kayit-check">✓</span>';

        const editorWrap = document.getElementById('sayfa-notlar');
        if (editorWrap) editorWrap.classList.add('editor-aktif');

        notlariListele();
    }

    async function notYeni() {
        await notBekleyenKaydiFlushEt();
        const s = await apicagir('/api/notlar', 'POST', { baslik: 'Yeni Not', icerik: '' });
        if (s.hata) {
            toast(s.hata);
            return;
        }
        state.notlar.unshift(s);
        notlariListele();
        notSec(s.id);
        setTimeout(() => document.getElementById('not-baslik').focus(), 100);
    }

    async function notSil(e, id) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (id === undefined) id = e;
        const notId = guvenliId(id);
        if (!notId) return;
        if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
        const s = await apicagir('/api/notlar/' + notId, 'DELETE');
        if (s.hata) {
            toast(s.hata);
            return;
        }
        if (state.aktifNot && guvenliId(state.aktifNot.id) === notId) notBekleyenKaydiIptalEt();
        state.notlar = state.notlar.filter((n) => guvenliId(n.id) !== notId);
        if (state.aktifNot && guvenliId(state.aktifNot.id) === notId) state.aktifNot = null;
        notlariListele();
        if (state.notlar.length && !state.aktifNot) {
            notSec(state.notlar[0].id);
        } else if (!state.notlar.length) {
            document.getElementById('notlar-bos').style.display = 'flex';
            document.getElementById('notlar-editor-icerik').style.display = 'none';
            const editorWrap = document.getElementById('sayfa-notlar');
            if (editorWrap) editorWrap.classList.remove('editor-aktif');
        }
    }

    function notSnapshotAl() {
        if (!state.aktifNot) return null;
        const notId = guvenliId(state.aktifNot.id);
        if (!notId) return null;
        return {
            id: notId,
            baslik: document.getElementById('not-baslik').value || 'Başlıksız',
            icerik: document.getElementById('not-icerik').innerHTML
        };
    }

    function notKayitAl(s, snapshot) {
        const kayit = s && s.not && typeof s.not === 'object' ? s.not : s && guvenliId(s.id) ? s : null;
        if (kayit) return { ...kayit, id: guvenliId(kayit.id) || snapshot.id };
        return {
            ...snapshot,
            guncellenme_tarihi: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };
    }

    function notBekleyenKaydiIptalEt(seqArtir = true) {
        clearTimeout(state.notKaydetTimer);
        state.notKaydetTimer = null;
        state.notBekleyenSnapshot = null;
        if (seqArtir) state.notKaydetSeq++;
    }

    async function notBekleyenKaydiFlushEt() {
        if (!state.notKaydetTimer || !state.notBekleyenSnapshot) return;
        const snapshot = state.notBekleyenSnapshot;
        notBekleyenKaydiIptalEt(false);
        await notKaydet(snapshot, ++state.notKaydetSeq);
    }

    function notKaydetGecikmeli() {
        const snapshot = notSnapshotAl();
        if (!snapshot) return;
        state.notBekleyenSnapshot = snapshot;
        const seq = ++state.notKaydetSeq;

        // Show saving state with animating text
        document.getElementById('not-kaydet-durum').innerHTML = 'Kaydediliyor <span class="kayit-spinner"></span>';

        clearTimeout(state.notKaydetTimer);
        state.notKaydetTimer = setTimeout(() => {
            state.notKaydetTimer = null;
            const bekleyen = state.notBekleyenSnapshot;
            state.notBekleyenSnapshot = null;
            notKaydet(bekleyen, seq);
        }, 800);
    }

    async function notKaydet(snapshot = null, seq = null) {
        if (!snapshot) {
            snapshot = notSnapshotAl();
            notBekleyenKaydiIptalEt(false);
            seq = ++state.notKaydetSeq;
        }
        if (!snapshot) return;
        const notId = guvenliId(snapshot.id);
        if (!notId) return;
        const aktifId = state.aktifNot ? guvenliId(state.aktifNot.id) : 0;
        if (seq === state.notKaydetSeq && aktifId === notId) {
            document.getElementById('not-kaydet-durum').innerHTML = 'Kaydediliyor <span class="kayit-spinner"></span>';
        }
        const s = await apicagir('/api/notlar/' + notId, 'PUT', {
            baslik: snapshot.baslik,
            icerik: snapshot.icerik
        });
        if (s.hata) {
            if (seq === state.notKaydetSeq && state.aktifNot && guvenliId(state.aktifNot.id) === notId) {
                document.getElementById('not-kaydet-durum').textContent = 'Hata: ' + s.hata;
            }
            return;
        }
        const kayit = notKayitAl(s, snapshot);
        const halaAktif = state.aktifNot && guvenliId(state.aktifNot.id) === notId;
        const guncelCevap = seq === state.notKaydetSeq;
        if (guncelCevap || !halaAktif) {
            state.notlar = [kayit, ...state.notlar.filter((n) => guvenliId(n.id) !== notId)];
        }
        if (seq === state.notKaydetSeq && halaAktif) {
            state.aktifNot = kayit;
            document.getElementById('not-baslik').value = kayit.baslik || '';
            document.getElementById('not-icerik').innerHTML = kayit.icerik || '';
            document.getElementById('not-kaydet-durum').innerHTML = 'Kayıtlı <span class="kayit-check">✓</span>';
        }
        if (guncelCevap || !halaAktif) notlariListele();
    }

    function notSecimBaglamiAl() {
        const editor = document.getElementById('not-icerik');
        editor.focus();
        const selection = window.getSelection();
        if (!selection) return null;
        if (!selection.rangeCount) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.addRange(range);
        }
        let range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        return { editor, selection, range };
    }

    function notFormat(komut, deger) {
        notSecimBaglamiAl();
        if (komut === 'formatBlock') {
            document.execCommand(komut, false, deger ? '<' + deger.toLowerCase() + '>' : 'p');
        } else {
            document.execCommand(komut, false, deger);
        }
        document.getElementById('not-icerik').focus();
        notKaydetGecikmeli();
    }

    function notGeriDon() {
        const editorWrap = document.getElementById('sayfa-notlar');
        if (editorWrap) editorWrap.classList.remove('editor-aktif');
    }

    function init() {
        const bas = document.getElementById('not-baslik');
        const ic = document.getElementById('not-icerik');
        if (bas) bas.addEventListener('input', notKaydetGecikmeli);
        if (ic) {
            ic.addEventListener('input', notKaydetGecikmeli);
            ic.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'b') {
                        e.preventDefault();
                        notFormat('bold');
                    } else if (e.key === 'i') {
                        e.preventDefault();
                        notFormat('italic');
                    } else if (e.key === 'u') {
                        e.preventDefault();
                        notFormat('underline');
                    } else if (e.key === 's') {
                        e.preventDefault();
                        notKaydet();
                    }
                }
            });
        }
    }

    return {
        actions: {
            notlariYukle,
            notlariListele,
            notSec,
            notYeni,
            notSil,
            notSnapshotAl,
            notKayitAl,
            notBekleyenKaydiIptalEt,
            notBekleyenKaydiFlushEt,
            notKaydetGecikmeli,
            notKaydet,
            notFormat,
            notGeriDon
        },
        pageLoaders: { notlar: notlariYukle },
        init
    };
}
