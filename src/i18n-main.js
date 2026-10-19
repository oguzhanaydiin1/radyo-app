'use strict';

/* Ana süreçteki yazılar (tepsi menüsü, bildirimler, pencereler) için İngilizce karşılıklar. */

const settings = require('./settings');

const EN = {
  'OA Radyo arka planda çalıyor': 'OA Radyo is playing in the background',
  'Kapatmak için saatin yanındaki OA Radyo simgesine sağ tıklayıp “Çıkış”ı seç.': 'To quit, right-click the OA Radyo icon next to the clock and choose “Quit”.',
  'İstasyon seçilmedi': 'No station selected', Duraklat: 'Pause', 'Çal': 'Play', 'Sonraki istasyon': 'Next station',
  'Önceki istasyon': 'Previous station', 'Kaydı durdur': 'Stop recording', 'Mini oynatıcı': 'Mini player',
  'OA Radyo’yu göster': 'Show OA Radyo', 'Çıkış': 'Quit',
  'Zamanlanmış kayıt yapılamadı': 'Scheduled recording failed', 'Zamanlanmış kayıt tamamlandı': 'Scheduled recording finished',
  'Eşitleme klasörünü seç (örneğin OneDrive içinde bir klasör)': 'Choose the sync folder (e.g. a folder inside OneDrive)',
  'Yedeği kaydet': 'Save backup', 'OA Radyo yedeği': 'OA Radyo backup', 'Yedeği aç': 'Open backup', 'Dosya çok büyük.': 'The file is too large.',
  'Zamanlanmış kayıt başlatılamadı': 'Scheduled recording couldn’t start', 'Zamanlanmış kayıt başladı': 'Scheduled recording started',
  'Günaydın! Alarm çalıyor': 'Good morning! Your alarm is playing', 'başka bir kayıt sürüyor.': 'another recording is in progress.',
  dakika: 'minutes', 'Canlı radyo': 'Live radio', 'OA Radyo — mini': 'OA Radyo — mini',
};

const lang = () => (settings.get().lang === 'en' ? 'en' : 'tr');
const t = (s) => (lang() === 'en' && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s);

module.exports = { t, lang };
