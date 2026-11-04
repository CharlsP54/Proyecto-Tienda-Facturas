# Mi Tienda · Facturas y costos

Aplicación privada para una tienda en Ecuador: documentos, originales, comprobación decimal, catálogo ampliado con códigos por proveedor, historial de costos, promociones, usuarios y respaldos. Los precios de venta actuales son opcionales.

## Modo principal: local autónomo

```text
npm run build:local
npm run local
npm run package:local
```

`local/` usa Node 24.20.0, SQLite nativo, archivos locales y cuentas propias; no necesita Cloudflare ni ChatGPT en ejecución. Datos por defecto en `%LOCALAPPDATA%\MiTienda`; solo escucha en `127.0.0.1:4310`. `build:local` compila la interfaz y prepara módulos nativos; `package:local` incluye el motor, recursos OCR/PDF y accesos de inicio/cierre, sin node_modules, datos ni claves.

Gemini opcional se configura en Lectura con IA. Clave cifrada AES-GCM con material local separado; consentimiento de originales por envío, tiempos límite y errores explícitos. Las pruebas usan un proveedor simulado y no consumen una clave real.

La guía vigente está en `../docs/GUIA_DE_USO.md`. Los comandos Sites que siguen son de compatibilidad; no publicar salvo solicitud del propietario. La tienda anterior no se modifica al usar o compilar el programa local.

## Funciones

- Borradores, confirmación, anulación y correcciones con historial.
- Facturas, notas de entrega y pedidos relacionados sin duplicar compras.
- Catálogo separado por nombre, marca, contenido, presentación habitual, unidad de comparación, código de barras y códigos propios por cada proveedor (`supplier_products`, nunca tratados como universales).
- Cantidades, presentaciones, descuentos, bonificaciones e impuestos por línea, conservando tanto costo neto antes de impuestos (`net_unit_cost`) como costo total pagado por unidad (`unit_cost`).
- Variaciones de costos, diferencia comercial frente al precio de venta opcional (sin guardar nunca cero) y referencias de aumento del 20 %, 25 % y 30 % eligiendo explícitamente base total pagada (sin doble IVA) o base neta antes de impuestos.
- OCR de imágenes dentro del navegador, con recursos servidos por la aplicación y revisión humana. PDF digital o escaneado con lectura local, XML SRI y TXT. Autollenado de cabecera y productos; categorías sugeridas y revisión previa a confirmar.
- Cuentas locales y roles de encargado/colaborador; acceso ChatGPT conservado solo en el modo Sites alternativo.
- CSV, respaldo completo (retrocompatible con copias previas) y restauración protegida en una tienda vacía.

## Desarrollo

Node >=22.13.0; comprobado con Node 24.20.0. Vinext, React, D1 y R2. Conservar los scripts Sites incluidos.

```text
npm run install:ci
npm run prepare:ocr
npm run build
```

Crear el archivo ignorado `.dev.vars` con `OWNER_EMAIL=seedy@sites.test` para desarrollo portable (el comando `npm run db:migrate:local` lo crea automáticamente si falta). La simulación de identidad solo existe en desarrollo. En producción, configurar `OWNER_EMAIL` como secreto del Site con el propietario real.

Aplicar de forma idempotente todas las migraciones SQL pendientes (`0000`, `0001`, `0002`, etc.) a la base local y levantar el servidor:

```text
npm run db:migrate:local
npm run dev
```

La base, usuarios y documentos locales de prueba no se suben a producción.

## Comprobaciones y empaquetado

```text
npm run check
npm run test:unit
npm test
npm run build
npm run package:site
```

- `npm run check`: ejecuta `typecheck`, `lint` (ESLint) y la suite completa de pruebas.
- `npm run test:unit`: pruebas rápidas en Node puro (motor decimal y heurísticas de OCR).
- `npm test`: suite completa incluyendo integración API/D1/R2 y pruebas de capacidad con Miniflare (`test:server` y `test:capacity`).
- `npm run package:site`: verifica `dist/.openai/hosting.json`, sincronía de migraciones SQL, ausencia de archivos privados y genera `../mi-tienda-publicacion-final.tar.gz` listo para ChatGPT Sites.

Miniflare y Wrangler necesitan permiso para servicios locales (`127.0.0.1`). Las pruebas de volumen usan datos sintéticos. Los tiempos obtenidos no garantizan idéntico rendimiento en cualquier alojamiento.

Para comprobar una imagen existente: `npm run check:ocr -- RUTA_LOCAL`. La imagen no se envía a un proveedor externo de OCR. Obtener texto no confirma que todos sus campos se hayan leído correctamente.

## Acceso compartido

El propietario autoriza las visitas en los controles de compartir del Site y registra correo y función en Equipo. Conocer la dirección no otorga acceso. La aplicación no envía invitaciones ni cambia la audiencia del Site.

## Respaldo y límites

- 200 líneas por documento, 20 adjuntos por documento, 20 MB por archivo.
- Copia diaria al guardar actividad: datos y referencias a originales inmutables conservados.
- Descarga completa: hasta 24 MB de JSON, 12 MB de originales y un máximo preventivo de 4 MB para datos de tablas. Nunca devolver una copia truncada como completa. Al alcanzar el límite, solicitar exportación del almacenamiento o partición administrada.
- Restauración solo sobre catálogo y documentos vacíos, comprobando relaciones y huellas de adjuntos (compatible tanto con respaldos actuales como con respaldos de la primera entrega); se conservan los usuarios destino.
- Historial de hasta 1.000 compras recientes por producto, con aviso.
- CSV de hasta 20.000 documentos, con rechazo explícito si se supera.

Las copias junto al servicio no sustituyen una descarga independiente. No publicar documentos reales en el repositorio. La clasificación de impuestos se revisa según el documento y las referencias aplicables: la revisión interna no comprueba autorización en el SRI. El programa no emite comprobantes ni presenta declaraciones.

La lectura automática requiere revisión: fotografías con texto pequeño, inclinadas, recortadas o con tablas poco legibles pueden perder líneas o confundir cifras. El programa conserva el original y los campos pendientes; no confirma ni publica costos por leer un archivo.
