require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet').default;
const path = require('path');
const { productionTrustProxyHatasi } = require('./utils/security');

const authRouter = require('./routes/auth');
const illerRouter = require('./routes/iller');
const ilcelerRouter = require('./routes/ilceler');
const kullanicilarRouter = require('./routes/kullanicilar');
const yukleRouter = require('./routes/yukle');
const excelRouter = require('./routes/excel');
const gorevlerRouter = require('./routes/gorevler');
const chatRouter = require('./routes/chat');
const notlarRouter = require('./routes/notlar');
const bildirimlerRouter = require('./routes/bildirimler');
const ozelMesajRouter = require('./routes/ozel-mesaj');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const PORT = process.env.PORT || 3000;

function trustProxyAyariniAl() {
    const deger = (process.env.TRUST_PROXY || '').trim();
    if (!deger) return false;

    const kucukDeger = deger.toLowerCase();
    const hata = process.env.NODE_ENV === 'production' ? productionTrustProxyHatasi(deger) : null;
    if (hata) throw new Error(hata);
    if (kucukDeger === 'false' || kucukDeger === '0') return false;
    if (kucukDeger === 'true') return true;

    const sayisalDeger = Number(deger);
    if (Number.isInteger(sayisalDeger) && sayisalDeger >= 0) return sayisalDeger;

    return deger;
}

function originListesiAl() {
    return (process.env.CORS_ORIGINS || process.env.CORS_ALLOWLIST || process.env.APP_ORIGIN || '')
        .split(',')
        .map((o) => o.trim())
        .map((o) => {
            try {
                return new URL(o).origin;
            } catch (_err) {
                return o;
            }
        })
        .filter(Boolean);
}

function ayniOriginMi(req, origin) {
    try {
        const originUrl = new URL(origin);
        return originUrl.protocol === `${req.protocol}:` && originUrl.host === req.get('host');
    } catch (_err) {
        return false;
    }
}

const izinliOriginler = new Set(originListesiAl());

app.disable('x-powered-by');
app.set('trust proxy', trustProxyAyariniAl());

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                frameAncestors: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: false
    })
);

app.use(
    cors((req, callback) => {
        const origin = req.get('origin');
        const temelAyarlar = {
            credentials: false,
            methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            maxAge: 600,
            optionsSuccessStatus: 204
        };

        if (!origin) {
            return callback(null, { ...temelAyarlar, origin: false });
        }

        if (izinliOriginler.has(origin) || ayniOriginMi(req, origin)) {
            return callback(null, { ...temelAyarlar, credentials: true, origin });
        }

        const err = new Error('CORS origin engellendi.');
        err.status = 403;
        err.kod = 'CORS_NOT_ALLOWED';
        return callback(err);
    })
);
app.use('/uploads', yukleRouter);
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: '1h' }));
app.use('/api/yukle', yukleRouter);
app.use(express.json({ limit: '8mb' }));

app.use('/api/auth', authRouter);
app.use('/api/iller', illerRouter);
app.use('/api/ilceler', ilcelerRouter);
app.use('/api/kullanicilar', kullanicilarRouter);
app.use('/api/excel', excelRouter);
app.use('/api/gorevler', gorevlerRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notlar', notlarRouter);
app.use('/api/bildirimler', bildirimlerRouter);
app.use('/api/ozel-mesaj', ozelMesajRouter);

app.get('/api', (req, res) => {
    res.json({ durum: 'Sosyal Medya Takip Paneli API çalışıyor.' });
});

app.use('/api', notFound);
app.use(errorHandler);

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
    });
}

module.exports = app;
