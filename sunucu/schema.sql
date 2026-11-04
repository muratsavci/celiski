-- Ham IP ve cihaz kodu tutulmaz. "kimlik", bunlardan gizli anahtarla üretilen HMAC özetidir.
CREATE TABLE IF NOT EXISTS oyuncular (
  kimlik TEXT PRIMARY KEY,
  isim TEXT NOT NULL UNIQUE,
  rekor INTEGER NOT NULL DEFAULT 0,
  rekor_tarih INTEGER NOT NULL DEFAULT 0,
  son_gonderim INTEGER NOT NULL DEFAULT 0,
  cihaz_bagli INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS siralama ON oyuncular (rekor DESC, rekor_tarih ASC);
