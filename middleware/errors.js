class ApiError extends Error {
    /**
     * @param {number} status
     * @param {string} kod
     * @param {string} mesaj
     * @param {unknown} [detaylar]
     */
    constructor(status, kod, mesaj, detaylar) {
        super(mesaj);
        this.status = status;
        this.kod = kod;
        this.detaylar = detaylar;
    }
}

/**
 * @param {number} status
 * @param {string} kod
 * @param {string} mesaj
 * @param {unknown} [detaylar]
 * @returns {ApiError}
 */
function hata(status, kod, mesaj, detaylar) {
    return new ApiError(status, kod, mesaj, detaylar);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function notFound(req, res) {
    res.status(404).json({ hata: 'Endpoint bulunamadi.', kod: 'NOT_FOUND' });
}

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    let status = err.status || err.statusCode || 500;
    let kod = err.kod || 'INTERNAL_ERROR';
    let mesaj = err.message || 'Sunucu hatasi.';
    const detaylar = err.detaylar;

    if (err.type === 'entity.too.large') {
        status = 413;
        kod = 'PAYLOAD_TOO_LARGE';
        mesaj = 'Gonderilen veri cok buyuk.';
    } else if (err instanceof SyntaxError && 'body' in err) {
        status = 400;
        kod = 'INVALID_JSON';
        mesaj = 'Gecersiz JSON verisi.';
    } else if (!err.status && !err.statusCode) {
        mesaj = 'Sunucu hatasi.';
    }

    if (status >= 500) {
        console.error('API hata:', {
            method: req.method,
            url: req.originalUrl,
            message: err.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
        });
    }

    /** @type {{ hata: string, kod: string, detaylar?: unknown }} */
    const cevap = { hata: mesaj, kod };
    if (detaylar) cevap.detaylar = detaylar;
    res.status(status).json(cevap);
}

module.exports = { ApiError, hata, notFound, errorHandler };
