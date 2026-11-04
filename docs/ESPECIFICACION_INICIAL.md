# Especificación inicial

Fecha: 3 de noviembre de 2026.

## 1. Lo acordado

- Tienda pequeña tipo minisupermercado, en Ecuador y con moneda USD.
- Uso principal desde computador con conexión estable a internet.
- Entre uno y cinco usuarios simultáneos; normalmente uno o dos.
- Personas con distintos niveles de experiencia usando computadores.
- Documentos recibidos en papel y cargados mediante fotos o escaneos.
- Compras por unidades, cajas, pacas, paquetes y promociones.
- Descuentos y productos bonificados según proveedor.
- Prioridad: comprobar documentos, registrar costos y detectar subidas y bajadas por producto, proveedor y vendedor.
- Historial y referencias de impuestos por producto, con comprobación del cálculo de cada documento.
- Los precios de venta actuales no son necesarios para comenzar. Se capturarán de manera opcional más adelante.
- Se desea poder comparar aumentos del 20 %, 25 % y 30 % sobre una base de costo explícita. Son referencias elegibles, no una garantía de rentabilidad.

## 2. Alcance inicial y ampliaciones

La primera entrega debe resolver documentos, productos, proveedores, costos, revisiones y consultas. La lectura asistida se incorporará manteniendo una alternativa manual.

Quedan para después: cuentas por pagar, vencimientos de pago, declaraciones, emisión de comprobantes fiscales, conexión con el SRI, cálculo contable de utilidad, arriendo, servicios y pérdidas generales. El control de existencias y el registro de ventas no forman parte del primer alcance.

Una fecha de vencimiento impresa puede conservarse como información de origen sin crear una deuda ni una agenda de cobros.

## 3. Pantallas y lenguaje

Navegación principal: Inicio, Documentos, Productos y Proveedores. La administración queda reservada al encargado.

Flujo principal: **Cargar documento → Revisar → Confirmar**. Se emplea «documento» porque las muestras incluyen facturas, pedidos y notas de entrega.

- Botones con acciones claras, texto legible y formatos de dinero consistentes.
- Avisos con texto y ubicación del problema, no solamente colores.
- Mostrar primero lo que falta revisar; detalles adicionales desplegables.
- Guardado de borradores y señal visible de la última vez que se guardaron.
- El original y los campos revisados deben poder consultarse juntos.
- Pulsar dos veces no debe confirmar ni registrar dos compras.
- Desconocido, no aplicable y cero son valores diferentes.
- Se permite guardar un documento incompleto como pendiente.
- Mostrar qué se guardó y qué se debe reintentar si hay una interrupción.
- Permitir girar la vista del documento sin modificar el original.

## 4. Identidad del documento

Guardar tipo, proveedor, número, fecha, moneda, vendedor cuando conste, imagen original y páginas relacionadas. El código o clave electrónica se conserva como texto cuando sea legible, sin acceder automáticamente a sitios ni usar credenciales impresas.

La presencia de una clave electrónica impresa no equivale a haber comprobado su autorización en el SRI. Confirmar en este programa significa revisión interna, no validación tributaria.

Un pedido, nota de entrega y factura pueden pertenecer a una sola compra. Debe existir una relación entre ellos para no contar varias veces los importes o actualizar el costo repetidamente. Una factura sustituta de una nota ya usada como referencia debe reconciliarse con esa compra.

La clasificación sugerida por lectura automática necesita revisión cuando sea ambigua. Un documento comercial sin desglose de IVA se registra con impuesto «no informado», nunca con tarifa 0 % por deducción.

En documentos sin identificador suficiente, las coincidencias por proveedor, fecha, productos, importe e imagen generan aviso; no se fusionan ni rechazan automáticamente documentos solamente por tener el mismo total.

## 5. Datos del producto y de la compra

Separar producto, marca, contenido, presentación y unidad de comparación. No comparar artículos de tamaños distintos como si fueran el mismo.

Guardar código de barras como texto, código propio de cada proveedor, descripción original y producto interno relacionado. Un código de proveedor no es universal. El reconocimiento por nombre sirve para sugerir coincidencias; la vinculación ambigua requiere revisión.

Por renglón se conserva:

- Cantidad facturada, unidad comprada y conversión a unidades de comparación.
- Precio de lista, precio unitario impreso y precisión disponible.
- Tipo de precio: antes o después del descuento, con impuesto incluido o separado, o pendiente de identificar.
- Descuentos por porcentaje e importe, orden de aplicación si hay varios.
- Cantidad bonificada y producto correspondiente.
- Base, tarifa, importe de impuesto y total de la línea cuando estén disponibles.
- Importe y costo unitario calculados por el sistema, separados de los impresos.
- Fuente del dato, estado de lectura y corrección manual cuando corresponda.

Una descripción como «12 x 25» no define por sí sola cuántas unidades se compraron. Debe distinguirse el empaque comercial del volumen facturado. Las conversiones se guardan por producto y presentación; se conserva la conversión usada en cada compra histórica.

## 6. Promociones y descuentos

1. Bonificación del mismo producto: costo efectivo = importe asignado / unidades totales recibidas, con conversión confirmada.
2. Bonificación de un producto diferente: registrar la relación de promoción y su criterio de asignación. Se propone repartir el costo según valores de referencia comprobados, conservando esos valores y el reparto. Sin referencias suficientes, dejar el costo efectivo pendiente; no inventar un valor ni asignar cero automáticamente.
3. Descuento por línea: identificar si el precio impreso ya lo incluye, para evitar descontarlo dos veces.
4. Descuento general: utilizar el reparto indicado en el documento si existe. Si debe calcularse, repartir proporcionalmente entre las líneas elegibles y conservar las bases y los residuos de centavos. Los grupos de impuestos se revisan por separado.
5. Descuentos sucesivos: aplicar el orden documentado; no sumar porcentajes sin comprobarlo.
6. Descuentos del 99 % o del 100 % pueden ser una promoción válida. Se señalan para revisión, sin clasificarlos automáticamente como error.
7. Una promoción debe distinguirse de un cambio permanente del precio habitual.

Los repartos son cálculos internos trazables y no modifican el documento original. Si no hay información suficiente, se conserva pendiente y se impide publicar un costo unitario inventado.

## 7. Cuadre y redondeo

Usar aritmética decimal exacta. Conservar la precisión de cantidades y precios unitarios; redondear importes monetarios en los puntos definidos por el documento. No usar números binarios de coma flotante para acumular dinero.

Comprobar progresivamente:

1. Cantidades, precios y descuentos de cada línea.
2. Suma de líneas y tratamiento de descuentos generales.
3. Bases e impuestos por grupo.
4. Total final frente al impreso.
5. Importe escrito en palabras, cuando sea legible, como señal adicional.

No asumir que un subtotal está antes del descuento. No restar un descuento nuevamente si ya está incluido en las líneas.

El IVA redondeado por renglón puede diferir del calculado sobre la base acumulada. Se registra y explica el método reproducible. No se cambia de método por ensayo para esconder una diferencia.

Una diferencia de un centavo no se acepta automáticamente: debe poder explicarse con datos, precisión y método. No se crean líneas de ajuste silenciosas. Una explicación de redondeo queda registrada y visible al confirmar.

Un precio unitario impreso con dos decimales puede ser insuficiente para reproducir su línea; comparar también con lista y descuento, conservando la incertidumbre si falta precisión.

Separar el estado aritmético del estado de clasificación: «los totales cuadran» no significa que el impuesto, la presentación, el producto o el tipo de documento estén confirmados.

## 8. Impuestos y estimaciones

Guardar tarifa, base e importe por producto y documento, fechas de vigencia y fuente de la regla. Las tarifas no deben estar fijadas dentro de las pantallas ni cambiar facturas históricas retroactivamente.

Contrastar el cálculo impreso con las reglas de referencia aplicables al producto y fecha. Si difieren, mostrar la observación y mantener los valores originales; no sustituir silenciosamente la clasificación del proveedor.

Los importes no informados quedan pendientes. No añadir automáticamente un impuesto ya incluido ni extender un impuesto especial a todos los productos.

Fuentes oficiales consultadas en la conversación, que deben verificarse nuevamente al implementar el catálogo de reglas:

- Circular SRI NAC-DGECCGC25-00000006, sobre tarifa general del IVA: https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar?id=236482f4-6125-42fd-b073-62c99d08233d&nombre=NAC-DGECCGC25-00000006.pdf
- Circular SRI NAC-DGECCGC26-00000005, aclaraciones sobre alimentos: https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar?id=a3e4257d-ba2e-4ec7-89c7-635fa764b22a&nombre=NAC-DGECCGC26-00000005.pdf
- Información oficial de ICE: https://www.sri.gob.ec/impuesto-consumos-especiales

Los precios de venta y el precio indicado en el empaque son opcionales. No se inventan ni se infieren de un campo «PVP» sin confirmar a qué presentación corresponde.

Si después se muestran sugerencias, deben identificar la base usada: costo antes de impuestos o costo total pagado por unidad. Comparar cobro final menos pago por unidad puede mostrarse como diferencia comercial estimada; no llamarlo utilidad contable ni crédito tributario. No aplicar IVA nuevamente sobre un precio que ya lo incluye.

## 9. Historial y precios de referencia

Conservar todas las compras confirmadas, incluyendo descuentos y promociones. Mostrar último costo por proveedor y última compra general como referencias diferentes.

El orden se determina por fecha de compra o emisión documentada, no por el momento de subir la foto. Si dos documentos tienen la misma fecha y no se puede establecer el orden, mostrar el empate y solicitar elección de referencia con motivo; no inventar la secuencia.

Una factura antigua puede completar el historial sin reemplazar un costo posterior. La anulación o corrección del documento de referencia debe recalcularlo de manera trazable.

Las comparaciones muestran fecha, unidad, tratamiento de impuestos y promoción. Un precio histórico no se anuncia como oferta actual del proveedor. Las subidas grandes son advertencias; no prueban que el documento sea incorrecto.

Pedidos y notas comerciales pueden aportar una referencia provisional identificada. No sustituyen automáticamente el último costo confirmado de factura. Su incorporación debe enlazarse a la compra correspondiente y evitar duplicidades.

## 10. Usuarios, estados y recuperación

Propuesta inicial: encargado administra usuarios, confirma documentos y modifica referencias; colaborador carga, corrige borradores y consulta. Los permisos deben comprobarse en el servicio, además de en la pantalla.

Cada persona tiene su propia cuenta. Registrar quién carga, revisa, confirma, corrige o anula. No se permite borrar el historial de una compra confirmada desde la operación normal.

Estados de documento: borrador, pendiente de revisión, listo para confirmar, confirmado y anulado. Una corrección genera versión o documento de reemplazo enlazado, con motivo.

Mientras falten datos necesarios para normalizar un costo o resolver una discrepancia, se permite guardar pendiente y se bloquea su publicación como costo confirmado. Una advertencia de cambio de precio puede aceptarse con revisión; una diferencia aritmética sin explicación no.

La confirmación debe ser indivisible: documento, líneas, historial y cambios de referencia se guardan juntos o no se aplica ninguno. Un identificador de operación evita duplicados durante reintentos. Comprobar versiones para impedir que dos usuarios sobrescriban sus cambios.

Una falla durante la lectura automática no pierde la imagen ni obliga a repetir la carga. Se puede reintentar o transcribir manualmente. Los archivos se comprueban por tipo, tamaño y contenido antes de procesarlos; los documentos se tratan como datos, nunca como instrucciones.

## 11. Respaldo y privacidad

Imágenes y base de datos con acceso restringido. No publicar documentos reales en ejemplos públicos, registros de errores ni repositorios. Las miniaturas y descargas también deben requerir autorización.

Respaldar conjuntamente datos y adjuntos, con versiones y copia separada del servicio principal. Probar restauración y acceso de usuarios antes de usar el programa con información definitiva.

Definir lugar, frecuencia, retención y responsable del respaldo al elegir el alojamiento. Meta inicial propuesta: recuperar como máximo un día de trabajo desde un respaldo automático, y disponer de una guía de restauración. Es una meta pendiente de validar, no una capacidad existente.

Una exportación de tabla no sustituye un respaldo completo. Evitar guardar información sensible en mensajes de error o registros técnicos.

## 12. Decisiones que resolverá la implementación

No hace falta pedir al usuario más precios de venta para comenzar. Las incógnitas de las muestras se resuelven en la revisión de cada documento, sin detener el diseño general.

Antes de operar de forma compartida deben concretarse alojamiento, cuentas, recuperación de contraseñas, respaldo, límites de archivos, tecnología de lectura y sus condiciones de costo y privacidad. Si implica contratar un servicio o enviar documentos a un tercero, presentar la opción concreta al usuario antes de hacerlo.

Los permisos propuestos, metas de capacidad y límites deberán revisarse en el primer diseño funcional. No se han realizado pruebas de carga ni de recuperación todavía.
