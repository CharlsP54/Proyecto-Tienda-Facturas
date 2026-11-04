# Revisión inicial de las seis muestras

Fecha: 3 de noviembre de 2026.

Lectura visual provisional de imágenes proporcionadas por el usuario. Los datos no se han confirmado con el proveedor ni con el SRI. Los cálculos siguientes comprueban relaciones aritméticas visibles; no certifican la legalidad, autenticidad, entrega física ni transcripción completa de un documento.

## 1. Distribuidora Roguizam

Original local: `muestras/originales/01-roguizam.png`.

Se identifica como factura. La imagen está girada. En las líneas se observan cantidades 5, 2, 2 y 2; precios 0,8600 y 0,2900; descuento 0,92 en la primera línea; importes netos 3,38, 0,58, 0,58 y 0,58.

- Primera línea: 5 × 0,86 − 0,92 = 3,38.
- Las otras líneas: 2 × 0,29 = 0,58 cada una.
- Suma neta: 3,38 + 0,58 + 0,58 + 0,58 = 5,12.
- El resumen muestra IVA 0,78 y total 5,90: 5,12 + 0,78 = 5,90.
- Sobre la base acumulada: 5,12 × 15 % = 0,768, que redondeado al centavo da 0,77.
- Sobre cada línea: 0,51 + 0,09 + 0,09 + 0,09 = 0,78.

El impuesto impreso es aritméticamente compatible con redondeo por línea. Esa explicación debe mostrarse, sin marcar automáticamente una diferencia de un centavo como error del proveedor. El descuento del resumen ya aparece aplicado a las líneas; no debe restarse nuevamente.

No se infiere cuántas unidades vendibles contiene una presentación «x48» o «x20» solamente por su descripción.

## 2. Industrial Danec

Original local: `muestras/originales/02-danec.png`.

El encabezado dice «Información de factura». Hay dos productos, cantidades 25 y 12, precios unitarios con cuatro decimales, descuentos por unidad y tarifas distintas entre líneas. También existe una columna PVP que no se utilizará como precio real de venta de la tienda.

Se leen importes de línea 2,33 y 4,17; suman 6,50. El IVA impreso es 0,35 y el total 6,85: 6,50 + 0,35 = 6,85.

Los encabezados del resumen y la forma exacta de presentar el descuento deben confirmarse durante la transcripción. El importe 1,88 aparece en descuento; no se debe restar nuevamente de 6,50 sin comprobar cómo está formado ese subtotal.

El ejemplo requiere conservar cuatro decimales y distinguir precio unitario, descuento unitario y total neto de línea. La transcripción detallada y la clasificación documental quedan pendientes de revisión; no se inventan campos por proximidad visual.

## 3. Industrias Ales

Original local: `muestras/originales/03-ales.png`.

Se identifica como factura. Incluye presentaciones compuestas, columna de fracción y descuentos del 1,50 % y 99 %.

- Resumen: 13,26 − 2,62 = 10,64.
- IVA mostrado: 1,60. El cálculo sobre 10,64 al 15 % redondea a 1,60.
- Total: 10,64 + 1,60 = 12,24.
- Importes de línea: 2,61 + 2,61 + 2,61 + 2,78 + 0,03 = 10,64.
- Jabón: 6 × 0,47 × (1 − 0,015) = 2,7777, que redondea a 2,78. Multiplicar solamente el unitario neto impreso 0,46 × 6 da 2,76; esa diferencia se explica por la precisión del precio.
- Promoción: 2,61 × (1 − 0,99) = 0,0261, que redondea a 0,03.

Un descuento del 99 % no se considera automáticamente una captura incorrecta. Debe conservarse como tal, sin convertirlo a producto gratis o costo cero.

La conversión de «DP 25X1», la fracción y la descripción «25T1 X 12SA» requiere confirmar cuál es la unidad efectivamente comprada y cuál se comparará. No se deduce una cantidad vendible multiplicando todos los números del texto.

## 4. Comercializadora Coile / ILE

Original local: `muestras/originales/04-coile.png`.

El encabezado dice «Nota de entrega» y el pie «Documento sin valor tributario». Debe conservarse con ese tipo, no transformarse en factura por tener impuestos y total. Puede vincularse posteriormente con la factura correspondiente.

- Importes: 1,60 + 2,12 + 1,10 = 4,82.
- Base sin IVA mostrada: 1,60; base gravada: 3,22.
- IVA: 3,22 × 15 % = 0,483, redondeado 0,48.
- Total: 4,82 + 0,48 = 5,30.

La estructura combina unidades por paca, número de pacas y unidades sueltas. Por ejemplo, las 280 unidades por paca del segundo producto no significan que se hayan comprado 280: la cantidad visible en esa línea es 20 unidades sueltas.

Usar estos datos como referencia comercial provisional exige conservar la etiqueta del documento y resolver la vinculación para no repetir la compra cuando llegue la factura.

## 5. Distribuidora Arcor Manta

Original local: `muestras/originales/05-arcor.png`.

El contenido muestra «Fecha del pedido», vendedor, un producto y total. El encabezado completo no está visible; la clasificación inicial es pedido o documento comercial pendiente de confirmar.

- Cantidad visible: 1; precio e importe 5,54; total 5,54.
- La descripción incluye «8DX750G», que necesita una conversión confirmada antes de calcular un costo de unidad vendible.
- No hay desglose visible de impuestos. Registrar «no informado», sin asumir 0 % ni añadir un porcentaje.

La igualdad de un importe con el total no basta para declarar revisada toda la compra.

## 6. Distribuidora Colombina Manta

Original local: `muestras/originales/06-colombina.png`.

Documento comercial con «Fecha del pedido», vendedor, productos y total. La clasificación es provisional. Se ven cinco líneas con importe positivo y una línea promocional en cero.

- Líneas: 2,10 + 1,16 + 3,70 + 2,31 + 2,31 + 0,00 = 11,58.
- La tercera línea tiene cantidad 2 y precio 1,85: 2 × 1,85 = 3,70.
- Una línea promocional «GALLETA MUU LECHE» aparece en cero. Requiere vinculación a la promoción; no constituye un costo de reposición confirmado igual a cero.
- No se observa desglose tributario: impuestos no informados.

Las referencias de presentaciones del tipo «16BS/24/10G» deben conservarse sin confundirlas con cantidades realmente recibidas.

## Resultado para el diseño

Las muestras permiten comenzar sin precios de venta actuales. Proporcionan casos para redondeo por línea, precio unitario redondeado, descuento del 99 %, impuestos mixtos, presentaciones compuestas, bonificaciones y documentos comerciales relacionados con una factura posterior.

Las seis muestras no contienen el mismo producto claramente identificado comprado en fechas distintas a distintos proveedores. Esa comparación se probará primero con casos sintéticos identificados como tales; los precios reales no se inventan.

Los campos que no se leen con certeza permanecerán pendientes. Las notas y pedidos pueden comprobarse aritméticamente sin presentarlos como facturas tributarias ni actualizar automáticamente el último costo confirmado de una factura.
