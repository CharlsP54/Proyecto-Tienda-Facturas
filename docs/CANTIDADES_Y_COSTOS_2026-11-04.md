# Cantidades compradas y costos por contenido · 04/11/2026

La recepción se identifica por las columnas y la unidad de compra. Los números del nombre se conservan como descripción y pueden proponer un contenido comercial para revisión, pero nunca determinan unidades recibidas.

| Caso confirmado por el propietario | Unidad del costo | Conversión de recepción | Contenido interior | Costo mostrado |
| --- | --- | --- | --- | --- |
| Una maicena de 200 g, descripción X24 | Unidad de 200 g | 1 | Sin configurar | $0,86 |
| Una funda de gomas de 500 g por sabor, descripción X12 | Funda | 1 | Sin configurar | Según costo pagado y método explícito de precisión |
| Una cajita de Ranchero X8SOBRES X144CAJA | Cajita | 1 | 8 sobres | $1,30 por cajita; $0,1625 por sobre |

La ficha de producto conserva por separado `unitsPerPack` (recepción respecto a la unidad del costo) e `innerUnits` / `innerUnitLabel` (contenido comercial de esa unidad). El segundo desglose no reconstruye ni modifica compras históricas.

## Lectura y verificación

Gemini y OCR local conservan `purchaseReading`: cantidad y factor originales, unidad, cajas, unidades sueltas, cantidad total, evidencia de una conversión explícita y explicación. PRIORIZAR UNI o Caj.=0/Uni.=1/T.Cant.=1 impide que X24 divida un costo por error. Cajas y unidades mezcladas, o precio cuya unidad no esté clara, quedan pendientes. Una caja de 24 con precio por CJ y factor explícito 24 usa cantidad 1, incluso cuando T.Cant. indica 24.

`lineTotal` conserva SUBTOTAL neto y `grossLineTotal` el TOTAL con IVA cuando existen ambas columnas. Los precios con tres o más decimales no se recortan. El usuario puede aceptar `netRounding=document` e IVA sobre la base acumulada cuando reproduce todas las cifras. El motor conserva subtotales y pagos asignando centavos por mayor residuo; las cifras impresas de las filas se comprueban aparte. Los precios y el original permanecen intactos.

Ejemplo: tres precios de $2,777 tienen netos impresos de $2,78 por fila, subtotal acumulado $8,33, IVA $1,25 y total $9,58. La suma de los totales impresos de fila de $3,19 es $9,57. El método guarda explícitamente el reparto del centavo del pago del documento, sin fingir que el total impreso era otro. Este modo todavía no admite descuentos generales ni cargos adicionales; los casos fuera de alcance conservan la revisión pendiente.

Los filtros de categoría y búsqueda se aplican antes de la página de 50 artículos. La compra más reciente se ordena por fecha de factura confirmada; el alta reciente usa la fecha del catálogo. Las categorías se enumeran hasta 500 y se avisa de ese límite; la búsqueda textual permite consultar las restantes.

## Evidencia y límites

- `npm run check`: 139 pruebas aprobadas, incluidos SQLite nativo, respaldo/restauración, filtros antes de paginar y reemplazo inmutable; tipado correcto y lint sin errores (permanece la advertencia previa del visor `<img>`). Compilaciones compatible y local correctas. Migración 0007 aplicada también en la base D1 local de compatibilidad; no se publicó ni modificó el sitio alojado.
- Lectura **real** con Gemini 3.5 Flash-Lite de un PDF inventado de cuatro artículos: tres gomas con nombre X12 y una maicena X24, todos con Caj.=0/Uni.=1/T.Cant.=1/UNI. Resultado: factor 1 en las cuatro líneas; netos y totales separados; subtotal $9,19, IVA $1,25 y total $10,44; maicena $0,86. Evidencia local de datos ficticios: `outputs/presentaciones/gemini-real-unidades.json`.
- Las pruebas de API y sus respuestas simuladas están separadas de esa lectura real. Ninguna muestra original ni catálogo del propietario se envió a Google durante esta entrega.
- La revisión visual de Brave quedó bloqueada por la herramienta al no poder verificar su URL. No se presenta esa revisión como realizada; se comprueban el cliente compilado y los flujos de servidor por separado.
- Migración 0007 aditiva, con campos interiores vacíos en productos antiguos; respaldos anteriores siguen restaurando. Las facturas confirmadas previas solo cambian mediante una corrección explícita que conserva original, adjuntos y auditoría.

## Correcciones locales solicitadas

Tras detener el servidor se guardó una copia integral privada y se comprobó la integridad de ambas bases. El mantenimiento se ensayó primero en otra copia privada y luego se ejecutó localmente, sin envío de originales. Se usaron las mismas operaciones de dominio para crear revisión, guardar con versión y confirmar el reemplazo; no se editaron directamente los datos de la compra confirmada. La auditoría indica expresamente que se trató de mantenimiento solicitado por el propietario, ejecutado sin crear una sesión ni una cuenta.

- **Maicena de 200 g:** reemplazo confirmado con factor 1 y costo $0,860000. El original conserva íntegros sus datos y costos anteriores, ahora con estado anulado por reemplazo. Los demás costos de esa factura no variaron.
- **Ranchero:** ficha configurada como cajita con ocho sobres; costo histórico $1,300000 por cajita intacto y desglose $0,162500 por sobre. No se usa X144 para ninguna conversión.
- **Gomas:** borrador preparado con una funda por sabor, netos $2,78, totales de fila $3,19 y precisión explícita para subtotal $8,33, IVA $1,25 y total $9,58. Conserva su estado pendiente para revisión final; no se crearon productos ni se confirmó esa compra durante el mantenimiento.

La comparación posterior comprueba conservación de documentos ajenos a estas acciones, filas históricas de costo, originales adjuntos, cuentas y protección de Gemini. Los datos privados permanecen fuera del paquete portable.
