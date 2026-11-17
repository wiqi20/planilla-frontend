# Entrega: Frontend · Control de Planilla — subdominio inexistente

- **Fecha:** 17 nov 2026
- **Rama / archivos:** `fix/subdominio-inexistente` en `planilla-frontend` (`planilla-frontend/index.html`, `pruebas/direccion-inexistente.mjs`, esta carpeta) y en `planilla-backend` (ver `planilla-backend/docs/entregas/subdominio-inexistente.md`).
- **Veredicto** (solo revisores): pendiente de Seguridad y QA.

## Resumen
`planilla-web` atiende todo `*.sticr.app`, así que cualquier subdominio sin cliente (por ejemplo `crumble.sticr.app`) mostraba el ingreso de Planilla. Ahora, si el subdominio no es una empresa de Planilla, ni la demo, ni una dirección propia de Planilla, se muestra «Esta dirección no existe» con un enlace a https://sticr.app, sin formulario de ingreso y con `<meta name="robots" content="noindex">`. Sin desplegar.

## Cómo se decide
1. Script del `<head>` (antes del primer pintado), según el nombre en `nombre.sticr.app`:
   - `demo` → flujo de la demo de siempre (no cambia).
   - `planilla`, `planilla-api` (propias de Planilla) → ingreso de siempre contra la empresa fija `admin` (no cambia).
   - `crumble`, `crumble-admin`, `pasteleria-demo`, `pasteleria-demo-admin`, `www`, `admin`, `api`, `app` → «Esta dirección no existe» de inmediato, sin llamar a la API.
   - Cualquier otro → «Cargando…» (sin formulario) y `noindex` mientras se pregunta a la API.
2. `GET https://planilla-api.sticr.app/api/auth/direccion?valor=<nombre>` responde solo `{ "existe": boolean }`.
   - `false` → «Esta dirección no existe»: se quitan del documento el ingreso y la app (no quedan ni ocultos), título «Esta dirección no existe — STI», `noindex`.
   - `true` → se quita `noindex` y sigue el ingreso de siempre.
   - Sin respuesta, 429, 5xx, más de 8 s o respuesta rara → sigue el ingreso de siempre (ver Decisiones).
3. Hosts que no son `nombre.sticr.app` (por ejemplo el dominio de Railway o `localhost`) siguen igual que antes.

## Qué se entrega
- `planilla-frontend/index.html`: script del `<head>`, estilos con los tokens existentes (`--paper`, `--ink`, `--cta`, fuentes del sistema «posada»), los bloques `#direccionComprobando` y `#direccionNoExiste`, y `comprobarDireccion()` antes de `iniciarAutenticacion`. `DIRECCIONES_INDIVIDUALES` pasa a ser solo `planilla` y `planilla-api`.
- `pruebas/direccion-inexistente.mjs`: prueba de navegador (Playwright, API simulada con `page.route`).
- `docs/subdominio-inexistente/capturas/`: `no-existe-{1280,390}-{claro,oscuro}.png`, `comprobando-{1280,390}.png`, `cliente-existe-{1280,390}.png`.

## Cómo se comprobó
- `PLAYWRIGHT_DIR=/opt/npm-tools/node_modules CHROME=/usr/bin/google-chrome node pruebas/direccion-inexistente.mjs planilla-frontend/index.html docs/subdominio-inexistente/capturas` → 17 de 17 casos `ok`: los 8 nombres de la lista dan «no existe» sin llamar a la API; `noexiste` con `existe:false` da «no existe», `noindex`, sin `#loginForm` en el DOM y sin desborde horizontal en 1280 y 390 px (claro y oscuro), enlace de al menos 44 px de alto en 390 px; «Cargando…» mientras la API tarda, sin formulario visible; `existe:true` muestra el ingreso y quita `noindex`; red caída, 429, 500 y respuesta rara siguen al ingreso; `planilla` y `demo` no llaman a `/direccion` ni ponen `noindex`; sin errores de JavaScript en la página.
- Teclado: el primer Tab llega a «Ir a sticr.app» con contorno de foco visible (comprobado en la prueba).
- Contra el backend real en local (base desechable, sin simular la API): una empresa creada por aprovisionamiento muestra el ingreso; `noexiste4` muestra «no existe» con `noindex` y sin formulario.
- `node --check` de los dos bloques `<script>` del HTML → sin errores de sintaxis.
- Este repositorio no tiene `package.json`: no hay `npm run lint`, `npx tsc --noEmit` ni `npm run build` que correr (es un solo `index.html` servido tal cual).

## Decisiones tomadas
- **La comprobación vive en el backend** (`/api/auth/direccion`), no en una lista en el HTML: el frontend no sabe qué clientes existen. La lista del HTML solo evita la llamada para nombres que nunca son cliente; el backend también los rechaza.
- **Si la comprobación falla, se muestra el ingreso de siempre** (fallo abierto): un cliente real nunca debe quedar sin poder entrar porque la API tardó o devolvió 429. El costo es que, con la API caída, un subdominio inexistente muestra el ingreso como antes (y el ingreso tampoco funcionaría).
- **`www`, `api`, `app` y `admin` pasan a «no existe»** (antes mostraban el ingreso de la empresa `admin`, que según `docs/CONTEXTO.md` «no funciona salvo que esa empresa exista»). Solo `planilla` (y `planilla-api`) conservan ese ingreso, como pidió el PM.
- **`noindex` desde el `<head>` mientras se comprueba**, y se quita si la empresa existe: así un rastreador que pinte la página antes de que conteste la API no la indexa.
- El nombre del host se escribe con `textContent` (sin HTML).
- Sin dependencias nuevas. Playwright solo se usa en la prueba y no se agrega al repositorio.

## Pendientes y riesgos
- **No hay código HTTP 404.** `planilla-web` sirve un `index.html` estático: el servidor responde 200 en cualquier subdominio y no puede saber si la empresa existe. Para dar 404 haría falta cambiar cómo se sirve `planilla-web` (un servidor pequeño que consulte la API o una regla en el proxy), y eso toca Railway. Queda para decisión del PM/dueño.
- **Rastreadores sin JavaScript** ven el HTML original (con el formulario en el código fuente y sin `noindex`). Google ejecuta JavaScript, así que sí ve el `noindex`.
- **Orden de despliegue:** el backend con `/api/auth/direccion` debe salir **antes o junto con** este frontend. Si el frontend sale primero, la llamada da 404 y, por el fallo abierto, todo sigue como hoy (nadie queda bloqueado, pero tampoco aparece «no existe» salvo para la lista fija).
- La lista `NUNCA_CLIENTE` está repetida en el script del `<head>`, en el script principal y en `src/subdominios.js` del backend. Si se agrega otro sistema de STI al comodín, hay que sumarlo en los tres lugares.
- `www.sticr.app` debería apuntar a sticr.app (Netlify); si en algún momento cae en `planilla-web`, ahora verá «no existe» en lugar del ingreso.

## Preguntas para el Project Manager
- ¿Se quiere el 404 real? Implica cambiar cómo se sirve `planilla-web` en Railway.
- ¿Confirmas que `www`, `api`, `app` y `admin` deben mostrar «no existe» (y ya no el ingreso de la empresa `admin`)?

## Dependencias nuevas
- Ninguna.
