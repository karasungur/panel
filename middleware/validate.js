const { z } = require('zod');
const { hata } = require('./errors');

const idSchema = z.coerce.number().int().positive();

function zodHatalari(error) {
    return error.issues.map(issue => ({
        alan: issue.path.join('.') || 'root',
        mesaj: issue.message
    }));
}

function validateBody(schema) {
    return (req, res, next) => {
        const sonuc = schema.safeParse(req.body);
        if (!sonuc.success) {
            return next(hata(400, 'VALIDATION_ERROR', 'Gecersiz istek verisi.', zodHatalari(sonuc.error)));
        }
        req.body = sonuc.data;
        next();
    };
}

function validateQuery(schema) {
    return (req, res, next) => {
        const sonuc = schema.safeParse(req.query);
        if (!sonuc.success) {
            return next(hata(400, 'VALIDATION_ERROR', 'Gecersiz sorgu parametresi.', zodHatalari(sonuc.error)));
        }
        req.query = sonuc.data;
        next();
    };
}

function pozitifId(deger, alan = 'id') {
    const sonuc = idSchema.safeParse(deger);
    if (!sonuc.success) {
        throw hata(400, 'INVALID_ID', `${alan} pozitif tam sayi olmalidir.`);
    }
    return sonuc.data;
}

const optionalTrimmedString = (max = 255) => z.preprocess(
    v => v === '' ? undefined : v,
    z.string().trim().max(max).optional()
);

module.exports = {
    z,
    idSchema,
    validateBody,
    validateQuery,
    pozitifId,
    optionalTrimmedString
};
