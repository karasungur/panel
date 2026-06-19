declare global {
    namespace Express {
        interface KullaniciOturumu {
            id: number;
            kullanici_adi: string;
            rol: string;
            ad_soyad?: string | null;
            gorev_adi?: string | null;
            renk?: string | null;
            profil_foto?: string | null;
            tokenVersion?: number;
        }

        interface Request {
            kullanici: KullaniciOturumu;
        }
    }

    interface Error {
        status?: number;
        statusCode?: number;
        kod?: string;
        detaylar?: unknown;
    }
}

export {};
