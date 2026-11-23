# Entrega: QA · Control de Planilla — subdominio inexistente

- **Fecha:** 17 nov 2026
- **Rama / archivos:** probado `fix/subdominio-inexistente` de `planilla-backend` (commit `3c93808`) y de `planilla-frontend` (commit `7db6590`). Pruebas e informe de QA en `docs/qa-subdominio-inexistente` de los dos repositorios: `qa-subdominio-inexistente/` (pruebas), `docs/subdominio-inexistente/qa.md` (este informe) y `docs/subdominio-inexistente/qa-capturas/` (evidencia).
- **Veredicto:** primera vuelta **RECHAZADO**; re-prueba (18 nov 2026) **APROBADO** (ver «Re-prueba» al final)

## Resumen
Todo lo pedido funciona para los clientes creados por el camino normal (el aprovisionamiento al cobrar): una empresa activa o suspendida sigue viendo y usando el ingreso, `planilla.sticr.app` entra con la empresa `admin`, la demo entra sola, con la API caída se ve el ingreso y los nombres libres o reservados ven «Esta dirección no existe» con `noindex` y un enlace a sticr.app. Se rechaza por un defecto alto (QA-01): una empresa que **existe** en la base pero cuyo nombre no cumple las reglas nuevas (menos de 3 o más de 30 caracteres, o un nombre reservado como `ayuda` o `soporte`) recibe `existe:false` y su dirección muestra «Esta dirección no existe». Desaparece el formulario y el cliente no puede entrar. El backend sí le deja iniciar sesión; lo que lo bloquea es la nueva comprobación.

## Resultados por flujo

| # | Flujo | Resultado | Evidencia |
|---|---|---|---|
| 1 | Empresa activa: ve el ingreso, entra, usa la app, cierra sesión y vuelve a entrar; recarga con sesión guardada | PASA | E2E F1a–F1e, `cliente-activo-*.png` |
| 2 | Empresa suspendida: ve el ingreso y al entrar recibe «Esta cuenta está suspendida…»; su token deja de servir | PASA | E2E F2, QA-B1, `cliente-suspendido-1280.png` |
| 3 | `planilla.sticr.app` con la empresa `admin`: ingreso y entrada, sin consultar `/direccion` y sin `noindex` | PASA | E2E F3 |
| 4 | Demo sin login (`DEMO_ENABLED=true`), a 390 px, sin `/direccion` | PASA | E2E F4, QA-B2, `demo-390.png` |
| 5 | API caída: se ve el ingreso (fallo abierto). 429, 500, respuesta rara y API lenta: también el ingreso | PASA | E2E F5; prueba del frontend (17/17) |
| 6 | Nombre libre y `crumble`, `crumble-admin`, `pasteleria-demo`, `pasteleria-demo-admin`, `www`, `admin`, `api`, `app`: «Esta dirección no existe», enlace `https://sticr.app`, `noindex`, sin `#loginForm` en el DOM, título «Esta dirección no existe — STI». La lista fija no llama a la API | PASA | E2E F6 (9 casos) |
| 7 | Límite de 120 por IP y uso normal | PASA | ver «Límite por IP» |
| 8 | Clientes existentes con nombres fuera de 3–30 o reservados siguen entrando | **FALLA** | QA-01 |
| 9 | 390 px y 1280 px, tema claro y oscuro, sin desborde | PASA | E2E F8, `no-existe-*.png`, `ingreso-*.png` |
| 10 | Teclado: el primer Tab llega a «Ir a sticr.app» con contorno sólido de 2 px y 66 px de alto; Enter navega a sticr.app. En el ingreso, el primer Tab llega a «Usuario» | PASA | E2E F8, `no-existe-390-*-foco.png` |
| 11 | axe (WCAG 2.1 A/AA) en «no existe», claro y oscuro, 1280 y 390 | PASA (0 fallas) | E2E F8 |
| 12 | axe en el ingreso, tema claro | 3 fallas de contraste, **ya estaban antes** del cambio | QA-03 |

### Límite por IP (cuántas consultas hace una carga de página)
- Cada carga de página de un cliente hace **1** `GET /api/auth/direccion`: 10 cargas seguidas dieron 10 consultas (E2E F1f). La demo, `planilla.sticr.app` y la lista fija hacen **0**. El resto de llamadas de una carga (`/api/empleados`, `/api/admin/*`, `/api/colillas`, `/api/reportes`, `/api/boletas`) no entra en ese límite.
- 120 consultas desde una IP pasan; la 121 da 429 con `Retry-After`. El login desde esa misma IP sigue funcionando y otra IP no se ve afectada (QA-B6). Con 429 el frontend muestra el ingreso de siempre, así que el límite **nunca deja a un cliente sin entrar**; solo deja de mostrarse «no existe» hasta que pasa la ventana.
- Cuenta la IP que agrega el proxy (la última de `X-Forwarded-For`), no la que inventa el cliente (QA-B7).
- En la práctica: una oficina detrás de una sola IP tendría que cargar la página más de 8 veces por minuto durante 15 minutos para llegar al límite.

## Defectos

### QA-01 · Alto · Abierto — Un cliente existente con un nombre fuera de 3–30 o reservado ve «Esta dirección no existe» y no puede entrar
- **Pasos:**
  1. En la base, una empresa con usuario cuyo subdominio no pase `validarSubdominio`: por ejemplo `q8` (2 caracteres), uno de 31 caracteres, o `ayuda`/`soporte` (reservados que **no** son de otro sistema). Es lo que aceptaba `POST /api/auth/registrar-empresa` antes de este cambio (1–63 caracteres y sin lista de reservados; estuvo abierto sin bandera del 25 sep al 14 oct 2026) y lo que `db/seed-admin.js --subdominio=<nombre>` sigue aceptando hoy sin validar.
  2. `GET /api/auth/direccion?valor=q8`.
  3. Abrir `https://q8.sticr.app`.
- **Esperado:** `{"existe":true}` y el formulario de ingreso, como antes del cambio. La empresa existe y `POST /api/auth/login` con sus credenciales da 200 (QA-B3 pasa).
- **Obtenido:** `{"existe":false}`. La página muestra «Esta dirección no existe», con `noindex`, y quita `#loginForm` del documento. El cliente no tiene cómo entrar desde su dirección.
- **Evidencia:** `planilla-backend/qa-subdominio-inexistente/direccion-qa.test.js`, prueba QA-B4 (`q7`, uno de 31 caracteres y `soporte` → `false`); E2E F7 (`q8.sticr.app` y `ayuda.sticr.app` → `{"form":false,"noExiste":true,"formEnDom":false}`); capturas `qa-capturas/heredado-q8-1280.png` y `qa-capturas/heredado-ayuda-1280.png`.
- **Causa:** `nombreDeEmpresaPosible` (en `src/subdominios.js`) reutiliza las reglas de **venta** (`validarSubdominio`: 3–30 y `RESERVADOS`) para decidir si una dirección **existe**. Son preguntas distintas.
- **Por qué es alto:** si hay una sola empresa así en producción, queda bloqueada y cree que STI ya no existe. No pude comprobar si hay alguna (no consulto datos reales). Por el historial, la base compartida nació el 18 oct, después de cerrar el registro público, así que lo más probable es que no haya ninguna. Pero `seed-admin` permite crearlas hoy y el encargo pide expresamente que no se rompa nada para clientes reales.
- **Para cerrarlo (decide el especialista):** que `/direccion` dé `existe:true` para cualquier fila de `empresas` cuyo nombre tenga formato de etiqueta DNS, y que excluya solo la lista que debe verse como «no existe» (los 4 de otros sistemas más `www`, `admin`, `api` y `app`). Debe conservar la misma consulta y el mismo tiempo para todos los casos negativos. Otra opción, si el PM la prefiere: antes de desplegar, que el dueño o DevOps corra en producción una consulta de solo lectura que liste los `subdominio` que no cumplen `^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$` o que están en `RESERVADOS` (salvo `admin` y `demo`). Si sale vacía, el riesgo baja a bajo, pero `seed-admin` también debería validar con `validarSubdominio`. La prueba QA-B4 queda para atrapar el defecto.

### QA-02 · Bajo · Informativo — `admin.sticr.app` ya no muestra el ingreso de la empresa `admin`
- **Pasos:** abrir `https://admin.sticr.app`.
- **Esperado según el encargo:** «Esta dirección no existe». **Obtenido:** lo mismo (PASA).
- **Nota:** antes del cambio, `admin.sticr.app` estaba en modo compartido con la empresa `admin`, **que existe** (la usa `planilla.sticr.app`), así que mostraba un ingreso que funcionaba. Quien la tuviera guardada en favoritos dejará de entrar por esa dirección; `planilla.sticr.app` sigue funcionando. El PM ya lo decidió; lo dejo escrito para el aviso a usuarios.

### QA-03 · Medio · Abierto, anterior a este cambio — Contraste insuficiente en el ingreso, tema claro
- **Pasos:** abrir el ingreso de un cliente en tema claro y correr axe (WCAG 2 AA).
- **Esperado:** contraste de al menos 4.5:1. **Obtenido:** 2.74:1 (`#8a8e82` sobre `#f6e6d9`) en `#gateSubtitle` y en las etiquetas «Usuario» y «Contraseña».
- **Evidencia:** pasa exactamente lo mismo con el `index.html` de `70a21af` (antes del cambio); no lo introduce esta rama. En tema oscuro no hay fallas. No bloquea este cambio; debería ir en otra tarea.

## Qué se probó y cómo
- **Backend, suite del proyecto:** `TEST_DATABASE_URL=postgresql://postgres@localhost:57311/qa82513_test npm test` (Postgres 16 desechable en `localhost`) → **100 de 100**. Sin base → 30 pasan, 70 se saltan, 0 fallan.
- **Backend, pruebas de QA:** `node --test qa-subdominio-inexistente/` → **7 de 8**. Falla QA-B4, que es el defecto QA-01. Cubren: activa y suspendida (con `/direccion`, login y token), demo real, login de nombres heredados, registrar-empresa 2/3/30/31 caracteres, límite de 120 y su independencia del login, `X-Forwarded-For` falso y entradas raras (inyección SQL, 5000 caracteres, nulo → 400 como en toda la API, `xn--`, puntos). Todas responden solo `{existe}`.
- **Frontend, prueba del especialista:** `pruebas/direccion-inexistente.mjs` con Chromium → **17 de 17**.
- **Frontend, E2E de QA contra el backend REAL local:** `qa-subdominio-inexistente/e2e-backend-real.mjs`. El HTML se sirve como `<nombre>.sticr.app` y las llamadas a `planilla-api.sticr.app` se reenvían al backend local; todo lo demás de Internet se bloquea → **29 de 33**. Las 4 fallas: 2 son QA-01 (F7) y 2 son QA-03, que ya estaba antes. En toda la corrida se hicieron 25 consultas a `/direccion`. Resultados en `qa-capturas/resultados.json`.
- **Datos:** solo empresas de ejemplo creadas por las pruebas (prefijos `o1t`, `qae` y `q7`/`q8`/`ayuda`/`soporte`), que se borran al terminar. No se tocó la API ni la base de producción. No hubo pagos.

## Qué no se pudo probar
- **`npm run lint`, `npx tsc --noEmit` y `npm run build`:** el backend no tiene esos scripts (es JavaScript sin TypeScript ni build) y el frontend no tiene `package.json`. En su lugar, `node --check` de todos los `.js` de `src/` → sin errores.
- **Si en producción hay empresas con nombres heredados (QA-01):** QA no consulta datos reales.
- **El límite con varias réplicas y el proxy real de Railway:** el límite vive en memoria, por instancia. Se probó con `TRUST_PROXY=1` simulando el proxy.
- **Rastreadores sin JavaScript y el código HTTP:** el servidor sigue respondiendo 200 y el HTML original no tiene `noindex`. Ya figura como pendiente en la entrega del frontend.
- **Hosts con punto final** (`crumble.sticr.app.`) o de dos niveles: no entran en el patrón `nombre.sticr.app` y siguen como antes (ingreso de `admin`). No se probaron en navegador.
- **Safari/iOS y Firefox:** solo Chromium.

## Pendientes y riesgos
- Volver a probar el área completa cuando se corrija QA-01: las pruebas de QA del backend y el E2E entero, no solo F7.
- El orden de despliegue (backend antes o junto con el frontend) sigue igual que en las entregas.

## Preguntas para el Project Manager
- ¿Se corrige QA-01 en el código o se acepta la consulta de solo lectura en producción como condición previa al despliegue? Mi recomendación es corregirlo en el código: es un cambio chico y además cubre `seed-admin`.

## Dependencias nuevas
- Ninguna (Playwright y axe-core solo del entorno de QA, no se agregan a los repositorios).

## Re-prueba (18 nov 2026) · Veredicto: **APROBADO**

Commits probados: `planilla-backend` `fix/subdominio-inexistente` **`90f5b88`** y `planilla-frontend` `fix/subdominio-inexistente` **`287485d`**. Se repitió el área completa afectada (backend `/direccion`, límite por IP, E2E entero), no solo los defectos.

### Estado de los defectos
| Defecto | Estado | Evidencia |
|---|---|---|
| QA-01 (Alto) clientes con nombre heredado ven «no existe» | **CERRADO** | `/direccion` ya no aplica las reglas de venta: acepta cualquier etiqueta DNS de 1–63 caracteres y excluye solo `NUNCA_CLIENTE` (los 4 de otros sistemas, `www`, `admin`, `api`, `app`). QA-B4 pasa. En el E2E, `ab`, `q8`, un nombre de 40 caracteres y `ayuda` ven el ingreso, sin `noindex`, y entran a la app (F7, `qa-capturas-reprueba/heredado-*.png`) |
| QA-02 (Bajo, informativo) `admin.sticr.app` → «no existe» | Sin cambio (decisión del PM) | F6 `admin` da «no existe» aunque la fila `admin` existe; `planilla.sticr.app` entra con ella (F3) |
| QA-03 (Medio) contraste del ingreso en tema claro | **CERRADO** | El subtítulo y las etiquetas usan `--ink` en tema claro. axe da 0 fallas en el ingreso a 1280 y 390 px, en tema claro y oscuro (F8) |

### Resultados
- **Backend, suite completa** con Postgres 16 desechable en `localhost` (puerto propio, `/var/lib/postgresql/qa82513r2`), tras `npm ci` con el `package-lock.json` de la rama (body-parser 1.20.9, qs 6.16.2) → **113 de 113**, ya con `test/direccion-qa.test.js`. Las aserciones de QA se copiaron sin cambios; solo cambian la ruta del `require` y el comentario de cabecera. Sin base: 32 pasan, 81 se saltan, 0 fallan.
- **Pruebas de QA del backend** (`test/direccion-qa.test.js`) → **8 de 8**: activa y suspendida, demo, login y `/direccion` de los nombres heredados, registrar-empresa 2/3/30/31, límite de 120 (la 121 da 429 y el login no se afecta), `X-Forwarded-For` falso y entradas raras.
- **Prueba de navegador del especialista** (`pruebas/direccion-inexistente.mjs`, 287485d) → **19 de 19**.
- **E2E de QA contra el backend corregido en local** (`qa-subdominio-inexistente/e2e-backend-real.mjs`, con los casos heredados ampliados a `ab`, `q8`, 40 caracteres y `ayuda`) → **35 de 35**:
  - Empresa activa: ingreso, entrar, recargar con sesión, cerrar sesión y volver a entrar, sin errores de JavaScript.
  - Empresa suspendida: ingreso y aviso de suspensión.
  - `planilla.sticr.app` con `admin`, demo sin login a 390 px y API caída → ingreso.
  - Nombre libre y los 8 excluidos → «Esta dirección no existe», `noindex`, enlace a `https://sticr.app` y sin formulario. Los 8 no consultan la API.
  - 1 consulta a `/direccion` por carga de página.
  - 390 y 1280 px, claro y oscuro, axe sin fallas, teclado.
  - Resultados en `qa-capturas-reprueba/resultados.json`.

### Notas de la re-prueba
- Ahora `seed-admin` rechaza nombres que no son etiqueta DNS y avisa, sin bloquear, si el nombre no cumple las reglas de venta o está en `NUNCA_CLIENTE`. Lo revisé leyendo el código; no lo ejecuté.
- La clave del límite agrupa IPv6 por `/64` y trata `::ffff:a.b.c.d` como IPv4 (`claveDeIp`). Se revisó el código y QA-B6/QA-B7 pasan con IPv4; no se probó con IPv6 real.
- Sigue sin poder probarse lo mismo que en la primera vuelta: lint, tsc y build (los repositorios no tienen esos scripts), varias réplicas o el proxy real de Railway, rastreadores sin JavaScript (siguen recibiendo 200 sin `noindex`), y navegadores distintos de Chromium.

**Veredicto de la re-prueba: APROBADO.** Pasan todos los flujos críticos pedidos y no quedan defectos bloqueantes ni altos.
