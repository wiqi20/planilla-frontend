# Entrega: Frontend · Control de Planilla (mover el comodín a `*.planilla.sticr.app`)

- **Fecha:** 23 nov 2026
- **Rama / archivos:** `feat/comodin-planilla` en `wiqi20/planilla-frontend`: `planilla-frontend/index.html`, `pruebas/direccion-inexistente.mjs`, `qa-subdominio-inexistente/e2e-backend-real.mjs`, `docs/comodin-planilla/` (capturas), esta entrega.
- **Plan:** `docs/proyectos/planilla/mover-comodin.md` y `docs/estandares/dominios.md` de `wiqi20/STICR_landingpage` (rama `docs/comodin-por-sistema`, PR #49), secciones 2.1 y 3.1.

## Resumen
El frontend reconoce el comodín nuevo `<empresa>.planilla.sticr.app` (un solo nivel) y, durante la transición, también la forma vieja `<empresa>.sticr.app`. `planilla.sticr.app` lleva a la ficha de sticr.app; cualquier host que no se reconozca muestra «Esta dirección no existe». Se eliminó el modo «individual» con la empresa fija `admin` fuera de `localhost`. Pruebas en verde con la API simulada (34 de 34) y con el backend real de la rama `feat/comodin-planilla` (42 de 42).

## Qué se entrega
- `planilla-frontend/index.html`:
  - El script del `<head>` clasifica el host **una sola vez** y deja el resultado en `window.PLANILLA_DIRECCION`, de solo lectura y congelado. La configuración de abajo lo lee de ahí, así que no hay dos expresiones que se puedan separar.
  - Expresión nueva: `^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.planilla\.sticr\.app$`.
  - Orden: raíz `planilla.sticr.app` → `noindex` + `location.replace('https://sticr.app/proyectos/control-de-planilla')` antes de pintar (pantalla neutra «Cargando…», nunca el ingreso); `<etiqueta>.planilla.sticr.app` → modo compartido como antes (`demo` entra sola, `NUNCA_CLIENTE` sin consultar, el resto consulta `GET /api/auth/direccion`); **(TRANSICIÓN)** `<etiqueta>.sticr.app` con la expresión de antes; `localhost`/`127.0.0.1` → desarrollo con la empresa `admin`; cualquier otro → «Esta dirección no existe» + `noindex`, sin consultar la API.
  - Se quitó `DIRECCIONES_INDIVIDUALES` (`planilla`, `planilla-api`) y la empresa fija `admin` fuera de local. `NUNCA_CLIENTE` no cambia; solo su comentario.
  - `API_COMPARTIDA`, `URL_COMPRA` y los enlaces a `https://sticr.app` no cambian.
- `pruebas/direccion-inexistente.mjs`: los casos de la tabla 3.1 del plan con hosts nuevos, más demo (con datos simulados marcados en el archivo), raíz, hosts desconocidos, `localhost` y un bloque **TRANSICIÓN** con la forma vieja.
- `qa-subdominio-inexistente/e2e-backend-real.mjs`: hosts a `*.planilla.sticr.app`; F3 ahora comprueba que la raíz lleva a la ficha; F9 (hosts desconocidos) y F10 (**TRANSICIÓN**, forma vieja) nuevos.
- `docs/comodin-planilla/capturas/` y `docs/comodin-planilla/qa-capturas/`: capturas de las dos corridas.

## Cómo se comprobó
- `PLAYWRIGHT_DIR=/opt/npm-tools/node_modules CHROME=/usr/bin/google-chrome node pruebas/direccion-inexistente.mjs planilla-frontend/index.html /home/claude/capturas-comodin-planilla` → **34 de 34 `ok`** (tres corridas completas en verde; la última, con la versión final de la prueba). Cubre: `crumble`, `crumble-admin`, `pasteleria-demo`, `pasteleria-demo-admin`, `www`, `admin`, `api` y `app` `.planilla.sticr.app` → no existe sin consultar la API; `a.b.planilla.sticr.app`, `cliente.up.railway.app`, `planilla.sticr.app.ejemplo.com`, `xplanilla.sticr.app.ejemplo.com`, `-x.planilla.sticr.app`, `sticr.app.ejemplo.com` y `ejemplo.com` → no existe, `noindex`, sin consultar la API ni entrar a `admin`; `noexiste.planilla.sticr.app` → no existe en 1280 y 390 px, claro y oscuro, sin desborde, enlace de 44 px o más; `cliente.planilla.sticr.app` → «Cargando…» y luego el ingreso, que manda `subdominio: "cliente"`; los 4 fallos de la comprobación siguen al ingreso; `planilla.sticr.app` → llega a la ficha, el ingreso, la app y «no existe» nunca se muestran en ningún momento del armado del documento (observador del DOM dentro de la página), siempre con `data-direccion="redirigiendo"` y `noindex`, sin llamadas a la API, y «Atrás» no vuelve a la raíz; `demo.planilla.sticr.app` → la demo entra sola en 1280 y 390 px con `subdominio: "demo"`, sin `/direccion` ni `noindex`; demo sin API → aviso «La demo no está disponible»; `localhost` → ingreso con `subdominio: "admin"`; TRANSICIÓN `cliente.sticr.app`, `noexiste.sticr.app`, `crumble.sticr.app`, `demo.sticr.app` igual que antes y `planilla-api.sticr.app` ya no entra a `admin`; contraste del ingreso de al menos 4.5:1 en los dos temas.
- Prueba de mutación de la raíz: con la rama de la raíz quitada, el caso de la raíz falla. Cambiar `replace` por `assign` no se nota en el navegador (Chrome convierte en reemplazo cualquier navegación sin gesto antes de cargar), así que la prueba también comprueba que el código use `location.replace(FICHA)`; con `assign`, falla.
- `qa-subdominio-inexistente/e2e-backend-real.mjs` contra el backend real de `origin/feat/comodin-planilla` de `planilla-backend` (743be77 y d1d3d9f, CORS con lo nuevo y la transición), en un árbol aparte, con Postgres desechable en `/var/lib/postgresql/fe-comodin-qa-e2e` (puerto 57931), `DEMO_ENABLED=true` y secretos generados para la corrida → **42 de 42 `ok`**: clientes activos y suspendidos entran o ven el aviso; recarga con sesión; raíz a la ficha sin llamadas; demo a 390 px; API caída → ingreso; libre y `NUNCA_CLIENTE` → no existe; heredados entran; F9 hosts desconocidos sin llamadas; F10 forma vieja (cliente entra, `demo.sticr.app` entra, libre → no existe); axe sin fallas y teclado en 1280 y 390 px, claro y oscuro. Backend y Postgres apagados y borrados al terminar.
- Capturas revisadas con Read: `no-existe-1280-claro`, `no-existe-390-claro`, `no-existe-390-oscuro`, `demo-1280`, `demo-390` (simulada) y `qa-capturas/demo-390` (backend real): sin desborde, banner de la demo con «Contratar este sistema», el nombre largo del host se parte bien en 390 px.
- Este repositorio no tiene `package.json`: no hay lint, typecheck ni build que correr. Que la página no tenga errores de JavaScript lo comprueban las pruebas (`pageerror` vacío).

## Decisiones tomadas
- La clasificación vive solo en el `<head>` y se expone en `window.PLANILLA_DIRECCION` (no se puede reescribir) — así la expresión se declara una vez, como pide el plan.
- La forma vieja usa **la expresión de antes sin cambios** (`^([a-z0-9-]+)\.sticr\.app$`) — es la que pide el plan para la transición; se borra entera en el paso 8.
- `planilla-api.sticr.app` en la forma vieja deja de entrar a `admin`: consulta la API y muestra «no existe» (el plan quita `DIRECCIONES_INDIVIDUALES`).
- `file://` y cualquier host sin nombre caen en «no existe» — el plan deja el modo de desarrollo solo para `localhost` y `127.0.0.1`.
- La raíz no tiene captura propia: Chrome descarta la página antes de pintarla. Se prueba desde adentro del documento y se guarda la captura de la llegada a la ficha (simulada).

## Pendientes y riesgos
- **Paso 8 (limpieza):** en `index.html`, borrar `COMODIN_VIEJO` y la línea `else if ((m = host.match(COMODIN_VIEJO)))…` del `<head>`, y los comentarios «TRANSICIÓN»; en `pruebas/direccion-inexistente.mjs`, borrar el bloque «TRANSICIÓN» y sumar `cliente.sticr.app` y `demo.sticr.app` a la lista de hosts desconocidos; en `qa-subdominio-inexistente/e2e-backend-real.mjs`, cambiar F10 para esperar «no existe» sin llamadas.
- Las sesiones y el tema guardados en `localStorage` en `*.sticr.app` no pasan a `*.planilla.sticr.app` (es por dirección). No importa: no hay clientes y la demo entra sola.
- El despliegue de `planilla-web` es el paso 2 del orden y lo pide DevOps; no se desplegó nada.
- Las pruebas de la forma vieja dependen de que el backend acepte en CORS las dos formas (rama `feat/comodin-planilla` del backend). Con el backend de `main` la forma nueva no puede leer la API: se deben desplegar en el orden del plan (backend primero).

## Preguntas para el Project Manager
- Ninguna.

## Dependencias nuevas
- Ninguna. Playwright y axe-core se usaron desde instalaciones que ya estaban en la máquina, como en las pruebas anteriores.
