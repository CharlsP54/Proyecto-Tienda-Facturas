# Guía de uso · versión local

## Abrir y cerrar

1. Doble clic en **INICIAR_MI_TIENDA.cmd**. Abre http://127.0.0.1:4310 en este computador. Puedes usar tu navegador habitual.
2. En el primer inicio escribe tu nombre, un usuario y una contraseña de al menos ocho caracteres. Esta cuenta pertenece al programa local; no requiere ChatGPT ni un correo real.
3. En **Equipo**, el encargado puede crear otras cuentas de encargado o colaborador. Cada persona usa su propia cuenta para conservar la autoría de los cambios.
4. Cierra las revisiones pendientes antes de ejecutar **DETENER_MI_TIENDA.cmd**. Cerrar una pestaña no detiene el servidor ni borra compras.

La aplicación solo admite conexiones desde este computador. No está preparada para acceso desde otros computadores o teléfonos de la red. No abrir puertos del router. Se necesita una instalación de red y seguridad específica si se amplía ese alcance.

Los datos están en **%LOCALAPPDATA%\MiTienda**, fuera de OneDrive y separados del código. El programa portable se puede actualizar conservando esa carpeta. No eliminarla ni reemplazarla para actualizar la aplicación.

## Configurar Gemini opcional

En **Lectura con IA**, introduce la clave privada de tu cuenta Google AI Studio, elige el modelo y pulsa conectar/comprobar. No pegues claves en un chat. El programa comprueba que la clave pueda acceder al modelo; eso no garantiza que tenga cuota disponible para generar una transcripción.

Se admiten claves de autorización nuevas, con puntos y más de 200 caracteres. Si actualizas desde la primera prueba que las recortaba, vuelve a copiar la clave completa desde Google AI Studio.

Después de verificar la clave, usa **Probar lectura con ejemplo**. El programa enviará a Google un PDF ficticio y comprobará de verdad sus dos productos y sus importes. La prueba puede consumir cuota o saldo y requiere autorización; no utiliza facturas del negocio ni crea compras. Tener una clave válida no garantiza que el servicio tenga capacidad o cuota para leer en ese momento.

Si aparece saturación **503**, usa **Reintentar o cambiar modelo** en el editor. Elige el modelo y autoriza un nuevo envío. En la revisión del 03/11/2026, **gemini-3.5-flash-lite** completó las lecturas de imagen y PDF, mientras 3.8 Flash informó saturación. La elección por lectura no cambia el modelo habitual. Para cambiarlo de forma permanente, selecciónalo aquí y guarda la conexión dejando la clave vacía para conservarla. No hay reintentos ni cambios de modelo automáticos.

La clave se guarda cifrada en este computador. La pantalla no la vuelve a mostrar; las copias comerciales JSON no contienen la clave ni contraseñas. Después de restaurar una copia JSON en otro computador, conecta Gemini de nuevo.

Cada lectura con Gemini pide autorización para enviar los originales seleccionados a Google. La cuenta puede tener cuotas y costos; en el nivel gratuito Google indica que el contenido puede usarse para mejorar sus productos. Consulta las condiciones de tu cuenta antes de enviar documentos. No se reintenta ni se cambia de modelo automáticamente cuando hay un error de cuota.

Puedes usar **Leer localmente** y cancelar el aviso sin enviar la factura. XML y TXT se procesan localmente. Los originales de referencia del proyecto no se envían a Google.

## Subir una factura

1. **Nuevo documento → Elegir archivo**. Admite JPG, PNG, WebP, PDF digital o escaneado, XML de factura SRI y TXT. Una factura por registro; sus páginas pueden ir juntas.
2. Se guarda el original y se propone su contenido. Con Gemini conectado aparece la autorización; sin él se utiliza la lectura local. El avance termina al concluir y no reinicia otra lectura por sí solo.
3. Revisa proveedor, RUC del emisor, número, fecha, vendedor y cada producto: nombre, código, cantidad, precio, descuento, impuestos y total. La categoría es una sugerencia comercial, nunca determina el IVA.
4. Revisa las conversiones de cajas, pacas, displays y promociones. Lo que no se pudo leer queda pendiente. El programa no debe inventar conversiones, IVA ni productos para completar la tabla.
5. Pulsa **Comprobar valores**. Las diferencias frente a lo impreso se muestran explícitamente. Un cambio de redondeo se aplica solo si lo eliges.
6. El encargado confirma después de comparar todo con el original. Los artículos nuevos revisados se incorporan al catálogo; los códigos aprendidos pertenecen a ese proveedor. No hace falta crear cada artículo antes de cargar la factura.

Ninguna lectura garantiza exactitud completa de cualquier foto o diseño. Si falta una línea o un importe, otra foto o el PDF/XML original puede resolverlo; conserva la revisión humana. Solo las facturas confirmadas actualizan costos definitivos. Notas de entrega y pedidos quedan separados como provisionales.

Límites vigentes: archivo de hasta 20 MB, PDF local de hasta 20 páginas, hasta 200 productos por documento. Para Gemini se admiten imágenes/PDF hasta 12 MB en total por envío, con hasta 20 archivos de una misma compra. La pantalla informa si se supera el límite; no presenta una tabla truncada como completa.

## Controlar y recuperar acciones

- **Cancelar lectura** detiene la espera local y descarta resultados tardíos. Si Google ya recibió el documento, cancelar no deshace ese envío ni garantiza cancelar su consumo. El original guardado se conserva.
- **Cancelar y salir** permite abandonar una revisión. Un documento nuevo sin archivos ni guardado se descarta sin crear una compra.
- **Deshacer / Rehacer** recorre hasta 30 cambios del editor, incluida la aplicación de una lectura o limpiar campos. Este historial es de la sesión de edición, no se conserva al cerrar o recargar. Después de guardar, revisa y guarda de nuevo si quieres persistir lo deshecho.
- **Limpiar campos** muestra sus consecuencias antes de vaciar los datos del borrador; no elimina originales ni compras confirmadas.
- **Papelera** retira un borrador de las listas normales conservando datos y originales. En Documentos, filtra por Papelera y pulsa recuperar. No hay vaciado definitivo desde la interfaz.
- **Retirar este original** lo oculta de los adjuntos activos, conserva sus bytes y no borra los campos que ya se leyeron. Se puede recuperar en **Originales retirados** del mismo borrador.
- Una compra confirmada se **corrige** creando otra revisión o se **anula** con motivo del encargado. El aviso explica los productos afectados y documentos vinculados. Anular retira esa compra de los costos vigentes; puede quedar como referencia una factura anterior. No borra artículos del catálogo ni registros relacionados.

Si otra persona guardó una versión más reciente, el programa muestra un conflicto en lugar de sobrescribirla. Reabre la compra y compara antes de guardar.

## Productos, costos e impuestos

La lista de **Productos** muestra la compra confirmada más reciente por fecha de factura, su costo pagado por unidad, tu precio de venta actual si lo registraste y una referencia de venta de **+25 % sobre ese costo**. Si no hay compra, existe un empate pendiente o falta asignar el costo de una promoción, la referencia queda pendiente. El precio de venta se cambia con **Editar** y nunca se reemplaza automáticamente por el sugerido.

El botón **Proveedores** despliega los proveedores registrados para ese artículo, las descripciones que usan, la fecha de su última factura, vendedor y costo por unidad con impuestos. La lista está paginada de 50 en 50. Una relación proveniente solo de un pedido, nota de entrega o código de catálogo se identifica sin inventar una compra confirmada. Son proveedores registrados en tus documentos, no una consulta de existencias actuales de esos negocios.

En **Productos → Ver compras** se consultan fecha del documento, proveedor, vendedor, costos y variaciones. Los empates de fecha requieren elegir referencia con motivo. Los precios de venta actuales son opcionales; no se copian de un PVP impreso.

Las referencias de +20 %, +25 % y +30 % son aumentos sobre el costo, no margen sobre el precio final ni utilidad contable neta. Sobre costo total pagado no se vuelve a añadir IVA. La base neta se muestra como referencia antes de impuestos. Una bonificación del mismo artículo reduce su costo por unidad recibida; un regalo diferente conserva el costo pendiente si no se conoce su asignación.

La aplicación comprueba los impuestos e importes del documento, conserva tarifas históricas y alerta sobre datos inusuales. No valida autorización SRI, no emite comprobantes ni presenta declaraciones. No cambia el IVA leído por una categoría sugerida.

## Facturas con IVA mixto y columnas contradictorias

La lectura conserva también los subtotales impresos por tarifa, por ejemplo **Subtotal 0 %** y **Subtotal 15 %**. El programa comprueba cada base por separado además del IVA y total final. Las categorías del producto no determinan su impuesto.

Si la columna de los artículos indica 0,00 o está incompleta, pero el resumen contiene IVA, aparece **Propuesta de IVA para revisar** cuando hay un solo reparto que reproduce exactamente las bases y totales. La tabla muestra el IVA leído, la tarifa propuesta y el impuesto calculado. Pulsa **Aplicar propuesta de IVA** para cambiar todas las líneas propuestas en una acción. Se conserva la lectura anterior, se añade la explicación a las notas y puedes usar **Deshacer / Rehacer** antes de confirmar.

Los ceros de IVA por línea que contradigan ese reparto quedan como no informados; el valor original sigue consultable. Si es necesario otro redondeo, se muestra en la propuesta y queda registrado al aceptarla. Ningún precio ni total impreso se ajusta para forzar el cuadre.

En borradores de lecturas anteriores, usa **Leer subtotales del original**. Esta lectura es local y conserva tus productos, precios y cantidades. Si no logra leerlos con suficiente claridad, puedes volver a usar **Leer con Gemini** desde el visor; solicita de nuevo tu autorización y prepara una lectura completa. No necesitas volver a adjuntar la factura guardada.

Si varias combinaciones producen las mismas bases, falta un subtotal, hay valores exentos/no sujetos sin desglosar o el IVA y total no coinciden, el programa lo explica sin elegir una combinación a ciegas. Consulta el XML o el detalle del proveedor. Incluso una propuesta única es una inferencia aritmética: un papel que se contradice requiere comprobar el desglose fiscal antes de la confirmación definitiva.

## Vincular descripciones de un mismo artículo

Un artículo del catálogo conserva su nombre habitual y cada factura conserva el texto del proveedor. Por ejemplo, **ARROZ FUNDA 1000G** y **ARROZ COMERCIAL 1K** pueden vincularse a un único **Arroz de mesa 1 kg**, con sus costos y proveedores reunidos. El arroz de 2 kg sigue siendo otro artículo.

La identificación combina tres ayudas:

1. Las reglas locales buscan códigos de ese proveedor, descripciones revisadas anteriormente y nombres iguales o parecidos. No requieren Gemini.
2. Si autorizas **Incluir hasta 500 nombres, marcas, contenidos y presentaciones del catálogo**, Gemini también propone coincidencias por significado. Esa opción se muestra antes del envío; no incluye precios del catálogo. Puedes desmarcarla y seguir leyendo la factura con Gemini o elegir lectura local.
3. En las coincidencias dudosas, tú pulsas **Es este producto** después de comparar marca, contenido, variante y presentación. Se conserva el texto de la factura y sus importes. Si es distinto, marca **Revisé las coincidencias: es un producto distinto** y explica qué lo diferencia.

La confirmación se detiene si hay candidatos pendientes de esa decisión. Al confirmar la factura se recuerda la descripción de ese proveedor para próximas lecturas; una lectura o borrador no enseña asociaciones definitivas. Los códigos internos de dos proveedores distintos nunca se consideran universales.

Las sugerencias no garantizan encontrar todas las equivalencias. La búsqueda local por semejanza usa un conjunto acotado y Gemini recibe hasta 500 artículos; puedes buscar el producto en el catálogo del editor para vincularlo. Esta actualización previene duplicados nuevos: no fusiona ni borra duplicados creados en revisiones anteriores.

## Copias y traslado desde la versión anterior

**Respaldo** permite descargar una copia JSON comercial con originales verificados. La restauración requiere una tienda sin compras ni catálogo y conserva la cuenta local actual. Admite copias anteriores; no sobreescribe una tienda que ya tiene registros.

Para trasladar la tienda anterior, entra en aquella versión con su cuenta autorizada, descarga **Respaldo** y luego importa ese archivo en la versión local vacía. No se ha copiado automáticamente ni eliminado información de aquella versión.

Las copias diarias de actividad se conservan localmente. El respaldo JSON tiene límites explícitos: 12 MB de originales y 24 MB de archivo completo, además del límite de metadatos. Al superarlos se rechaza la copia incompleta. Para una tienda grande o una copia de recuperación integral:

1. Guarda los cambios y ejecuta **DETENER_MI_TIENDA.cmd**; espera a que indique que cerró.
2. Copia **toda** la carpeta **%LOCALAPPDATA%\MiTienda** a otro disco, incluyendo bases de datos, archivos y conexión cifrada. Una copia en el mismo disco no protege contra avería de ese disco.
3. Para recuperar, con el programa detenido conserva aparte la carpeta actual y coloca la copia íntegra como MiTienda. Inicia de nuevo y verifica documentos y originales.

Esta copia integral incluye cuentas y material de conexión: mantenla privada. No copiar solo tienda.sqlite mientras el programa está abierto, pues puede tener operaciones pendientes en los archivos WAL. No se ha implementado aún un botón de copia integral de tamaño ilimitado.

## Cantidad comprada y contenido de una caja

Una ficha debe indicar **categoría, presentación, unidad del costo, conversión y tipo de presentación**. Elige **Una unidad individual** para una unidad sin desglose de piezas, o **Contiene varias unidades** para una funda, cajita u otra presentación con contenido individual; en ese caso completa cantidad y nombre interior. Marca, código de barras, precio de venta y referencia habitual de IVA son opcionales; el IVA real de cada factura sigue siendo necesario.

Si falta un dato necesario, verás **Pendiente de revisión** y su motivo. Los importes no aparecen como costos vigentes ni generan precios sugeridos. Se conserva el registro para completarlo. Un producto nuevo dependiente de una factura no se publica desde una lectura incompleta o incoherente, y la factura nueva no se confirma hasta resolverlo.

Gemini puede proponer estos campos y se recuerdan en la ficha revisada. Un nombre como **24X28 UND CJ** no dice por sí solo qué número corresponde a la funda. Si el contenido no está inequívoco, queda pendiente. Si un documento identifica un contenido diferente al de la ficha, se necesita revisar la presentación o vincular el producto correcto.

La cantidad de la factura y los números del nombre describen cosas diferentes. Si compraste una maicena de 200 g por $0,86 y la unidad impresa es **UNI**, su costo es **$0,86**. El texto **X24 UND CJ** puede describir la caja del proveedor; no se divide entre 24 por ese nombre.

La lectura toma primero las columnas **Caj.**, **Uni.**, **T.Cant.** y **Unidad**. En **Cómo se leyó la cantidad comprada** puedes consultar las columnas y la conversión anteriores. Si falta información sobre una caja o hay contradicciones, la conversión queda pendiente. En **Unidades de comparación por presentación comprada**, escribe **1** cuando cada unidad comprada sea la misma unidad del costo.

Si una factura ya está confirmada, usa **Crear corrección**, indica el motivo, revisa la conversión y confirma el reemplazo. El original se conserva en el historial; no se borra ni se sobreescribe su información.

Para una cajita de Ranchero que cuesta $1,30 y contiene ocho sobres, entra en **Productos → Editar**:

1. Define **Unidad del costo: cajita** y conserva **Factor habitual de recepción: 1** cuando compras cajitas.
2. En **Venta por partes**, indica **8** y **sobre**. Si aparece **Usar contenido sugerido**, comprueba la propuesta antes de guardar.
3. Guarda. En **Costo de compra** verás dos columnas: **Presentación: $1,30 por cajita** y **Unidad interior: $0,1625 por sobre**, con los importes grandes. **Venta sugerida +25 %** separa también ambas unidades. El X144 del embalaje mayor no interviene. Esta configuración no cambia cantidades ni costos de compras confirmadas.

El precio de venta actual de la ficha corresponde a la unidad del costo. Las referencias de venta por partes se calculan por separado sobre su costo pagado, con el mismo redondeo monetario explícito.

Ejemplo confirmado por el propietario: una **funda de 24 chupetes** con costo total de **$2,05** tiene costo interno de **$0,085417 por chupete**. La consulta diaria lo muestra como **$0,085**, conservando la precisión para los cálculos y referencias. Los precios sugeridos de venta siguen en centavos. El valor exacto de una celda puede consultarse al mantener el puntero sobre el importe; el editor de factura conserva los decimales impresos.

Los costos antiguos que dividían UNI por el número de caja del nombre se muestran pendientes también en el historial. No se sustituyen por cero ni se usan para calcular variaciones. Abre la factura y utiliza **Crear una corrección** para revisar esos registros; sus datos originales se conservan.

## Consultar sin perder de vista la lista

**Proveedores**, **Ver compras** y **Editar** abren paneles flotantes sobre el lado derecho. Puedes desplazarte por la lista visible y por el contenido del panel de forma independiente. **Minimizar** deja la cabecera para poder acceder a otros productos; **Expandir** recupera el contenido y la **X** lo cierra.

Si editas una ficha y cambias de producto, de sección o cierras sin guardar, aparece un aviso para conservar la edición o descartarla. Abrir **Ayuda** y cerrarla devuelve la ficha con sus cambios. **Guardar** conserva la información; cerrar o minimizar no confirma una compra.

## Buscar productos y revisar la precisión de una factura

En **Productos** puedes buscar también por categoría, seleccionar una categoría y ordenar por **Compra más reciente**, **Agregados recientemente**, **Nombre A–Z** o **Nombre Z–A**. El orden de compras usa la fecha de la factura confirmada. Los filtros se aplican a todo el catálogo antes de paginar. **Limpiar filtros** recupera la vista inicial.

Cuando una fila trae **SUBTOTAL** y **TOTAL**, el primero es el neto y el segundo puede incluir IVA. La revisión permite comprobar ambos. Un precio con tres o más decimales se conserva tal como fue leído.

Si tres precios de $2,777 producen un subtotal impreso de $8,33, puede aparecer **Usar precisión del precio hasta el subtotal**. Revisa y acepta ese método para reproducir **$8,33 + $1,25 de IVA = $9,58**. Se conservan los importes impresos de cada fila y se explica el reparto de centavos en las notas. Puedes deshacerlo antes de confirmar. Este método requiere tarifas conocidas y no admite todavía descuentos generales ni cargos adicionales.

## Si algo falla

- Si el servidor está detenido, usa el acceso de inicio. Los registros de diagnóstico están en **%LOCALAPPDATA%\MiTienda\registros**.
- Si Gemini falla por clave, modelo, cuota o internet, conserva el borrador; conecta otra vez o lee localmente. No se confirma una compra por una respuesta parcial.
- Si una lectura es incompleta, revisa sus advertencias y compara la cantidad de productos con el original antes de confirmar.
- Si un cálculo difiere, revisa cantidades, precio antes de descuentos, impuestos y redondeo. No ajustar un centavo sin explicación.
- Si olvidas todas las contraseñas de encargado, no borres las bases para entrar: conserva la carpeta y solicita recuperación local de acceso. El restablecimiento de contraseñas desde la interfaz queda pendiente.
- Si no hay espacio en disco o se corta la energía, reinicia el programa y revisa el último borrador guardado. SQLite usa transacciones y WAL; las copias externas son la protección ante daño del disco o de archivos.
