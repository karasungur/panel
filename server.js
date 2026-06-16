require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRouter = require('./routes/auth');
const illerRouter = require('./routes/iller');
const ilcelerRouter = require('./routes/ilceler');
const kullanicilarRouter = require('./routes/kullanicilar');
const yukleRouter = require('./routes/yukle');
const excelRouter = require('./routes/excel');
const ayarlarRouter = require('./routes/ayarlar');
const gorevlerRouter = require('./routes/gorevler');
const chatRouter = require('./routes/chat');
const notlarRouter = require('./routes/notlar');

const app = express();
const PORT = process.env.PORT || 3000;

// Render proxy arkasinda calisirken gercek IP icin
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Kalici disk varsa /uploads URL'i oradan servis edilsin
if (process.env.DATA_DIR) {
    const uploadDir = path.join(path.resolve(process.env.DATA_DIR), 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    app.use('/uploads', express.static(uploadDir));
}

app.use('/api/auth', authRouter);
app.use('/api/iller', illerRouter);
app.use('/api/ilceler', ilcelerRouter);
app.use('/api/kullanicilar', kullanicilarRouter);
app.use('/api/yukle', yukleRouter);
app.use('/api/excel', excelRouter);
app.use('/api/ayarlar', ayarlarRouter);
app.use('/api/gorevler', gorevlerRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notlar', notlarRouter);

app.get('/api', (req, res) => {
    res.json({ durum: 'Sosyal Medya Takip Paneli API çalışıyor.' });
});

app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
});
