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

const telefonEl = /** @type {HTMLInputElement | null} */ (document.getElementById('telefon'));
const sifreEl = /** @type {HTMLInputElement | null} */ (document.getElementById('sifre'));
const hataEl = document.getElementById('hata-mesaji');
const formEl = document.getElementById('login-form');
const btnEl = document.getElementById('giris-btn');

if (telefonEl) {
    telefonEl.addEventListener('input', (e) => {
        e.target.value = telefonRakamlariniAl(e.target.value);
        telefonEl.classList.remove('invalid');
        telefonEl.setAttribute('aria-invalid', 'false');
        if (hataEl && (!sifreEl || !sifreEl.classList.contains('invalid'))) {
            hataEl.style.display = 'none';
        }
    });
}

if (sifreEl) {
    sifreEl.addEventListener('input', () => {
        sifreEl.classList.remove('invalid');
        sifreEl.setAttribute('aria-invalid', 'false');
        if (hataEl && (!telefonEl || !telefonEl.classList.contains('invalid'))) {
            hataEl.style.display = 'none';
        }
    });
}

// Şifre Göster/Gizle İşlemi
const sifreToggle = document.getElementById('sifre-toggle');
if (sifreToggle && sifreEl) {
    sifreToggle.addEventListener('click', () => {
        const isPassword = sifreEl.type === 'password';
        sifreEl.type = isPassword ? 'text' : 'password';

        // Aria label ve ikon güncellemesi
        sifreToggle.setAttribute('aria-label', isPassword ? 'Şifreyi gizle' : 'Şifreyi göster');
        sifreToggle.innerHTML = isPassword
            ? `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                   <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm0-10.5c-5 0-9.27 3.11-11 7.5 1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 13c-3.04 0-5.5-2.46-5.5-5.5S8.96 6.5 12 6.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5z"/>
               </svg>`
            : `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                   <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
               </svg>`;
    });
}

if (formEl) {
    formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        girisYap();
    });
}

async function girisYap() {
    if (!telefonEl || !sifreEl || !hataEl || !btnEl) return;

    const telefon = telefonRakamlariniAl(telefonEl.value);
    const sifre = sifreEl.value;
    const formKart = document.querySelector('.form-kart');

    hataEl.style.display = 'none';
    telefonEl.classList.remove('invalid');
    sifreEl.classList.remove('invalid');
    telefonEl.setAttribute('aria-invalid', 'false');
    sifreEl.setAttribute('aria-invalid', 'false');

    let hasError = false;
    if (!/^5\d{9}$/.test(telefon)) {
        hataEl.textContent = 'Geçerli bir telefon numarası girin (5xxxxxxxxx).';
        telefonEl.classList.add('invalid');
        telefonEl.setAttribute('aria-invalid', 'true');
        hasError = true;
    }

    if (!sifre) {
        if (!hasError) {
            hataEl.textContent = 'Şifrenizi girin.';
        }
        sifreEl.classList.add('invalid');
        sifreEl.setAttribute('aria-invalid', 'true');
        hasError = true;
    }

    if (hasError) {
        hataEl.style.display = 'block';
        if (formKart) {
            formKart.classList.add('shake');
            setTimeout(() => formKart.classList.remove('shake'), 400);
        }
        return;
    }

    btnEl.disabled = true;
    btnEl.classList.add('loading');

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
            if (formKart) {
                formKart.classList.add('shake');
                setTimeout(() => formKart.classList.remove('shake'), 400);
            }
            btnEl.disabled = false;
            btnEl.classList.remove('loading');
        }
    } catch {
        hataEl.textContent = 'Sunucuya bağlanılamadı.';
        hataEl.style.display = 'block';
        if (formKart) {
            formKart.classList.add('shake');
            setTimeout(() => formKart.classList.remove('shake'), 400);
        }
        btnEl.disabled = false;
        btnEl.classList.remove('loading');
    }
}
