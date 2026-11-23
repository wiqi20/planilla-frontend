// QA independiente del cambio "comodín por sistema" (mover-comodin.md de STICR_landingpage, 3.1 y 3.4 en local).
// Navegador real (Chromium) + backend REAL de la rama feat/comodin-planilla corriendo en local.
// El HTML se sirve como si fuera el host de cada caso; las llamadas a planilla-api.sticr.app se reenvían al backend
// local CONSERVANDO la cabecera Origin, así que el navegador aplica el CORS real del backend. La ficha de sticr.app
// se simula; todo lo demás de Internet se bloquea. Datos de ejemplo con prefijo "qac"; se borran al final.
// Uso:
//   PLAYWRIGHT_DIR=/opt/npm-tools/node_modules CHROME=/opt/pw-browsers/chromium AXE=/ruta/axe.min.js \
//   API_LOCAL=http://localhost:PUERTO PG_URL=postgresql://... PROVISION_SECRET=... BACKEND_DIR=/ruta/planilla-backend \
//   node qa-comodin-planilla/planilla-e2e.mjs planilla-frontend/index.html qa-comodin-planilla/capturas
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR, '/'));
const { chromium } = req('playwright');
const reqBack = createRequire(path.join(process.env.BACKEND_DIR, 'package.json'));
const { Pool } = reqBack('pg');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const CAP = process.argv[3];
fs.mkdirSync(CAP, { recursive: true });
const API = process.env.API_LOCAL;
const FICHA = 'https://sticr.app/proyectos/control-de-planilla';
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const SECRETO = process.env.PROVISION_SECRET;
const pool = new Pool({ connectionString: process.env.PG_URL });

const resultados = [];
function marcar(id, ok, detalle = '') { resultados.push({ id, ok, detalle }); console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}: ${detalle}`); }

async function provision(ruta, body) {
  const r = await fetch(API + '/api/provision' + ruta, { method: 'POST', headers: { 'content-type': 'application/json', 'x-provision-secret': SECRETO }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${ruta} ${r.status} ${await r.text()}`);
  return r.json();
}

const id = crypto.randomBytes(3).toString('hex');
const A = `qaca${id}`, B = `qacb${id}`;
const USR_A = 'duenoa', USR_B = 'duenob', CLAVE = 'clave-ejemplo-qa-9';
async function sembrar() {
  for (const [sub, nombre, usr] of [[A, 'Soda Ejemplo QA', USR_A], [B, 'Taller Ejemplo QA', USR_B]]) {
    await provision('/empresa', { nombreEmpresa: nombre, subdominio: sub, stripeSubscriptionId: `sub_${sub}` });
    await provision('/admin', { subdominio: sub, stripeSubscriptionId: `sub_${sub}`, usuario: usr, password: CLAVE });
  }
}
async function limpiar() {
  await pool.query('DELETE FROM empresas WHERE subdominio = ANY($1)', [[A, B]]);
  await pool.end();
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
async function abrir(host, { ancho = 1280, alto = 800, tema = 'light', ruta = '/', html = HTML } = {}) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema });
  const page = await ctx.newPage();
  const llamadas = [];
  const acao = [];
  const errores = [];
  const vistos = { form: false };
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.exposeBinding('__qaFormVisto', () => { vistos.form = true; });
  // Observador dentro de la página: avisa si el formulario de ingreso llega a verse en algún momento.
  await page.addInitScript(() => {
    const revisar = () => { const f = document.getElementById('loginForm'); if (f && f.offsetParent !== null) window.__qaFormVisto(); };
    new MutationObserver(revisar).observe(document, { subtree: true, childList: true, attributes: true });
    document.addEventListener('DOMContentLoaded', revisar);
  });
  await page.route('**/*', async (route) => {
    const r = route.request();
    const url = new URL(r.url());
    if (url.hostname === host.replace(/\.$/, '') || url.hostname === host) {
      if (url.pathname === ruta.split('?')[0]) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    }
    if (url.href === FICHA) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Ficha</title><h1>Control de Planilla</h1>' });
    if (url.hostname === 'planilla-api.sticr.app') {
      llamadas.push(`${r.method()} ${url.pathname}${url.search}`);
      try {
        const resp = await route.fetch({ url: API + url.pathname + url.search });
        acao.push(resp.headers()['access-control-allow-origin'] || null);
        return await route.fulfill({ response: resp });
      } catch { return; }
    }
    return route.abort('blockedbyclient').catch(() => {});
  });
  const resp = await page.goto(`https://${host}${ruta}`, { waitUntil: 'domcontentloaded' }).catch((e) => ({ error: String(e) }));
  return { ctx, page, llamadas, acao, errores, vistos, resp };
}
const listo = (page) => page.waitForFunction(() => {
  const a = document.documentElement.getAttribute('data-direccion');
  if (a === 'no-existe') return true;
  if (a === 'comprobando' || a === 'redirigiendo') return false;
  const v = (i) => { const n = document.getElementById(i); return n && n.offsetParent !== null; };
  return v('loginForm') || v('appWrap') || v('demoNoDisponible');
}, null, { timeout: 20000 });
const estado = (page) => page.evaluate(() => {
  const v = (i) => { const n = document.getElementById(i); return !!n && n.offsetParent !== null; };
  return {
    attr: document.documentElement.getAttribute('data-direccion'),
    noindex: !!document.querySelector('meta[name=robots][content=noindex]'),
    form: v('loginForm'), app: v('appWrap'), noExiste: v('direccionNoExiste'),
    texto: (document.getElementById('direccionNoExiste') || {}).innerText || '',
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    error: (document.getElementById('loginError') || {}).textContent || '',
    contratar: !!document.querySelector('#demoBanner a') && v('demoBanner') && document.querySelector('#demoBanner a').textContent.trim() === 'Contratar este sistema',
  };
});
async function axe(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
}
async function entrar(page, usuario, clave) {
  await page.fill('#loginUsuario', usuario);
  await page.fill('#loginPassword', clave);
  await page.click('#loginForm button[type=submit]');
}
const verApp = (page) => page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 15000 });
const verError = (page) => page.waitForFunction(() => { const n = document.getElementById('loginError'); return n && n.offsetParent !== null && n.textContent.length > 0; }, null, { timeout: 15000 });

try {
  await sembrar();

  // Q1. Cliente con empresa existente en el comodín nuevo: ingreso, entra, CORS real con su origen, cerrar y volver.
  {
    const host = `${A}.planilla.sticr.app`;
    const o = await abrir(host);
    await listo(o.page);
    const e = await estado(o.page);
    marcar('Q1a cliente.planilla.sticr.app (existe) muestra el ingreso, sin noindex', e.form && !e.noindex && !e.noExiste, JSON.stringify(e));
    await entrar(o.page, USR_A, CLAVE);
    await verApp(o.page);
    marcar('Q1b entra a la app', true);
    marcar('Q1c el backend responde Access-Control-Allow-Origin con el origen nuevo', o.acao.length > 0 && o.acao.every((x) => x === `https://${host}`), JSON.stringify([...new Set(o.acao)]));
    o.page.once('dialog', (d) => d.accept());
    await o.page.click('#logoutBtn');
    await o.page.waitForFunction(() => document.getElementById('loginForm').offsetParent !== null, null, { timeout: 10000 });
    await entrar(o.page, USR_A, CLAVE);
    await verApp(o.page);
    marcar('Q1d cerrar sesión y volver a entrar', true);
    marcar('Q1e sin errores de JavaScript', o.errores.length === 0, JSON.stringify(o.errores));
    await o.ctx.close();
  }

  // Q2. Aislamiento: en la dirección de A no entra el usuario de B, y la sesión de A no sirve en la dirección de B.
  {
    const o = await abrir(`${A}.planilla.sticr.app`);
    await listo(o.page);
    await entrar(o.page, USR_B, CLAVE);
    await verError(o.page);
    const e = await estado(o.page);
    marcar('Q2a en A.planilla.sticr.app el usuario de B no entra', !e.app && e.error.length > 0, e.error);
    await o.ctx.close();
    const tokA = (await (await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subdominio: A, usuario: USR_A, password: CLAVE }) })).json()).token;
    const emp = await fetch(API + '/api/admin/empresa', { headers: { authorization: `Bearer ${tokA}` } });
    const cuerpo = await emp.json();
    marcar('Q2b el token de A solo ve la empresa A', emp.status === 200 && cuerpo.subdominio === A, JSON.stringify({ status: emp.status, subdominio: cuerpo.subdominio }));
    const sinToken = await fetch(API + '/api/empleados');
    marcar('Q2c sin sesión la API responde 401', sinToken.status === 401, String(sinToken.status));
  }

  // Q3. Demo en el comodín nuevo: entra sola, sin ingreso, con el aviso de contratar; se recorre sin registrarse.
  for (const ancho of [1280, 390]) {
    const o = await abrir('demo.planilla.sticr.app', { ancho, alto: ancho === 390 ? 844 : 800 });
    await listo(o.page);
    await verApp(o.page);
    const e = await estado(o.page);
    const tabs = await o.page.$$eval('#tabsNav .tab-btn', (b) => b.map((x) => x.dataset.tab));
    let recorrido = true;
    for (const t of tabs) {
      await o.page.click(`#tabsNav .tab-btn[data-tab="${t}"]`);
      recorrido = recorrido && await o.page.isVisible(`#tab-${t}`);
    }
    marcar(`Q3 demo.planilla.sticr.app ${ancho}px: entra sola, nunca el ingreso, aviso de contratar, se recorren las pestañas`, e.app && !o.vistos.form && e.contratar && recorrido && !e.noindex && !o.llamadas.some((l) => l.includes('/direccion')),
      JSON.stringify({ app: e.app, formVisto: o.vistos.form, contratar: e.contratar, tabs, recorrido, llamadas: o.llamadas.slice(0, 4) }));
    marcar(`Q3 demo ${ancho}px sin desborde horizontal`, !e.desborde);
    await o.page.click('#tabsNav .tab-btn[data-tab="empleados"]');
    await o.page.screenshot({ path: `${CAP}/demo-${ancho}.png` });
    await o.ctx.close();
  }

  // Q4. Raíz: lleva a la ficha, nunca muestra el ingreso ni llama a la API (también con ruta y consulta).
  for (const ruta of ['/', '/?x=1']) {
    const o = await abrir('planilla.sticr.app', { ruta });
    await o.page.waitForURL(FICHA, { timeout: 10000 }).catch(() => {});
    const h = await o.page.evaluate(() => history.length);
    marcar(`Q4 planilla.sticr.app${ruta} → ficha sin ingreso ni llamadas`, o.page.url() === FICHA && !o.vistos.form && o.llamadas.length === 0 && o.errores.length === 0,
      JSON.stringify({ url: o.page.url(), formVisto: o.vistos.form, llamadas: o.llamadas, historial: h }));
    await o.ctx.close();
  }

  // Q5. Nombres de Crumble y nombres generales (nuevo y transición) → "Esta dirección no existe" sin consultar.
  for (const n of ['crumble', 'crumble-admin', 'pasteleria-demo', 'pasteleria-demo-admin', 'www', 'admin', 'api', 'app']) {
    for (const dom of ['planilla.sticr.app', 'sticr.app']) {
      const o = await abrir(`${n}.${dom}`);
      await listo(o.page);
      const e = await estado(o.page);
      marcar(`Q5 ${n}.${dom} → no existe sin consultar`, e.noExiste && e.noindex && !e.form && !o.vistos.form && o.llamadas.length === 0 && /no existe/i.test(e.texto), JSON.stringify({ llamadas: o.llamadas }));
      await o.ctx.close();
    }
  }

  // Q6. Hosts desconocidos o raros → no existe; nunca la empresa admin ni el ingreso.
  const raros = [
    `a.b.planilla.sticr.app`, `${A}.up.railway.app`, `planilla.sticr.app.ejemplo.com`, `${A}.planilla.sticr.app.ejemplo.com`,
    `xn--ejemplo.ejemplo.com`, `planilla-api.planilla.sticr.app`, `libre${id}.planilla.sticr.app`, `sticr.app`,
    `demo.planilla.sticr.app.`, `${A}.planilla.sticr.app.`, `ejemplo.com`,
  ];
  for (const host of raros) {
    const o = await abrir(host);
    if (o.resp && o.resp.error) { marcar(`Q6 ${host}`, false, o.resp.error); await o.ctx.close(); continue; }
    await listo(o.page).catch(() => {});
    const e = await estado(o.page);
    const loginAdmin = o.llamadas.some((l) => l.includes('/login'));
    marcar(`Q6 ${host} → no existe, noindex, sin ingreso ni admin`, e.noExiste && e.noindex && !o.vistos.form && !loginAdmin, JSON.stringify({ llamadas: o.llamadas, attr: e.attr }));
    await o.ctx.close();
  }

  // Q7. Transición: cliente.sticr.app y demo.sticr.app siguen funcionando con el backend real (CORS viejo).
  {
    const o = await abrir(`${B}.sticr.app`);
    await listo(o.page);
    const e = await estado(o.page);
    await entrar(o.page, USR_B, CLAVE);
    await verApp(o.page);
    marcar('Q7a TRANSICIÓN cliente.sticr.app ve el ingreso y entra', e.form && !e.noindex, JSON.stringify({ acao: [...new Set(o.acao)] }));
    await o.ctx.close();
    const d = await abrir('demo.sticr.app');
    await listo(d.page);
    await verApp(d.page);
    marcar('Q7b TRANSICIÓN demo.sticr.app entra sola', !d.vistos.form, JSON.stringify({ acao: [...new Set(d.acao)] }));
    await d.ctx.close();
  }

  // Q8. Capturas, axe y teclado de "no existe" en 1280 y 390 px con el host nuevo.
  for (const ancho of [1280, 390]) {
    for (const tema of ['light', 'dark']) {
      const o = await abrir(`libre${id}.planilla.sticr.app`, { ancho, alto: ancho === 390 ? 844 : 800, tema });
      await listo(o.page);
      const e = await estado(o.page);
      const v = await axe(o.page);
      await o.page.keyboard.press('Tab');
      const foco = await o.page.evaluate(() => ({ tag: document.activeElement.tagName, texto: document.activeElement.textContent.trim(), outline: getComputedStyle(document.activeElement).outlineStyle }));
      marcar(`Q8 no existe ${ancho}px ${tema}: sin desborde, axe limpio, Tab llega al enlace`, !e.desborde && v.length === 0 && foco.tag === 'A' && foco.outline !== 'none', JSON.stringify({ axe: v, foco }));
      await o.page.screenshot({ path: `${CAP}/no-existe-${ancho}-${tema}.png`, fullPage: true });
      await o.ctx.close();
    }
  }
  // Q10. Etiqueta de 63 caracteres (máximo DNS) que no existe, en 390 px: el host largo no desborda.
  {
    const largo = ('l' + id + 'x'.repeat(63)).slice(0, 63);
    const o = await abrir(`${largo}.planilla.sticr.app`, { ancho: 390, alto: 844 });
    await listo(o.page);
    const e = await estado(o.page);
    marcar('Q10 etiqueta de 63 caracteres en 390 px → no existe sin desborde', e.noExiste && !e.desborde, JSON.stringify({ desborde: e.desborde, llamadas: o.llamadas }));
    await o.page.screenshot({ path: `${CAP}/no-existe-63-390.png` });
    await o.ctx.close();
  }
  // axe en la demo (host nuevo)
  {
    const o = await abrir('demo.planilla.sticr.app');
    await listo(o.page); await verApp(o.page);
    const v = await axe(o.page);
    marcar('Q9 axe en la demo (1280 px)', v.length === 0, JSON.stringify(v));
    await o.ctx.close();
    // Referencia: la misma revisión con el index.html de main en demo.sticr.app (¿la falla ya existía?).
    if (process.env.HTML_MAIN) {
      const m = await abrir('demo.sticr.app', { html: fs.readFileSync(process.env.HTML_MAIN, 'utf8') });
      await listo(m.page); await verApp(m.page);
      const vm = await axe(m.page);
      console.log(`info Q9-ref axe en la demo con main (demo.sticr.app): ${JSON.stringify(vm)}`);
      await m.ctx.close();
    }
  }
} finally {
  await browser.close();
  await limpiar();
}
const fallas = resultados.filter((r) => !r.ok);
fs.writeFileSync(path.join(CAP, 'resultados.json'), JSON.stringify(resultados, null, 2));
console.log(`\n${resultados.length - fallas.length} de ${resultados.length} ok`);
process.exit(fallas.length ? 1 : 0);
