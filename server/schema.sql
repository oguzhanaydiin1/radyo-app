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
