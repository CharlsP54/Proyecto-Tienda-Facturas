# Plan de desarrollo y verificación

## Orden de trabajo

### 1. Registro manual y comprobación de valores

Crear el registro de proveedores, productos, presentaciones y documentos. Adjuntar imagen, capturar líneas y totales, guardar borrador y mostrar diferencias. Desde el principio, dinero en decimal, impuestos separados y precio de venta opcional.

El primer resultado utilizable debe permitir reproducir las muestras sin depender de un lector automático ni de una conexión con el SRI.

### 2. Confirmación e historial

Publicar costos solamente desde documentos revisados. Separar factura y referencia comercial. Incorporar versiones, anulación, vinculación de documentos, protección contra duplicados y selección del último costo por fecha.

### 3. Uso compartido y recuperación

Incorporar cuentas, permisos, registro de cambios y protección frente a ediciones simultáneas. Probar confirmación indivisible y reintento después de una caída. Preparar respaldo conjunto de datos e imágenes y una restauración real de prueba.

Antes de que varias personas operen con datos definitivos, estas protecciones deben estar terminadas. Se puede probar el registro manual antes en un entorno de desarrollo identificado.

### 4. Lectura asistida de documentos

Agregar orientación de vista, extracción de datos, señalización de campos dudosos y procesamiento en cola con límites. La extracción nunca confirma documentos automáticamente. Si falla, conservar la imagen y permitir captura manual.

Seleccionar herramienta de lectura según precisión sobre estas muestras, privacidad, costo y capacidad de reintento. No enviar los documentos reales a un servicio externo sin haber presentado y autorizado su uso.

### 5. Comparaciones y sugerencias opcionales

Mostrar historial por producto, proveedor y vendedor, con fechas, presentaciones y promociones. Añadir precios de venta cuando estén disponibles. Las sugerencias de aumento sobre costo requieren una base identificada y no cambian el precio sin aprobación.

## Arquitectura que debe respetarse

Una interfaz sencilla en navegador desde el computador; un servicio compartido que compruebe reglas y permisos; base de datos con transacciones, restricciones y decimales; archivos privados; trabajo de extracción separado de las consultas normales. Un archivo de datos compartido por sincronización de carpetas no será el mecanismo de edición concurrente.

La selección concreta de herramientas se resolverá al implementar, verificando su documentación vigente. El usuario no necesita escoger librerías o motores de datos para continuar.

## Casos de aceptación necesarios

| Caso | Resultado esperado |
|---|---|
| Roguizam, IVA por línea | Explicar 0,78 por suma del redondeo de las líneas y conservar el importe impreso. |
| Danec, precios con cuatro decimales | Conservar precisión y evitar aplicar dos veces el descuento. |
| Ales, jabón | Reproducir 2,78 desde precio de lista y descuento; no imponer 2,76 por multiplicar un unitario abreviado. |
| Ales, 99 % de descuento | Conservar 0,03, advertir promoción y no inventar costo cero. |
| Coile, nota de entrega | Cuadrar 5,30, conservar el tipo y enlazar posteriormente la factura sin repetir la compra. |
| Arcor, impuesto ausente | Guardar pendiente/no informado; no usar tarifa 0 % por defecto. |
| Colombina, línea promocional | Cuadrar 11,58 y mantener pendiente la asignación de costo del producto bonificado. |
| Precio de venta vacío | Permitir capturar y comprobar documentos sin exigir ese dato ni guardar cero. |
| Factura repetida | Evitar segunda confirmación y permitir revisar una posible coincidencia. |
| Pedido y factura de la misma compra | Enlazarlos y evitar actualizar el costo como dos compras independientes. |
| Factura antigua cargada después | Completar historial sin sustituir un costo posterior. |
| Igual fecha sin orden conocido | Pedir selección razonada de referencia, sin resolver por orden de carga. |
| Presentación ambigua | Guardar pendiente y bloquear publicación de un costo unitario inventado. |
| Total alterado o línea omitida | Señalar la diferencia exacta y bloquear confirmación hasta resolverla. |
| Dos usuarios corrigen la misma versión | Conservar ambos trabajos o pedir resolver conflicto; no perder cambios en silencio. |
| Doble clic, reintento o caída al confirmar | Una sola compra aplicada, completa o ninguna; informar el resultado al reconectar. |
| Falla de extracción | Original disponible, error comprensible, reintento controlado y captura manual. |
| Anulación de la última factura | Recalcular referencia desde documentos restantes y conservar trazabilidad. |
| Acceso no autorizado | Bloquear consulta, cambio y descarga de documentos de otro alcance. |
| Restauración | Recuperar datos, adjuntos y referencias comprobando integridad. |

## Capacidad y límites propuestos

Confirmado: hasta cinco usuarios simultáneos, normalmente uno o dos. La cantidad mensual de documentos no ha sido estimada; no se promete capacidad ilimitada.

Para una primera prueba de carga se propone un conjunto sintético de 10.000 productos y 50.000 documentos históricos, con un escenario adicional de documentos de 200 líneas y una cola de 100 archivos pendientes. Son objetivos de prueba, no volumen actual ni resultados obtenidos.

Medir consultas y guardado de borradores con cinco usuarios. Meta propuesta para consultas frecuentes: percentil 95 por debajo de dos segundos en el entorno de referencia documentado. Medir por separado carga de imágenes y lectura automática, que dependen del tamaño de archivo y del servicio seleccionado.

Definir y probar límites de tamaño de archivo, páginas, número de trabajos activos y reintentos. Cuando se alcance un límite, mostrar el motivo y conservar el trabajo existente; nunca aceptar indefinidamente archivos que no se podrán procesar.

Registrar errores y tiempos sin copiar datos sensibles de las facturas. El aumento de cola, espacio ocupado y fallos de respaldo deben generar avisos al encargado técnico, con responsable y forma de recuperación definidos antes del uso definitivo.

## Prueba de facilidad de uso

Una persona con poca experiencia debe poder cargar un documento, encontrar un campo señalado, corregirlo, guardar pendiente y volver a localizarlo con instrucciones mínimas. Probar también el significado de «confirmar», «anular» y «costo por unidad»; ajustar etiquetas que causen confusión.

## Entrega y puesta en uso

1. Revisar el primer flujo con las seis muestras.
2. Probar cálculos y estados con casos válidos e inválidos.
3. Probar cinco usuarios y los escenarios de interrupción.
4. Restaurar una copia de respaldo de prueba.
5. Hacer un piloto con documentos nuevos y comparación manual.
6. Corregir fallos del piloto antes de dar el sistema por listo.

Hasta superar esas etapas, los datos de prueba no deben presentarse como registros oficiales de operación ni mezclarse silenciosamente con datos definitivos.

## Pendientes sin bloquear el inicio

- Confirmar unidades de comparación de las presentaciones ambiguas al registrar cada producto.
- Revisar los encabezados poco legibles de Danec y la clasificación de documentos parciales.
- Definir alojamiento, respaldo y lectura automática antes de desplegar o contratar servicios.
- Revisar permisos del encargado y colaborador en el primer diseño.
- Incorporar precios reales de venta cuando al usuario le resulte práctico.

No hace falta solicitar más datos comerciales para comenzar la primera etapa.
