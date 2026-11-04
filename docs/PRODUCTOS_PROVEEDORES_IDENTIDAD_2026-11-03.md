# Productos, proveedores e identidad · 03/11/2026

## Comportamiento entregado

- Productos muestra costo pagado de la factura más reciente por fecha del documento, venta actual opcional y referencia +25 % sobre costo total pagado. Se utiliza el motor racional existente. No añade IVA otra vez, no rellena venta faltante y no presenta el aumento como utilidad neta garantizada.
- Proveedores reúne relaciones de facturas, descripciones aprendidas, códigos y documentos comerciales. Pagina todos los registros de 50 en 50, muestra hasta tres descripciones recientes por proveedor y separa relaciones sin factura confirmada de costos reales. No indica disponibilidad del proveedor.
- Un producto del catálogo conserva su nombre y cada compra conserva la descripción original. Los códigos se buscan exclusivamente dentro del proveedor. Las descripciones revisadas se guardan en `product_aliases` al confirmar facturas, de forma atómica con costos y auditoría; la lectura y el borrador no publican aprendizaje definitivo.
- Un código conocido, una descripción revisada o un nombre exacto pueden proponer el vínculo en el editor; permanece sujeto a revisión. Semejanza y Gemini solo muestran opciones. Las ambigüedades no deciden por orden de carga.
- Antes de crear desde la factura, interfaz y servidor comprueban coincidencias. El usuario vincula el artículo existente o declara que es distinto y explica su diferencia. Se comprueba versión del borrador y reintento de alta, conservando su original.
- El catálogo puede guardarse antes de que finalice la confirmación, como en el flujo previo; si una operación posterior falla, puede quedar un artículo sin compra. No se publican costos ni asociaciones definitivas hasta la confirmación atómica de la factura.

## Gemini opcional

El aviso previo permite autorizar hasta 500 identificadores con nombre, marca, contenido, presentación y código de barras. No se incluyen precios del catálogo. Si se desmarca, Gemini sigue leyendo el documento sin ese contexto. La opción no envía nada antes de la autorización final. Solo se aceptan propuestas cuyo identificador pertenecía al conjunto autorizado y sigue existiendo.

La prueba real utilizó un PDF ficticio y tres artículos ficticios (arroz 1 kg, arroz 2 kg y detergente 1 litro). Gemini 3.5 Flash-Lite propuso correctamente arroz de 1 kg y detergente, conservando dos líneas, cantidades, precios, IVA y total de 5,30 USD. Evidencia sin claves en `outputs/catalogo-proveedores/gemini-coincidencias-real.json`. No se enviaron los originales de `muestras/originales/` ni el catálogo real del propietario.

## Verificación

`npm run check`: tipos aprobados, ESLint sin errores y 115 pruebas aprobadas. Queda la advertencia conocida sobre `<img>` del visor privado. `npm run build` y `npm run build:local` verifican ambos perfiles. Migración 0006 generada, aplicada a D1 local y empaquetada para el programa nativo, que la aplica al arrancar sin destruir datos. Las asociaciones forman parte del presupuesto, exportación y restauración de respaldo; las copias antiguas reconstruyen asociaciones desde facturas ya confirmadas.

Nueve pruebas nuevas en `tests/catalog.test.ts` verifican variantes, ventas no informadas, nombres distintos de un producto, códigos de proveedores independientes, 55 proveedores paginados, borradores comerciales inválidos, empates y anulaciones, propuestas Gemini revisables, protección de altas y compatibilidad de respaldo.

Recorrido visual con tienda separada y ficticia en 127.0.0.1:4311: se bloquearon dos candidatos pendientes sin crear productos; al vincular y confirmar, el catálogo mantuvo tres artículos, incluido el arroz de 2 kg separado. El arroz de 1 kg reunió tres proveedores con descripciones distintas y costos 1,30 / 1,40 / 1,50; la referencia más reciente fue 1,88. El detergente mostró costo pagado 2,30 (IVA incluido), venta actual 2,80 y sugerido 2,88, sin doble impuesto. La respuesta Gemini de este recorrido visual es simulada, distinta de la prueba real anterior.

Capturas finales con datos ficticios: `outputs/catalogo-proveedores/productos-precios.jpg` y `proveedores-producto.jpg`. No se detectaron errores de consola en la comprobación final del catálogo.

Paquete `mi-tienda-local.zip` actualizado e instalación activa en `%LOCALAPPDATA%\MiTiendaPrograma\20261104024716610`. Antes del arranque se detuvo la tienda y se verificó una copia íntegra privada en `%LOCALAPPDATA%\MiTienda-copias\antes-correccion-lectura-1793760488004`. Revisión posterior: 254 archivos instalados coinciden con el paquete, ZIP de 277 entradas sin datos privados, ambas bases sanas, migración 0006 aplicada y cuentas, documentos, productos, compras, adjuntos y conexión cifrada conservados. La aplicación responde en 127.0.0.1:4310. No se publicaron cambios en Sites.

## Límites explícitos

La semejanza local no asegura detectar todos los productos: usa hasta 10.001 artículos precargados, o una búsqueda acotada de hasta 200 en el alta; códigos, descripciones conocidas y nombres exactos se consultan también directamente. Gemini compara hasta 500 artículos y puede equivocarse. La búsqueda del catálogo permite vincular manualmente los demás. La asociación conserva incertidumbres y requiere revisión de marca, tamaño, sabor y unidades por empaque.

No se fusionan ni borran duplicados anteriores. Una consolidación histórica reversible, con impacto y auditoría, queda para un flujo posterior específico. Los precios actuales de venta siguen siendo opcionales y el sugerido no contempla gastos operativos ni promete rentabilidad neta. No se altera el sitio anterior ni se publican datos o muestras.
