// electron-builder afterPack: docu-engine'in bağımlılıklarını paketin içine kopyalar.
//
// extraResources `node_modules` klasörlerini filtre ne derse desin atlıyor (ölçüldü:
// "node_modules/**/*" açıkça yazılınca da kopyalanmadı). Sinematik Belgesel motoru
// alt süreçte kendi node_modules'unu çözdüğü için onsuz render başlamaz.
const fs = require('node:fs');
const path = require('node:path');

const SKIP = new Set(['.remotion', 'typescript', '@types', '.cache']);

exports.default = async function afterPack(context) {
  const from = path.join(context.packager.projectDir, 'docu-engine', 'node_modules');
  const to = path.join(context.appOutDir, 'resources', 'docu-engine', 'node_modules');
  if (!fs.existsSync(from)) throw new Error('docu-engine/node_modules yok — önce `npm run docu:install`');
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)) || path.dirname(src) !== from,
  });
  const renderer = path.join(to, '@remotion', 'renderer', 'package.json');
  if (!fs.existsSync(renderer)) throw new Error('docu-engine bağımlılıkları kopyalanamadı');
  console.log(`  • docu-engine bağımlılıkları kopyalandı → ${to}`);
};
