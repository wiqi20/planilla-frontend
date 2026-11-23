# Entrega: QA · Control de Planilla (mover el comodín a `*.planilla.sticr.app`)

- **Fecha:** 23 nov 2026
- **Rama / archivos:** `docs/qa-comodin-planilla` en `wiqi20/planilla-frontend` (desde `origin/feat/comodin-planilla`, c5bc4b9): este informe y `qa-comodin-planilla/` (pruebas propias, capturas y evidencia).
- **Qué se probó:** `planilla-backend` `feat/comodin-planilla` (743be77 + d1d3d9f, solo documentación), `planilla-frontend` `feat/comodin-planilla` (c5bc4b9) y `STICR_landingpage` `feat/tenant-domain-planilla` (329a389), contra el plan `docs/proyectos/planilla/mover-comodin.md` y `docs/estandares/qa.md` (rama `docs/comodin-por-sistema`).
- **Veredicto:** **APROBADO** (sin defectos bloqueantes ni altos; ver «Qué no se pudo probar»: la compra completa en modo de pruebas del proveedor queda para el humo del paso 6, como ya pide el plan).

## Resumen
Las tres ramas hacen lo que pide el plan. Las direcciones nuevas (`cliente.planilla.sticr.app`, `demo.planilla.sticr.app`, la raíz `planilla.sticr.app`) funcionan con el backend real de la rama y su CORS. Los nombres de Crumble y los hosts desconocidos muestran «Esta dirección no existe». La transición `*.sticr.app` sigue funcionando. El sitio arma `<nombre>.planilla.sticr.app` en la compra, en `/configurar` y en los textos legales. Hay un defecto bajo (el campo del nombre en la compra es angosto) y tres hallazgos que ya estaban en `main` y no vienen de este cambio.

## Resultados por punto pedido

| # | Punto | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | `cliente.planilla.sticr.app` con empresa existente → ingreso | **Pasa.** Ingreso visible, sin `noindex`; entra a la app; cerrar sesión y volver a entrar; el backend responde `Access-Control-Allow-Origin` con el origen nuevo. | Q1a–Q1e; F1a–F1f |
| 2 | `demo.planilla.sticr.app` → demo sin login | **Pasa** en 1280 y 390 px: entra sola, el formulario nunca se ve (observador del DOM), aviso «Contratar este sistema», se recorren las 6 pestañas, sin `/direccion` ni `noindex`, sin desborde. | Q3; `capturas/demo-1280.png`, `demo-390.png` |
| 3 | `planilla.sticr.app` → ficha sin mostrar el ingreso | **Pasa** (`/` y `/?x=1`): llega a `https://sticr.app/proyectos/control-de-planilla`, el ingreso nunca se ve, 0 llamadas a la API, sin errores de JavaScript. | Q4; F3; prueba simulada |
| 4 | Nombres de Crumble → «Esta dirección no existe» | **Pasa** para `crumble`, `crumble-admin`, `pasteleria-demo`, `pasteleria-demo-admin`, `www`, `admin`, `api`, `app`, tanto en `.planilla.sticr.app` como en `.sticr.app`, sin consultar la API. | Q5 (16 casos); F6 |
| 5 | Hosts desconocidos → «Esta dirección no existe» | **Pasa**: `a.b.planilla.sticr.app`, `*.up.railway.app`, `planilla.sticr.app.ejemplo.com`, `x.planilla.sticr.app.ejemplo.com`, `xn--…`, `sticr.app`, `ejemplo.com`, con punto final (`demo.planilla.sticr.app.`), `planilla-api.planilla.sticr.app` y un nombre libre; nunca el ingreso ni la empresa `admin`. Etiqueta de 63 caracteres en 390 px sin desborde. | Q6, Q10; F9 |
| 6 | Transición `cliente.sticr.app` | **Pasa**: el cliente entra y `demo.sticr.app` entra sola, con el CORS de transición del backend real. | Q7a, Q7b; F10a–c |
| 7 | Compra en el sitio muestra `<nombre>.planilla.sticr.app` | **Pasa** en 1280 y 390 px con la disponibilidad respondida por el backend real: sufijo `.planilla.sticr.app`, «✓ minegocio.planilla.sticr.app está disponible.», `crumble` sale como reservado y no deja pagar, «Abrir la demo» apunta a `https://demo.planilla.sticr.app`, axe limpio, teclado. `/configurar` (enlace del correo y pantalla final) muestra y enlaza `minegocioqa.planilla.sticr.app`. | C1a–C1j, C3a–b; `capturas-sitio/compra-*.png`, `configurar-*.png` |
| 7b | Campo del nombre en 390 px | **Defecto bajo D1** (abajo): 114 px, unos 10 caracteres visibles. | C1f; `capturas-sitio/compra-campo-390.png` |
| 8 | Páginas legales con el ejemplo nuevo | **Pasa** el contenido: `/terminos`, `/reembolsos` y `/privacidad` muestran `minegocio.planilla.sticr.app`, ya no `minegocio.sticr.app` ni `nombre.sticr.app`, fecha «23 de noviembre de 2026», sin desborde en 1280 y 390 px. axe marca contraste, **igual en `main`** (P2). | C2; `capturas-sitio/*-390.png` |

## Comandos y pruebas

### Backend (`planilla-backend`, rama)
- Postgres 16 desechable en `/var/lib/postgresql/qa-comodin-planilla-7f3e`, puerto 56813 en localhost.
- `npm ci` → sin cambios en el lockfile. `TEST_DATABASE_URL=postgres://postgres@localhost:56813/planilla_test npm test` → **115 de 115, 0 fallos, 0 omitidas** (123 s).
- CORS real con `curl` contra el backend de la rama (GET y preflight): acepta `https://demo.planilla.sticr.app`, `https://minegocio.planilla.sticr.app`, `https://planilla.sticr.app`, `https://sticr.app`, `https://demo.sticr.app` (transición). Rechaza `https://crumble.sticr.app`, `https://pasteleria-demo.sticr.app`, `https://a.b.planilla.sticr.app`, `http://demo.planilla.sticr.app`, `https://planilla.sticr.app.ejemplo.com`, `https://-x.planilla.sticr.app`, mayúsculas, `:443` explícito y `https://evil.com`. Responde `Vary: Origin` y `Cache-Control: no-store`.
- **SIGTERM (`test/cierre-arranque.test.js`)**: sin carga, 0 de 15 fallos en `main` y 0 de 15 en la rama. Con la CPU ocupada falla en los dos con `ECONNRESET`: `main` 2 de 10, rama 7 de 10. La rama no toca `server.js`, `cierre.js`, `app.js`, la prueba ni su soporte, y la petición de la prueba no lleva `Origin`. **La inestabilidad ya existe en `main`** (P3). Detalle en `qa-comodin-planilla/sigterm-corridas.txt`.

### Frontend (`planilla-frontend`, rama)
- `pruebas/direccion-inexistente.mjs` (API simulada) con Chromium de Playwright → **34 de 34 `ok`**.
- `qa-subdominio-inexistente/e2e-backend-real.mjs` contra el backend real de la rama (puerto 46871, `DEMO_ENABLED=true`, secretos generados para la corrida) → **42 de 42 `ok`**: incluye axe y teclado de «no existe» y del ingreso en 1280 y 390 px, claro y oscuro.
- **Prueba propia** `qa-comodin-planilla/planilla-e2e.mjs`. Reenvía las llamadas al backend real **conservando `Origin`**, así que el navegador aplica el CORS real → **48 de 49 `ok`**. La única falla es Q9 (contraste en la demo), que da lo mismo con el `index.html` de `main` (P1). Incluye aislamiento: en la dirección de la empresa A no entra el usuario de B, el token de A solo ve la empresa A y la API sin sesión responde 401.
- Este repositorio no tiene `package.json`: no hay lint, typecheck ni build.

### Sitio (`STICR_landingpage`, rama)
- `npm ci` → 418 paquetes, sin errores.
- `npm run typecheck` y `npx tsc --noEmit` → sin errores.
- `TEST_DATABASE_URL=…/sitio_qa_test npm test` → **23 archivos, 365 de 365**.
- `npm run lint` → **3 errores y 7 avisos**. Los 3 errores son los de siempre en `docs/proyectos/crumble/logo/fuentes/render5.js` (`no-require-imports`), un archivo que esta rama no cambia.
- `npm run build` → compila y genera todas las rutas.
- **Prueba propia** `qa-comodin-planilla/sitio-e2e.mjs`: corre contra `next start` de la rama, con una base de ejemplo que tiene el proyecto publicado. `PLANILLA_API_URL` apunta al backend real de la rama y `STRIPE_SECRET_KEY` es falsa: solo sirve para pintar el formulario y nunca se envía. Resultado: **24 de 30 `ok`**. Las 6 fallas son el contraste de axe en las páginas legales, idéntico en `main` (P2, comprobado con `qa-comodin-planilla/axe-legales-comparar.mjs` contra un build de `origin/main`: mismas cuentas, 15/6/12 nodos, #696969 sobre #e6e6e5 = 4.39:1).

## Defectos

### D1 · Bajo · El campo del nombre en la compra es angosto (390 px y también 1280 px)
- **Pasos:** abrir `/proyectos/control-de-planilla` a 390 px y escribir `minegocio-de-ejemplo-largo-qa1` (30 caracteres, el máximo de venta) en «Dirección de tu sistema».
- **Esperado:** el cliente ve lo que escribe, o la mayor parte.
- **Obtenido:** el campo mide 114 px y el sufijo `.planilla.sticr.app` 186 px, así que se ven unos 10 caracteres y el resto se desplaza dentro del campo. A 1280 px el campo mide 144 px (unos 13 caracteres), porque la tarjeta es angosta. No desborda la página, el sufijo queda dentro de la fila y el mensaje de abajo repite la dirección completa («✓ … .planilla.sticr.app está disponible.»), así que no bloquea la compra.
- **Evidencia:** `qa-comodin-planilla/capturas-sitio/compra-campo-390.png`, `compra-nombre-largo-390.png` y `compra-campo-1280.png`; C1f en `capturas-sitio/resultados.json`.
- **Sugerencia (decide Diseño):** en pantallas angostas, poner el sufijo debajo del campo, como ya propuso Frontend.

## Hallazgos previos (están en `main`; no vienen de este cambio ni bloquean este veredicto)
- **P1 · Medio · Contraste en la app (demo):** axe `color-contrast` (serious) en `.sub` y en las pestañas inactivas (`button[data-tab=…]`), 19 nodos. Sale igual con el `index.html` de `main` en `demo.sticr.app`. Pasos: abrir la demo y correr axe (Q9 y su referencia en `planilla-e2e.mjs`).
- **P2 · Medio · Contraste en `/terminos`, `/reembolsos` y `/privacidad`:** el texto `text-slate` (#696969) sobre #e6e6e5 da 4.39:1 (pide 4.5:1). Las cuentas de nodos son las mismas en `main`. La rama solo cambió texto.
- **P3 · Bajo · La prueba de SIGTERM es inestable:** falla por tiempos con la CPU ocupada, también en `main` (ver arriba). Puede pintar de rojo el CI sin relación con el cambio. Conviene arreglarla aparte, por ejemplo esperando a que las 6 peticiones estén realmente en `bcrypt` del lado del servidor antes de mandar la señal.

## Observaciones sobre el plan (no son defectos)
- El backend **se aparta del plan 3.2 en dos casos de la transición**, y lo dice en su entrega. Rechaza `https://crumble.sticr.app` y los otros 3 nombres de Crumble (el plan dice aceptarlo; lo pidió el Project Manager, y es más estricto). Acepta `https://xplanilla.sticr.app` (el plan lo pone entre los rechazados, pero lo cubre la forma vieja que el mismo plan manda mantener). Los dos comportamientos están probados y son coherentes. Falta que el Project Manager actualice el plan (pregunta abierta del Backend).
- El CORS nuevo acepta orígenes como `https://crumble.planilla.sticr.app` o `https://planilla-api.planilla.sticr.app`. No es un riesgo: esos hosts los sirve el mismo `planilla-web`, que muestra «no existe» sin llamar a la API.

## Qué no se pudo probar y por qué
- **Compra completa en modo de pruebas del proveedor de pagos** (pago, webhook, `/gracias`, correo, crear el acceso y entrar a `minegocio.planilla.sticr.app`): no hay claves de prueba de Stripe en este entorno y `/gracias` consulta la sesión en Stripe. `lib/payments/` no cambia y las tablas guardan solo la etiqueta. Se probó lo que arma la dirección: la compra hasta antes del pago, `/configurar` y `tenantUrl` en las pruebas unitarias. **Debe hacerse en el humo del paso 6 del plan (3.4).** Lo mismo para pago fallido o abandonado y cancelación, que este cambio no toca. La suspensión de una empresa sí se probó en el frontend (F2).
- **`/admin` (suscripciones):** requiere ingreso con Google. Solo se revisó en el código que usa `tenantUrl`.
- **DNS, certificados y Railway/Netlify reales** (`*.planilla.sticr.app`, la raíz, retirar `*.sticr.app`): son los pasos 3 a 7, a cargo de DevOps y el dueño. Aquí los hosts se simularon en el navegador.
- **`tests/qa-correo/*.mjs` del sitio:** necesitan servicios falsos del árbol principal. Solo se comprobó que esperan la dirección nueva.

## Cómo repetir
Ver el encabezado de cada script en `qa-comodin-planilla/`: `planilla-e2e.mjs` (backend real), `sitio-e2e.mjs` (sitio con `next start`) y `axe-legales-comparar.mjs`. Las pruebas crean sus datos con prefijo `qac` y los borran al final (quedaron 0 filas).

## Entorno y limpieza
Árboles propios `/home/claude/wt-qa-comodin-{be,be-main,fe,sitio,sitio-main}`. Postgres desechable en `/var/lib/postgresql/qa-comodin-planilla-7f3e` (puerto 56813), backend local en 46871 y sitio en 43917/43918, todo apagado y borrado al terminar. No se tocaron los árboles principales, ni producción, ni datos reales.

## Preguntas para el Project Manager
- ¿Se actualiza el plan 3.2 con el comportamiento real de la transición (rechaza los 4 nombres de Crumble y acepta `xplanilla.sticr.app` hasta el paso 8)?
- ¿Se abren tareas aparte para P1, P2 (contraste) y P3 (prueba de SIGTERM)?
- ¿Diseño decide sobre D1 antes de unir el PR del sitio, o queda para después?

## Dependencias nuevas
- Ninguna. Se usaron Playwright y Chromium ya instalados (`/opt/npm-tools`, `/opt/pw-browsers`) y `axe-core` de `node_modules` del sitio.
