# Fichas, contenido y consulta de costos · 04/11/2026

Esta revisión responde al problema de una funda de chupetes sin desglose, costos históricos divididos por números del embalaje y fichas sin unidad identificada. La regla se aplica a todos los productos y proveedores.

## Decisiones

- `contentsMode=single` identifica una unidad sin desglose individual; `multiple` requiere cantidad interior entera y su nombre. Es distinto de la conversión de recepción `unitsPerPack`.
- Nombre, categoría, presentación real, unidad del costo y conversión son necesarios para usar una ficha comercial. Las marcas, códigos, PVP y referencia habitual de IVA siguen siendo opcionales. Cada factura mantiene su propio IVA obligatorio y su cuadre exacto.
- `productCostIssues`, `purchaseCostIssues` y la comprobación de contenido explícito se comparten entre consulta y confirmación. Un dato pendiente suprime costos y sugerencias comerciales; un precio guardado cuya unidad esté pendiente tampoco se presenta como precio vigente en la lista.
- El historial conserva sus filas originales. Una conversión antigua que divide UNI por X40/X672 no se usa como costo ni produce un cambio porcentual. Se requiere una corrección de la factura para sustituir el registro confirmado. No hay anulaciones masivas ni modificaciones silenciosas de importes.
- «Funda de 24 chupetes» es una propuesta explícita de contenido; «24X28» necesita revisión. Una propuesta de contenido nunca se copia al factor de recepción. Si el modelo propone un contenido contradictorio, se deja pendiente.

## Cambios técnicos

Migración aditiva `0008_steady_yellow_claw.sql`, esquema y respaldos v2 retrocompatibles. Los respaldos anteriores admiten los campos nuevos vacíos; un contenido interior anterior explícito se identifica como múltiple. Se mantienen originales, auditoría y cuentas locales. La auditoría de fichas incluye unidad, modo y contenido anteriores y posteriores.

La API bloquea creación desde factura incompleta y confirmación con fichas pendientes. El historial extrae la línea original para validación, reservando la factura completa para el cálculo de respaldo de netos antiguos; así evita duplicar documentos enteros en consultas modernas de muchas compras.

Los costos de consulta se redondean explícitamente a tres decimales en el motor puro. Los importes internos de seis decimales y los campos impresos de factura permanecen intactos. Un costo positivo por debajo de la escala visible se muestra «menor que $0,001» y las referencias que redondearían a cero no se publican.

Los paneles flotantes son independientes de la posición de la lista. Admiten minimizar, expandir y cerrar; las respuestas tardías no reabren paneles cerrados. La edición conserva aviso de cambios sin guardar y la vuelta desde ayuda.

## Verificación y límites

Las pruebas cubren datos completos, pendientes, contradicciones de contenido, corrección inmutable, lectura de columnas, precio interno $2,05 / 24 = $0,085417, presentación visible $0,085 y precio sugerido no nulo. También se conservan las pruebas de permisos, respaldos, concurrencia y capacidad de 50.000 documentos / 10.000 productos con cinco solicitudes.

Se realizó una lectura **real** de un PDF **ficticio** con Gemini 3.5 Flash-Lite: cuatro filas, cantidades reales 1, subtotales separados del IVA y una funda explícita de 24 chupetes. La lectura combinada con reglas conservadoras propuso `funda / multiple / 24 / chupete`; los campos no identificados de las otras filas se mantuvieron pendientes. El cuadre financiero fue $9,19 + $1,25 = $10,44. La primera comprobación detectó el rótulo genérico UNI y se reforzó la propuesta de presentación explícita antes de repetir la prueba satisfactoriamente. No se confunde esa lectura real con las respuestas simuladas de las pruebas de API.

La evidencia ficticia está en `outputs/presentaciones/gemini-real-contenido.json`. No se enviaron originales ni catálogo comercial del propietario a Google para estas comprobaciones. Una ficha completa tampoco demuestra por sí sola que el producto físico sea correcto: sigue siendo necesaria su revisión contra la factura y la presentación recibida.

El propietario confirmó **24 chupetes por funda**. La actualización local completa esa ficha y conserva los datos previamente confirmados de una cajita de ocho sobres y una unidad de maicena de 200 g. Los demás registros sin información suficiente permanecen pendientes; no se inventa su contenido. Las facturas y sus filas de costos se conservan.

## Entrega local verificada

- `typecheck` correcto; `lint` sin errores (permanece el aviso anterior del visor con `<img>`); **143 pruebas aprobadas** y **11 pruebas del modo local aprobadas**. La base D1 de compatibilidad está al día. Compilación compatible y local correctas; paquete local generado e instalado. No se publicó el modo Sites.
- La actualización se ensayó en una copia privada antes de aplicarla. La comparación de las bases antes y después verificó nueve tablas comerciales intactas, incluidas facturas y costos, las cuentas y configuración sin cambios y **47 archivos privados idénticos**. Solo se completaron las tres fichas conocidas y se añadieron cuatro entradas de auditoría. Integridad SQLite y relaciones correctas.
- La versión instalada `20261104181150167` está funcionando en `http://127.0.0.1:4310`. Se comprobaron 274 archivos instalados, los cinco módulos de dominio contra el código fuente y los controles nuevos servidos al navegador. El acceso anónimo a los datos permanece bloqueado y el paquete portable excluye datos privados.
- La revisión visual con datos ficticios comprobó costos por funda y chupete, tres decimales, estados pendientes, proveedores e historial flotantes, minimizar/expandir/cerrar, regreso desde ayuda con edición conservada y aviso al descartar cambios. Evidencia: `outputs/presentaciones/productos-revision-flotante.png`. El servidor de prueba se cerró al terminar.
