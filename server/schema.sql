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

-- E-posta listesi (duyurular). Kişi onay bağlantısına tıklayınca "active" olur;
-- listeden ayrılınca kayıt tamamen silinir.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL,            -- pending | active
  token TEXT NOT NULL UNIQUE,      -- onay ve ayrılma bağlantısı
  created TEXT NOT NULL,
  confirmed TEXT,
  lang TEXT,
  source TEXT,
  consent TEXT,                    -- onaylanan metnin sürümü
  ip TEXT,                         -- IP adresinin tek yönlü özeti (kötüye kullanım için)
  mailed TEXT                      -- son onay e-postasının gönderildiği zaman
);
CREATE INDEX IF NOT EXISTS subscribers_status ON subscribers (status, created);
