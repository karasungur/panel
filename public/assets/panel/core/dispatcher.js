export function bindDispatcher(actions) {
    function actionArgumanlariniCoz(argMetni, event, element) {
        const metin = String(argMetni || '').trim();
        if (!metin) return [];
        const parcalar = metin.match(/'[^']*'|"[^"]*"|[^,]+/g) || [];
        return parcalar.map((parca) => {
            const temiz = parca.trim();
            if (temiz === 'event') return event;
            if (temiz === 'this') return element;
            if (temiz === 'true') return true;
            if (temiz === 'false') return false;
            if (temiz === 'null') return null;
            if ((temiz.startsWith("'") && temiz.endsWith("'")) || (temiz.startsWith('"') && temiz.endsWith('"'))) {
                return temiz.slice(1, -1);
            }
            const sayi = Number(temiz);
            return Number.isNaN(sayi) ? temiz : sayi;
        });
    }

    function actionCagir(ifade, event, element) {
        const eslesme = String(ifade || '')
            .trim()
            .match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
        if (!eslesme) return false;
        const [, ad, argMetni] = eslesme;
        const fn = actions[ad];
        if (typeof fn !== 'function') return false;
        fn(...actionArgumanlariniCoz(argMetni, event, element));
        return true;
    }

    document.addEventListener(
        'click',
        (event) => {
            const hedef = event.target.closest('[data-action-call]');
            if (!hedef) return;
            event.preventDefault();
            actionCagir(hedef.dataset.actionCall, event, hedef);
        },
        true
    );

    document.addEventListener('change', (event) => {
        const hedef = event.target.closest('[data-change-call]');
        if (hedef) actionCagir(hedef.dataset.changeCall, event, hedef);
    });

    document.addEventListener('input', (event) => {
        const hedef = event.target.closest('[data-input-call]');
        if (hedef) actionCagir(hedef.dataset.inputCall, event, hedef);
    });

    document.addEventListener('keydown', (event) => {
        const enterAction = event.target.closest('[data-enter-action]');
        if (enterAction && event.key === 'Enter') {
            event.preventDefault();
            actionCagir(enterAction.dataset.enterAction + '()', event, enterAction);
            return;
        }
        const enterFocus = event.target.closest('[data-enter-focus]');
        if (enterFocus && event.key === 'Enter') {
            event.preventDefault();
            document.getElementById(enterFocus.dataset.enterFocus)?.focus();
            return;
        }
        const hedef = event.target.closest('[data-keydown-call]');
        if (hedef) actionCagir(hedef.dataset.keydownCall, event, hedef);
    });

    return { actionCagir };
}
