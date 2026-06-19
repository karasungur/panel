const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} relativePath
 * @returns {Promise<any>}
 */
async function importPanelModule(relativePath) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    const url = 'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64');
    return import(url);
}

function restoreGlobal(name, previousValue) {
    if (previousValue === undefined) delete global[name];
    else {
        Object.defineProperty(global, name, {
            configurable: true,
            writable: true,
            value: previousValue
        });
    }
}

function createNotificationDom(t) {
    const previousDocument = global.document;
    const previousWindow = global.window;
    const previousLocation = global.location;
    const fakeLocation = { hash: '', origin: 'http://localhost.test' };
    const liste = {
        children: [],
        innerHTML: '',
        appendChild(el) {
            this.children.push(el);
        }
    };
    const panel = {
        classList: {
            removed: [],
            remove(className) {
                this.removed.push(className);
            }
        }
    };
    const elements = {
        'bildirim-rozet': { textContent: '', style: {} },
        'bildirim-liste': liste,
        'bildirim-panel': panel
    };
    const fakeDocument = {
        createElement() {
            return { className: '', innerHTML: '', onclick: null };
        },
        getElementById(id) {
            return elements[id] || null;
        }
    };

    Object.defineProperty(global, 'document', {
        configurable: true,
        writable: true,
        value: fakeDocument
    });
    Object.defineProperty(global, 'window', {
        configurable: true,
        writable: true,
        value: { location: fakeLocation }
    });
    Object.defineProperty(global, 'location', {
        configurable: true,
        writable: true,
        value: fakeLocation
    });

    t.after(() => {
        restoreGlobal('document', previousDocument);
        restoreGlobal('window', previousWindow);
        restoreGlobal('location', previousLocation);
    });

    return { fakeLocation, liste, panel };
}

function createClassList(initialClasses = []) {
    const classes = new Set(initialClasses);
    return {
        add(className) {
            classes.add(className);
        },
        remove(className) {
            classes.delete(className);
        },
        contains(className) {
            return classes.has(className);
        }
    };
}

function createDomElement(options = {}) {
    const element = {
        children: [],
        className: '',
        classList: createClassList(options.classes),
        focusCalled: false,
        onclick: null,
        style: {},
        value: '',
        appendChild(child) {
            this.children.push(child);
        },
        focus() {
            this.focusCalled = true;
        }
    };
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return this._innerHTML || '';
        },
        set(value) {
            this._innerHTML = value;
            if (value === '') this.children = [];
        }
    });
    return element;
}

function createNotesDom(t) {
    const previousDocument = global.document;
    const elements = {
        'notlar-liste-icerik': createDomElement(),
        'notlar-bos': createDomElement(),
        'notlar-editor-icerik': createDomElement(),
        'not-baslik': createDomElement(),
        'not-icerik': createDomElement(),
        'not-kaydet-durum': createDomElement(),
        'sayfa-notlar': createDomElement()
    };
    const fakeDocument = {
        createElement() {
            return createDomElement();
        },
        getElementById(id) {
            return elements[id] || null;
        }
    };

    Object.defineProperty(global, 'document', {
        configurable: true,
        writable: true,
        value: fakeDocument
    });

    t.after(() => {
        restoreGlobal('document', previousDocument);
    });

    return { elements };
}

function createNotesContext(responses, stateOverrides = {}) {
    const apiCalls = [];
    const state = {
        aktifNot: null,
        notBekleyenSnapshot: null,
        notKaydetSeq: 0,
        notKaydetTimer: null,
        notlar: [],
        notSecimSeq: 0,
        ...stateOverrides
    };

    return {
        apiCalls,
        state,
        ctx: {
            state,
            esc(value) {
                return String(value ?? '');
            },
            guvenliId(value) {
                const id = Number.parseInt(value, 10);
                return Number.isSafeInteger(id) && id > 0 ? id : 0;
            },
            toast() {},
            async apicagir(url, method = 'GET', body = null) {
                apiCalls.push([url, method, body]);
                return responses.shift();
            }
        }
    };
}

function notesTestNote(id) {
    return {
        id,
        baslik: 'Not ' + id,
        icerik: '<p>Icerik ' + id + '</p>',
        guncellenme_tarihi: '2026-06-19 10:00:00'
    };
}

function createPublicChatDom(t, options = {}) {
    const previousDocument = global.document;
    const previousSetInterval = global.setInterval;
    const intervals = [];
    const chatMessages = {
        children: Array.from({ length: options.childrenCount || 0 }, () => ({})),
        clientHeight: options.clientHeight ?? 100,
        scrollHeight: options.scrollHeight ?? 0,
        scrollTop: options.scrollTop ?? 0,
        _innerHTML: '',
        appendChild(el) {
            this.children.push(el);
            this.scrollHeight = this.children.length * 80;
        }
    };
    Object.defineProperty(chatMessages, 'innerHTML', {
        get() {
            return this._innerHTML;
        },
        set(value) {
            this._innerHTML = value;
            if (value === '') {
                this.children = [];
                this.scrollTop = 0;
                this.scrollHeight = 0;
            }
        }
    });
    const chatPage = {
        classList: {
            contains(className) {
                return className === 'aktif';
            }
        }
    };
    const fakeDocument = {
        createElement() {
            return { className: '', innerHTML: '' };
        },
        getElementById(id) {
            if (id === 'chat-mesajlar') return chatMessages;
            if (id === 'sayfa-chat') return chatPage;
            return null;
        }
    };

    Object.defineProperty(global, 'document', {
        configurable: true,
        writable: true,
        value: fakeDocument
    });
    Object.defineProperty(global, 'setInterval', {
        configurable: true,
        writable: true,
        value(callback, delay) {
            const interval = { callback, delay };
            intervals.push(interval);
            return interval;
        }
    });

    t.after(() => {
        restoreGlobal('document', previousDocument);
        restoreGlobal('setInterval', previousSetInterval);
    });

    return { chatMessages, intervals };
}

function createPublicChatContext(responses, stateOverrides = {}) {
    const apiCalls = [];
    const state = {
        kullanici: { id: 1 },
        chatInterval: null,
        chatLastMsgKey: null,
        chatJustSent: false,
        ...stateOverrides
    };

    return {
        apiCalls,
        state,
        ctx: {
            state,
            esc(value) {
                return String(value ?? '');
            },
            guvenliRenk(value) {
                return value || '#24467c';
            },
            toast() {},
            basHarfleri() {
                return 'KG';
            },
            kullaniciGorunenAd(kullanici) {
                return kullanici.ad_soyad || 'Kullanici';
            },
            resimHTML() {
                return '';
            },
            async apicagir(url, method = 'GET') {
                apiCalls.push([url, method]);
                return responses.shift();
            }
        }
    };
}

function publicChatMessage(id) {
    return {
        id,
        kullanici_id: 2,
        ad_soyad: 'Kullanici ' + id,
        renk: '#24467c',
        metin: 'Mesaj ' + id,
        tarih: '2026-06-19 10:00:00'
    };
}

function waitForAsyncCallback() {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

test('panel phone helpers normalize, validate, and display GSM numbers', async () => {
    const { telefonRakamlariniAl, telefonGonderimDegeri, telefonGoster } = await importPanelModule(
        'public/assets/panel/core/format.js'
    );

    const validCases = [
        ['5551234567', '5551234567'],
        ['05551234567', '5551234567'],
        ['+90 555 123 45 67', '5551234567']
    ];

    for (const [input, digits] of validCases) {
        assert.equal(telefonRakamlariniAl(input), digits);
        assert.equal(telefonGonderimDegeri(input), '+90' + digits);
        assert.equal(telefonGoster(input), '0555-123-45-67');
    }

    for (const input of ['4551234567', '555123456', '55512345678', 'abc', '', null, undefined]) {
        assert.equal(telefonGonderimDegeri(input), '');
        assert.equal(telefonGoster(input), '');
    }
});

test('panel dispatcher runs delegated actions early enough to stop parent card clicks', async (t) => {
    const { bindDispatcher } = await importPanelModule('public/assets/panel/core/dispatcher.js');
    const previousDocument = global.document;
    /** @type {{ type: string, listener: (event: unknown) => void, options: unknown }[]} */
    const listeners = [];

    const fakeDocument = {
        /**
         * @param {string} type
         * @param {(event: unknown) => void} listener
         * @param {unknown} options
         */
        addEventListener(type, listener, options) {
            listeners.push({ type, listener, options });
        },
        getElementById() {
            return null;
        }
    };

    Object.defineProperty(global, 'document', {
        configurable: true,
        writable: true,
        value: fakeDocument
    });

    t.after(() => {
        if (previousDocument === undefined) delete global.document;
        else {
            Object.defineProperty(global, 'document', {
                configurable: true,
                writable: true,
                value: previousDocument
            });
        }
    });

    const order = [];
    bindDispatcher({
        /** @param {{ stopPropagation: () => void }} event */
        deleteNested(event) {
            order.push('action');
            event.stopPropagation();
        }
    });

    const clickListener = listeners.find((listener) => listener.type === 'click');
    assert.ok(clickListener);
    assert.equal(clickListener.options, true);

    const actionElement = {
        dataset: { actionCall: 'deleteNested(event)' },
        /** @param {string} selector */
        closest(selector) {
            return selector === '[data-action-call]' ? actionElement : null;
        }
    };
    const event = {
        target: actionElement,
        propagationStopped: false,
        preventDefault() {
            order.push('preventDefault');
        },
        stopPropagation() {
            order.push('stopPropagation');
            this.propagationStopped = true;
        }
    };

    clickListener.listener(event);
    if (!event.propagationStopped) order.push('parent-card-click');

    assert.deepEqual(order, ['preventDefault', 'action', 'stopPropagation']);
});

test('panel dispatcher prefers private chat delete action over parent header action', async (t) => {
    const { bindDispatcher } = await importPanelModule('public/assets/panel/core/dispatcher.js');
    const previousDocument = global.document;
    /** @type {{ type: string, listener: (event: unknown) => void, options: unknown }[]} */
    const listeners = [];

    const fakeDocument = {
        /**
         * @param {string} type
         * @param {(event: unknown) => void} listener
         * @param {unknown} options
         */
        addEventListener(type, listener, options) {
            listeners.push({ type, listener, options });
        },
        getElementById() {
            return null;
        }
    };

    Object.defineProperty(global, 'document', {
        configurable: true,
        writable: true,
        value: fakeDocument
    });

    t.after(() => {
        if (previousDocument === undefined) delete global.document;
        else {
            Object.defineProperty(global, 'document', {
                configurable: true,
                writable: true,
                value: previousDocument
            });
        }
    });

    const order = [];
    bindDispatcher({
        /** @param {{ stopPropagation: () => void }} event */
        sohbetSil(event) {
            order.push('delete-action');
            event.stopPropagation();
        },
        sohbetKucult() {
            order.push('minimize-action');
        }
    });

    const clickListener = listeners.find((listener) => listener.type === 'click');
    assert.ok(clickListener);
    assert.equal(clickListener.options, true);

    const headerElement = {
        dataset: { actionCall: 'sohbetKucult(7)' }
    };
    const deleteButton = {
        dataset: { actionCall: 'sohbetSil(event, 7)' },
        /** @param {string} selector */
        closest(selector) {
            if (selector === '[data-action-call]') return deleteButton;
            return headerElement;
        }
    };
    const event = {
        target: deleteButton,
        propagationStopped: false,
        preventDefault() {
            order.push('preventDefault');
        },
        stopPropagation() {
            order.push('stopPropagation');
            this.propagationStopped = true;
        }
    };

    clickListener.listener(event);
    if (!event.propagationStopped) order.push('parent-header-click');

    assert.deepEqual(order, ['preventDefault', 'delete-action', 'stopPropagation']);
});

test('notes reload clears mobile editor state when selected note list becomes empty', async (t) => {
    const { createNotesFeature } = await importPanelModule('public/assets/panel/features/notes.js');
    const { elements } = createNotesDom(t);
    const { apiCalls, state, ctx } = createNotesContext([[notesTestNote(1)], []]);
    const feature = createNotesFeature(ctx);

    await feature.actions.notlariYukle();

    assert.equal(state.aktifNot.id, 1);
    assert.equal(elements['sayfa-notlar'].classList.contains('editor-aktif'), true);
    assert.equal(elements['notlar-editor-icerik'].style.display, 'flex');

    await feature.actions.notlariYukle();

    assert.deepEqual(
        apiCalls.map(([url, method]) => [url, method]),
        [
            ['/api/notlar', 'GET'],
            ['/api/notlar', 'GET']
        ]
    );
    assert.equal(state.aktifNot, null);
    assert.deepEqual(state.notlar, []);
    assert.equal(elements['sayfa-notlar'].classList.contains('editor-aktif'), false);
    assert.equal(elements['notlar-bos'].style.display, 'flex');
    assert.equal(elements['notlar-editor-icerik'].style.display, 'none');
    assert.match(elements['notlar-liste-icerik'].innerHTML, /Henüz not yok/);
});

test('notes reload clears mobile editor state after an API error response', async (t) => {
    const { createNotesFeature } = await importPanelModule('public/assets/panel/features/notes.js');
    const { elements } = createNotesDom(t);
    const { state, ctx } = createNotesContext([[notesTestNote(1)], { hata: 'Istek basarisiz. (500)' }]);
    const feature = createNotesFeature(ctx);

    await feature.actions.notlariYukle();

    assert.equal(state.aktifNot.id, 1);
    assert.equal(elements['sayfa-notlar'].classList.contains('editor-aktif'), true);

    await feature.actions.notlariYukle();

    assert.equal(state.aktifNot, null);
    assert.deepEqual(state.notlar, []);
    assert.equal(elements['sayfa-notlar'].classList.contains('editor-aktif'), false);
    assert.equal(elements['notlar-bos'].style.display, 'flex');
    assert.equal(elements['notlar-editor-icerik'].style.display, 'none');
});

test('panel notifications open private-message links in the matching floating chat', async (t) => {
    const format = await importPanelModule('public/assets/panel/core/format.js');
    const { createNotificationsFeature } = await importPanelModule('public/assets/panel/features/notifications.js');
    const { fakeLocation, liste, panel } = createNotificationDom(t);
    const apiCalls = [];
    const actionCalls = [];
    const state = {
        bildirimSonId: 0,
        chatKisilerListesi: [
            {
                kisi_id: 7,
                ad_soyad: 'Bildirim Gonderen',
                telefon: '+905551112233',
                renk: '#24467c',
                son_giris: '2026-06-19 09:00:00'
            }
        ],
        pushIzni: false
    };
    const notifications = [
        {
            id: 42,
            okundu: 0,
            tip: 'mesaj_yeni',
            baslik: 'Yeni mesaj',
            icerik: 'Merhaba',
            link: '/panel/chat#chat-balon-7',
            olusturulma_tarihi: '2026-06-19 10:00:00'
        }
    ];
    const feature = createNotificationsFeature({
        ...format,
        state,
        actions: {
            sayfaGoster(page) {
                actionCalls.push(['sayfaGoster', page]);
            },
            async chatKisileriYukle() {
                actionCalls.push(['chatKisileriYukle']);
            },
            async sohbetAc(id, ad, renk, sonGiris) {
                actionCalls.push(['sohbetAc', id, ad, renk, sonGiris]);
            }
        },
        toast() {},
        async apicagir(url, method) {
            apiCalls.push([url, method || 'GET']);
            if (url === '/api/bildirimler') return { bildirimler: notifications, okunmamis: 1 };
            return {};
        }
    });

    await feature.actions.bildirimleriYenile(true);
    assert.equal(liste.children.length, 1);

    await liste.children[0].onclick();

    assert.deepEqual(apiCalls, [
        ['/api/bildirimler', 'GET'],
        ['/api/bildirimler/42/okundu', 'PUT'],
        ['/api/bildirimler', 'GET']
    ]);
    assert.equal(fakeLocation.hash, 'chat-balon-7');
    assert.deepEqual(panel.classList.removed, ['aktif']);
    assert.deepEqual(actionCalls, [
        ['sayfaGoster', 'chat'],
        ['chatKisileriYukle'],
        ['sohbetAc', 7, 'Bildirim Gonderen', '#24467c', '2026-06-19 09:00:00']
    ]);
});

test('panel notifications navigate only to safe panel links', async (t) => {
    const format = await importPanelModule('public/assets/panel/core/format.js');
    const { createNotificationsFeature } = await importPanelModule('public/assets/panel/features/notifications.js');
    const { liste } = createNotificationDom(t);
    const actionCalls = [];
    const notifications = [
        {
            id: 11,
            okundu: 0,
            tip: 'gorev_yeni',
            baslik: 'Yeni gorev',
            link: '/panel/gorevler',
            olusturulma_tarihi: '2026-06-19 10:00:00'
        },
        {
            id: 12,
            okundu: 0,
            tip: 'mesaj_yeni',
            baslik: 'Dis link',
            link: 'https://example.com/panel/chat#chat-balon-7',
            olusturulma_tarihi: '2026-06-19 10:01:00'
        },
        {
            id: 13,
            okundu: 0,
            tip: 'test',
            baslik: 'Bilinmeyen sayfa',
            link: '/panel/bilinmeyen',
            olusturulma_tarihi: '2026-06-19 10:02:00'
        }
    ];
    const feature = createNotificationsFeature({
        ...format,
        state: { bildirimSonId: 0, chatKisilerListesi: [], pushIzni: false },
        actions: {
            sayfaGoster(page) {
                actionCalls.push(['sayfaGoster', page]);
            },
            async sohbetAc(id) {
                actionCalls.push(['sohbetAc', id]);
            }
        },
        toast() {},
        async apicagir(url) {
            if (url === '/api/bildirimler') return { bildirimler: notifications, okunmamis: 3 };
            return {};
        }
    });

    await feature.actions.bildirimleriYenile(true);
    assert.equal(liste.children.length, 3);

    await liste.children[0].onclick();
    await liste.children[1].onclick();
    await liste.children[2].onclick();

    assert.deepEqual(actionCalls, [['sayfaGoster', 'gorevler']]);
});

test('public chat keeps polling after an initial non-array response', async (t) => {
    const { createChatFeature } = await importPanelModule('public/assets/panel/features/chat.js');
    const { chatMessages, intervals } = createPublicChatDom(t);
    const { apiCalls, state, ctx } = createPublicChatContext([
        { hata: 'Istek basarisiz. (500)' },
        [publicChatMessage(1)]
    ]);
    const feature = createChatFeature(ctx);

    await feature.actions.chatYukle();

    assert.equal(apiCalls.length, 1);
    assert.equal(intervals.length, 1);
    assert.equal(state.chatInterval, intervals[0]);
    assert.equal(chatMessages.children.length, 0);

    intervals[0].callback();
    await waitForAsyncCallback();

    assert.deepEqual(apiCalls, [
        ['/api/chat', 'GET'],
        ['/api/chat', 'GET']
    ]);
    assert.equal(chatMessages.children.length, 1);
    assert.equal(state.chatLastMsgKey, '1-');
});

test('public chat preserves scroll position while rebuilding away from bottom', async (t) => {
    const { createChatFeature } = await importPanelModule('public/assets/panel/features/chat.js');
    const { chatMessages } = createPublicChatDom(t, {
        childrenCount: 6,
        clientHeight: 100,
        scrollHeight: 500,
        scrollTop: 120
    });
    const messages = Array.from({ length: 8 }, (_, index) => publicChatMessage(index + 1));
    const { ctx } = createPublicChatContext([messages]);
    const feature = createChatFeature(ctx);

    await feature.actions.chatYukle();

    assert.equal(chatMessages.children.length, 8);
    assert.equal(chatMessages.scrollTop, 120);
});

test('public chat still scrolls to the bottom when already at bottom', async (t) => {
    const { createChatFeature } = await importPanelModule('public/assets/panel/features/chat.js');
    const { chatMessages } = createPublicChatDom(t, {
        childrenCount: 6,
        clientHeight: 100,
        scrollHeight: 500,
        scrollTop: 460
    });
    const messages = Array.from({ length: 8 }, (_, index) => publicChatMessage(index + 1));
    const { ctx } = createPublicChatContext([messages]);
    const feature = createChatFeature(ctx);

    await feature.actions.chatYukle();

    assert.equal(chatMessages.children.length, 8);
    assert.equal(chatMessages.scrollTop, chatMessages.scrollHeight);
});
