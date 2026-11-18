// QA independiente del cambio "subdominio inexistente": navegador real (Chromium) + backend REAL en local.
// El HTML se sirve como <nombre>.sticr.app y las llamadas a planilla-api.sticr.app se reenvían al backend local
// (no se toca la API de producción). Todo lo demás de Internet se bloquea.
// Uso:
//   PLAYWRIGHT_DIR=/opt/npm-tools/node_modules AXE=/ruta/axe-core/axe.min.js API_LOCAL=http://localhost:4777 \
//   PG_URL=postgresql://postgres@localhost:57311/qa_test PROVISION_SECRET=... \
//   node qa-subdominio-inexistente/e2e-backend-real.mjs planilla-frontend/index.html docs/subdominio-inexistente/qa-capturas
// El backend debe correr con DEMO_ENABLED=true y la misma PROVISION_SECRET. La prueba crea sus empresas (prefijo qae)
// y las borra al final.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd() + '/node_modules', '/'));
const { chromium } = req('playwright');
const reqBack = createRequire(path.join(process.env.BACKEND_DIR, 'package.json'));
const { Pool } = reqBack('pg');
const bcrypt = reqBack('bcryptjs');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const CAP = process.argv[3];
fs.mkdirSync(CAP, { recursive: true });
const API = process.env.API_LOCAL;
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const SECRETO = process.env.PROVISION_SECRET;
const pool = new Pool({ connectionString: process.env.PG_URL });

const resultados = [];
let totalDireccion = 0;
function marcar(id, ok, detalle) { resultados.push({ id, ok, detalle }); console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}: ${detalle}`); }

async function provision(ruta, body) {
  const r = await fetch(API + '/api/provision' + ruta, { method: 'POST', headers: { 'content-type': 'application/json', 'x-provision-secret': SECRETO }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${ruta} ${r.status} ${await r.text()}`);
  return r.json();
}

// ---------- Datos de ejemplo ----------
const id = crypto.randomBytes(3).toString('hex');
const ACTIVA = `qaea${id}`, SUSP = `qaes${id}`, CLAVE = 'clave-de-ejemplo-qa-1';
const LEGADO_CORTO = 'q8', LEGADO_RESERVADO = 'ayuda';
async function sembrar() {
  for (const [sub, nombre] of [[ACTIVA, 'Panadería Ejemplo QA'], [SUSP, 'Ferretería Ejemplo QA']]) {
    await provision('/empresa', { nombreEmpresa: nombre, subdominio: sub, stripeSubscriptionId: `sub_${sub}` });
    await provision('/admin', { subdominio: sub, stripeSubscriptionId: `sub_${sub}`, usuario: 'dueno', password: CLAVE });
  }
  await provision('/estado', { stripeSubscriptionId: `sub_${SUSP}`, activa: false });
  // Empresa 'admin' (la de planilla.sticr.app, la crea db/seed-admin.js) y dos "heredadas" (nombres que el registro
  // público aceptaba antes o que seed-admin acepta sin validar).
  const hash = await bcrypt.hash(CLAVE, 10);
  for (const sub of ['admin', LEGADO_CORTO, LEGADO_RESERVADO]) {
    const e = await pool.query("INSERT INTO empresas (nombre, subdominio) VALUES ($1, $2) ON CONFLICT (subdominio) DO UPDATE SET activa = true RETURNING id", [`QA ${sub}`, sub]);
    await pool.query("DELETE FROM usuarios WHERE empresa_id = $1", [e.rows[0].id]);
    await pool.query("INSERT INTO usuarios (empresa_id, usuario, password_hash) VALUES ($1, 'dueno', $2)", [e.rows[0].id, hash]);
  }
}
async function limpiar() {
  await pool.query("DELETE FROM empresas WHERE subdominio = ANY($1)", [[ACTIVA, SUSP, 'admin', LEGADO_CORTO, LEGADO_RESERVADO]]);
  await pool.end();
}

// ---------- Navegador ----------
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
async function abrir(host, { ancho = 1280, alto = 800, tema = 'light', apiCaida = false, storage } = {}) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema, storageState: storage });
  const page = await ctx.newPage();
  const llamadas = [];
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.route('**/*', async (route) => {
    const r = route.request();
    const url = new URL(r.url());
    if (url.hostname === host && url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    if (url.hostname === 'planilla-api.sticr.app') {
      llamadas.push(`${r.method()} ${url.pathname}${url.search}`);
      if (url.pathname === '/api/auth/direccion' && r.method() === 'GET') totalDireccion++;
      if (apiCaida) return route.abort('connectionrefused');
      try {
        const resp = await route.fetch({ url: API + url.pathname + url.search });
        return await route.fulfill({ response: resp });
      } catch { return; } // el contexto se cerró a mitad de la llamada (fin de un caso)
    }
    return route.abort('blockedbyclient').catch(() => {}); // fuentes/CDN: fuera; el texto usa la fuente de respaldo
  });
  await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded' });
  return { ctx, page, llamadas, errores };
}
const listo = (page) => page.waitForFunction(() => {
  const a = document.documentElement.getAttribute('data-direccion');
  if (a === 'no-existe') return true;
  if (a === 'comprobando') return false;
  const v = (id) => { const n = document.getElementById(id); return n && n.offsetParent !== null; };
  return v('loginForm') || v('appWrap') || v('demoNoDisponible');
}, null, { timeout: 20000 });
const estado = (page) => page.evaluate(() => {
  const v = (id) => { const n = document.getElementById(id); return !!n && n.offsetParent !== null; };
  const enlace = document.querySelector('#direccionNoExiste a');
  return {
    attr: document.documentElement.getAttribute('data-direccion'),
    noindex: !!document.querySelector('meta[name=robots][content=noindex]'),
    formEnDom: !!document.getElementById('loginForm'),
    form: v('loginForm'), app: v('appWrap'), noExiste: v('direccionNoExiste'),
    titulo: document.title, href: enlace && enlace.getAttribute('href'), texto: enlace && enlace.textContent.trim(),
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    error: (document.getElementById('loginError') || {}).textContent || '',
  };
});
async function axe(page) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations
    .map((v) => `${v.id}(${v.impact}) x${v.nodes.length}`));
  return r;
}
async function entrar(page, usuario, clave) {
  await page.fill('#loginUsuario', usuario);
  await page.fill('#loginPassword', clave);
  await page.click('#loginForm button[type=submit]');
}

try {
  await sembrar();

  // F1. Cliente activo: ve el ingreso, entra, usa la app, cierra sesión y vuelve a entrar.
  {
    const { ctx, page, llamadas, errores } = await abrir(`${ACTIVA}.sticr.app`);
    await listo(page);
    const e = await estado(page);
    const dirs = llamadas.filter((l) => l.startsWith('GET /api/auth/direccion')).length;
    marcar('F1a cliente activo ve el ingreso', e.form && !e.noindex && !e.noExiste, JSON.stringify({ form: e.form, noindex: e.noindex, direccionPorCarga: dirs }));
    await page.screenshot({ path: `${CAP}/cliente-activo-ingreso-1280.png` });
    await entrar(page, 'dueno', CLAVE);
    await page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 15000 });
    marcar('F1b cliente activo entra y ve la app', true, 'appWrap visible tras el ingreso');
    await page.screenshot({ path: `${CAP}/cliente-activo-app-1280.png` });
    const storage = await ctx.storageState();
    // Recarga con sesión guardada: una sola consulta de dirección por carga.
    const antes = llamadas.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await listo(page);
    const tras = llamadas.slice(antes);
    const e2 = await estado(page);
    marcar('F1c recarga con sesión guardada entra directo a la app', e2.app, `llamadas en la recarga: ${JSON.stringify(tras)}`);
    page.once('dialog', (d) => d.accept());
    await page.click('#logoutBtn');
    await page.waitForFunction(() => document.getElementById('loginForm') && document.getElementById('loginForm').offsetParent !== null, null, { timeout: 10000 });
    await entrar(page, 'dueno', CLAVE);
    await page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 15000 });
    marcar('F1d cerrar sesión y volver a entrar', true, 'ok');
    marcar('F1e sin errores de JavaScript', errores.length === 0, JSON.stringify(errores));
    await ctx.close();
    // 10 cargas seguidas = 10 consultas (para estimar el consumo del límite de 120/15 min por IP).
    const c2 = await abrir(`${ACTIVA}.sticr.app`, { storage });
    await listo(c2.page);
    for (let i = 0; i < 9; i++) { await c2.page.reload({ waitUntil: 'domcontentloaded' }); await listo(c2.page); }
    const n = c2.llamadas.filter((l) => l.startsWith('GET /api/auth/direccion')).length;
    marcar('F1f consultas de /direccion por carga de página', n === 10, `${n} consultas en 10 cargas (resto de llamadas por carga: ${JSON.stringify([...new Set(c2.llamadas.filter((l) => !l.includes('direccion')))])})`);
    await c2.ctx.close();
  }

  // F2. Cliente suspendido: ve el ingreso y, al entrar, el aviso de suspensión.
  {
    const { ctx, page } = await abrir(`${SUSP}.sticr.app`);
    await listo(page);
    const e = await estado(page);
    await entrar(page, 'dueno', CLAVE);
    await page.waitForFunction(() => { const n = document.getElementById('loginError'); return n && n.offsetParent !== null && n.textContent.length > 0; }, null, { timeout: 10000 });
    const e2 = await estado(page);
    marcar('F2 empresa suspendida ve el ingreso y el aviso de suspensión', e.form && !e.noindex && /suspendida/i.test(e2.error), e2.error);
    await page.screenshot({ path: `${CAP}/cliente-suspendido-1280.png` });
    await ctx.close();
  }

  // F3. planilla.sticr.app: ingreso de la empresa admin, sin consultar /direccion.
  {
    const { ctx, page, llamadas } = await abrir('planilla.sticr.app');
    await listo(page);
    const e = await estado(page);
    await entrar(page, 'dueno', CLAVE);
    await page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 15000 });
    marcar('F3 planilla.sticr.app entra con la empresa admin', e.form && !e.noindex && !llamadas.some((l) => l.includes('direccion')), JSON.stringify(llamadas));
    await ctx.close();
  }

  // F4. Demo sin login (backend con DEMO_ENABLED=true).
  {
    const { ctx, page, llamadas, errores } = await abrir('demo.sticr.app', { ancho: 390, alto: 844 });
    await page.waitForFunction(() => document.getElementById('appWrap').offsetParent !== null, null, { timeout: 20000 });
    const e = await estado(page);
    marcar('F4 la demo entra sola sin formulario ni /direccion', e.app && !e.form && !e.noindex && !llamadas.some((l) => l.includes('direccion')) && errores.length === 0, JSON.stringify(llamadas));
    await page.screenshot({ path: `${CAP}/demo-390.png` });
    await ctx.close();
  }

  // F5. API caída: se ve el ingreso (fallo abierto).
  {
    const { ctx, page } = await abrir(`${ACTIVA}.sticr.app`, { apiCaida: true });
    await listo(page);
    const e = await estado(page);
    marcar('F5 con la API caída se ve el ingreso', e.form && !e.noExiste && !e.noindex, JSON.stringify(e));
    await ctx.close();
  }

  // F6. Libre y reservados: "Esta dirección no existe", enlace a sticr.app, noindex, sin formulario en el DOM.
  for (const nombre of [`libre${id}`, 'crumble', 'crumble-admin', 'pasteleria-demo', 'pasteleria-demo-admin', 'www', 'admin', 'api', 'app']) {
    const { ctx, page, llamadas, errores } = await abrir(`${nombre}.sticr.app`);
    await listo(page);
    const e = await estado(page);
    const ok = e.noExiste && e.noindex && !e.formEnDom && !e.app && e.href === 'https://sticr.app' && /no existe/.test(e.titulo) && errores.length === 0;
    marcar(`F6 ${nombre}.sticr.app → no existe`, ok, JSON.stringify({ href: e.href, noindex: e.noindex, formEnDom: e.formEnDom, consultas: llamadas.length }));
    await ctx.close();
  }

  // F7. Clientes heredados (nombres fuera de 3-30 o reservados que no son de otro sistema).
  for (const nombre of [LEGADO_CORTO, LEGADO_RESERVADO]) {
    const { ctx, page } = await abrir(`${nombre}.sticr.app`);
    await listo(page);
    const e = await estado(page);
    marcar(`F7 cliente heredado ${nombre}.sticr.app sigue viendo el ingreso`, e.form && !e.noExiste, JSON.stringify({ form: e.form, noExiste: e.noExiste, formEnDom: e.formEnDom }));
    await page.screenshot({ path: `${CAP}/heredado-${nombre}-1280.png` });
    await ctx.close();
  }

  // F8. Celular 390 px, tema claro y oscuro, axe y teclado en "no existe" y en el ingreso.
  for (const tema of ['light', 'dark']) {
    for (const [nombre, tipo] of [[`libre${id}`, 'no-existe'], [ACTIVA, 'ingreso']]) {
      for (const ancho of [1280, 390]) {
        const { ctx, page } = await abrir(`${nombre}.sticr.app`, { ancho, alto: ancho === 390 ? 844 : 800, tema });
        await listo(page);
        const e = await estado(page);
        const v = await axe(page);
        await page.screenshot({ path: `${CAP}/${tipo}-${ancho}-${tema === 'light' ? 'claro' : 'oscuro'}.png`, fullPage: true });
        marcar(`F8 ${tipo} ${ancho}px ${tema}: sin desborde ni fallas de axe`, !e.desborde && v.length === 0, `desborde=${e.desborde} axe=${JSON.stringify(v)}`);
        if (ancho === 390 && tipo === 'no-existe') {
          await page.keyboard.press('Tab');
          const foco = await page.evaluate(() => {
            const a = document.activeElement; const s = getComputedStyle(a);
            const r = a.getBoundingClientRect();
            return { tag: a.tagName, texto: a.textContent.trim(), outline: s.outlineStyle + ' ' + s.outlineWidth, alto: r.height };
          });
          await page.screenshot({ path: `${CAP}/no-existe-390-${tema === 'light' ? 'claro' : 'oscuro'}-foco.png` });
          const [popup] = await Promise.all([page.waitForRequest((r) => r.url().startsWith('https://sticr.app'), { timeout: 5000 }).catch(() => null), page.keyboard.press('Enter')]);
          marcar(`F8 teclado ${tema}: Tab llega a "Ir a sticr.app" con foco visible y Enter navega`, foco.texto === 'Ir a sticr.app' && foco.outline.startsWith('solid') && foco.alto >= 44 && !!popup, JSON.stringify(foco));
        }
        if (ancho === 390 && tipo === 'ingreso') {
          await page.keyboard.press('Tab');
          const f1 = await page.evaluate(() => document.activeElement.id);
          marcar(`F8 teclado ${tema}: en el ingreso el primer campo alcanzable es el usuario`, ['loginUsuario', 'themeToggleBtn'].includes(f1) || f1 === 'loginUsuario', `primer foco: ${f1}`);
        }
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  await limpiar();
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallas.length} de ${resultados.length} ok; consultas a /direccion en toda la corrida: ${totalDireccion}`);
  fs.writeFileSync(path.join(CAP, 'resultados.json'), JSON.stringify({ resultados, totalDireccion }, null, 2));
  process.exitCode = fallas.length ? 1 : 0;
}
