# Informe de verificación de Mi Tienda

Fecha: 3 de noviembre de 2026. Moneda: USD. País de operación: Ecuador.

## Resultado de las comprobaciones vigentes

71 pruebas automatizadas aprobadas, ninguna fallida ni omitida. TypeScript (`tsc --noEmit`) y ESLint (`eslint .`) aprobados sin errores ni advertencias. Las pruebas abarcan:

- 34 casos del motor decimal exacto (`calculations.test.ts`), incluyendo importes transcritos de Roguizam, Danec y Ales, separación de `netUnitCost`, `unitCost` y referencias provisionales de pedidos/notas, referencias comerciales (+20 %, +25 %, +30 %) sobre base total pagada o neta sin doble IVA, asistente explicativo de modo de redondeo alternativo (`line` vs. `total`), cotejo de importe en letras contra centavos impresos, observaciones tributarias oficiales de vigencia de IVA en Ecuador (Circular SRI NAC-DGECCGC25-00000006) y reparto asistido de costos en promociones de producto diferente (`allocatedCost`).
- Un ejercicio de cálculo con cinco hilos, 500 documentos sintéticos de 200 líneas: 100.000 líneas (2,53 segundos de pared en la última corrida).
- Siete casos de extracción documental y OCR (`ocr.test.ts`): campos explícitos, ambigüedad, fechas imposibles, subtotales, importe en letras, extracción estructurada de cabecera y parseo de tablas de renglones de producto.
- 28 casos de integración del servidor (`server.test.ts`): autenticación, permisos, catálogo ampliado (`brand`, `content`, `comparisonUnit`, `salePrice` opcional), códigos propios por proveedor (`supplier_products`) y bloqueo de reasignación silenciosa, desempate explícito de compras de igual fecha con motivo obligatorio de encargado (`reference_choices`), referencias provisionales de pedidos/notas y advertencia de posibles documentos duplicados, registro automático de proveedores al confirmar, retención de 30 copias diarias de respaldo, cabeceras de seguridad `nosniff`, concurrencia CAS, correcciones, originales privados, respaldos y restauración (compatible con respaldos v1 y v2).
- Una prueba de capacidad con 10.000 productos y 50.000 documentos sintéticos, cinco sesiones concurrentes y guardado con control de versión.

En la última ejecución completa de capacidad (con la suite íntegra corriendo en la misma máquina compartida), las cinco sesiones concurrentes registraron consultas de 986, 956, 920, 933 y 927 milisegundos; p95 de 986 milisegundos (ampliamente dentro de la meta de `< 2000 ms`). Al editar la misma versión desde cinco sesiones, hubo un guardado aceptado (`200`) y cuatro conflictos controlados (`409`), sin sobrescritura silenciosa.

Entorno: Node 24.20.0, Miniflare local y el computador de desarrollo compartido con otros procesos. Estos tiempos no garantizan idéntico rendimiento en producción, con archivos grandes, conexiones distintas o trabajo de OCR simultáneo.

## Pruebas en pantalla

Se completó el siguiente recorrido en el navegador local durante la validación base:

1. Entrar con la identidad simulada de desarrollo.
2. Crear un producto con presentación de una unidad e IVA de referencia del 15 %.
3. Registrar una factura sintética: dos unidades a un dólar antes de IVA, IVA 0,30 y total 2,30.
4. Comprobar que una fecha vacía bloquea la confirmación.
5. Ingresar una fecha día/mes/año y comprobar su normalización.
6. Confirmar y consultar el historial: costo total por unidad 1,15 y referencias comerciales 1,38/1,44/1,50 para aumentos del 20/25/30 %.
7. Descargar un respaldo JSON y comprobar su formato y contenido.
8. Adjuntar localmente la imagen Ales suministrada por el usuario, consultar el original y ejecutar el OCR en el navegador.
9. Filtrar los documentos confirmados y conservar separado el borrador pendiente.

La lectura de Ales devolvió 1984 caracteres tanto en la prueba local de motor como en el navegador. El reconocimiento de texto no reprodujo de forma confiable todos los importes de la foto. Por ello se presenta como ayuda para transcribir, con revisión humana obligatoria; las líneas de producto y presentaciones requieren revisión y vinculación al catálogo.

La captura `outputs/vista-aplicacion-probada.jpg` corresponde al entorno local de prueba. No representa compras reales importadas a producción.

## Privacidad y publicación

El Site se publicó privado, conservando acceso exclusivo al propietario. La visita pública muestra el inicio de sesión de ChatGPT. Se configuró el propietario como secreto del servidor, separado de la fuente. No se copiaron al sitio publicado las imágenes originales ni los registros locales de prueba.

La comprobación autenticada completa se realizó en desarrollo. La cuenta real del usuario debe iniciar sesión para entrar a la versión publicada. No se introdujeron credenciales del usuario ni se añadieron colaboradores sin identificación y autorización.

## Límites y recuperación

- 200 líneas por documento; 20 adjuntos por documento; 20 MB por original.
- Respaldo JSON de hasta 24 MB, con hasta 12 MB de originales únicos y estimación preventiva de hasta 4 MB de datos y sobrecarga de tablas.
- Al superar la capacidad de respaldo, se rechaza antes de cargar las filas y se muestra aviso. No se entrega una copia truncada como completa. Un original individual grande puede necesitar descargarse por separado.
- La copia diaria conserva datos y referencias a originales inmutables alojados junto al servicio. La descarga completa es la copia independiente disponible dentro de esos límites. Más volumen requiere una exportación administrada del almacenamiento.
- Restauración solamente en una tienda sin catálogo ni documentos, comprobando relaciones, cálculos y huellas digitales de archivos (compatible con respaldos v1 y v2).
- Historial limitado a 1.000 compras por producto, con aviso; CSV a 20.000 documentos, con rechazo explícito al superarlo.

No se ha demostrado capacidad ilimitada ni ausencia absoluta de fallos. Las protecciones comprobadas reducen pérdidas de información por errores humanos, reintentos y ediciones simultáneas. La revisión interna no certifica autenticidad ni clasificación tributaria de cada producto, y no emite comprobantes o declaraciones al SRI.

## Fuente y paquete de publicación

TypeScript, ESLint, pruebas integrales y compilación de producción aprobados. El paquete actualizado `mi-tienda-publicacion-final.tar.gz` incluye exclusivamente `dist/` con las migraciones `0000`, `0001`, `0002` y `0003` verificadas mediante `npm run package:site`. La plataforma aplica las migraciones pendientes automáticamente al publicar. El detalle completo de cambios respecto a las entregas anteriores se encuentra en la [Bitácora de cambios y mejoras](BITACORA_DE_CAMBIOS.md).
