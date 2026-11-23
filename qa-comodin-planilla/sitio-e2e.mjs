// QA independiente del cambio "comodín por sistema" en el sitio sticr.app (rama feat/tenant-domain-planilla).
// Navegador real contra `next start` local; la disponibilidad del nombre la responde el backend REAL de Planilla
// (rama feat/comodin-planilla) en local. Base de ejemplo desechable con el proyecto publicado y un enlace de
// configuración de ejemplo. No se llega a Stripe: no se envía el formulario de pago (no hay claves de prueba).
// Uso:
//   PLAYWRIGHT_DIR=/opt/npm-tools/node_modules CHROME=/opt/pw-browsers/chromium AXE=/ruta/axe.min.js \
//   SITIO=http://localhost:PUERTO TOKEN_CONFIG=<token de ejemplo sembrado> \
//   node qa-comodin-planilla/sitio-e2e.mjs qa-comodin-planilla/capturas-sitio
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR, '/'));
const { chromium } = req('playwright');
const SITIO = process.env.SITIO;
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const CAP = process.argv[2];
fs.mkdirSync(CAP, { recursive: true });

const resultados = [];
function marcar(id, ok, detalle = '') { resultados.push({ id, ok, detalle }); console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}: ${detalle}`); }
async function axe(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
}
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
try {
  for (const ancho of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho === 390 ? 844 : 900 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));

    // C1. Ficha y formulario de compra.
    await page.goto(`${SITIO}/proyectos/control-de-planilla`, { waitUntil: 'networkidle' });
    const sufijo = (await page.locator('#subdominio + span').textContent()).trim();
    marcar(`C1a ${ancho}px el campo muestra el sufijo .planilla.sticr.app`, sufijo === '.planilla.sticr.app', sufijo);
    const demoHref = await page.locator('a', { hasText: 'Abrir la demo' }).getAttribute('href');
    marcar(`C1b ${ancho}px "Abrir la demo" apunta a https://demo.planilla.sticr.app`, demoHref === 'https://demo.planilla.sticr.app', demoHref);

    await page.fill('#nombreEmpresa', 'Soda Ejemplo QA');
    await page.locator('#subdominio').pressSequentially('minegocio', { delay: 20 });
    const msg = page.locator('#subdominio').locator('xpath=ancestor::div[1]/following-sibling::*[1]');
    await page.waitForFunction(() => /está disponible|no está|reservado/i.test(document.body.innerText), null, { timeout: 10000 });
    const texto = (await page.locator('text=está disponible').first().textContent().catch(() => '')).trim();
    marcar(`C1c ${ancho}px muestra "✓ minegocio.planilla.sticr.app está disponible." (backend real)`, texto === '✓ minegocio.planilla.sticr.app está disponible.', texto);
    const boton = await page.locator('form[action="/api/checkout"] button[type=submit]').isEnabled();
    marcar(`C1d ${ancho}px el botón de pago se habilita con un nombre disponible`, boton);
    await page.screenshot({ path: `${CAP}/compra-${ancho}.png`, fullPage: true });

    // Nombre reservado de otro sistema.
    await page.fill('#subdominio', '');
    await page.locator('#subdominio').pressSequentially('crumble', { delay: 20 });
    await page.waitForFunction(() => /reservado/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const reservado = await page.evaluate(() => /reservado/i.test(document.body.innerText));
    const botonR = await page.locator('form[action="/api/checkout"] button[type=submit]').isEnabled();
    marcar(`C1e ${ancho}px "crumble" sale como reservado y no deja pagar`, reservado && !botonR);

    // Campo del nombre: ancho y nombre largo (30 caracteres, el máximo de venta).
    await page.fill('#subdominio', '');
    const largo = 'minegocio-de-ejemplo-largo-qa1';
    await page.locator('#subdominio').pressSequentially(largo, { delay: 10 });
    await page.waitForFunction(() => /está disponible|no está|reservado/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const medidas = await page.evaluate(() => {
      const i = document.getElementById('subdominio');
      const s = i.nextElementSibling;
      const r = i.getBoundingClientRect(), rs = s.getBoundingClientRect();
      const fila = i.parentElement.getBoundingClientRect();
      return { campo: Math.round(r.width), sufijo: Math.round(rs.width), fila: Math.round(fila.width), cabe: i.scrollWidth <= i.clientWidth, caracteresVisibles: Math.floor(i.clientWidth / (i.scrollWidth / i.value.length || 1)), sufijoDesborda: rs.right > fila.right + 1 };
    });
    const mensajeLargo = await page.evaluate((l) => document.body.innerText.includes(`✓ ${l}.planilla.sticr.app está disponible.`), largo);
    marcar(`C1f ${ancho}px medidas del campo del nombre (informativo)`, true, JSON.stringify({ ...medidas, mensajeCompleto: mensajeLargo }));
    marcar(`C1g ${ancho}px sin desborde horizontal de la página y el sufijo dentro de la fila`, !(await desborde(page)) && !medidas.sufijoDesborda);
    await page.locator('#subdominio').focus();
    await page.screenshot({ path: `${CAP}/compra-nombre-largo-${ancho}.png` });
    await page.locator('#subdominio').scrollIntoViewIfNeeded();
    const campoBox = await page.locator('#subdominio').locator('xpath=ancestor::div[2]').boundingBox();
    if (campoBox) await page.screenshot({ path: `${CAP}/compra-campo-${ancho}.png`, clip: { x: 0, y: Math.max(0, campoBox.y - 40), width: ancho, height: Math.min(260, campoBox.height + 120) } });

    // Teclado: Tab desde el nombre de la empresa llega al campo del nombre.
    await page.locator('#nombreEmpresa').focus();
    await page.keyboard.press('Tab');
    const foco = await page.evaluate(() => document.activeElement.id);
    marcar(`C1h ${ancho}px teclado: Tab del nombre de la empresa al campo de la dirección`, foco === 'subdominio', foco);
    const v = await axe(page);
    marcar(`C1i ${ancho}px axe en la ficha`, v.length === 0, JSON.stringify(v));
    marcar(`C1j ${ancho}px sin errores de JavaScript`, errores.length === 0, JSON.stringify(errores));

    // C2. Páginas legales con el ejemplo nuevo.
    for (const p of ['terminos', 'reembolsos', 'privacidad']) {
      await page.goto(`${SITIO}/${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500); // por si hay animación de entrada
      const t = await page.evaluate(() => document.body.innerText);
      const ok = t.includes('minegocio.planilla.sticr.app') && !/\bminegocio\.sticr\.app/.test(t) && !t.includes('nombre.sticr.app') && t.includes('23 de noviembre de 2026');
      const va = await axe(page);
      marcar(`C2 /${p} ${ancho}px ejemplo nuevo, sin el viejo, fecha 23 nov 2026, sin desborde, axe limpio`, ok && !(await desborde(page)) && va.length === 0, JSON.stringify({ nuevo: t.includes('minegocio.planilla.sticr.app'), viejo: /\bminegocio\.sticr\.app/.test(t) || t.includes('nombre.sticr.app'), fecha: t.includes('23 de noviembre de 2026'), axe: va }));
      await page.screenshot({ path: `${CAP}/${p}-${ancho}.png`, fullPage: true });
    }

    // C3. /configurar: el enlace del correo y la pantalla final muestran la dirección nueva.
    await page.goto(`${SITIO}/configurar?token=${encodeURIComponent(process.env.TOKEN_CONFIG)}`, { waitUntil: 'networkidle' });
    const tc = await page.evaluate(() => document.body.innerText);
    marcar(`C3a ${ancho}px /configurar con enlace válido muestra minegocioqa.planilla.sticr.app`, tc.includes('minegocioqa.planilla.sticr.app') && !/minegocioqa\.sticr\.app/.test(tc), tc.match(/\S*minegocioqa\S*/g)?.join(' '));
    await page.screenshot({ path: `${CAP}/configurar-${ancho}.png`, fullPage: true });
    await page.goto(`${SITIO}/configurar?ok=listo&s=minegocioqa`, { waitUntil: 'networkidle' });
    const hrefs = await page.$$eval('a', (as) => as.map((a) => a.href).filter((h) => h.includes('minegocioqa')));
    marcar(`C3b ${ancho}px /configurar listo enlaza a https://minegocioqa.planilla.sticr.app`, hrefs.length > 0 && hrefs.every((h) => h.startsWith('https://minegocioqa.planilla.sticr.app')), JSON.stringify(hrefs));
    await ctx.close();
  }
} finally {
  await browser.close();
}
const fallas = resultados.filter((r) => !r.ok);
fs.writeFileSync(path.join(CAP, 'resultados.json'), JSON.stringify(resultados, null, 2));
console.log(`\n${resultados.length - fallas.length} de ${resultados.length} ok`);
process.exit(fallas.length ? 1 : 0);
