// Prueba de navegador: dirección sin cliente de Planilla vs. cliente real.
// El HTML se sirve como si fuera <nombre>.sticr.app y la API se SIMULA con page.route (no toca la API real).
// Uso (Playwright instalado aparte; este repositorio no tiene dependencias):
//   PLAYWRIGHT_DIR=/ruta/a/node_modules CHROME=/usr/bin/google-chrome \
//   node pruebas/direccion-inexistente.mjs planilla-frontend/index.html docs/subdominio-inexistente/capturas
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

async function abrir(host, { api = 'existe', ancho = 1280, alto = 800, tema = 'light', demora = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema });
  const page = await ctx.newPage();
  const llamadas = [];
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === host) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    if (url.hostname === 'planilla-api.sticr.app') {
      llamadas.push(url.pathname + url.search);
      if (demora) await new Promise((r) => setTimeout(r, demora));
      const cors = { 'Access-Control-Allow-Origin': `https://${host}` };
      if (url.pathname === '/api/auth/direccion') {
        if (api === 'red') return route.abort('failed');
        if (api === '429') return route.fulfill({ status: 429, headers: cors, contentType: 'application/json', body: '{"error":"Demasiadas consultas"}' });
        if (api === '500') return route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"error":"x"}' });
        if (api === 'raro') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"existe":"no"}' });
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ existe: api === 'existe' }) });
      }
      if (url.pathname === '/api/auth/login' && route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST' } });
      }
      return route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: '{"error":"sin demo"}' });
    }
    // Fuentes y CDN: se dejan pasar; si fallan, el texto usa la fuente de respaldo.
    return route.continue().catch(() => {});
  });
  await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded' });
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

await caso('crumble.sticr.app: no existe sin consultar la API, noindex, sin formulario', async () => {
  const { ctx, page, llamadas, errores } = await abrir('crumble.sticr.app');
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(300);
  const e = await estado(page);
  assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false);
  assert.equal(e.noExisteVisible, true); assert.equal(e.nombre, 'crumble.sticr.app');
  assert.equal(e.titulo, 'Esta dirección no existe — STI'); assert.equal(e.desborde, false);
  assert.deepEqual(llamadas, []); assert.deepEqual(errores, []);
  const h1 = await page.locator('h1:visible').allTextContents(); assert.deepEqual(h1, ['Esta dirección no existe']);
  assert.equal(await page.locator('a.enlace-cta').getAttribute('href'), 'https://sticr.app');
  // Teclado: el primer Tab llega al enlace, con foco visible.
  await page.keyboard.press('Tab');
  const foco = await page.evaluate(() => ({ txt: document.activeElement.textContent, outline: getComputedStyle(document.activeElement).outlineStyle }));
  assert.equal(foco.txt, 'Ir a sticr.app'); assert.notEqual(foco.outline, 'none');
  await page.screenshot({ path: `${CAPTURAS}/no-existe-1280-claro.png`, fullPage: true });
  await ctx.close();
});

for (const host of ['crumble-admin.sticr.app', 'pasteleria-demo.sticr.app', 'pasteleria-demo-admin.sticr.app', 'www.sticr.app', 'admin.sticr.app', 'api.sticr.app', 'app.sticr.app']) {
  await caso(`${host}: no existe sin consultar la API`, async () => {
    const { ctx, page, llamadas } = await abrir(host);
    await page.waitForTimeout(400);
    const e = await estado(page);
    assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false); assert.deepEqual(llamadas, []);
    await ctx.close();
  });
}

await caso('noexiste.sticr.app (API: existe false): no existe, noindex, sin formulario; capturas', async () => {
  for (const [ancho, alto, tema] of [[1280, 800, 'light'], [1280, 800, 'dark'], [390, 844, 'light'], [390, 844, 'dark']]) {
    const { ctx, page, llamadas, errores } = await abrir('noexiste.sticr.app', { api: 'no', ancho, alto, tema });
    await esperarFin(page);
    await page.waitForTimeout(300);
    const e = await estado(page);
    assert.equal(e.attr, 'no-existe'); assert.equal(e.robots, true); assert.equal(e.hayForm, false); assert.equal(e.desborde, false);
    assert.deepEqual(llamadas, ['/api/auth/direccion?valor=noexiste']); assert.deepEqual(errores, []);
    if (ancho === 390) {
      const alturaEnlace = await page.locator('a.enlace-cta').evaluate((a) => a.getBoundingClientRect().height);
      assert.ok(alturaEnlace >= 44, `enlace de ${alturaEnlace}px`);
    }
    await page.screenshot({ path: `${CAPTURAS}/no-existe-${ancho}-${tema === 'light' ? 'claro' : 'oscuro'}.png`, fullPage: true });
    await ctx.close();
  }
});

await caso('cliente.sticr.app mientras la API responde: "Cargando…", sin formulario visible', async () => {
  const { ctx, page } = await abrir('cliente.sticr.app', { api: 'existe', demora: 2500 });
  await page.waitForTimeout(500);
  const e = await estado(page);
  assert.equal(e.attr, 'comprobando'); assert.equal(e.formVisible, false); assert.equal(e.robots, true);
  assert.equal(await page.locator('#direccionComprobando').isVisible(), true);
  await page.screenshot({ path: `${CAPTURAS}/comprobando-1280.png` });
  await ctx.close();
  const m = await abrir('cliente.sticr.app', { api: 'existe', demora: 2500, ancho: 390, alto: 844 });
  await m.page.waitForTimeout(500);
  await m.page.screenshot({ path: `${CAPTURAS}/comprobando-390.png` });
  await m.ctx.close();
});

await caso('cliente.sticr.app (API: existe true): formulario de ingreso, sin noindex', async () => {
  for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
    const { ctx, page, llamadas, errores } = await abrir('cliente.sticr.app', { api: 'existe', ancho, alto });
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

for (const api of ['red', '429', '500', 'raro']) {
  await caso(`cliente.sticr.app con la comprobación fallida (${api}): sigue al ingreso de siempre`, async () => {
    const { ctx, page } = await abrir('cliente.sticr.app', { api });
    await esperarFin(page);
    await page.waitForTimeout(300);
    const e = await estado(page);
    assert.equal(e.attr, null); assert.equal(e.formVisible, true); assert.equal(e.robots, false);
    await ctx.close();
  });
}

await caso('planilla.sticr.app: ingreso de siempre, sin consultar /direccion ni noindex', async () => {
  const { ctx, page, llamadas } = await abrir('planilla.sticr.app');
  await page.waitForTimeout(800);
  const e = await estado(page);
  assert.equal(e.attr, null); assert.equal(e.formVisible, true); assert.equal(e.robots, false);
  assert.ok(!llamadas.some((l) => l.startsWith('/api/auth/direccion')), JSON.stringify(llamadas));
  await ctx.close();
});

await caso('demo.sticr.app: flujo de la demo, sin consultar /direccion ni noindex, nunca el formulario', async () => {
  const { ctx, page, llamadas } = await abrir('demo.sticr.app');
  await page.waitForTimeout(1500);
  const e = await estado(page);
  assert.equal(e.attr, null); assert.equal(e.formVisible, false); assert.equal(e.robots, false);
  assert.ok(!llamadas.some((l) => l.startsWith('/api/auth/direccion')), JSON.stringify(llamadas));
  assert.ok(llamadas.includes('/api/auth/login'), JSON.stringify(llamadas));
  await ctx.close();
});

// QA-03: subtítulo y etiquetas del ingreso con contraste de al menos 4.5:1 en los dos temas.
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
for (const tema of ['light', 'dark']) {
  await caso(`ingreso (${tema}): subtítulo y etiquetas con contraste >= 4.5:1`, async () => {
    const { ctx, page } = await abrir('planilla.sticr.app', { tema });
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
