import type { Script } from '../types';

/**
 * Demo scripts, one per genre. A real video is exactly this shape: write the
 * scenes, drop images in public/, add music and voiceover, render.
 *
 * `dur` is seconds. Leave `transition` off to use the genre's default.
 */

export const belgesel: Script = {
  id: 'belgesel',
  genre: 'documentary',
  scenes: [
    { type: 'title', kicker: 'Bir imparatorluğun', title: 'Gerçek Hikâyesi', image: 'demo/giant-mode.jpg', dur: 3.2 },
    { type: 'counter', from: 31000, to: 38410, label: 'Şube', dur: 1.6 },
    { type: 'counter', from: 80, to: 112, label: 'Ülke', dur: 1.5 },
    {
      type: 'words',
      text: 'Ama her şey tek bir sokak arabasıyla başladı',
      keyword: 'başladı',
      image: 'demo/old-photo-alive.jpg',
      transition: 'zoom',
      dur: 3.4,
    },
    { type: 'photo', image: 'demo/old-photo-alive.jpg', name: 'Hasan Kervan', role: 'Kurucu · 1974', dur: 3.0 },
    {
      type: 'slam',
      word: 'Çalındı',
      sub: 've kimse fark etmedi',
      image: 'demo/movie-trailer.jpg',
      transition: 'zoom',
      riser: true,
      dur: 3.3,
    },
    { type: 'photo', image: 'demo/luxury-transformation.jpg', caption: 'Tarifi yazan kadın tek kuruş almadı', dur: 3.0 },
    {
      type: 'words',
      text: 'Bu, o tarifin bedelini ödeyenlerin hikâyesi',
      keyword: 'bedelini',
      image: 'demo/ai-hug.jpg',
      dur: 3.8,
    },
  ],
};

export const finans: Script = {
  id: 'finans',
  genre: 'finance',
  scenes: [
    { type: 'title', kicker: '2008', title: 'Çöküş', dur: 2.8 },
    { type: 'counter', from: 0, to: 700, prefix: '$', suffix: ' Milyar', label: 'Kurtarma paketi', dur: 2.0 },
    {
      type: 'chart',
      title: 'S&P 500 · 2008',
      points: [1468, 1492, 1515, 1540, 1505, 1561, 1526, 1480, 1282, 968, 896, 752, 805, 903],
      dur: 4.6,
    },
    {
      type: 'words',
      text: 'Bir gecede milyonlarca insan evini kaybetti',
      keyword: 'evini',
      image: 'demo/explosion-walk.jpg',
      dur: 3.4,
    },
    { type: 'slam', word: 'Panik', sub: 've kimse durduramadı', at: 0.8, riser: true, dur: 2.8 },
    { type: 'counter', from: 0, to: 8.8, decimals: 1, suffix: ' Milyon', label: 'Kaybedilen iş', dur: 2.2 },
    { type: 'words', text: 'Peki bir sonraki ne zaman?', keyword: 'sonraki', silence: true, dur: 3.0 },
  ],
};

export const korku: Script = {
  id: 'korku',
  genre: 'horror',
  scenes: [
    {
      type: 'words',
      text: '1987 kışında Koridor 4 kapatıldı',
      keyword: 'kapatıldı',
      image: 'demo/cyberpunk-car.jpg',
      dur: 4.0,
    },
    { type: 'photo', image: 'demo/zombie-transformation.jpg', name: 'Elif A.', role: 'son görüldüğü gece', dur: 3.2 },
    {
      type: 'words',
      text: 'Kimse ona ne olduğunu açıklayamadı',
      keyword: 'açıklayamadı',
      image: 'demo/cyberpunk-car.jpg',
      dur: 3.6,
    },
    {
      type: 'slam',
      word: 'Kayboldu',
      sub: 'iz bırakmadan',
      image: 'demo/cyberpunk-car.jpg',
      at: 1.4,
      silence: true,
      riser: true,
      dur: 3.4,
    },
    { type: 'title', kicker: 'Koridor 4', title: 'Hâlâ Açık', dur: 3.2 },
  ],
};

export const SCRIPTS: Script[] = [belgesel, finans, korku];
