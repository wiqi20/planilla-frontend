// Prueba de navegador: cómo se trata cada dirección (docs/proyectos/planilla/mover-comodin.md de STICR_landingpage, 3.1).
// El HTML se sirve como si fuera <nombre>.planilla.sticr.app (u otro host) y la API se SIMULA con page.route
// (no toca la API real). La demo usa datos de ejemplo simulados en este archivo.
// Uso (Playwright instalado aparte; este repositorio no tiene dependencias):
//   PLAYWRIGHT_DIR=/ruta/a/node_modules CHROME=/usr/bin/google-chrome \
//   node pruebas/direccion-inexistente.mjs planilla-frontend/index.html docs/comodin-planilla/capturas
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd() + '/node_modules', '/'));
const { chromium } = require('playwright');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const CAPTURAS = process.argv[3];
fs.mkdirSync(CAPTURAS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });

const FICHA = 'https://sticr.app/proyectos/control-de-planilla';
// Cuerpos de la demo simulada (datos de ejemplo, solo para esta prueba).
const loginDemo = [];
const DEMO = {
  '/api/auth/login': { token: 'token-de-prueba', empresa: { subdominio: 'demo', nombre: 'Demo de Planilla' }, usuario: { usuario: 'demo' } },
  '/api/empleados': [
    { id: 1, nombre: 'Ana Ejemplo Mora', correo: 'ana@ejemplo.com', salario: 650000, fecha_ingreso: '2023-02-01', vacaciones_disponibles: 6 },
    { id: 2, nombre: 'Luis Ejemplo Rojas', correo: '', salario: 480000, fecha_ingreso: '2024-07-15', vacaciones_disponibles: 2 },
  ],
  '/api/admin/empresa': { nombre: 'Demo de Planilla', correo_admin: '', subdominio: 'demo' },
  '/api/admin/usuarios': [{ id: 1, usuario: 'demo' }],
};

async function abrir(host, { api = 'existe', ancho = 1280, alto = 800, tema = 'light', demora = 0, demoraFicha = 0, demo = false, protocolo = 'https', esperar = 'domcontentloaded' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema });
  const page = await ctx.newPage();
  const llamadas = [];
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === host && url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    if (url.href === FICHA) {
      if (demoraFicha) await new Promise((r) => setTimeout(r, demoraFicha));
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Ficha</title><h1>Control de Planilla</h1>' }).catch(() => {});
    }
    if (url.hostname === 'planilla-api.sticr.app') {
      const metodo = route.request().method();
      const cors = { 'Access-Control-Allow-Origin': `${protocolo}://${host}` };
      if (metodo === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' } });
      }
      llamadas.push(url.pathname + url.search);
      if (demora) await new Promise((r) => setTimeout(r, demora));
      if (demo && url.pathname in DEMO) {
        if (url.pathname === '/api/auth/login') loginDemo.push(route.request().postData());
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(DEMO[url.pathname]) });
      }
      if (demo) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
      if (url.pathname === '/api/auth/direccion') {
        if (api === 'red') return route.abort('failed');
        if (api === '429') return route.fulfill({ status: 429, headers: cors, contentType: 'application/json', body: '{"error":"Demasiadas consultas"}' });
        if (api === '500') return route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"error":"x"}' });
        if (api === 'raro') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"existe":"no"}' });
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ existe: api === 'existe' }) });
      }
      return route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: '{"error":"sin demo"}' });
    }
    // Fuentes y CDN: se dejan pasar; si fallan, el texto usa la fuente de respaldo.
    return route.continue().catch(() => {});
  });
  await page.goto(`${protocolo}://${host}/`, { waitUntil: esperar });
  return { ctx, page, llamadas, errores };
}

const estado = (page) => page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-direccion'),
  robots: !!document.querySelector('meta[name=robots][content=noindex]'),
  hayForm: !!document.getElementById('loginForm'),
  formVisible: !!document.getElementById('loginForm') && document.getElementById('loginForm').offsetParent !== null,
  noExisteVisible: document.getElementById('direccionNoExiste').offsetParent !== null,
  titulo: document.title,
  nombre: document.getElementById('direccionNombre').textContent,
  desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
const esperarFin = (page) => page.waitForFunction(() => document.documentElement.getAttribute('data-direccion') !== 'comprobando', null, { timeout: 15000 });

const resultados = [];
async function caso(nombre, fn) {
  try { await fn(); resultados.push(`ok   ${nombre}`); } catch (e) { resultados.push(`FALLA ${nombre}: ${e.message}`); }
}

// Hosts de clientes: comodín nuevo (*.planilla.sticr.app). Los casos de la forma vieja (*.sticr.app) están al final,
// marcados como TRANSICIÓN.
await caso('crumble.planilla.sticr.app: no existe sin consultar la API, noindex, sin formulario', async () => {
  const { ctx, page, llamadas, errores } = await abrir('crumble.planilla.sticr.app');
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(300);
  const e = await estado(page);
  assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false);
  assert.equal(e.noExisteVisible, true); assert.equal(e.nombre, 'crumble.planilla.sticr.app');
  assert.equal(e.titulo, 'Esta dirección no existe — STI'); assert.equal(e.desborde, false);
  assert.deepEqual(llamadas, []); assert.deepEqual(errores, []);
  const h1 = await page.locator('h1:visible').allTextContents(); assert.deepEqual(h1, ['Esta dirección no existe']);
  assert.equal(await page.locator('a.enlace-cta').getAttribute('href'), 'https://sticr.app');
  // Teclado: el primer Tab llega al enlace, con foco visible.
  await page.keyboard.press('Tab');
  const foco = await page.evaluate(() => ({ txt: document.activeElement.textContent, outline: getComputedStyle(document.activeElement).outlineStyle }));
  assert.equal(foco.txt, 'Ir a sticr.app'); assert.notEqual(foco.outline, 'none');
  await ctx.close();
});

for (const nombre of ['crumble-admin', 'pasteleria-demo', 'pasteleria-demo-admin', 'www', 'admin', 'api', 'app']) {
  const host = `${nombre}.planilla.sticr.app`;
  await caso(`${host}: no existe sin consultar la API`, async () => {
    const { ctx, page, llamadas } = await abrir(host);
    await page.waitForTimeout(400);
    const e = await estado(page);
    assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false); assert.deepEqual(llamadas, []);
    await ctx.close();
  });
}

// Hosts que no son de Planilla: nunca entran a la empresa 'admin' ni consultan la API.
for (const host of ['a.b.planilla.sticr.app', 'cliente.up.railway.app', 'planilla.sticr.app.ejemplo.com', 'xplanilla.sticr.app.ejemplo.com',
  '-x.planilla.sticr.app', 'sticr.app.ejemplo.com', 'ejemplo.com']) {
  await caso(`${host}: no existe, noindex, sin consultar la API ni entrar a admin`, async () => {
    const { ctx, page, llamadas, errores } = await abrir(host);
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(400);
    const e = await estado(page);
    assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false); assert.equal(e.noExisteVisible, true);
    assert.equal(e.nombre, host); assert.deepEqual(llamadas, []); assert.deepEqual(errores, []);
    await ctx.close();
  });
}

await caso('noexiste.planilla.sticr.app (API: existe false): no existe, noindex, sin formulario; capturas', async () => {
  for (const [ancho, alto, tema] of [[1280, 800, 'light'], [1280, 800, 'dark'], [390, 844, 'light'], [390, 844, 'dark']]) {
    const { ctx, page, llamadas, errores } = await abrir('noexiste.planilla.sticr.app', { api: 'no', ancho, alto, tema });
    await esperarFin(page);
    await page.waitForTimeout(300);
    const e = await estado(page);
    assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false); assert.equal(e.desborde, false);
    assert.equal(e.nombre, 'noexiste.planilla.sticr.app');
    assert.deepEqual(llamadas, ['/api/auth/direccion?valor=noexiste']); assert.deepEqual(errores, []);
    if (ancho === 390) {
      const alturaEnlace = await page.locator('a.enlace-cta').evaluate((a) => a.getBoundingClientRect().height);
      assert.ok(alturaEnlace >= 44, `enlace de ${alturaEnlace}px`);
    }
    await page.screenshot({ path: `${CAPTURAS}/no-existe-${ancho}-${tema === 'light' ? 'claro' : 'oscuro'}.png`, fullPage: true });
    await ctx.close();
  }
});

await caso('cliente.planilla.sticr.app mientras la API responde: "Cargando…", sin formulario visible', async () => {
  const { ctx, page } = await abrir('cliente.planilla.sticr.app', { api: 'existe', demora: 2500 });
  await page.waitForTimeout(500);
  const e = await estado(page);
  assert.equal(e.attr, 'comprobando'); assert.equal(e.formVisible, false); assert.equal(e.robots, true);
  assert.equal(await page.locator('#direccionComprobando').isVisible(), true);
  await page.screenshot({ path: `${CAPTURAS}/comprobando-1280.png` });
  await ctx.close();
  const m = await abrir('cliente.planilla.sticr.app', { api: 'existe', demora: 2500, ancho: 390, alto: 844 });
  await m.page.waitForTimeout(500);
  await m.page.screenshot({ path: `${CAPTURAS}/comprobando-390.png` });
  await m.ctx.close();
});

await caso('cliente.planilla.sticr.app (API: existe true): formulario de ingreso, sin noindex', async () => {
  for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
    const { ctx, page, llamadas, errores } = await abrir('cliente.planilla.sticr.app', { api: 'existe', ancho, alto });
    await esperarFin(page);
    await page.waitForTimeout(300);
    const e = await estado(page);
    assert.equal(e.attr, null); assert.equal(e.robots, false); assert.equal(e.formVisible, true); assert.equal(e.noExisteVisible, false);
    assert.equal(e.titulo, 'Planilla — Control de Nómina');
    assert.deepEqual(llamadas, ['/api/auth/direccion?valor=cliente']); assert.deepEqual(errores, []);
    await page.screenshot({ path: `${CAPTURAS}/cliente-existe-${ancho}.png` });
    await ctx.close();
  }
});

await caso('cliente.planilla.sticr.app: el ingreso manda la empresa "cliente"', async () => {
  const { ctx, page } = await abrir('cliente.planilla.sticr.app', { api: 'existe' });
  await esperarFin(page);
  const cuerpo = page.waitForRequest((r) => r.url().endsWith('/api/auth/login') && r.method() === 'POST', { timeout: 5000 });
  await page.fill('#loginUsuario', 'dueno'); await page.fill('#loginPassword', 'x');
  await page.click('#loginForm button[type=submit]');
  assert.equal(JSON.parse((await cuerpo).postData()).subdominio, 'cliente');
  await ctx.close();
});

for (const api of ['red', '429', '500', 'raro']) {
  await caso(`cliente.planilla.sticr.app con la comprobación fallida (${api}): sigue al ingreso de siempre`, async () => {
    const { ctx, page } = await abrir('cliente.planilla.sticr.app', { api });
    await esperarFin(page);
    await page.waitForTimeout(300);
    const e = await estado(page);
    assert.equal(e.attr, null); assert.equal(e.formVisible, true); assert.equal(e.robots, false);
    await ctx.close();
  });
}

await caso('planilla.sticr.app (raíz): lleva a la ficha con replace y noindex; el ingreso nunca se ve; sin llamadas a la API', async () => {
  // Chrome descarta la página de planilla.sticr.app apenas empieza la navegación a la ficha (no llega a pintarse),
  // así que su estado se lee desde adentro, mientras se arma el documento: cada cambio del DOM informa a la prueba.
  const informes = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.exposeBinding('__informar', (_origen, dato) => { informes.push(dato); });
  await ctx.addInitScript(() => {
    if (location.hostname !== 'planilla.sticr.app') return;
    const mirar = () => {
      const visible = (id) => { const n = document.getElementById(id); return n ? getComputedStyle(n).display !== 'none' : null; };
      window.__informar({
        attr: document.documentElement.getAttribute('data-direccion'),
        robots: !!document.querySelector('meta[name=robots][content=noindex]'),
        ingreso: visible('loginGate'), app: visible('appWrap'), noExiste: visible('direccionNoExiste'),
      });
    };
    new MutationObserver(mirar).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const llamadas = []; const errores = []; const navegaciones = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navegaciones.push(f.url()); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === 'https://planilla.sticr.app/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    if (url.href === FICHA) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Ficha</title><h1>Control de Planilla</h1>' });
    if (url.hostname === 'planilla-api.sticr.app') { llamadas.push(url.pathname); return route.abort(); }
    return route.abort().catch(() => {});
  });
  await page.goto('https://planilla.sticr.app/', { waitUntil: 'commit' });
  await page.waitForURL(FICHA, { timeout: 10000 });
  await page.waitForTimeout(500);
  assert.equal(page.url(), FICHA);
  assert.deepEqual(navegaciones, ['https://planilla.sticr.app/', FICHA]);
  const conAttr = informes.filter((i) => i.attr !== null);
  assert.ok(conAttr.length > 0, 'no llegó ningún informe con data-direccion');
  assert.ok(informes.every((i) => i.ingreso !== true && i.app !== true && i.noExiste !== true), JSON.stringify(informes));
  assert.ok(conAttr.every((i) => i.attr === 'redirigiendo' && i.robots), JSON.stringify(conAttr));
  assert.deepEqual(llamadas, []); assert.deepEqual(errores, []);
  await page.screenshot({ path: `${CAPTURAS}/raiz-llega-a-la-ficha-1280.png` });
  // Chrome convierte en reemplazo cualquier navegación sin gesto antes de cargar, así que el navegador no distingue
  // replace de assign: se comprueba también en el código.
  assert.ok(HTML.includes('location.replace(FICHA)'), 'la raíz debe usar location.replace');
  // replace: «Atrás» no vuelve a planilla.sticr.app (que volvería a mandar a la ficha).
  await page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null);
  await page.waitForTimeout(300);
  assert.equal(navegaciones.filter((u) => u === 'https://planilla.sticr.app/').length, 1, `Atrás volvió a planilla.sticr.app: ${JSON.stringify(navegaciones)}`);
  await ctx.close();
});

await caso('demo.planilla.sticr.app: flujo de la demo, sin consultar /direccion ni noindex, nunca el formulario; capturas', async () => {
  for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
    const { ctx, page, llamadas, errores } = await abrir('demo.planilla.sticr.app', { ancho, alto, demo: true });
    await page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const e = await estado(page);
    assert.equal(e.attr, null); assert.equal(e.formVisible, false); assert.equal(e.robots, false); assert.equal(e.desborde, false);
    assert.ok(!llamadas.some((l) => l.startsWith('/api/auth/direccion')), JSON.stringify(llamadas));
    assert.ok(llamadas.includes('/api/auth/login'), JSON.stringify(llamadas));
    assert.equal(JSON.parse(loginDemo.at(-1)).subdominio, 'demo');
    assert.deepEqual(errores, []);
    await page.screenshot({ path: `${CAPTURAS}/demo-${ancho}.png` });
    await ctx.close();
  }
});

await caso('demo.planilla.sticr.app con la API sin demo: aviso "La demo no está disponible", nunca el formulario', async () => {
  const { ctx, page } = await abrir('demo.planilla.sticr.app');
  await page.waitForFunction(() => document.getElementById('demoNoDisponible').offsetParent !== null, null, { timeout: 15000 });
  const e = await estado(page);
  assert.equal(e.formVisible, false);
  await ctx.close();
});

await caso('localhost: modo de desarrollo (empresa admin), sin consultar /direccion ni noindex', async () => {
  const { ctx, page, llamadas } = await abrir('localhost', { protocolo: 'http' });
  await page.waitForTimeout(800);
  const e = await estado(page);
  assert.equal(e.attr, null); assert.equal(e.formVisible, true); assert.equal(e.robots, false);
  assert.ok(!llamadas.some((l) => l.startsWith('/api/auth/direccion')), JSON.stringify(llamadas));
  const cuerpo = page.waitForRequest((r) => r.url().endsWith('/api/auth/login') && r.method() === 'POST', { timeout: 5000 });
  await page.fill('#loginUsuario', 'dueno'); await page.fill('#loginPassword', 'x');
  await page.click('#loginForm button[type=submit]');
  assert.equal(JSON.parse((await cuerpo).postData()).subdominio, 'admin');
  await ctx.close();
});

// ---- TRANSICIÓN: QUITAR EN EL PASO 8 de mover-comodin.md. Entonces cliente.sticr.app y demo.sticr.app pasan a
// "Esta dirección no existe" sin consultar la API (agregar esos casos a la lista de hosts desconocidos). ----
await caso('TRANSICIÓN cliente.sticr.app (API: existe true): formulario de ingreso con la empresa "cliente"', async () => {
  const { ctx, page, llamadas } = await abrir('cliente.sticr.app', { api: 'existe' });
  await esperarFin(page);
  await page.waitForTimeout(300);
  const e = await estado(page);
  assert.equal(e.attr, null); assert.equal(e.formVisible, true); assert.equal(e.robots, false);
  assert.deepEqual(llamadas, ['/api/auth/direccion?valor=cliente']);
  await ctx.close();
});
await caso('TRANSICIÓN noexiste.sticr.app (API: existe false): no existe', async () => {
  const { ctx, page } = await abrir('noexiste.sticr.app', { api: 'no' });
  await esperarFin(page);
  const e = await estado(page);
  assert.equal(e.attr, 'no-existe'); assert.equal(e.hayForm, false);
  await ctx.close();
});
await caso('TRANSICIÓN crumble.sticr.app: no existe sin consultar la API', async () => {
  const { ctx, page, llamadas } = await abrir('crumble.sticr.app');
  await page.waitForTimeout(400);
  const e = await estado(page);
  assert.equal(e.attr, 'no-existe'); assert.deepEqual(llamadas, []);
  await ctx.close();
});
await caso('TRANSICIÓN demo.sticr.app: la demo entra sola', async () => {
  const { ctx, page, llamadas } = await abrir('demo.sticr.app', { demo: true });
  await page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 15000 });
  const e = await estado(page);
  assert.equal(e.formVisible, false); assert.equal(e.robots, false);
  assert.ok(!llamadas.some((l) => l.startsWith('/api/auth/direccion')), JSON.stringify(llamadas));
  await ctx.close();
});
await caso('TRANSICIÓN planilla-api.sticr.app: ya no entra a admin; consulta y muestra no existe', async () => {
  const { ctx, page } = await abrir('planilla-api.sticr.app', { api: 'no' });
  await esperarFin(page);
  const e = await estado(page);
  assert.equal(e.attr, 'no-existe'); assert.equal(e.hayForm, false);
  await ctx.close();
});
// ---- fin TRANSICIÓN ----

// QA-03: subtítulo y etiquetas del ingreso con contraste de al menos 4.5:1 en los dos temas.
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
for (const tema of ['light', 'dark']) {
  await caso(`ingreso (${tema}): subtítulo y etiquetas con contraste >= 4.5:1`, async () => {
    const { ctx, page } = await abrir('cliente.planilla.sticr.app', { tema });
    await esperarFin(page);
    await page.waitForTimeout(500);
    const fondo = await page.locator('#loginGate .login-card').evaluate((e) => getComputedStyle(e).backgroundColor);
    for (const sel of ['#gateSubtitle', 'label[for=loginUsuario]', 'label[for=loginPassword]']) {
      const color = await page.locator(sel).evaluate((e) => getComputedStyle(e).color);
      const r = contraste(color, fondo);
      assert.ok(r >= 4.5, `${sel}: ${r.toFixed(2)}:1`);
    }
    await page.screenshot({ path: `${CAPTURAS}/ingreso-${tema === 'light' ? 'claro' : 'oscuro'}-1280.png` });
    await ctx.close();
  });
}

await browser.close();
console.log(resultados.join('\n'));
if (resultados.some((r) => r.startsWith('FALLA'))) process.exit(1);
