---
name: desarrollo-y-publicacion
description: >-
  Guía operativa para ejecutar, migrar en D1 local, probar con Node/Miniflare,
  verificar OCR local y empaquetar Mi Tienda en Windows conservando 100 % de
  compatibilidad con ChatGPT Sites. Usar cuando el usuario pida levantar el
  entorno local, correr migraciones o pruebas, depurar el servidor o generar el
  archivo .tar.gz de publicación.
---

# Desarrollo Local, Pruebas y Publicación (Windows + ChatGPT Sites)

Procedimiento exacto para operar `aplicacion/` en Windows sin romper el perfil portable ni el despliegue en ChatGPT Sites.

## 1. Requisitos previos y variables locales

- **Node.js:** `>=22.13.0` (probado con `v24.20.0`).
- **Archivo local `aplicacion/.dev.vars`** (ignorado por Git):
  ```ini
  OWNER_EMAIL=seedy@sites.test
  ```
  - En modo `portable` (`aplicacion/.sites-runtime/execution-profile.json`), `vite.config.ts` habilita la ruta `/signin-with-chatgpt` para autenticar localmente a `seedy@sites.test` como propietario (`admin`).
  - En producción (ChatGPT Sites), la identidad proviene exclusivamente de las cabeceras `oai-authenticated-user-id` y `oai-authenticated-user-email`, y `OWNER_EMAIL` se configura como secreto del Site con el correo real del propietario.

## 2. Instalación y preparación de recursos OCR

Si faltan dependencias o recursos WASM/idioma de Tesseract en `aplicacion/public/ocr`:

```powershell
npm --prefix aplicacion run install:ci
npm --prefix aplicacion run prepare:ocr
```

## 3. Compilación y migraciones D1 locales

1. Compilar la aplicación (genera `aplicacion/dist/server/wrangler.json` y copia `.openai/hosting.json` + `drizzle/` a `dist/.openai/`):
   ```powershell
   npm --prefix aplicacion run build
   ```
2. Aplicar de forma idempotente todas las migraciones pendientes en `.wrangler/state`:
   ```powershell
   npm --prefix aplicacion run db:migrate:local
   ```
   - Ejecuta [db-migrate-local.mjs](../../../aplicacion/scripts/db-migrate-local.mjs), que registra migraciones en `_local_migrations` y detecta tablas/columnas preexistentes (`0000`, `0001`, `0002`, etc.) sin destruir datos locales.
   - Nota: Wrangler/workerd abre un puerto loopback local (`127.0.0.1`), por lo que requiere permiso de servicios locales si un sandbox bloquea loopback.

## 4. Levantar servidor de desarrollo

```powershell
npm --prefix aplicacion run dev
```

- Escucha por defecto en `http://localhost:5173`.
- Para entrar como encargado local, usar el botón de inicio de sesión simulado (`/signin-with-chatgpt`) disponible solo en desarrollo portable.

## 5. Ejecución de verificaciones y pruebas

Ejecutar en orden desde el más rápido al más completo:

1. **Chequeo estático (TypeScript + ESLint):**
   ```powershell
   npm --prefix aplicacion run check
   ```
   *(equivale a `npm run typecheck` + `npm run lint`)*
2. **Pruebas unitarias rápidas (Node puro, sin Miniflare):**
   ```powershell
   npm --prefix aplicacion run test:unit
   ```
   Ejecuta `tests/calculations.test.ts` y `tests/ocr.test.ts`.
3. **Pruebas integrales de API y concurrencia (Miniflare D1 + R2):**
   ```powershell
   npm --prefix aplicacion run test:server
   ```
   Ejecuta `tests/server.test.ts`. Requiere acceso loopback `127.0.0.1` para `workerd`.
4. **Pruebas de volumen y límites preventivos (Miniflare):**
   ```powershell
   npm --prefix aplicacion run test:capacity
   ```
   Ejecuta `tests/server-capacity.test.ts` (documentos de 200 líneas, techos de respaldo JSON/R2, historial de +1.000 compras).
5. **Suite completa:**
   ```powershell
   npm --prefix aplicacion test
   ```
6. **Prueba puntual de OCR local sobre una imagen:**
   ```powershell
   npm --prefix aplicacion run check:ocr -- "RUTA_IMAGEN_LOCAL"
   ```
   Procesa la imagen localmente sin enviarla a ningún servicio externo.

## 6. Empaquetado verificado para publicar en ChatGPT Sites

Cada vez que se vaya a actualizar el Site publicado (`appgprj_6aea07cf262881918ca0d6ae20e2bf69`):

1. Ejecutar `typecheck`, `lint`, `test` y `build` sin errores.
2. Generar y validar el paquete `.tar.gz`:
   ```powershell
   npm --prefix aplicacion run package:site
   ```
3. El script [package-site.mjs](../../../aplicacion/scripts/package-site.mjs) verifica automáticamente:
   - Que `dist/.openai/hosting.json`, `dist/client` y `dist/server/index.js` existan.
   - Que todas las migraciones `.sql` de `aplicacion/drizzle/` estén sincronizadas en `dist/.openai/drizzle/` y declaradas en `drizzle/meta/_journal.json`.
   - Que ningún archivo privado (`.dev.vars`, `.wrangler`, muestras u originales) entre en `dist/`.
   - Que `mi-tienda-publicacion-final.tar.gz` contenga exclusivamente entradas bajo `dist/`.

