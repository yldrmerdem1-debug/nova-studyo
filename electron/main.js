// Nova Stüdyo — masaüstü uygulama kabuğu.
// Express sunucusu aynı süreçte başlar, arayüz kendi penceresinde açılır.
// Tarayıcı yok, adres çubuğu yok — gerçek uygulama.

import { app, BrowserWindow, Menu, shell, dialog, screen, powerSaveBlocker } from "electron";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { seedBundledResources } from './seed-resources.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, ".."); // kod kökü — paketli modda app.asar içi, SALT OKUNUR
const PORT_RANGE = [4545, 4546, 4547, 4548, 4549];

// Yazılabilir ev dizini: paketli modda Belgeler\Nova Studyo, geliştirmede proje klasörü.
// asar içine yazılamayacağı için bu ayrım şart.
function resolveHome() {
  if (!app.isPackaged) return ROOT;
  // "Videolar" klasörü: üretilen videoların doğal yeri ve OneDrive varsayılan olarak
  // buluta senkronlamaz. ("Belgeler" OneDrive'a yönlendirilmiş olabiliyor — her render
  // 100 MB, kullanıcının bulut kotasını yakardı.) Bulunamazsa uygulama verisine düş.
  for (const key of ["videos", "userData"]) {
    try {
      const base = app.getPath(key);
      if (!base) continue;
      if (key === "userData") return base;                 // zaten uygulamaya özel
      if (/onedrive|dropbox|google drive/i.test(base)) continue; // senkronlu klasörden kaç
      return path.join(base, "Nova Studyo");
    } catch {}
  }
  return path.join(process.env.LOCALAPPDATA || process.cwd(), "Nova Studyo");
}
const HOME = resolveHome();
process.env.NOVA_HOME = HOME;

/** Eksik paket müzik/kliplerini güncellemelerde de ekle; kullanıcı dosyalarını koru. */
function seedHome() {
  fs.mkdirSync(HOME, { recursive: true });
  if (!app.isPackaged) return;
  for(const warning of seedBundledResources(process.resourcesPath,HOME).warnings) console.warn('Resource seed:',warning);
  const readme = path.join(HOME, "BENİ OKU.txt");
  if (!fs.existsSync(readme)) {
    try {
      fs.writeFileSync(readme,
        "Nova Stüdyo çalışma klasörü\r\n" +
        "===========================\r\n\r\n" +
        "data\\jobs   → üretilen videolar (output.mp4, thumbnail.jpg, seo.md, subs.srt)\r\n" +
        "data\\settings.json → API anahtarların ve ayarların (kimseyle paylaşma)\r\n" +
        "music       → buraya mp3 atarsan fon müziği olarak kullanılır\r\n" +
        "assets      → buraya mp4 atarsan kendi kliplerin videoya girer\r\n\r\n" +
        "API anahtarlarını uygulama içinden Ayarlar sayfasından girebilirsin.\r\n", "utf8");
    } catch {}
  }
}

let win = null;
let PORT = PORT_RANGE[0];
let attachedToExisting = false;

// Ana süreçte yakalanmayan hata = sessiz ölüm. Kullanıcı en azından sebebi görsün.
process.on("uncaughtException", (e) => {
  try {
    dialog.showErrorBox("Nova Stüdyo — beklenmeyen hata", String(e?.stack || e).slice(0, 2000));
  } catch {}
});
process.on("unhandledRejection", (e) => {
  console.error("Yakalanmayan promise hatası:", e);
});

// Tek örnek: ikinci kez açılırsa var olan pencereyi öne getir
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

/** Port durumu: "nova" (bizim sunucu zaten orada) | "other" (başkası tutmuş) | "free" */
async function probePort(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return "nova";
  } catch {}
  return await new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve("other"));
    s.once("listening", () => s.close(() => resolve("free")));
    s.listen(port, "127.0.0.1");
  });
}

/** Boş bir port bul; zaten çalışan bir Nova varsa ona bağlan. */
async function resolvePort() {
  for (const p of PORT_RANGE) {
    const st = await probePort(p);
    if (st === "nova") { PORT = p; attachedToExisting = true; return; }
    if (st === "free") { PORT = p; return; }
  }
  throw new Error(`${PORT_RANGE.join(", ")} portlarının hepsi başka uygulamalar tarafından kullanılıyor.`);
}

async function startServer() {
  process.env.NOVA_EMBEDDED = "1";
  process.env.NOVA_PORT = String(PORT);
  // Windows'ta yol boşluk/Türkçe karakter içerebilir — ESM import file:// URL ister
  await import(pathToFileURL(path.join(ROOT, "server.js")).href);
}

/** Sunucu ayağa kalkana kadar bekle (ilk açılışta birkaç yüz ms). */
async function waitForServer(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function iconPath() {
  for (const f of ["icon.ico", "icon.png"]) {
    const p = path.join(ROOT, "build", f);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function fatal(message, detail = "") {
  dialog.showErrorBox("Nova Stüdyo başlatılamadı", `${message}\n\n${detail}`.trim().slice(0, 2000));
  app.exit(1);
}

const STATE_FILE = () => path.join(HOME, "data", "window.json");

/** Kaydedilmiş pencere konumu; ekrana sığmıyorsa (monitör değişmiş olabilir) yok sayılır. */
function savedBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
    const fits = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return b.x >= a.x - 40 && b.y >= a.y - 40 && b.x + b.width <= a.x + a.width + 40;
    });
    if (fits && b.width > 800 && b.height > 560) return b;
  } catch {}
  return null;
}

function rememberBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {}
}

async function createWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const saved = savedBounds();
  // Ekranı taşmayan varsayılan: küçük dizüstülerde de tam görünür kalsın
  const width = saved?.width ?? Math.min(1440, wa.width - 80);
  const height = saved?.height ?? Math.min(940, wa.height - 60);

  win = new BrowserWindow({
    width, height,
    x: saved?.x, y: saved?.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0d13",
    show: false,
    autoHideMenuBar: true,
    icon: iconPath(),
    title: "Nova Stüdyo",
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  if (saved?.maximized) win.maximize();

  for (const ev of ["resize", "move", "maximize", "unmaximize"]) win.on(ev, debounce(rememberBounds, 500));

  // Açılış ekranı ÖNCE gelsin: sunucu 2-4 sn'de kalkıyor, o sürede siyah ekran görünmesin.
  const splash = path.join(HERE, "loading.html");
  if (fs.existsSync(splash)) await win.loadFile(splash);
  win.show();

  // Dış bağlantılar varsayılan tarayıcıda açılsın
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file://") || url.startsWith(`http://127.0.0.1:${PORT}`)) return;
    e.preventDefault();
    shell.openExternal(url);
  });

  return win;
}

/** Pencere içindeki gerçek CSS ölçülerini konsola yaz (yerleşim hatalarını ayıklamak için). */
async function reportViewport() {
  try {
    const m = await win.webContents.executeJavaScript(`(() => {
      const de = document.documentElement;
      const main = document.querySelector('.main');
      return {
        css: innerWidth + 'x' + innerHeight,
        dpr: devicePixelRatio,
        zoom: null,
        clientWidth: de.clientWidth,
        scrollWidth: de.scrollWidth,
        scrollY: Math.round(scrollY),
        scrollHeight: de.scrollHeight,
        mainRight: main ? Math.round(main.getBoundingClientRect().right) : null,
      };
    })()`);
    m.zoom = win.webContents.getZoomFactor();
    console.log("[görünüm]", JSON.stringify(m));
  } catch {}
}

/** Arayüzü yükle; yükleme başarısız olursa birkaç kez dene. */
async function loadUi() {
  for (let i = 0; i < 4; i++) {
    try {
      await win.loadURL(`http://127.0.0.1:${PORT}`);
      return true;
    } catch (e) {
      if (i === 3) { fatal("Arayüz yüklenemedi.", String(e?.message || e)); return false; }
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  return false;
}

/** Üretim sürerken kapanışı onaylat. close olayında await edilemez → busy bayrağı canlı tutulur. */
function guardClose() {
  let busy = false;
  const timer = setInterval(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/state`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      busy = (data.jobs || []).some((j) => j.status === "running");
    } catch { busy = false; }
  }, 4000);

  let forceClose = false;
  win.on("close", (e) => {
    if (forceClose || !busy) return;
    e.preventDefault(); // senkron — geç kalmıyor
    dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Devam etsin", "Yine de kapat"],
      defaultId: 0,
      cancelId: 0,
      title: "Üretim sürüyor",
      message: "Şu anda bir video üretiliyor.",
      detail: "Kapatırsan render yarıda kalır. Tamamlanan işler kütüphanede kalır.",
    }).then(({ response }) => {
      if (response === 1) { forceClose = true; win.close(); }
    });
  });

  win.on("close", () => rememberBounds());
  win.on("closed", () => { clearInterval(timer); win = null; });
}

function buildMenu() {
  const openDir = (...parts) => () => {
    const dir = path.join(HOME, ...parts);
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Nova Stüdyo",
      submenu: [
        { label: "Videolar klasörünü aç", click: openDir("data", "jobs"), accelerator: "CmdOrCtrl+Shift+O" },
        { label: "Müzik klasörünü aç", click: openDir("music") },
        { label: "Kendi klipler klasörünü aç", click: openDir("assets") },
        { label: "Çalışma klasörünü aç", click: openDir() },
        { type: "separator" },
        { role: "reload", label: "Yenile" },
        { role: "toggleDevTools", label: "Geliştirici araçları" },
        { type: "separator" },
        { role: "quit", label: "Çıkış" },
      ],
    },
    {
      label: "Düzen",
      submenu: [
        { role: "undo", label: "Geri al" }, { role: "redo", label: "Yinele" },
        { type: "separator" },
        { role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" },
        { role: "paste", label: "Yapıştır" }, { role: "selectAll", label: "Tümünü seç" },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        { role: "resetZoom", label: "Yakınlaştırmayı sıfırla" },
        { role: "zoomIn", label: "Yakınlaştır" }, { role: "zoomOut", label: "Uzaklaştır" },
        { type: "separator" }, { role: "togglefullscreen", label: "Tam ekran" },
      ],
    },
  ]));
}

app.whenReady().then(async () => {
  seedHome();
  buildMenu();
  await createWindow(); // pencere ve açılış ekranı hemen görünür

  try {
    await resolvePort();
  } catch (e) {
    return fatal(String(e.message));
  }

  if (!attachedToExisting) {
    try {
      await startServer();
    } catch (e) {
      return fatal("Sunucu modülü yüklenemedi.", String(e?.stack || e));
    }
  }

  if (!(await waitForServer())) {
    return fatal(
      `Sunucu ${PORT} portunda yanıt vermedi.`,
      "FFmpeg kurulu mu ve data klasörü yazılabilir mi kontrol edin."
    );
  }

  if (await loadUi()) {
    guardClose();
    if (!app.isPackaged) setTimeout(reportViewport, 2500);
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) { await createWindow(); await loadUi(); guardClose(); }
  });
});

// UYKU ENGELİ — Sinematik Belgesel işi 1-2 saat gözetimsiz koşuyor. Windows boşta
// uykusu CPU yüküne değil kullanıcı girdisine bakar; ne ffmpeg ne Remotion'ın Chrome'u
// güç isteği tutuyor, pilde render yarıda kalıyordu. İş süresince 'prevent-app-suspension'
// (ekran kapanabilir, sistem uyumaz). Sayaçlı: iç içe çağrılar birbirini bırakmasın.
let busyCount = 0;
let blockerId = null;
globalThis.__novaBusy = (on) => {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  try {
    if (busyCount > 0 && (blockerId === null || !powerSaveBlocker.isStarted(blockerId))) blockerId = powerSaveBlocker.start("prevent-app-suspension");
    else if (busyCount === 0 && blockerId !== null) {
      if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
  } catch {}
};

// Çıkışta ffmpeg alt süreçlerini kes — Windows'ta ebeveyn ölünce çocuklar hayatta kalır
app.on("before-quit", () => { try { globalThis.__novaKillAll?.(); } catch {} });

// Render sürerken pencere kapanırsa uygulama da kapanır (işler diske yazılı, kaldığı yerden devam eder)
app.on("window-all-closed", () => app.quit());
