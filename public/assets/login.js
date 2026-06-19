document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') girisYap();
});
async function yanitJsonOku(cevap) {
    try {
        return await cevap.json();
    } catch {
        return {};
    }
}
function telefonRakamlariniAl(deger) {
    let rakam = String(deger || '').replace(/\D/g, '');
    if (rakam.startsWith('90') && rakam.length === 12) rakam = rakam.slice(2);
    else if (rakam.startsWith('0') && rakam.length === 11) rakam = rakam.slice(1);
    return rakam.slice(0, 10);
}
document.getElementById('telefon').addEventListener('input', (e) => {
    e.target.value = telefonRakamlariniAl(e.target.value);
});
document.getElementById('giris-btn').addEventListener('click', girisYap);
async function girisYap() {
    const telefon = telefonRakamlariniAl(document.getElementById('telefon').value);
    const sifre = document.getElementById('sifre').value;
    const hataEl = document.getElementById('hata-mesaji');
    const btn = document.getElementById('giris-btn');
    hataEl.style.display = 'none';
    if (!/^5\d{9}$/.test(telefon)) {
        hataEl.textContent = 'Geçerli bir telefon numarası girin.';
        hataEl.style.display = 'block';
        return;
    }
    btn.disabled = true;
    try {
        const cevap = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefon, sifre })
        });
        const veri = await yanitJsonOku(cevap);
        if (cevap.ok && veri.kullanici) {
            localStorage.removeItem('token');
            localStorage.setItem('kullanici', JSON.stringify(veri.kullanici));
            window.location.href = '/panel/harita';
        } else {
            hataEl.textContent = veri.hata || 'Giriş başarısız.';
            hataEl.style.display = 'block';
            btn.disabled = false;
        }
    } catch {
        hataEl.textContent = 'Sunucuya bağlanılamadı.';
        hataEl.style.display = 'block';
        btn.disabled = false;
    }
}
