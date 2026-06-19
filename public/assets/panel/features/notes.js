export function createNotesFeature(ctx) {
    const { state, metin, esc, guvenliId, toast, apicagir } = ctx;
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
                ')">×</button>';
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
        document.getElementById('not-kaydet-durum').textContent = 'Kayıtlı';
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
        document.getElementById('not-kaydet-durum').textContent = 'Yazılıyor...';
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
            document.getElementById('not-kaydet-durum').textContent = 'Kaydediliyor...';
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
            document.getElementById('not-kaydet-durum').textContent = 'Kayıtlı ✓';
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

    function notImleciSonaTasi(node) {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function notSecimiEtiketle(tagName) {
        const baglam = notSecimBaglamiAl();
        if (!baglam) return;
        const el = document.createElement(tagName);
        if (baglam.range.collapsed) {
            el.appendChild(document.createTextNode('\u200b'));
        } else {
            el.appendChild(baglam.range.extractContents());
        }
        baglam.range.insertNode(el);
        notImleciSonaTasi(el);
    }

    function notBlokAta(deger) {
        const baglam = notSecimBaglamiAl();
        if (!baglam) return;
        const tagName =
            { H1: 'h1', H2: 'h2', H3: 'h3', P: 'p', BLOCKQUOTE: 'blockquote' }[metin(deger).toUpperCase()] || 'p';
        const baslangic =
            baglam.range.startContainer.nodeType === Node.ELEMENT_NODE
                ? baglam.range.startContainer
                : baglam.range.startContainer.parentElement;
        const blok = baslangic?.closest('h1,h2,h3,p,blockquote,li,div');
        if (blok && blok !== baglam.editor && baglam.editor.contains(blok)) {
            const yeniBlok = document.createElement(tagName);
            while (blok.firstChild) yeniBlok.appendChild(blok.firstChild);
            blok.replaceWith(yeniBlok);
            notImleciSonaTasi(yeniBlok);
            return;
        }
        notSecimiEtiketle(tagName);
    }

    function notListeEkle(tagName) {
        const baglam = notSecimBaglamiAl();
        if (!baglam) return;
        const liste = document.createElement(tagName);
        const madde = document.createElement('li');
        if (baglam.range.collapsed) madde.appendChild(document.createElement('br'));
        else madde.appendChild(baglam.range.extractContents());
        liste.appendChild(madde);
        baglam.range.insertNode(liste);
        notImleciSonaTasi(madde);
    }

    function notFormat(komut, deger) {
        const komutMap = {
            bold: () => notSecimiEtiketle('strong'),
            italic: () => notSecimiEtiketle('em'),
            underline: () => notSecimiEtiketle('u'),
            formatBlock: () => notBlokAta(deger),
            insertUnorderedList: () => notListeEkle('ul'),
            insertOrderedList: () => notListeEkle('ol')
        };
        const uygula = komutMap[komut];
        if (uygula) uygula();
        document.getElementById('not-icerik').focus();
        notKaydetGecikmeli();
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
            notFormat
        },
        pageLoaders: { notlar: notlariYukle },
        init
    };
}
