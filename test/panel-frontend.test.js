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
