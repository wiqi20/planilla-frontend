// Compara axe (color-contrast) de las páginas legales entre dos servidores del sitio (rama y main).
// Uso: PLAYWRIGHT_DIR=... CHROME=... AXE=... node qa-comodin-planilla/axe-legales-comparar.mjs http://rama http://main
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR, '/'));
const { chromium } = req('playwright');
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
for (const base of process.argv.slice(2)) {
  for (const p of ['terminos', 'reembolsos', 'privacidad']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, ej: v.nodes[0].any[0]?.data })));
    console.log(base, p, JSON.stringify(r));
    await page.close();
  }
}
await browser.close();
