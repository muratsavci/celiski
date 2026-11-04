// Çelişki sıralama sunucusu.
// IP adresinden kalıcı bir meyve ismi türetir ve en iyi skorları sıralar.
// Ham IP adresi veritabanına yazılmaz ve hiçbir yanıtta dönmez.

const SIFATLAR = [
  'Çevik', 'Cesur', 'Hızlı', 'Keskin', 'Neşeli', 'Sakin', 'Zeki', 'Kurnaz', 'Usta', 'Parlak',
  'Minik', 'Dev', 'Gizemli', 'Uyanık', 'Şanslı', 'Atik', 'Tatlı', 'Serin', 'Güneşli', 'Altın',
  'Gümüş', 'Bilge', 'Sessiz', 'Yaman', 'Asil', 'Afacan', 'Kızıl', 'Çılgın', 'Yıldız', 'Şimşek'
];
const MEYVELER = [
  'Elma', 'Armut', 'Ayva', 'Kiraz', 'Vişne', 'Çilek', 'Karpuz', 'Kavun', 'Muz', 'Portakal',
  'Mandalina', 'Limon', 'Greyfurt', 'Nar', 'İncir', 'Üzüm', 'Şeftali', 'Kayısı', 'Erik', 'Dut',
  'Ananas', 'Mango', 'Kivi', 'Hurma', 'Böğürtlen', 'Ahududu', 'Yabanmersini', 'Kızılcık',
  'Avokado', 'Papaya', 'Muşmula', 'Yenidünya', 'Alıç', 'Nektarin', 'Pomelo', 'Karadut'
];
const ISIM_SAYISI = SIFATLAR.length * MEYVELER.length;

// Oyundaki AYAR nesnesiyle aynı olmalı.
const TEMEL_PUAN = 10;
const CARPAN_SERISI = 5;
const EN_YUKSEK_CARPAN = 5;

const EN_COK_DOGRU = 5000;
const EN_KISA_CEVAP_MS = 120;
const GONDERIM_ARALIGI_MS = 1500;

function beklenenSkor(dogru) {
  let toplam = 0;
  for (let seri = 1; seri <= dogru; seri++) {
    toplam += TEMEL_PUAN * Math.min(EN_YUKSEK_CARPAN, 1 + Math.floor(seri / CARPAN_SERISI));
  }
  return toplam;
}

function isimUret(sira) {
  const i = sira % ISIM_SAYISI;
  return SIFATLAR[Math.floor(i / MEYVELER.length)] + ' ' + MEYVELER[i % MEYVELER.length];
}

// IPv6 kullanıcıları sık sık adres değiştirir; aynı bağlantı /64 öneki ile tanınır.
function ipAnahtari(ip) {
  const metin = ip.trim().toLowerCase();
  if (!metin.includes(':')) return metin;
  const gomulu = metin.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (gomulu) return gomulu[1];
  const [sol, sag] = metin.split('::');
  const solParca = sol ? sol.split(':') : [];
  const sagParca = sag ? sag.split(':') : [];
  const parcalar = metin.includes('::')
    ? [...solParca, ...Array(8 - solParca.length - sagParca.length).fill('0'), ...sagParca]
    : solParca;
  return parcalar.slice(0, 4).map((p) => parseInt(p || '0', 16).toString(16)).join(':');
}

async function kimlikUret(ip, tuz) {
  const anahtar = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(tuz), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const imza = await crypto.subtle.sign('HMAC', anahtar, new TextEncoder().encode(ipAnahtari(ip)));
  return [...new Uint8Array(imza)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function oyuncuBul(env, ip) {
  const kimlik = await kimlikUret(ip, env.IP_TUZ);
  const secim = env.DB.prepare('SELECT kimlik, isim, rekor, rekor_tarih, son_gonderim FROM oyuncular WHERE kimlik = ?').bind(kimlik);
  const kayitli = await secim.first();
  if (kayitli) return kayitli;

  const baslangic = parseInt(kimlik.slice(0, 8), 16);
  for (let adim = 0; adim < ISIM_SAYISI; adim++) {
    await env.DB.prepare('INSERT OR IGNORE INTO oyuncular (kimlik, isim) VALUES (?, ?)')
      .bind(kimlik, isimUret(baslangic + adim)).run();
    const yeni = await secim.first();
    if (yeni) return yeni;
  }
  throw new Error('Boş isim kalmadı');
}

async function tablo(env, oyuncu) {
  const { results } = await env.DB.prepare(
    'SELECT kimlik, isim, rekor FROM oyuncular WHERE rekor > 0 ORDER BY rekor DESC, rekor_tarih ASC, isim ASC LIMIT 10'
  ).all();
  let sira = null;
  if (oyuncu.rekor > 0) {
    const satir = await env.DB.prepare(
      'SELECT COUNT(*) + 1 AS sira FROM oyuncular WHERE rekor > ?1 OR (rekor = ?1 AND rekor_tarih < ?2) OR (rekor = ?1 AND rekor_tarih = ?2 AND isim < ?3)'
    ).bind(oyuncu.rekor, oyuncu.rekor_tarih, oyuncu.isim).first();
    sira = satir.sira;
  }
  return {
    ilkOn: results.map((r, i) => ({ sira: i + 1, isim: r.isim, skor: r.rekor, sen: r.kimlik === oyuncu.kimlik })),
    ben: { isim: oyuncu.isim, skor: oyuncu.rekor, sira }
  };
}

function skorGecerli(girdi) {
  const { skor, dogru, sureMs } = girdi || {};
  return Number.isInteger(skor) && Number.isInteger(dogru) && Number.isFinite(sureMs)
    && dogru > 0 && dogru <= EN_COK_DOGRU
    && skor === beklenenSkor(dogru)
    && sureMs >= dogru * EN_KISA_CEVAP_MS;
}

async function skorKaydet(istek, env, oyuncu) {
  let girdi;
  try { girdi = await istek.json(); } catch (e) { return { durum: 400, govde: { hata: 'gecersiz' } }; }
  if (!skorGecerli(girdi)) return { durum: 422, govde: { hata: 'gecersiz' } };

  const simdi = Date.now();
  if (simdi - oyuncu.son_gonderim < GONDERIM_ARALIGI_MS) return { durum: 429, govde: { hata: 'cok-hizli' } };

  await env.DB.prepare(
    'UPDATE oyuncular SET son_gonderim = ?1, rekor_tarih = CASE WHEN ?2 > rekor THEN ?1 ELSE rekor_tarih END, rekor = MAX(rekor, ?2) WHERE kimlik = ?3'
  ).bind(simdi, girdi.skor, oyuncu.kimlik).run();
  const guncel = await env.DB.prepare('SELECT kimlik, isim, rekor, rekor_tarih FROM oyuncular WHERE kimlik = ?').bind(oyuncu.kimlik).first();
  return { durum: 200, govde: await tablo(env, guncel) };
}

function izinliKoken(istek, env) {
  const koken = istek.headers.get('Origin');
  return koken && env.IZINLI_KOKENLER.split(',').includes(koken) ? koken : null;
}

function yanit(durum, govde, koken) {
  const basliklar = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (koken) basliklar['Access-Control-Allow-Origin'] = koken;
  return new Response(JSON.stringify(govde), { status: durum, headers: basliklar });
}

export default {
  async fetch(istek, env) {
    const koken = izinliKoken(istek, env);
    const yol = new URL(istek.url).pathname;

    if (istek.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...(koken ? { 'Access-Control-Allow-Origin': koken } : {}),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin'
        }
      });
    }
    if (!koken) return yanit(403, { hata: 'izin-yok' }, null);

    const ip = istek.headers.get('CF-Connecting-IP');
    if (!ip) return yanit(400, { hata: 'ip-yok' }, koken);

    try {
      if (istek.method === 'GET' && yol === '/siralama') {
        return yanit(200, await tablo(env, await oyuncuBul(env, ip)), koken);
      }
      if (istek.method === 'POST' && yol === '/skor') {
        const sonuc = await skorKaydet(istek, env, await oyuncuBul(env, ip));
        return yanit(sonuc.durum, sonuc.govde, koken);
      }
      return yanit(404, { hata: 'bulunamadi' }, koken);
    } catch (hata) {
      console.error(hata);
      return yanit(500, { hata: 'sunucu' }, koken);
    }
  }
};
