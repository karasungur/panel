const { z } = require('zod');
const { hata } = require('./errors');

/**
 * @typedef {import('express').RequestHandler} RequestHandler
 * @typedef {import('express-serve-static-core').Query} ExpressQuery
 * @typedef {{ alan: string, mesaj: string }} ZodHata
 */

const idSchema = z.coerce.number().int().positive();

/**
 * @param {import('zod').ZodError} error
 * @returns {ZodHata[]}
 */
function zodHatalari(error) {
    return error.issues.map((issue) => ({
        alan: issue.path.join('.') || 'root',
        mesaj: issue.message
    }));
}

/**
 * @param {import('zod').ZodType} schema
 * @returns {RequestHandler}
 */
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

/**
 * @param {import('zod').ZodType<ExpressQuery>} schema
 * @returns {RequestHandler}
 */
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

/**
 * @param {unknown} deger
 * @param {string} [alan]
 * @returns {number}
 */
function pozitifId(deger, alan = 'id') {
    const sonuc = idSchema.safeParse(deger);
    if (!sonuc.success) {
        throw hata(400, 'INVALID_ID', `${alan} pozitif tam sayi olmalidir.`);
    }
    return sonuc.data;
}

/**
 * @param {number} [max]
 */
const optionalTrimmedString = (max = 255) =>
    z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(max).optional());

module.exports = {
    z,
    idSchema,
    validateBody,
    validateQuery,
    pozitifId,
    optionalTrimmedString
};
