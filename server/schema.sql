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
