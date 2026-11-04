# Estado Actual y Hoja de Ruta Viva

## Actualización vigente · 04/11/2026 · programa autónomo local

**Revisión general de fichas y costos:** la migración 0008 conserva un tipo de presentación explícito. Una ficha sin unidad, categoría, presentación o contenido necesario queda pendiente; tampoco publica costos de una conversión antigua que contradiga UNI. La protección se aplica a catálogo, proveedores, historial y confirmación. Los contenidos explícitos se contrastan con la ficha y los encadenamientos ambiguos no se resuelven escogiendo un número. Gemini y OCR proponen datos para revisión, sin modificar cantidades recibidas a partir del contenido. Ver [alcance y verificación](REVISION_PRODUCTOS_2026-11-04.md).

**Consulta diaria:** costos con hasta tres decimales, precisión completa conservada y referencias cero descartadas. Proveedores, compras y edición se abren en paneles flotantes que pueden minimizarse y cerrarse, manteniendo visible la lista. Los cambios sin guardar tienen aviso y abrir ayuda conserva la ficha en edición.

**Entrega comprobada:** actualización instalada y funcionando localmente; 143 pruebas generales y 11 locales aprobadas. Se completaron la funda de 24 chupetes, la cajita de ocho sobres y la maicena individual ya confirmadas. Facturas, filas de costos, cuentas, configuración y originales permanecen intactos. Las demás fichas incompletas y conversiones históricas dudosas requieren revisión antes de volver a usarse como referencias.

**Visibilidad de costos:** el catálogo muestra presentación y unidad interior en columnas independientes tanto para compra como para venta sugerida, con importes grandes y unidad visible. La mejora fue revisada visualmente con datos ficticios y conserva los cálculos y datos anteriores.

**Cantidades, presentación y venta por partes:** la lectura prioriza UNI/UN y las columnas Caj./Uni./T.Cant. Un X12, X24 o X144 del nombre nunca completa la conversión de recepción. Una conversión ambigua queda pendiente. El detalle conserva las columnas y el factor leídos. Productos incorpora búsqueda por categoría, filtro y orden por compra más reciente, alta reciente o nombre. La ficha puede definir ocho sobres por cajita y mostrar ambos costos, conservando el costo histórico por cajita. Migración aditiva 0007 y respaldos retrocompatibles. Ver [verificación y alcance](CANTIDADES_Y_COSTOS_2026-11-04.md).

**Precisión del proveedor:** se distinguen SUBTOTAL neto y TOTAL con IVA por fila. Para precios como 2,777 existe un método explícito de precisión hasta el subtotal por tarifa; solo se propone cuando reproduce todos los importes y conserva los centavos pagados. No aplica tolerancias ni cambia los precios impresos.

**IVA mixto por bases impresas:** lectura de subtotales por tarifa desde Gemini, texto/PDF local y XML cuando la tarifa está explícita; contraste exacto por grupo y propuesta de reparto único con aceptación, lectura anterior conservada, explicación y deshacer/rehacer. La ambigüedad no se resuelve por categoría ni con el IVA total aislado. Una lectura local de subtotales puede conservar los renglones ya revisados. Ver [evidencia y límites](IVA_MIXTO_2026-11-03.md).

**Catálogo y proveedores:** Productos muestra compra confirmada reciente, venta actual opcional y referencia de +25 % sobre costo pagado, sin doble IVA. El botón Proveedores reúne relaciones registradas con precios y descripciones por proveedor; no consulta disponibilidad externa. Descripciones diferentes pueden apuntar a un único producto. Las reglas locales y Gemini opcional proponen coincidencias; el usuario resuelve las dudosas antes de crear un artículo. Solo la factura confirmada aprende las descripciones. Se conserva compatibilidad con respaldos antiguos mediante migración 0006. Ver [pruebas y límites de esta entrega](PRODUCTOS_PROVEEDORES_IDENTIDAD_2026-11-03.md).

La identificación no garantiza equivalencias completas: Gemini compara hasta 500 artículos autorizados y las reglas de semejanza también tienen límites de búsqueda. No hay fusión retroactiva de duplicados ya creados. Un flujo reversible y auditable para consolidarlos sería una mejora futura separada.

El modo de uso principal ahora es local con cuentas propias, SQLite y archivos en este computador. Gemini es opcional, necesita clave privada y autorización por lectura. La versión alojada anterior se conserva sin actualizar ni migrar automáticamente.

Se añadieron cancelación de lectura sin resultados tardíos, progreso de una sola pasada local, deshacer/rehacer, limpiar con aviso, papelera recuperable, retiro/recuperación de originales y avisos de impacto para anular/corregir. Los cálculos exactos y las restricciones de confirmación se conservan.

Consulta [la guía vigente](GUIA_DE_USO.md) y [el informe local](VERSION_LOCAL_2026-11-03.md). Los apartados históricos siguientes describen también el modo Sites anterior; no implican que el programa local necesite servicios externos.

El propietario ya creó su cuenta y conectó Gemini. La revisión posterior corrigió un esquema remoto rechazado por Google, además de distinguir saturación y cuota. Se hicieron lecturas reales de imagen y PDF ficticios con Gemini 3.5 Flash-Lite y se verificó el llenado en pantalla. Ver [la revisión real y sus límites](REVISION_GEMINI_REAL_2026-11-03.md). Las pruebas automáticas de regresión usan respuestas simuladas; las pruebas reales adicionales están diferenciadas en ese informe. Sigue pendiente comparar el resultado de las facturas reales que el propietario autorice, con revisión humana. Las seis muestras originales no se han enviado a Google; sus limitaciones de OCR local siguen vigentes. También quedan como mejoras el restablecimiento de contraseñas en la interfaz, acceso desde otros equipos y respaldo integral con un solo botón. Hay procedimientos de copia integral y recuperación documentados; los respaldos JSON mantienen límites explícitos.


Este documento registra qué partes de la [Especificación inicial](ESPECIFICACION_INICIAL.md) y del [Plan de desarrollo](PLAN_DESARROLLO.md) ya están implementadas y verificadas en `aplicacion/`, y cuáles quedan listas como siguientes incrementos priorizados para continuar desarrollando sin perder la idea principal ni el estilo del proyecto.

Para consultar el detalle de qué se construyó, mejoró o modificó en cada entrega, revisar la [Bitácora de cambios y mejoras](BITACORA_DE_CAMBIOS.md).

---

## 1. Capacidades implementadas y verificadas

### A. Motor decimal exacto y cuadre de documentos (`aplicacion/lib/calculations.ts`)
- Aritmética racional exacta sobre `bigint` (`Rational`), sin coma flotante binaria en ningún importe monetario.
- Reproducción exacta de los seis escenarios reales de referencia (*Roguizam, Danec, Ales, Coile, Arcor y Colombina*).
- Modos explícitos de redondeo de IVA (`taxGroup` acumulado vs. `line` por renglón), sin tolerancias silenciosas de un centavo.
- Separación entre descuentos por línea, descuento global proporcional con conservación exacta de centavos, cargos especiales (`otherTaxAmount`, `otherTaxInIvaBase`) y totales impresos (subtotal neto, IVA y total final).
- Cálculo separado por unidad de comparación (6 decimales):
  - `unitCost`: costo total pagado por unidad (incluyendo parte proporcional de impuestos y bonificaciones del mismo producto).
  - `netUnitCost`: costo neto antes de impuestos por unidad de comparación.
  - `provisionalUnitCost`: costo referencial separado para pedidos y notas de entrega.
- Referencias comerciales (`calculatePriceReferences`): aumentos de `+20 %`, `+25 %` y `+30 %` eligiendo explícitamente base **total pagada (`gross`, sin doble IVA)** o **neta antes de impuestos (`net`)**, diferencia comercial estimada frente a `salePrice` opcional y alerta cuando el precio de venta queda por debajo del costo pagado.

### B. Catálogo ampliado, códigos por proveedor y precios opcionales (`db/schema.ts`, `drizzle/0002_tiny_gressill.sql`, `lib/server.ts`, `app/page.tsx`)
- Separación explícita en catálogo (`products`) de **nombre**, **marca (`brand`)**, **contenido (`content`)**, **presentación habitual (`presentation`)**, **unidad de comparación (`comparisonUnit`)**, **conversión (`unitsPerPack`)**, **código de barras (`barcode`)**, **IVA habitual (`taxRate`)** y **precio de venta actual opcional (`salePrice`)**.
- Validación estricta `optionalPrice`: `""` se conserva como no registrado y se rechaza cualquier precio `<= 0` (jamás se guarda cero como precio de venta).
- Tabla `supplier_products` con índice único `(supplier_key, supplier_code)`:
  - Cada proveedor conserva sus propios códigos internos sin tratarlos como universales.
  - Al confirmar una factura, los códigos de proveedor capturados en las líneas se vinculan atómicamente al producto confirmado.
  - Si un código ya asignado a un producto de ese proveedor intenta confirmarse con otro producto distinto, el servidor exige motivo explícito en `notes` (`422`) antes de permitir el cambio.
  - En el editor de documentos se muestran sugerencias revisables por humano tanto por código del proveedor actual como por coincidencia de texto, sin autocompletar ni confirmar en silencio.
- Búsqueda unificada en catálogo por nombre, marca, contenido, código de barras y códigos de proveedor.

### C. Flujo de documentos, historial inmutable, usuarios y respaldos (`lib/server.ts`, `app/page.tsx`)
- Estados de documento: borrador/pendiente, listo para confirmar, confirmado y anulado (`void`), con corrección mediante documento de reemplazo enlazado y motivo obligatorio.
- Separación estricta entre facturas (`invoice`) y documentos comerciales (`delivery`, `order`), con vinculación `linkedDocumentId` para evitar duplicar compras.
- Historial por producto (`GET /api/history`) ordenado por fecha del documento (`documents.date`), con último costo general, último costo por proveedor, vendedor, bonificaciones, `netUnitCost` (incluyendo respaldo calculado para compras previas a la migración `0002`), códigos por proveedor y selector de base `gross`/`net`.
- Concurrencia optimista CAS (`version` + `update_token`), idempotencia (`operationId` con huella SHA-256) y transacciones indivisibles (`db.batch`).
- Control de acceso con ChatGPT Sites (`oai-authenticated-user-*`), roles `admin` (encargado) y `member` (colaborador), protección anti-CSRF y bitácora completa en `audit_log`.
- Adjuntos privados en R2 verificados por firma binaria (PNG, JPEG, WebP, PDF) con visor giratorio en navegador y OCR local (Tesseract WASM servido desde `public/ocr`).
- Exportación CSV protegida contra inyección de fórmulas, copias automáticas diarias en R2 y respaldo/restauración JSON íntegros (retrocompatibles con respaldos v1 y v2, verificando huellas SHA-256 de adjuntos y exigiendo tienda vacía al restaurar).

### D. Resolución de empates, referencias provisionales y reglas comerciales avanzadas
- **Desempate explícito de compras de igual fecha (`reference_choices` / migración `0003`):**
  - Detección automática en `GET /api/history` cuando existen varias compras confirmadas en la fecha más reciente (`date`).
  - El sistema nunca decide la compra vigente por orden de carga o ID aleatorio.
  - El encargado (`admin`) selecciona la compra representativa indicando un motivo obligatorio (`POST /api/reference-choices`).
  - La decisión queda trazada en `audit_log`, reflejada con insignia de *Referencia vigente fijada* en la tabla y sincronizada en los respaldos.
- **Referencias comerciales provisionales separadas de facturas:**
  - Pedidos (`order`) y notas de entrega (`delivery`) calculan referencias pre-IVA (`provisionalNetUnitCost`) y con IVA (`provisionalUnitCost`, cuando está informado) sin alterar nunca los costos confirmados de factura.
  - Tabla dedicada en la ficha del producto indicando fecha, proveedor, vendedor, importes y estado de facturación.
- **Alertas informativas de posibles comprobantes duplicados:**
  - Al guardar documentos, se detectan posibles coincidencias del mismo proveedor por número o por fecha+total.
  - La advertencia es puramente informativa para revisión humana: nunca rechaza ni fusiona compras a ciegas.
- **Reparto asistido de costo en promociones de producto diferente (`allocatedCost`):**
  - En líneas promocionales (`promotion: true`), se permite ingresar un costo asignado voluntario del paquete (`allocatedCost`).
  - Si se asigna, calcula el costo unitario real a 6 decimales para publicar en el historial; si no se asigna, permanece pendiente para no publicar un costo cero engañoso.
- **Asistente explicativo de diferencias de redondeo y comprobación en letras:**
  - Si el cálculo difiere del impreso por redondeo de IVA, el motor comprueba en segundo plano el modo alternativo (`line` vs. `total`). Si coincide exactamente, muestra una recomendación explicativa y un botón de un clic para aplicar el modo reproducible.
  - Campo opcional `wordsTotal` (importe escrito en letras): verifica que la fracción de centavos escrita (ej. `24/100`) coincida con los centavos del total numérico impreso.
- **Observaciones normativas tributarias oficiales en Ecuador:**
  - Contraste automático contra tarifas vigentes (Circular SRI NAC-DGECCGC25-00000006 para IVA 15 % desde 01/04/2024, IVA histórico 12 % y tarifas 0 % / 5 %). Alerta sobre tarifas atípicas o fuera de fecha conservando intacto el valor impreso.
- **Seguridad, privacidad y respaldos:**
  - Retención automática de las 30 copias de respaldo más recientes en Cloudflare R2, eliminando copias obsoletas para proteger la privacidad.
  - Cabecera `X-Content-Type-Options: nosniff` en descargas de archivos y exportación CSV con escape de fórmulas.
  - Vínculo relacional íntegro garantizado: todo proveedor en facturas confirmadas queda registrado en la tabla `suppliers`.

### F. Lectura y autollenado local revisados (03/11/2026)
- Al elegir un archivo se guarda el original privado, se lee en el navegador y se propone la cabecera y la tabla completas. La pantalla pasa a revisión, con progreso y cancelación.
- Formatos admitidos: JPG, PNG, WebP, PDF digital, PDF escaneado, XML de factura SRI y TXT. No se promete leer cualquier formato ni cualquier fotografía borrosa.
- PDF.js extrae texto conservando coordenadas y convierte las páginas escaneadas a imágenes para OCR local. Sus recursos, incluido el trabajador PDF, se sirven desde `public/ocr`.
- Tesseract reconstruye los renglones con coordenadas TSV para evitar confundir columnas con productos distintos. No se mandan facturas a OpenAI, Gemini ni otros servicios de OCR.
- Proveedor y RUC proceden del contenido legible. Se eliminaron identidades de proveedor inventadas. Un IVA desconocido sigue pendiente; un total de IVA nunca asigna una tarifa a todas las líneas.
- Las categorías son sugerencias comerciales editables. No determinan el impuesto. Se persisten en catálogo mediante la migración `0004` y en respaldos retrocompatibles.
- Los códigos conocidos del mismo proveedor proponen artículos y conversiones de catálogo para revisión. La asociación se recuerda solamente al confirmar la factura.
- Los productos nuevos se crean al confirmar la revisión, sin exigir al usuario repetir su nombre y precio en otra pantalla. No se publica ningún costo al leer un archivo.
- Se conserva el texto fuente por renglón y las advertencias. Si no hay productos reconocibles, se completa la cabecera legible y se avisa de que hace falta otra lectura; no se anuncia éxito completo.
- La extracción devuelve una propuesta sin modificar el borrador en el servidor. Se comprueba su versión y se evita aplicar una lectura a un documento que cambió mientras se procesaba.
- Se conectaron controles visibles para campos ampliados del catálogo, referencias netas/total pagado, variaciones exactas de costo por proveedor, empates por fecha con motivo, documentos provisionales, asignación promocional y aplicación explícita del redondeo reproducible.

### G. Continuidad de ingeniería y empaquetado Windows + ChatGPT Sites
- Reglas permanentes en [AGENTS.md](../AGENTS.md) y skills operativos en `.agents/skills/`.
- Scripts listos en `aplicacion/package.json`: `db:generate`, `db:migrate:local`, `check` (`typecheck` + `lint`), `test:unit`, `test:server`, `test:capacity`, `test`, `build` y `package:site`.
- Pruebas automatizadas de motor, lectura, API y capacidad (el resultado de esta revisión se registra en la bitácora) cubriendo motor decimal, sugerencias OCR, integración API, concurrencia CAS y capacidad con 10.000 productos y 50.000 documentos.

---

## 2. Pendiente prioritario de lectura real

La revisión del 03/11/2026 confirmó el flujo automático con muestras ficticias, pero **las seis fotos originales todavía no se leen completas y exactas**. Roguizam y Danec no recuperaron renglones fiables; Coile fue parcial; Ales, Arcor y Colombina también requieren correcciones. Ver [el informe con evidencia y límites](REVISION_AUTOLLENADO_2026-11-03.md). Antes de considerar cumplido el objetivo de solo revisar/aprobar esas fotos, hace falta mejorar el reconocimiento de esos diseños y comprobar capturas de mayor calidad o PDF/XML del proveedor. No habilitar confirmación automática ni ocultar diferencias.

## 3. Próximas mejoras técnicas opcionales (Hoja de ruta viva)

El alcance implementado se comprueba con pruebas automáticas y muestras ficticias de lectura. Cada factura real requiere revisión humana; la exactitud de OCR depende de su calidad y diseño. Las siguientes mejoras pueden explorarse en siguientes entregas de pulido operativo:

### Mejora 1 — Controles visuales avanzados en visor de originales
- Soporte para lupa/zoom continuo y desplazamiento panorámico (*pan & zoom*) en imágenes grandes de facturas arrugadas o tickets largos, complementando la rotación de 90° existente.

### Mejora 2 — Filtro por rango de fechas en exportación CSV
- Permitir al encargado acotar la descarga de documentos por año o mes para facilitar análisis contables periódicos sin descargar todo el archivo histórico.

### Mejora 3 — Atajos de teclado en digitación de líneas
- Atajo `Enter` o `Ctrl+Enter` para añadir un nuevo renglón de producto en el formulario de facturas de muchas líneas.

---

## 3. Fuera del alcance actual (según Sección 2 de `ESPECIFICACION_INICIAL.md`)
No implementar salvo cambio expreso de alcance por parte del propietario:
- Cuentas por pagar / agenda de cobros y vencimientos financieros.
- Control de inventario / kardex de existencias ni punto de venta (POS).
- Emisión de comprobantes electrónicos, declaraciones tributarias o conexión directa con servicios web del SRI.
- Contabilidad general de gastos operativos (arriendo, servicios, nómina o utilidad contable neta).

