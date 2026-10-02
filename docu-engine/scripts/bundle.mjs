// Kompozisyonu önceden paketler (Nova Studyo `npm run dist` öncesi çalışır).
// Paketli uygulama webpack çalıştırmaz; bu paketi ve kaynağın özetini (.srchash) kullanır.
import { ensureBundle } from '../lib/produce.mjs';

const dir = await ensureBundle((m) => console.log('›', m));
console.log(`paket hazır: ${dir}`);
