# Versión local y control de lectura · 03/11/2026

**Actualización posterior:** se corrigió el rechazo del esquema y se verificó lectura con Gemini real. La evidencia vigente y los límites están en [Revisión de Gemini real](REVISION_GEMINI_REAL_2026-11-03.md). Los resultados iniciales que siguen corresponden a la entrega anterior a esa revisión.

## Alcance entregado

Programa autónomo para Windows con Node 24.20.0 incluido, React y SQLite nativo. El servidor escucha exclusivamente en 127.0.0.1:4310. Usuarios, sesiones, datos comerciales, originales, recursos OCR/PDF y copias diarias se conservan localmente. El uso diario no requiere instalar paquetes ni servicios, ChatGPT, Cloudflare, Supabase o conexión a internet. Gemini es opcional y requiere internet y una cuenta propia.

Programa instalado en `%LOCALAPPDATA%\MiTiendaPrograma\<versión>`; datos en `%LOCALAPPDATA%\MiTienda`. Ambos están fuera de OneDrive. El código fuente permanece en la carpeta original del proyecto. Hay accesos INICIAR_MI_TIENDA.cmd y DETENER_MI_TIENDA.cmd en la raíz, y una copia portable de distribución sin registros del negocio.

La versión alojada anterior se conserva sin publicar estos cambios, sin borrar datos ni alterar permisos. No se completó una migración de sus compras: el propietario debe descargar su respaldo con su acceso habitual e importarlo en la tienda local vacía. No se copian datos reales como semillas.

## Lectura y control de acciones

- Tesseract y PDF.js se sirven localmente; se eliminó la búsqueda oculta por varias rotaciones que reiniciaba el avance. Una lectura por acción, con progreso, cancelación y tiempos límite.
- Gemini recibe los originales autorizados, no solo texto OCR. Devuelve JSON con cabecera, productos, códigos por proveedor, precios, descuentos, impuestos, evidencia y categorías sugeridas. El motor decimal separado comprueba los cálculos. Las categorías no asignan IVA.
- La conexión se valida y la clave se cifra con AES-GCM. No se incluye en respuestas, URLs, logs ni respaldos comerciales. La clave de protección está en un archivo local separado. Se pueden desconectar y reconectar sin borrar compras.
- La lectura pide consentimiento por documento. No hay envíos ni cambios de modelo/reintentos automáticos ante errores. Los documentos de `muestras/originales/` no se enviaron a Google y siguen fuera de código y paquetes.
- Cancelar invalida resultados tardíos tanto de lectura como de carga. Una respuesta anterior no reemplaza un nuevo editor. No se promete deshacer un envío ya recibido por Google.
- Deshacer/rehacer hasta 30 cambios por sesión del editor; limpiar con aviso; salir conservando o descartando un borrador; papelera recuperable; retirar/recuperar adjuntos sin borrarlos físicamente.
- Anular o corregir exige motivo del encargado y presenta impacto en productos e historial. Se conserva la compra original y no se modifican documentos vinculados automáticamente.
- Adjuntos y papelera usan versiones CAS y auditoría. La migración 0005 añade `files.detached`; las copias antiguas lo restauran como activo.

## Corrección detectada durante el primer uso de Gemini

La validación original rechazaba puntos y el campo recortaba la entrada a 200 caracteres. Eso impedía usar claves de autorización nuevas. Se corrigieron interfaz, servidor y cifrado para conservar credenciales opacas de hasta 4096 caracteres, incluidos puntos, sin imponer un prefijo antiguo. Google decide su validez real. Solo se recortan espacios exteriores; espacios internos, saltos o caracteres invisibles generan un aviso explicativo sin mostrar la clave.

Hay prueba de regresión de cifrado/descifrado y envío íntegro de una clave ficticia larga `AQ.` y una prueba de configuración completa en el servidor local. Las claves reales deben volver a pegarse después de actualizar, ya que una entrada recortada no se puede reconstruir.

## Verificación

- Tipos TypeScript: aprobado.
- ESLint: sin errores; una advertencia de optimización de imagen en el visor privado de originales. El visor mantiene el acceso al archivo local sin un servicio externo.
- Suite completa: 98 pruebas (motor decimal, lectura, API, permisos, CAS, idempotencia, copias retrocompatibles, Gemini simulado, persistencia y capacidad).
- Compilación local y compilación Sites de compatibilidad aprobadas; paquete local preparado. No se publicó un Site ni se necesita paquete Sites para usar esta entrega.
- Migración 0005 aplicada a la base Wrangler de desarrollo local. El ejecutable nativo aplica migraciones SQLite con checksum al iniciar.
- Programa instalado y comprobado con su motor incluido; inicio, cierre ordenado y reinicio verificados. La cuenta real la crea el propietario, sin contraseña de prueba dentro del programa entregado.
- Paquete inspeccionado: motor, licencia, archivos OCR/PDF y migraciones presentes; sin cuentas, compras, muestras, claves ni node_modules.

Prueba de capacidad SQLite nativo: 50.000 documentos, 10.000 productos y cinco consultas HTTP simultáneas de listas paginadas; en la revisión medida durante otras pruebas, aproximadamente 320–338 ms por consulta. Cinco escrituras de la misma versión: una aceptada y cuatro conflictos. Una transacción fallida revierte sus cambios. También se conserva la prueba anterior Miniflare de 50.000 documentos. Estas cifras corresponden a este computador y datos sintéticos, no garantizan tiempo constante ni capacidad ilimitada.

Revisión visual en navegador, con datos ficticios: PDF digital y foto completaron dos artículos y un total de $5,30; la comprobación reprodujo subtotal $5,00 e IVA $0,30. Se verificaron guardado automático, deshacer/rehacer, papelera/recuperar, retirar/recuperar original, cancelar documento vacío, autorización Gemini, respuesta simulada y cancelación sin resultado tardío ni reinicio del avance. Sin errores de consola en esa revisión.

Evidencia: `outputs/version-local/comprobacion-factura.jpg`. La prueba de conexión y transcripción real con una clave del propietario sigue pendiente; no se afirma haber medido la exactitud de Gemini sobre las facturas reales.

## Límites y mitigaciones

Hasta 200 renglones y 20 archivos por documento (incluidos adjuntos retirados); archivos hasta 20 MB; PDF local hasta 20 páginas. Gemini: máximo 12 MB de originales por solicitud. Cuotas, permisos, modelo no disponible, respuesta truncada o espera agotada se muestran explícitamente y conservan el borrador; no se confirma una compra con ellos.

Los JSON de respaldo conservan límites (12 MB de adjuntos, 24 MB de archivo completo y un techo de metadatos); una copia que los supera se rechaza como incompleta. Para recuperar una tienda grande está documentada la copia de toda la carpeta con el programa detenido. El acceso de cierre espera a que se cierren las bases antes de anunciar que se puede copiar. Conservar copia en otro disco. El botón de respaldo integral sin esos límites queda para una siguiente mejora.

La recuperación de contraseñas desde la interfaz y el acceso por red no están implementados; mantener una segunda cuenta de encargado y las copias privadas. No exponer este servidor a internet. Un fallo de disco no se resuelve solo con transacciones: requiere copia externa.

Las seis fotos de referencia siguen con las limitaciones de OCR local registradas en la revisión anterior. Conectar Gemini no garantiza transcripción perfecta; se necesita comprobar una factura autorizada, comparar cada producto con el original y conservar revisión humana. La comprobación de impuestos es aritmética y documental, no autorización SRI ni emisión tributaria.

## Referencias del proveedor de IA

- [Tipos actuales de claves Gemini y migración a claves de autorización](https://ai.google.dev/gemini-api/docs/api-key).
- [Cuotas, precios y uso de datos según el nivel de Gemini](https://ai.google.dev/gemini-api/docs/pricing).
- [Modelo Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash).
