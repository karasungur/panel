export function toast(m) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 2600);
}

export function val(id) {
    return document.getElementById(id).value;
}

export async function loadTemplateInto(url, templateId, targetId) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(url + ' yüklenemedi (' + response.status + ')');
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const template = doc.getElementById(templateId);
    if (!(template instanceof HTMLTemplateElement)) throw new Error(templateId + ' template bulunamadı.');
    const target = document.getElementById(targetId);
    if (!target) throw new Error(targetId + ' hedef alanı bulunamadı.');
    target.replaceChildren(template.content.cloneNode(true));
}

export async function loadPanelPartials() {
    await Promise.all([
        loadTemplateInto('/assets/panel/partials/pages.html', 'panel-pages-template', 'panel-pages-root'),
        loadTemplateInto('/assets/panel/partials/floating.html', 'panel-floating-template', 'panel-floating-root'),
        loadTemplateInto('/assets/panel/partials/modals.html', 'panel-modals-template', 'panel-modals-root')
    ]);
}

export function partialHatasiGoster(error) {
    const root = document.getElementById('panel-pages-root');
    if (!root) return;
    root.innerHTML =
        '<div class="bolum" style="margin:24px"><div class="bos-mesaj">Panel arayüzü yüklenemedi: ' +
        String(error && error.message ? error.message : error) +
        '</div></div>';
}
