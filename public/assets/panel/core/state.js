import { guvenliJsonParse } from './format.js';

export const RENKLER = [
    '#c1121f',
    '#24467c',
    '#00ab76',
    '#856404',
    '#7B1FA2',
    '#D81B60',
    '#00838f',
    '#5d4037',
    '#455a64',
    '#e65100'
];

export const PANEL_SAYFALARI = new Set(['harita', 'iller', 'gorevler', 'chat', 'kullanicilar', 'profil', 'notlar']);

export const state = {
    kullanici: guvenliJsonParse(localStorage.getItem('kullanici'), {}),
    seciliIlId: null,
    seciliIlAdi: '',
    secilenRenk: RENKLER[1],
    haritaYuklendi: false,
    haritaVeri: [],
    chatInterval: null,
    excelTip: 'il',
    excelState: { requestId: 0, importId: '', tip: 'il', uygulanabilir: false },
    bildirimSonId: 0,
    bildirimIntervalId: null,
    pushIzni: false,
    chatAciciAcik: false,
    chatKisilerListesi: [],
    acikSohbetler: {},
    chatPollInterval: null,
    yazilmaBildirTimer: null,
    notlar: [],
    aktifNot: null,
    notKaydetTimer: null,
    notBekleyenSnapshot: null,
    notKaydetSeq: 0,
    notSecimSeq: 0,
    haritaSeciliIl: null
};
