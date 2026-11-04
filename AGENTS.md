# Reglas del Proyecto — Mi Tienda · Facturas y costos

## Decisión vigente del propietario · 03/11/2026

El modo principal es **local autónomo**: servidor Node enlazado exclusivamente a 127.0.0.1, SQLite nativo y archivos bajo `%LOCALAPPDATA%\MiTienda`, usuarios y contraseñas locales. Sin dependencia operativa de ChatGPT Sites, Cloudflare, Supabase ni otro alojamiento/base externa. **Gemini es la única excepción externa opcional**, con clave cifrada y autorización explícita de los originales de cada lectura. No publicar ni modificar el sitio anterior salvo nueva solicitud. Conservar su compatibilidad como modo alternativo, incluidos sus scripts protegidos.

Los originales de `muestras/originales/` siguen sin salir del computador. Las facturas que el usuario seleccione expresamente para Gemini pueden enviarse solo tras el aviso y consentimiento de la interfaz. Nunca solicitar ni guardar claves en chats, código, logs, copias comerciales o archivos publicables.

La comparación opcional de identidad con Gemini comparte hasta 500 artículos (id, nombre, marca, contenido, presentación y código de barras), únicamente si el usuario marca esa opción y autoriza el envío. Nunca incluye precios del catálogo. Gemini solo propone identificadores existentes de ese conjunto; no vincula ni fusiona artículos por su cuenta.

El OCR local permanece disponible sin conexión. `aplicacion/local/` implementa ejecución, cuentas y adaptadores de SQLite/archivos sin servicios externos. `build:local` y `package:local` producen el programa portable sin datos; comprobar también `test:local`. Preservar aritmética exacta, trazabilidad y CAS en ambos modos. No presentar pruebas simuladas de Gemini como evidencia de reconocimiento real.

Este archivo define los invariantes de negocio, las decisiones de diseño y la forma exacta en que se programa y verifica este proyecto. Toda modificación futura debe respetar estas reglas sin excepción.

---

## 1. La idea principal del proyecto

Aplicación privada para una tienda/minimarket en **Ecuador (USD)** centrada en **registrar documentos de compra, verificar matemáticamente cada importe impreso contra los originales, conservar trazabilidad auditable y consultar historial real de costos por proveedor y producto**.

### Invariantes de dominio innegociables

1. **Aritmética decimal exacta (cero `float` binario en dinero):**
   - Todo cálculo monetario, de cantidades, descuentos, bonificaciones e impuestos vive en `aplicacion/lib/calculations.ts` sobre una clase `Rational` basada en `bigint` (`num`, `den`).
   - Está **prohibido** usar `Number` / punto flotante IEEE-754 (`parseFloat`, `+x`, multiplicaciones/divisiones flotantes) para calcular subtotales, descuentos, IVA, costos unitarios o referencias de precios.
   - Redondeo explícito `HALF-UP` (`roundHalfUp`) o truncamiento explícito cuando se modela un método reproducible del proveedor, siempre documentado en advertencias/notas.
   - **Prohibido ajustar silenciosamente diferencias de 1 centavo** para "hacer cuadrar" un documento. Si el IVA o total impreso difiere entre redondeo por grupo vs. redondeo por línea (caso real *Roguizam*), el modo de redondeo debe reproducirse explícitamente (`taxGroup` vs `line`) y quedar trazado.

2. **Distinción estricta entre desconocido (`""`), no aplica y cero (`0`):**
   - Cadena vacía `""` significa **pendiente / no informado / desconocido**; **jamás** debe convertirse silenciosamente en `"0"` ni en `0`.
   - En una factura (`invoice`), un IVA desconocido (`taxRate === ""`) o una conversión de empaque sin confirmar (`unitsPerPack` vacío en caja/paquete/display/bulto/funda/paca) **bloquea la confirmación**. Un IVA explícito `"0"` (`0 %`) sí es válido y confirmado.
   - Un costo unitario resultante igual a cero sin promoción válida nunca se publica como costo confirmado normal.
   - Las bases por tarifa explícitas (`taxSummary`) se contrastan con las líneas, el IVA y el total. El asistente puede proponer un reparto matemático único, pero solo se aplica con la acción explícita del usuario, preservando `taxReading`, explicación y redondeo. No inferir tarifas de la categoría ni del IVA total aislado; varios repartos, bases incompletas, contradicciones monetarias no nulas o límites de búsqueda dejan la revisión pendiente. Una coincidencia aritmética no certifica clasificación tributaria.

3. **Separación entre documentos contables y comerciales:**
   - Solo las **facturas confirmadas (`kind = "invoice"`, `status = "confirmed"`)** publican costos en el historial principal de compras (`document_products`) y actualizan códigos por proveedor (`supplier_products`).
   - **Notas de entrega (`delivery`) y pedidos (`order`)** son documentos comerciales/provisionales: pueden guardarse, vincularse a una factura (`linkedDocumentId`) sin duplicar compras y validarse parcialmente aunque no traigan desglose de IVA, pero **nunca sustituyen ni publican costos definitivos de factura**.

4. **Códigos de proveedor NO universales:**
   - Un código impreso en factura pertenece al par `(supplier_key, supplier_code)` en la tabla `supplier_products`, **nunca** es un identificador universal entre distintos proveedores (solo el código de barras EAN/GTIN en `products.barcode` es propio del artículo comercial, y aun así es opcional).
   - La coincidencia por código de proveedor sugiere el producto en revisión humana; **no confirma ni sobreescribe silenciosamente** un mapeo distinto sin explicación en `notes`.
   - Un producto canónico puede tener varias descripciones por proveedor en `product_aliases`. Solo se aprenden al confirmar una factura revisada, en el mismo lote atómico de costos y auditoría. Conservar siempre la descripción original de cada renglón.
   - Las coincidencias por semejanza o Gemini son opciones para revisión, sin asignación automática de `productId`. Si se pretende crear desde una factura un artículo con candidatos, exigir revisión explícita y motivo de diferencia tanto en la interfaz como en la API. No fusionar retroactivamente registros existentes ni variantes/tamaños sin un flujo específico autorizado.

5. **Precios de venta actuales opcionales y referencias sin doble IVA:**
   - `products.salePrice` es **siempre opcional** (`""` cuando no se registra). **Jamás** se guarda `"0"` / `"0.00"` como precio de venta ni se toma automáticamente un PVP sugerido por el proveedor como precio de la tienda.
   - Las referencias comerciales de `+20 %`, `+25 %` y `+30 %` (`calculatePriceReferences`) permiten elegir explícitamente la base:
     - `gross`: sobre el **costo unitario total pagado** (ya incluye IVA e impuestos de compra; no volver a sumar IVA encima).
     - `net`: sobre el **costo unitario neto antes de impuestos** (`netUnitCost`), advirtiendo que no incluye el IVA de compra/venta.
   - La diferencia comercial se calcula siempre como `precio de venta actual − costo unitario total pagado` y alerta explícitamente si está por debajo del costo pagado.

6. **Promociones y bonificaciones reales:**
   - Bonificación del **mismo producto** (`bonusQty` con `promoKind = "same_product"` o vacío): suma unidades reales recibidas de comparación y reduce el costo pagado por unidad.
   - Promoción de **producto distinto** (`promoKind = "different_product"`): no inventa reposición a costo cero; deja el costo unitario pendiente de asignación o documentado como promoción cruzada.

7. **Inmutabilidad del historial, auditoría y concurrencia (CAS):**
   - Una compra confirmada no se edita destructivamente en sitio: se usa la acción de **corregir** (crea nueva revisión/reemplazo conservando rastro) o **anular** (`void`) con motivo obligatorio del `admin`, registrando cada cambio en `audit_log`.
   - El historial de costos se ordena por **fecha del documento (`documents.date`)**, no por fecha de digitación.
   - Toda escritura crítica usa control optimista (`version` + `update_token`), idempotencia (`idempotency_keys` con `operationId` y huella SHA-256 del payload) y ejecución atómica con `db.batch(...)`.

8. **Alcance fiscal y legal en Ecuador:**
   - La validación interna comprueba coherencia aritmética contra el documento físico/electrónico; **no equivale a comprobar autorización tributaria en el SRI**, ni emite comprobantes electrónicos ni presenta declaraciones.

9. **Privacidad absoluta de originales (`muestras/originales/`):**
   - Los archivos reales del usuario en `muestras/originales/` están fuera del repositorio Git de `aplicacion/`, nunca se copian a `aplicacion/`, nunca se empaquetan en `.tar.gz`, nunca se suben a servicios externos de OCR/IA y nunca se publican como datos de semilla en producción.
   - El OCR **local** se ejecuta **100 % en el navegador** con recursos locales servidos desde `aplicacion/public/ocr` (Tesseract.js WASM local) y siempre requiere revisión humana; nunca inventa proveedor, productos ni totales ambiguos. Gemini opcional sigue la decisión vigente anterior y nunca envía las muestras originales del proyecto.

---

## 2. Arquitectura y forma de programar este proyecto

### Stack y entorno de ejecución
- **Runtime:** Node.js `>=22.13.0` (desarrollado y verificado en Windows con Node `24.20.0`).
- **Modo alternativo de compatibilidad Sites (no es requisito para usar el programa local):** **Vinext** (`vinext` sobre Vite 8 + React 19) compilado para **Cloudflare Workers** (`@cloudflare/vite-plugin`, `wrangler`), con **Cloudflare D1 (SQLite)** vía **Drizzle ORM** y **Cloudflare R2** (`FILES`) para originales y respaldos diarios.
- **Compatibilidad obligatoria con ChatGPT Sites:**
  - Conservar intactos `.openai/hosting.json`, `scripts/sites-env.mjs`, `scripts/run-framework.mjs`, `scripts/execution-profile.mjs`, `scripts/tool-environment.mjs`, `scripts/install-ci.mjs`, `scripts/vite/sites-vite-plugin.ts` y los scripts `install:ci`, `dev`, `build`, `start` de `aplicacion/package.json`.
  - Autenticación basada en cabeceras `oai-authenticated-user-id` y `oai-authenticated-user-email` (`aplicacion/app/chatgpt-auth.ts`). La identidad simulada (`seedy@sites.test` mediante `/signin-with-chatgpt`) solo se activa en desarrollo local (`portable`), jamás en producción.
  - El archivo publicable `mi-tienda-publicacion-final.tar.gz` contiene únicamente `dist/` (incluyendo `dist/.openai/hosting.json`, `dist/.openai/drizzle/`, `dist/client/` y `dist/server/`).

### Estructura compacta y sin sobreingeniería
El código de `aplicacion/` mantiene deliberadamente pocos módulos cohesivos, tipado estricto (`strict: true`, cero `any`) y dependencias mínimas:

- `aplicacion/db/schema.ts` y `aplicacion/drizzle/*.sql`: esquema SQLite/D1 y migraciones numeradas generadas con `npm run db:generate`. Nunca editar tablas en producción sin migración SQL en `drizzle/`.
- `aplicacion/lib/calculations.ts`: motor puro sin dependencias de red ni base de datos (fácil de probar con `node --experimental-strip-types --test`). Contiene `Rational`, validadores numéricos, cálculo de líneas/totales/redondeos y `calculatePriceReferences`.
- `aplicacion/lib/ocr.ts`: heurísticas conservadoras sobre texto OCR para proponer campos explícitos sin adivinar datos ausentes.
- `aplicacion/lib/server.ts`: toda la API HTTP (`/api/*`), control de roles (`admin` encargado vs `member` colaborador), consultas D1/R2, lotes atómicos `db.batch`, auditoría, exportación CSV y respaldo/restauración íntegros con límites explícitos (nunca devolver copias truncadas como completas).
- `aplicacion/app/page.tsx` y `aplicacion/app/globals.css`: interfaz completa en español claro para operación diaria de tienda (captura con visor giratorio de originales, sugerencias de OCR y códigos de proveedor revisables por humano, catálogo, historial con referencias de precios, equipo y respaldos), con estética cálida de cuaderno contable moderno y soporte táctil/escritorio sin librerías pesadas de UI.
- `aplicacion/tests/`:
  - `calculations.test.ts` y `ocr.test.ts`: pruebas unitarias rápidas en Node puro (`npm run test:unit`).
  - `server.test.ts` y `server-capacity.test.ts`: pruebas integrales de API, concurrencia CAS, permisos, R2/D1 y capacidad con Miniflare (`npm run test:server` / `npm test`).

### Convenciones de código y estilo
1. **Idioma:** interfaz de usuario, mensajes de error de API, comentarios de dominio y documentación en **español claro** (términos cotidianos de tienda ecuatoriana: *factura, nota de entrega, pedido, encargado, colaborador, bonificación, presentación, unidad de comparación*). Identificadores de código y columnas SQL en inglés conciso consistente con el esquema actual.
2. **Tipado y limpieza:** prohibido usar `any`; validar toda entrada externa en `lib/server.ts` y `lib/calculations.ts` (límites de longitud, caracteres de control, techos numéricos, rechazo de `NaN`/`Infinity`/notación científica).
3. **Respaldos retrocompatibles:** cada vez que se agregue una tabla o columna persistente en `db/schema.ts`, es **obligatorio** actualizar simultáneamente:
   - `npm --prefix aplicacion run db:generate` (nueva migración en `aplicacion/drizzle/`)
   - `npm --prefix aplicacion run db:migrate:local` (aplicar a `.wrangler/state` local)
   - `BACKUP_TABLES`, `BACKUP_SIZE_SQL`, `GET /api/backup` y `POST /api/restore` en `aplicacion/lib/server.ts` manteniendo compatibilidad con respaldos anteriores.
4. **Flujo obligatorio de verificación antes de cerrar cualquier cambio:**
   Desde la raíz o `aplicacion/`, todo cambio de código debe dejar en verde:
   - `npm --prefix aplicacion run typecheck`
   - `npm --prefix aplicacion run lint`
   - `npm --prefix aplicacion test` (`test:unit` + `test:server` + `test:capacity`)
   - `npm --prefix aplicacion run build`
   - `npm --prefix aplicacion run package:site` (cuando el cambio deba quedar listo para publicar en ChatGPT Sites)

---

## 3. Mapa rápido de documentación y skills del proyecto

- Bitácora detallada de entregas, mejoras y archivos tocados (actualizar en cada entrega): `docs/BITACORA_DE_CAMBIOS.md`
- Estado actual y hoja de ruta viva: `docs/ESTADO_Y_PENDIENTES.md`
- Reglas de negocio detalladas: `docs/ESPECIFICACION_INICIAL.md` y `docs/REVISION_MUESTRAS.md`
- Operación para usuarios finales: `docs/GUIA_DE_USO.md`
- Skills especializados en `.agents/skills/`:
  - `desarrollo-y-publicacion`: comandos en Windows, migraciones D1 locales, servidor dev con login simulado, pruebas Miniflare y empaquetado `.tar.gz` para ChatGPT Sites.
  - `motor-decimal-y-esquema`: guía paso a paso para modificar `calculations.ts`, `db/schema.ts`, migraciones Drizzle, lotes CAS en `server.ts` y respaldos.
  - `muestras-y-reglas-ecuador`: referencia de los 6 casos reales ecuatorianos (*Roguizam, Danec, Ales, Coile, Arcor, Colombina*), redondeos de IVA y reglas de privacidad.

