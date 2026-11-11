-- İsimsiz kullanım sayımı. Kişiyi tanımlayan bilgi tutulmaz:
-- "install" uygulamanın rastgele ürettiği kimliğin tuzlanmış özetidir.
CREATE TABLE IF NOT EXISTS active_daily (
  day TEXT NOT NULL,
  app TEXT NOT NULL,
  install TEXT NOT NULL,
  version TEXT,
  lang TEXT,
  PRIMARY KEY (day, app, install)
);
CREATE TABLE IF NOT EXISTS listen_daily (
  day TEXT NOT NULL,
  app TEXT NOT NULL,
  station TEXT NOT NULL,
  name TEXT,
  minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, station)
);
CREATE INDEX IF NOT EXISTS listen_day ON listen_daily (day);

-- Uygulama hata raporları (Harrier Cleaner). Kişiyi tanımlayan bilgi tutulmaz:
-- "install" uygulamanın rastgele kimliğinin tuzlanmış özeti; yollar ve kullanıcı adı uygulamada temizlenir.
CREATE TABLE IF NOT EXISTS error_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,
  app TEXT NOT NULL,
  version TEXT,
  os TEXT,
  lang TEXT,
  install TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT
);
CREATE INDEX IF NOT EXISTS error_reports_app ON error_reports (app, created);
CREATE INDEX IF NOT EXISTS error_reports_install ON error_reports (install, created);

-- Üyelik (şifresiz, e-posta koduyla giriş).
DROP TABLE IF EXISTS subscribers;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created TEXT NOT NULL,
  last_login TEXT,
  announce INTEGER NOT NULL DEFAULT 0,   -- duyuru e-postalarına izin (isteğe bağlı)
  consent TEXT                            -- onaylanan aydınlatma metninin sürümü
);
-- Bekleyen giriş kodları: kod yalnızca özet olarak tutulur, 10 dakikada geçersiz olur.
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  ip TEXT,
  pending TEXT                            -- üye olurken girilen bilgiler (kod onaylanınca hesap açılır)
);
CREATE INDEX IF NOT EXISTS login_codes_ip ON login_codes (ip, created);
-- Oturumlar: çerezdeki anahtarın yalnızca özeti tutulur.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created TEXT NOT NULL,
  expires TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
-- Oturumların cihaz bilgisi (Güvenlik ve oturumlar sayfası için).
CREATE TABLE IF NOT EXISTS session_info (
  token TEXT PRIMARY KEY,
  device TEXT,
  last_seen TEXT
);
-- Tek giriş: bir OA uygulamasının öbürüne verdiği tek kullanımlık kodlar (yalnız özet; 2 dakika geçerli).
CREATE TABLE IF NOT EXISTS auth_handoff (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  created TEXT NOT NULL,
  expires TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_handoff_user ON auth_handoff (user_id, created);
-- "Çıkınca haber ver": üyenin haber almak istediği uygulamalar.
CREATE TABLE IF NOT EXISTS app_notify (
  user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (user_id, app)
);

-- OA Tarayıcı eşitlemesi: üyenin yer imleri ve hızlı erişim kutuları (koleksiyon başına bir satır).
CREATE TABLE IF NOT EXISTS user_sync (
  user_id TEXT NOT NULL,
  item TEXT NOT NULL,
  updated TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, item)
);

-- Profil fotoğrafı: dosyanın kendisi R2'de (AVATARS), burada yalnız adı. Fotoğrafı yalnız üyenin kendisi görür.
CREATE TABLE IF NOT EXISTS user_avatar (
  user_id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- Site ziyaretçi sayacı (oalabs.dev). Çerez yok, kişiyi tanımlayan bilgi tutulmaz:
-- "visitor" IP + tarayıcı bilgisinin o güne özel tuzlanmış özetidir; ertesi gün aynı kişi tanınamaz.
CREATE TABLE IF NOT EXISTS site_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE TABLE IF NOT EXISTS site_visitors (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  source TEXT,     -- google, bing, doğrudan, sosyal, başka site (alan adı)
  lang TEXT,
  device TEXT,     -- telefon, tablet, bilgisayar
  PRIMARY KEY (day, visitor)
);

-- Geri bildirim (hata, öneri) ve fikir panosu (oylanabilen özellik istekleri)
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,
  kind TEXT NOT NULL,       -- hata, oneri, diger
  app TEXT,
  text TEXT NOT NULL,
  email TEXT,               -- isteğe bağlı: yanıt istersen
  page TEXT,
  ip_hash TEXT,
  user_id TEXT,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created);
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  app TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, open, planned, progress, done, rejected
  reply TEXT,
  votes INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ideas_status ON ideas (status);
CREATE TABLE IF NOT EXISTS idea_votes (
  idea_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (idea_id, user_id)
);

-- Kullanıcı yorumları: geri bildirim formunda "yayımlanabilir" diye işaretlenenler. Yönetici onaylayınca
-- sitede görünür (adı, kullanıcının yazdığı gibi; boşsa isimsiz).
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,
  app TEXT NOT NULL,
  text TEXT NOT NULL,
  name TEXT,
  lang TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  feedback_id INTEGER
);
CREATE INDEX IF NOT EXISTS reviews_pub ON reviews (published, app);

-- Ziyaretçinin ülkesi (Cloudflare'in verdiği iki harfli kod; IP saklanmaz). Kişi başına günde bir satır.
CREATE TABLE IF NOT EXISTS site_geo (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  country TEXT,
  PRIMARY KEY (day, visitor)
);

-- OA Labs Center: hesaba bağlı cihazlar ve kurulu OA uygulamaları (apps: [{id, version}] JSON).
CREATE TABLE IF NOT EXISTS center_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  apps TEXT NOT NULL DEFAULT '[]',
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS center_devices_user ON center_devices (user_id, updated);

-- OA Labs Center: bir cihazdan öbürüne "şu uygulamayı kur" istekleri (state: pending, done, failed, cancelled).
CREATE TABLE IF NOT EXISTS center_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  from_device TEXT,
  app TEXT NOT NULL,
  created TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  finished TEXT
);
CREATE INDEX IF NOT EXISTS center_commands_device ON center_commands (user_id, device_id, state);

-- OA Labs Center'da ve bildirimde görünen duyurular (yönetim panelinden).
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,
  app TEXT,
  title TEXT NOT NULL,
  body TEXT,
  title_en TEXT,
  body_en TEXT,
  url TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
