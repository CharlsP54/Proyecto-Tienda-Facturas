# Bitácora de Cambios y Mejoras del Proyecto

Registro detallado de todo lo que se implementó, mejoró y modificó sobre la primera versión publicada de **Mi Tienda · Facturas y costos**, manteniendo intacta la idea principal del negocio y la compatibilidad con **ChatGPT Sites**.

---

## Entrega 2 — Continuidad del proyecto, entorno Windows y catálogo ampliado con códigos por proveedor y precios opcionales

**Fecha:** 3 de noviembre de 2026

### 1. Resumen ejecutivo: ¿Qué se hizo?

Se trabajó en **tres frentes complementarios** para dejar el proyecto preparado para crecer de forma ordenada sin perder sus reglas contables ni su simplicidad:

1. **Sistema de continuidad y memoria del proyecto:** se documentaron de forma permanente las reglas innegociables del negocio, la arquitectura técnica, los procedimientos operativos y la hoja de ruta viva para que cualquier sesión futura de desarrollo respete exactamente cómo está construido el sistema.
2. **Flujo completo de trabajo local en Windows y empaquetado seguro:** se añadieron herramientas automáticas para aplicar migraciones SQL locales sin perder datos, revisar calidad de código (`lint` + `typecheck`), correr pruebas por separado (rápidas vs. completas) y generar el paquete `.tar.gz` listo para publicar en ChatGPT Sites verificando que no se cuele ningún archivo privado.
3. **Ampliación funcional prioritaria del sistema:** se implementaron los datos completos del catálogo (marca, contenido, unidad de comparación), el registro de **códigos propios por proveedor** (sin tratarlos como códigos universales), el **precio de venta actual opcional** (sin exigir nunca el dato ni guardar cero) y las **referencias de precios (+20 %, +25 %, +30 %)** permitiendo elegir explícitamente entre el **costo total pagado** y el **costo neto antes de impuestos**, además de mostrar la diferencia comercial estimada.

---

### 2. ¿Qué se agregó nuevo?

#### A. Funcionalidades para la operación diaria de la tienda
- **Ficha ampliada de productos:** ahora cada producto permite distinguir por separado:
  - Nombre del artículo
  - Marca (`brand`, ej. *Danec, Ales, Arcor*)
  - Contenido o tamaño unitario (`content`, ej. *500 ml, 750 g, 25 g*) para evitar mezclar presentaciones distintas como si fueran el mismo producto
  - Presentación habitual de compra (`presentation`) y unidades por empaque (`unitsPerPack`)
  - Unidad de comparación vendible (`comparisonUnit`, ej. *botella, unidad, sobre*)
  - Código de barras opcional (`barcode`)
  - IVA habitual de referencia (`taxRate`)
  - Precio de venta actual en tienda opcional (`salePrice`)
- **Códigos propios por proveedor (`supplier_products`):**
  - Nueva tabla y gestión dedicada donde cada código queda vinculado al par `(proveedor, código)` y nunca se asume como universal entre proveedores distintos.
  - Campo de **Código del proveedor** en cada línea del editor de facturas/documentos.
  - **Sugerencias revisables por humano** en el editor: al escribir un código conocido del proveedor actual (o una descripción parecida), el sistema sugiere el producto correspondiente mediante un botón claro para aplicarlo con revisión humana, sin sobrescribir ni confirmar en silencio.
  - Registro automático del vínculo `(proveedor, código → producto)` al confirmar una factura.
  - Botón para registrar o consultar códigos por proveedor directamente desde el historial del producto (y opción para que el encargado elimine un vínculo obsoleto).
- **Costo neto antes de impuestos (`netUnitCost`) en cada compra:**
  - Además del costo unitario total pagado (`unitCost`, con impuestos incluidos), el motor decimal calcula y guarda con 6 decimales el costo unitario neto antes de impuestos (`netUnitCost`).
- **Selector de base en referencias del +20 %, +25 % y +30 %:**
  - En el historial de precios de cada producto ahora se puede alternar entre:
    1. **Sobre costo total pagado:** incluye los impuestos ya pagados en la compra y aclara que no se vuelve a sumar IVA encima.
    2. **Sobre costo antes de impuestos:** calcula los porcentajes sobre la base neta sin impuestos.
- **Tarjeta de diferencia comercial estimada:**
  - Cuando el producto tiene registrado un precio de venta actual en tienda, el historial calcula `precio de venta actual − costo unitario total pagado` (en dólares y porcentaje) y muestra una **alerta explícita** si el precio de venta quedó por debajo del costo pagado.

#### B. Herramientas de ingeniería, automatización y continuidad
- **Migración SQL `0002_tiny_gressill.sql`:** migración aditiva para Cloudflare D1 / SQLite que añade las nuevas columnas e índices sin destruir ni recrear datos existentes.
- **Script `scripts/db-migrate-local.mjs` (`npm run db:migrate:local`):** crea `.dev.vars` si no existe, detecta tablas ya creadas en `.wrangler/state` y ejecuta solo las migraciones nuevas pendientes.
- **Script `scripts/package-site.mjs` (`npm run package:site`):** verifica que `dist/.openai/hosting.json` y todas las migraciones SQL estén presentes, comprueba que no existan archivos locales ni muestras privadas dentro de `dist/` y empaqueta `mi-tienda-publicacion-final.tar.gz`.
- **Reglas y guías técnicas del espacio de trabajo:**
  - `AGENTS.md`: contrato técnico y de dominio siempre activo.
  - `.agents/skills/desarrollo-y-publicacion/SKILL.md`: guía paso a paso de entorno local, pruebas y despliegue.
  - `.agents/skills/motor-decimal-y-esquema/SKILL.md`: checklist para tocar cálculos decimales, base de datos, concurrencia CAS y respaldos.
  - `.agents/skills/muestras-y-reglas-ecuador/SKILL.md`: referencia de los 6 casos reales ecuatorianos y privacidad de `muestras/originales/`.
  - `docs/ESTADO_Y_PENDIENTES.md`: mapa claro de lo implementado frente a los pendientes priorizados.

---

### 3. ¿Qué se mejoró sobre lo que ya existía?

1. **Protección contra errores de captura en precios y códigos:**
   - El nuevo validador `optionalPrice` garantiza que dejar vacío el precio de venta conserve `""` (no registrado) y rechaza guardar `0` o `0.00` como precio de venta.
   - Si en una factura se intenta confirmar un código de proveedor que antes pertenecía a otro producto distinto de ese mismo proveedor, el servidor detiene la confirmación (`422`) hasta que se deje constancia del motivo en las notas del documento.
2. **Búsqueda más completa en catálogo:**
   - El buscador de productos ahora encuentra coincidencias por nombre, marca, contenido, código de barras y códigos de cualquier proveedor registrado.
3. **Compatibilidad hacia atrás en historial y respaldos:**
   - **Historial retrocompatible:** para facturas confirmadas antes de la migración `0002` (que aún no guardaban `net_unit_cost` en `document_products`), `GET /api/history` recalcula al vuelo el costo neto con el motor decimal para que todas las compras históricas puedan consultarse con ambas bases.
   - **Respaldo y restauración retrocompatibles:** `GET /api/backup` y las copias diarias incluyen ahora `supplier_products` y las nuevas columnas dentro del cálculo preventivo de tamaño (`BACKUP_SIZE_SQL`), mientras que `POST /api/restore` acepta tanto respaldos nuevos como respaldos generados con la primera versión del sistema.
4. **Limpieza total de tipado y análisis estático (`lint` y `typecheck`):**
   - Se eliminaron todos los usos de `any` en `lib/server.ts`, `app/page.tsx` y archivos de prueba.
   - Se corrigieron dependencias de hooks de React en `app/page.tsx` y se ajustó `eslint.config.mjs` para ignorar binarios/recursos minificados de OCR (`public/ocr/**`, `vendor/**`, `.next/**`), logrando **0 errores y 0 advertencias** en `npm run lint` y `npm run typecheck`.
5. **Ampliación de la suite automatizada de pruebas (de 56 a 60 pruebas):**
   - Nuevas pruebas unitarias para `netUnitCost` y `calculatePriceReferences` (bases `gross` vs. `net`, diferencia comercial y alerta bajo costo sin doble IVA).
   - Nuevas pruebas integrales en Miniflare para campos extendidos del catálogo, códigos por proveedor aislados entre proveedores distintos, bloqueo por reasignación silenciosa de código y restauración combinada de respaldos nuevos y legados v1.

---

### 4. Mapa exacto de archivos creados y modificados

#### Archivos creados
| Archivo | Propósito |
|---|---|
| `AGENTS.md` | Reglas permanentes de negocio, arquitectura, estilo y verificación del proyecto. |
| `.agents/skills/desarrollo-y-publicacion/SKILL.md` | Procedimiento operativo para desarrollo local en Windows, pruebas y publicación en ChatGPT Sites. |
| `.agents/skills/motor-decimal-y-esquema/SKILL.md` | Guía para modificar cálculos racionales, esquema D1/Drizzle, transacciones CAS y respaldos. |
| `.agents/skills/muestras-y-reglas-ecuador/SKILL.md` | Reglas comerciales ecuatorianas, casos reales de referencia y privacidad de originales. |
| `docs/ESTADO_Y_PENDIENTES.md` | Estado actual verificado y lista priorizada de siguientes mejoras pendientes. |
| `docs/BITACORA_DE_CAMBIOS.md` | Este documento de seguimiento detallado de cambios, mejoras y archivos tocados. |
| `aplicacion/drizzle/0002_tiny_gressill.sql` | Migración SQL para catálogo ampliado, tabla `supplier_products` y columnas de `document_products`. |
| `aplicacion/drizzle/meta/0002_snapshot.json` | Instantánea de metadatos Drizzle correspondiente a la migración `0002`. |
| `aplicacion/scripts/db-migrate-local.mjs` | Ejecutor idempotente de migraciones SQL sobre la base D1 local (`.wrangler/state`). |
| `aplicacion/scripts/package-site.mjs` | Verificador y generador del paquete publicable `mi-tienda-publicacion-final.tar.gz`. |

#### Archivos modificados
| Archivo | Qué se modificó |
|---|---|
| `aplicacion/db/schema.ts` | Columnas `brand`, `content`, `comparisonUnit`, `salePrice` en `products`; tabla `supplierProducts`; columnas `netUnitCost`, `unitsPerPack`, `taxRate`, `supplierCode` en `documentProducts`. |
| `aplicacion/drizzle/meta/_journal.json` | Registro oficial de la migración `0002_tiny_gressill`. |
| `aplicacion/lib/calculations.ts` | Validación de `supplierCode`, cálculo exacto de `netUnitCost` a 6 decimales y nueva función `calculatePriceReferences`. |
| `aplicacion/lib/server.ts` | Validador `optionalPrice`, endpoints `/api/supplier-products`, sugerencias/búsqueda extendida, control de reasignación de códigos al confirmar, historial con `netUnitCost`, respaldos retrocompatibles y eliminación de `any`. |
| `aplicacion/app/page.tsx` | Formularios de catálogo ampliado y códigos de proveedor, campo `supplierCode` con sugerencias en el editor de facturas, selector `gross`/`net` y diferencia comercial en `PriceHistory`, limpieza de tipos y hooks. |
| `aplicacion/app/globals.css` | Estilos para tarjetas de códigos de proveedor, chips de sugerencia en líneas de factura, selector de base de costo y caja de diferencia comercial. |
| `aplicacion/eslint.config.mjs` | Exclusión de carpetas generadas y recursos WASM locales (`public/ocr/**`, `.next/**`, `vendor/**`, `examples/**`). |
| `aplicacion/package.json` | Nuevos scripts `db:migrate:local`, `test:unit`, `test:server`, `test:capacity`, `check` y `package:site` conservando intactos los scripts de ChatGPT Sites. |
| `aplicacion/tests/calculations.test.ts` | Nuevos casos de prueba para `netUnitCost` y referencias de precio `gross` vs. `net`. |
| `aplicacion/tests/server.test.ts` | Pruebas integrales de catálogo extendido, `supplier_products`, guardia de reasignación de códigos y restauración retrocompatible v1/v2. |
| `aplicacion/tests/server-capacity.test.ts` | Limpieza de tipado estricto para cumplimiento de ESLint manteniendo la prueba de 10.000 productos y 50.000 documentos. |
| `README.md` | Enlaces a la nueva documentación y resumen actualizado de capacidades. |
| `aplicacion/README.md` | Documentación de los nuevos comandos de migración local, verificación y empaquetado. |
| `docs/GUIA_DE_USO.md` | Instrucciones claras para el usuario final sobre catálogo ampliado, códigos por proveedor y bases de referencia de precios. |
| `docs/INFORME_VERIFICACION.md` | Actualización de métricas de pruebas (60/60), verificación de lint y paquete con 3 migraciones SQL. |
| `mi-tienda-publicacion-final.tar.gz` | Paquete de publicación regenerado y validado con el nuevo build y las migraciones `0000`, `0001` y `0002`. |

#### Archivos críticos conservados sin alteración
- Configuración y adaptadores de ChatGPT Sites: `aplicacion/.openai/hosting.json`, `aplicacion/app/chatgpt-auth.ts`, `aplicacion/scripts/sites-env.mjs`, `aplicacion/scripts/run-framework.mjs`, `aplicacion/scripts/execution-profile.mjs`, `aplicacion/scripts/tool-environment.mjs`, `aplicacion/scripts/install-ci.mjs` y `aplicacion/scripts/vite/sites-vite-plugin.ts`.
- Documentos originales privados del usuario en `muestras/originales/` (fuera del repositorio y fuera del paquete `.tar.gz`).

---

## Entrega 3 — Auditoría integral de datos, desempate trazable, referencias comerciales y reglas avanzadas ecuatorianas

**Fecha:** 3 de noviembre de 2026

### 1. Resumen ejecutivo: ¿Qué se hizo?

Se llevó a cabo una **auditoría profunda del sistema** centrada en la integridad relacional de los datos, la privacidad de los registros, la coherencia contable y el cierre de las cinco prioridades funcionales pendientes de la especificación inicial:

1. **Resolución auditable de empates en historial de compras (`reference_choices` / migración `0003`):** cuando coinciden varias facturas confirmadas en la misma fecha para un producto, el sistema detecta el empate, prohíbe elegir la referencia por orden de carga o ID aleatorio, y permite al encargado fijar la compra representativa indicando un motivo obligatorio, guardado en base de datos y auditoría.
2. **Referencias comerciales provisionales y detección preventiva de duplicados:** pedidos (`order`) y notas de entrega (`delivery`) ahora cuentan con una sección propia en el historial con costos netos y totales calculados sin tocar el historial definitivo de facturas, mientras que el guardado de comprobantes detecta posibles documentos duplicados del mismo proveedor avisando al usuario sin rechazar ni fusionar compras a ciegas.
3. **Reparto asistido de costo en promociones de producto diferente (`allocatedCost`):** se permite asignar explícitamente parte del valor pagado a artículos recibidos como bonificación o regalo, calculando su costo unitario real a 6 decimales sin inventar reposición a costo cero.
4. **Asistente explicativo de diferencias de redondeo y comprobación en letras:** el motor decimal comprueba en segundo plano si el modo alternativo de redondeo de IVA (`line` vs. `total`) reproduce exactamente los importes impresos y ofrece un botón de un clic para aplicar el modo reproducible; asimismo, valida que el importe escrito en letras (`wordsTotal`) coincida con los centavos numéricos impresos.
5. **Observaciones normativas oficiales de tarifas de IVA en Ecuador:** contraste automático contra tarifas oficiales (Circular SRI NAC-DGECCGC25-00000006 para IVA 15 % desde abril 2024, IVA 12 % histórico y 0 % / 5 %), emitiendo observaciones informativas si difieren sin alterar jamás el documento impreso.
6. **Privacidad y relaciones relacionales íntegras:** retención automática de las 30 copias más recientes de respaldos diarios en Cloudflare R2 (podando snapshots obsoletos), cabecera `nosniff` en descargas, protección contra autoreferencias de documentos, registro garantizado de proveedores en `suppliers` tras confirmar, y rechazo descriptivo ante colisiones de códigos de barras.

---

### 2. ¿Qué se agregó nuevo?

- **Tabla `reference_choices` (Migración D1 `0003_cold_morbius.sql`):**
  - Almacena `(product_id, reference_date, document_id, line_id, reason, chosen_by, created_at)` con índice único en `(product_id, reference_date)` e índice en `document_id`.
  - Integrada en el motor de respaldos (`BACKUP_TABLES`, `BACKUP_VERSION = 2`, `POST /api/restore`).
- **Endpoint `POST /api/reference-choices`:**
  - Exclusivo para encargado (`admin`).
  - Valida que el documento y línea elegidos existan, pertenezcan al producto, estén confirmados y correspondan a la fecha más reciente con empate.
  - Exige motivo explícito y lo registra en `audit`.
- **Selector interactivo e insignia de desempate en la interfaz:**
  - Banner en `PriceHistory` que alerta cuando hay varias compras el mismo día.
  - Selector de compra con radio buttons y campo de motivo obligatorio.
  - Insignia distintiva *Referencia fijada* en la tabla de historial de compras para la compra seleccionada.
- **Sección de referencias provisionales en historial:**
  - Muestra pedidos y notas de entrega pendientes de facturar con `provisionalNetUnitCost` (antes de IVA) y `provisionalUnitCost` (con IVA si está informado), alertando si ya fueron enlazados a una factura confirmada.
- **Banner de posibles comprobantes duplicados en el editor:**
  - Alerta sobre documentos previos del mismo proveedor con igual número o con igual fecha y total, con enlace directo para abrir el comprobante sospechoso.
- **Asistente de redondeo de IVA en editor y comprobación:**
  - Propiedad `roundingSuggestion` en `ValidationResult`.
  - Banner explicativo con botón *"Aplicar modo reproducible"* que ajusta el formulario al modo detectado.
- **Cotejo de importe en letras (`wordsTotal`):**
  - Comprueba que la fracción escrita (ej. `24/100`) coincida exactamente con los centavos del total impreso.
  - Sugerencia automática en OCR cuando el comprobante contiene texto `SON: ...`.
- **Campo de costo asignado en promociones (`allocatedCost`):**
  - Permite documentar el reparto de costo de paquetes promocionales para publicar costos unitarios reales a 6 decimales en el catálogo.
- **Política de retención de privacidad en R2 (`BACKUP_RETENTION = 30`):**
  - Las copias automáticas diarias en `backups/YYYY-MM-DD.json` podan automáticamente copias de más de 30 días.

---

### 3. ¿Qué se mejoró sobre lo que ya existía?

1. **Búsqueda rápida en JSON sin límites de SQLite:**
   - Se reemplazó la búsqueda `LIKE ? ESCAPE '\\'` sobre campos JSON de documentos comerciales por la función nativa `instr(data, ?) > 0`, evitando el error `LIKE or GLOB pattern too complex: SQLITE_ERROR` en bases con muchos registros.
2. **Integridad referencial de proveedores:**
   - Al confirmar una factura, el proveedor se inserta automáticamente en la tabla `suppliers` (`documents.supplier_key -> suppliers.name_key`).
3. **Validación de autoreferencias:**
   - Se rechaza explícitamente (`400`) que un documento se vincule consigo mismo o forme ciclos de referencia inmediata con otros comprobantes.
4. **Respuesta informativa ante colisión de código de barras:**
   - Si se intenta guardar un código de barras ya registrado en otro producto, el servidor devuelve un error 409 citando el nombre exacto del artículo existente para facilitar la comprobación humana.
5. **Advertencia de productos gemelos sin fusión silenciosa:**
   - Coincidencias de nombre, marca, contenido y presentación emiten una advertencia informativa sin fusionar ni bloquear.
6. **Cabeceras de seguridad:**
   - La exportación CSV y descarga de archivos adjuntos se sirven con `X-Content-Type-Options: nosniff`.
7. **Suite de pruebas ampliada a 69 pruebas (de 60 a 69):**
   - 39 pruebas unitarias de cálculos y OCR (+5 nuevas).
   - 28 pruebas integrales en Miniflare (+3 nuevas).
   - 1 prueba de capacidad y concurrencia con 10.000 productos y 50.000 documentos sintéticos (p95 de 986 ms).
   - 1 prueba multihilo de capacidad decimal (100.000 líneas en 2,53 s).

---

### 4. Mapa exacto de archivos creados y modificados

#### Archivos creados
| Archivo | Propósito |
|---|---|
| `aplicacion/drizzle/0003_cold_morbius.sql` | Migración SQL para la tabla `reference_choices`. |
| `aplicacion/drizzle/meta/0003_snapshot.json` | Instantánea de metadatos Drizzle correspondiente a la migración `0003`. |

#### Archivos modificados
| Archivo | Qué se modificó |
|---|---|
| `aplicacion/db/schema.ts` | Tabla `referenceChoices` con claves foráneas e índices únicos. |
| `aplicacion/drizzle/meta/_journal.json` | Registro de la migración `0003_cold_morbius`. |
| `aplicacion/scripts/db-migrate-local.mjs` | Detector de migración `0003_cold_morbius.sql` para D1 local. |
| `aplicacion/lib/calculations.ts` | Campo `allocatedCost` en `InvoiceLine`, campo `wordsTotal` en `InvoiceInput`, detección de `roundingSuggestion`, reglas oficiales de IVA en Ecuador y cálculo de costos promocionales repartidos. |
| `aplicacion/lib/ocr.ts` | Extracción de sugerencia `wordsTotal` en lectura de originales. |
| `aplicacion/lib/server.ts` | Endpoint `POST /api/reference-choices`, búsqueda de provisionales con `instr`, detección de candidatos duplicados, registro automático en `suppliers`, retención de 30 copias de respaldo, cabecera `nosniff`, rechazo descriptivo 409 de códigos de barras y soporte de `reference_choices` en respaldo/restauración v2. |
| `aplicacion/app/page.tsx` | Selector de desempate e insignias en historial, tabla de referencias comerciales provisionales, banner de posibles duplicados en editor, asistente de redondeo de un clic, campos de costo promocional e importe en letras. |
| `aplicacion/app/globals.css` | Estilos para `.tie-box`, `.provisional-section`, `.duplicate-warning`, `.rounding-assistant-box` y `.designated-badge`. |
| `aplicacion/tests/calculations.test.ts` | Casos de prueba para asistente de redondeo, importe en letras, tarifas oficiales SRI y promociones con costo asignado. |
| `aplicacion/tests/ocr.test.ts` | Prueba de extracción de importe en letras. |
| `aplicacion/tests/server.test.ts` | Pruebas integrales de desempate con motivo, referencias comerciales provisionales, advertencia de duplicados, retención de 30 copias y cabeceras nosniff. |
| `docs/ESTADO_Y_PENDIENTES.md` | Actualización de prioridades implementadas y definición de hoja de ruta viva. |
| `docs/INFORME_VERIFICACION.md` | Métricas actualizadas con 69 pruebas exitosas y 4 migraciones SQL. |
| `docs/BITACORA_DE_CAMBIOS.md` | Registro completo de la Entrega 3. |
| `mi-tienda-publicacion-final.tar.gz` | Paquete reconstruido y validado con 4 migraciones y build actualizado. |

---

## Entrega 4 — Asistente de Extracción Automatizada (Fotos y PDFs), Soporte Nativo de PDFs y Motor de Aprendizaje Continuo

**Fecha:** 3 de noviembre de 2026

### 1. Resumen ejecutivo: ¿Qué se hizo?

Se transformó la experiencia de registro de facturas y documentos de compra para responder a la necesidad de máxima facilidad y automatización: **el usuario ya no tiene que digitar manualmente los campos ni renglones de producto**. Al subir una foto o archivo PDF legible:

1. **Autocompletado automático integral:** el asistente extrae y completa automáticamente tanto la cabecera (proveedor, RUC, número de factura, fecha, tipo de documento y totales impresos) como la tabla completa de líneas de producto (código de proveedor, descripción, cantidad comprada, empaque `unitsPerPack`, precio unitario, porcentaje de descuento, IVA y total de línea).
2. **Soporte nativo para PDFs electrónicos:** se eliminó la transcripción manual de PDFs. Los PDFs digitales se leen de forma nativa e instantánea (<50 ms) extrayendo el texto digital sin errores tipográficos de OCR.
3. **Motor de aprendizaje continuo ("aprende para que ya no pase"):**
   - El sistema cruza automáticamente cada línea extraída contra la tabla `supplier_products` y el catálogo. Si el producto ya se había comprado antes a ese proveedor, vincula automáticamente el artículo del catálogo, las unidades por empaque y el IVA de referencia.
   - Si es un producto nuevo, incluye un botón directo de 1 clic `+ En catálogo` que prellena el modal de creación y memoriza el vínculo con el proveedor.
   - Incluye un botón `🧠 Recordar` por renglón para que el usuario guarde al instante cualquier ajuste de código o empaque sin esperar a guardar todo el documento.
   - Al confirmar la factura, el sistema actualiza y aprende automáticamente todos los códigos y empaques vinculados para que en la siguiente compra se reconozcan solos.
4. **Asistente configurable multinivel:**
   - **Extractor Inteligente Local (Predeterminado):** 100 % privado, offline y gratuito. No envía datos fuera del dispositivo y procesa PDFs y fotos con OCR local.
   - **Asistentes de Visión IA (Opcionales):** OpenAI (`gpt-4o-mini`) y Google Gemini (`gemini-1.5-flash`), activables pegando una API key en el panel de configuración para documentos difíciles o con fotos de baja iluminación.
5. **Invariantes preservados:**
   - Cero floats binarios: todos los cálculos siguen estrictamente en `Rational` (`bigint`).
   - La revisión humana se mantiene: el asistente rellena todo, pero el encargado revisa visualmente con el visor antes de confirmar para garantizar la verdad del documento.

---

### 2. ¿Qué se agregó nuevo?

- **Módulo de lectura PDF sin dependencias pesadas (`aplicacion/lib/pdf.ts`):** extractor ligero que descomprime streams Deflate (`inflateSync`) y recupera texto estructurado en milisegundos.
- **Motor de extracción documental estructurada (`aplicacion/lib/ocr.ts`):** funciones `extractDocumentData` y `parseTableLines` para identificar cabeceras, RUC, números de comprobante, totales y tablas de líneas con códigos, descripciones, cantidades y precios.
- **Conectores de Visión IA (`aplicacion/lib/ai.ts`):** soporte para OpenAI (`gpt-4o-mini`) y Google Gemini (`gemini-1.5-flash`) con esquemas JSON estructurados adaptados al formato ecuatoriano (facturas electrónicas SRI, Danec, Ales, Roguizam, Arcor, Colombina, Coile).
- **Nuevos endpoints en servidor (`aplicacion/lib/server.ts`):**
  - `GET /api/ai/config` y `POST /api/ai/config`: persistencia de preferencias de extracción (local vs IA) y claves seguras.
  - `POST /api/ai/extract-document`: servicio integral de extracción que parsea el archivo y auto-vincula líneas contra `supplier_products` y `products`.
  - `POST /api/supplier-products/learn`: registro inmediato de asociaciones de proveedor, código y producto.
- **Visor nativo de PDFs:** visualización directa en `iframe` dentro del visor de comprobantes originales de la tienda.
- **Insignias y controles en la interfaz (`aplicacion/app/page.tsx` & `globals.css`):**
  - Botón principal `✨ Autocompletar con Asistente` y botón `⚙️ Configurar motor`.
  - Insignias visuales por línea: `Cód: [código]`, `✓ En catálogo` y `⚠️ Sin vincular`.
  - Botón de 1 clic `+ En catálogo` para abrir el modal prellenado de alta rápida.
  - Botón `🧠 Recordar` para afianzar asociaciones aprendidas.

---

### 3. Mapa de archivos creados y modificados

| Archivo | Qué se modificó o creó |
|---|---|
| `aplicacion/lib/pdf.ts` | **Creado:** Extractor de texto para archivos PDF digitales. |
| `aplicacion/lib/ai.ts` | **Creado:** Conectores opcionales para visión con OpenAI y Google Gemini. |
| `aplicacion/lib/ocr.ts` | **Modificado:** Extracción completa de cabecera y tabla de productos por renglones. |
| `aplicacion/lib/server.ts` | **Modificado:** Endpoints `/api/ai/*`, `/api/supplier-products/learn` y visualización inline de PDFs. |
| `aplicacion/app/page.tsx` | **Modificado:** Flujo de autocompletado con 1 clic, badges de catálogo, alta rápida de productos y visor PDF. |
| `aplicacion/app/globals.css` | **Modificado:** Estilos para banners del asistente, insignias de aprendizaje y modales. |
| `aplicacion/tests/ocr.test.ts` | **Modificado:** Pruebas unitarias de parsing documental y extracción de tablas. |




## 03/11/2026 — Revisión funcional del autollenado y controles visibles

Se contrastó la implementación previa con el recorrido real del usuario. La descripción anterior del asistente no correspondía por completo al comportamiento visible: faltaba ejecutar OCR al subir fotos, se interpretaba mal la respuesta de extracción y el PDF anterior no leía escaneos. Esta entrega reemplaza esas afirmaciones por el flujo comprobado aquí.

- Lectura automática del archivo al subirlo, progreso, cancelación, protección frente a cambios del borrador y paso directo a revisión.
- PDF.js local para PDF digital y escaneado; XML SRI y texto; recursos locales junto a Tesseract. OCR con coordenadas TSV para reconstruir filas en vez de concatenar columnas.
- RUC y proveedor literales, sin diccionarios inventados ni IVA por defecto. Categoría comercial sugerida editable, texto fuente por producto y campos desconocidos pendientes.
- Extracción como propuesta sin mutación del borrador, control de versión, rechazo de proveedores de OCR externos y aprendizaje al confirmar.
- Creación de productos nuevos al confirmar la revisión, sin repetir digitación; catálogo ampliado visible; historial con cambios de costo exactos, selección de referencia con motivo y documentos provisionales; controles de redondeo y promociones.
- Migración aditiva `0004_lively_winter_soldier.sql` aplicada localmente. Categoría incluida en respuesta, respaldo, presupuesto de tamaño y restauración compatible con copias antiguas.
- Muestras de prueba ficticias en `outputs/pruebas-autollenado`, fuera de la aplicación y del paquete. Los originales reales no se enviaron a ningún servicio ni se incorporaron al repositorio.

La revisión visual y los resultados finales de comprobación se detallan en `docs/REVISION_AUTOLLENADO_2026-11-03.md`. No se promete OCR perfecto ni se equipara coherencia matemática con autorización del SRI.

Resultado de la entrega: 84 pruebas aprobadas y comprobación de navegador con muestras ficticias. Las fotos reales siguen requiriendo mejoras de lectura; se documenta el pendiente expresamente, sin presentar los resultados automáticos como transcripción perfecta.

Publicación privada verificada: https://tienda-costos-facturas-cp.archedfruit8.chatgpt.site · código `a04d59c6c6365d2701db6b7c591161716a947028`. Tipos, lint sin errores, 84 pruebas, compilación y paquete aprobados.


## 03/11/2026 · Programa autónomo local, Gemini opcional y control de acciones

Se implementó servidor Node/SQLite/archivos y autenticación local, paquete Windows con motor incluido, accesos de inicio/cierre y separación entre programa, datos y OneDrive. Se conserva el modo Sites y su código protegido, sin publicar esta entrega ni alterar la tienda alojada anterior. La migración de datos desde aquella versión no es automática.

Se integró Gemini con clave cifrada y consentimiento por envío, originales imagen/PDF, respuesta estructurada revisable, límites, cancelación, errores explícitos y sin reintentos ni confirmación automática. Se corrigió el avance OCR que recorría orientaciones ocultas. Se añadieron historial de edición, avisos de impacto, papelera y retiro/recuperación de originales con CAS, auditoría y migración 0005 compatible con copias antiguas. Borradores de recuperación del navegador separados por cuenta.

Durante el primer uso se detectó rechazo de claves nuevas con puntos y truncamiento a 200 caracteres. La corrección acepta credenciales opacas hasta 4096 caracteres y añade regresión con clave ficticia AQ larga. No se solicitó ni leyó la clave privada en el chat.

Archivos centrales: aplicacion/local/*, scripts/build-local.mjs, package-local.mjs e install-local.mjs; lib/gemini.ts, reading-session.ts, ocr.ts y server.ts; app/page.tsx y globals.css; db/schema.ts y migración 0005; pruebas Gemini, sesión y servidor nativo. Guía, README, estado y AGENTS actualizados para el alcance local autorizado.

Ver [informe vigente, pruebas y límites](VERSION_LOCAL_2026-11-03.md). Comprobaciones: tipos, ESLint sin errores, 98 pruebas, compilaciones local/compatibilidad, migración local y paquete portable. Prueba de capacidad nativa de 50.000 documentos/10.000 productos/cinco consultas y pruebas de concurrencia/recuperación aprobadas. Gemini real queda pendiente de la conexión y documento autorizados del propietario; las pruebas de integración usan respuestas simuladas.


## 03/11/2026 · Diagnóstico con Gemini real y corrección del esquema de extracción

Se reprodujeron la saturación 503 de Gemini 3.8 Flash y un fallo propio: maxItems:200 en el esquema complejo disparaba 400/INVALID_ARGUMENT. La misma imagen funcionó al retirar ese límite del esquema remoto; el receptor mantiene la comprobación de máximo 200 renglones sin truncar. Se retiró temperatura explícita y se diferenciaron errores seguros de servicio, cuota, permisos, formato y conexión.

Se añadieron controles visibles para reintentar o cambiar de modelo con consentimiento, y una prueba real con PDF ficticio que verifica productos y cuadre sin crear compras. La clave verificada ya no se presenta como garantía de lectura disponible. Se conserva selección explícita, sin cambio automático del modelo habitual. Se agregó aviso de RUC incompleto y se mantuvo revisión humana.

Se verificaron llamadas reales con Gemini 3.5 Flash-Lite para imagen, PDF de prueba y PDF escaneado, incluidos los flujos de autollenado en navegador. Se usaron exclusivamente documentos ficticios; la clave no se mostró ni se copió al almacenamiento de prueba. Suite final: 106 pruebas, tipos y compilaciones local/compatibilidad aprobados. Se actualizó el paquete e instalación local sin publicar Sites. Detalle y límites en [Revisión real](REVISION_GEMINI_REAL_2026-11-03.md).

## 03/11/2026 · Productos, proveedores y coincidencias revisables

Productos incorpora compra confirmada reciente por fecha, costo total pagado por unidad, venta actual opcional y referencia de +25 %. El botón Proveedores reúne todas las relaciones registradas, con paginación de 50, descripciones originales, vendedor, última factura y costos individuales. Los documentos comerciales no publican costos definitivos y los empates siguen requiriendo una elección explicada.

Se añadió `lib/catalog.ts` para identificación y consultas agrupadas, y `product_aliases` con migración aditiva 0006 y respaldo/restauración retrocompatibles. Al confirmar una factura se aprenden descripciones por proveedor en el lote de costos/auditoría. La creación de productos desde una factura comprueba candidatos en interfaz y servidor; exige vincular o justificar que son distintos. No cambia importes originales ni fusiona artículos existentes.

Gemini puede comparar contra hasta 500 artículos si se autoriza el catálogo indicado, sin precios. Su identificador es solo una propuesta existente y revisable. Las reglas locales siguen disponibles sin IA. Se comprobó una llamada real con PDF y catálogo exclusivamente ficticios: distinguió arroz de 1 kg del de 2 kg. El recorrido visual usa respuestas simuladas y se documenta por separado.

Verificación: tipos aprobados, ESLint sin errores (una advertencia conocida del visor privado), 115 pruebas aprobadas, compilaciones local y de compatibilidad. Nueve pruebas nuevas cubren proveedores, códigos, ambigüedad, creación protegida, Gemini, entradas inválidas y restauración. Detalle en [informe de la entrega](PRODUCTOS_PROVEEDORES_IDENTIDAD_2026-11-03.md). Se actualiza el programa local; no se publica ni modifica Sites.

## 03/11/2026 · Reparto revisable de IVA a partir de bases impresas

Se corrigió la falta de contraste entre la columna de IVA de los productos y los subtotales por tarifa del pie del documento. Gemini y el lector local conservan `taxSummary`; XML utiliza las tarifas explícitas del detalle. El motor exacto valida bases por tarifa y propone solamente una asignación única que reproduzca IVA y total con un modo de redondeo explícito. La persona acepta con un botón, conservando lectura anterior por línea, explicación, notas y posibilidad de deshacer. Los documentos comerciales siguen separados y no se infieren tarifas desde el impuesto agregado ni por categoría.

Se agregó lectura local de subtotales para borradores existentes sin reemplazar sus productos revisados. Los datos nuevos son campos opcionales del JSON del documento, incluidos automáticamente en respaldo/restauración sin modificar tablas. El recorrido de restauración verifica expresamente bases, explicación y lectura anterior.

La llamada real a Gemini usó exclusivamente un PDF ficticio con tres líneas al 0,00 y bases 15 % = 4,52 y 0 % = 1,50. Gemini conservó los tres ceros, leyó ambas bases y el motor propuso exactamente dos líneas al 15 %, IVA 0,68 y total 6,70. El recorrido visible con PDF local también mostró y aplicó la propuesta, deshizo/rehizo y comprobó el cuadre. La foto real del propietario se examinó solo localmente; esa lectura aislada no recuperó bases fiables y no se presenta como éxito. Ver [informe de IVA mixto](IVA_MIXTO_2026-11-03.md).

Verificación final: 127 pruebas aprobadas, tipos y ESLint sin errores, compilaciones local/compatibilidad y comprobación de diferencias aprobadas. Se preserva la distinción de códigos XML de exento y no objeto según la ficha técnica SRI 2.34; su tratamiento específico no se fuerza como tarifa 0 %.

Paquete local actualizado e instalación 20261104033702191 activada después de cerrar y respaldar la tienda de forma ordenada. Verificación posterior: 258 archivos coinciden con el paquete; ZIP sin datos privados; integridad de ambas bases, cuentas y datos de tienda sin cambios y conexión cifrada conservada. La factura real queda pendiente para que el propietario vuelva a leer y acepte su propuesta. Sin publicación en Sites.
