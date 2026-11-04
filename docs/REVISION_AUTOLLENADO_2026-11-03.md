# Revisión funcional del autollenado — 03/11/2026

## Resultado

Se corrigió el recorrido **elegir archivo → leer → completar cabecera y productos → revisar junto al original → comprobar → confirmar**. Las pruebas en navegador con documentos ficticios demostraron autollenado desde PDF digital, foto PNG, PDF escaneado y XML con grupos de IVA distintos. No se digitó la información de esas facturas para completar la prueba positiva.

La lectura automática de las seis fotografías originales **todavía no es suficientemente completa ni exacta para prometer que solo haga falta aprobarlas**. La comprobación matemática y la revisión humana siguen siendo necesarias. Una nueva captura con texto más grande y nítido, el PDF digital o el XML del proveedor pueden reducir las correcciones; no se garantiza que eliminen todas.

## Fallos corregidos

- Las fotos no ejecutaban OCR al subirlas; además, cambiar el original activo cancelaba su propia lectura. Se corrigió el inicio y la cancelación.
- La respuesta de extracción ya era un objeto y se intentaba convertir otra vez desde JSON. Ahora se aplica y guarda la propuesta correctamente.
- El lector anterior de PDF no cubría escaneos. PDF.js local extrae coordenadas o convierte la página para OCR.
- El texto OCR recorría columnas por separado. Se reconstruyen filas por coordenadas TSV y se corrige inclinación; se prueban orientaciones alternativas cuando hace falta.
- Se eliminaron RUC inventados, IVA por defecto y llamadas a servicios externos de IA. Un dato desconocido permanece pendiente.
- El reconocimiento podía interpretar un RUC o un pie con números como un producto. Se rechazan renglones sin evidencia suficiente de cantidad o precio.
- Las categorías se sugieren y pueden revisarse; se guardan en catálogo y respaldos mediante la migración aditiva 0004.
- Se hicieron visibles campos del catálogo ampliado, variaciones exactas de costo, referencias netas y totales, elección de referencia con motivo, notas provisionales, promociones y redondeo reproducible.

## Comprobaciones en navegador

| Prueba ficticia | Resultado observado |
|---|---|
| PDF digital | Proveedor, RUC, número, fecha, dos productos, cantidades, precios, IVA y total rellenados. |
| Foto PNG | Lectura iniciada al subir; dos productos y sus categorías, tarifas 0 % y 15 %, total 5,30. |
| PDF escaneado | OCR local; mismos dos productos y total calculado 5,30 igual al impreso. |
| XML | Cabecera y detalle completos; suma exacta de grupos de IVA; reconoce los artículos previamente confirmados. |
| Confirmación | Crea los dos artículos nuevos sin repetir captura y publica costos 1,50 y 2,30 por unidad. |
| Historial | Neto 2,00 y total pagado 2,30 separados; referencias 2,76 / 2,88 / 2,99 sin doble IVA. |
| Diferencia intencional de 0,01 | Bloquea Confirmar documento y explica la diferencia. Se restauró el valor correcto después de la prueba. |
| Dos compras del mismo día | No elige por orden de carga; guarda la selección del encargado y su motivo. |

Las muestras ficticias y las capturas de evidencia están en `outputs/pruebas-autollenado`, fuera de `aplicacion/`. Los documentos locales de prueba no se suben a la tienda publicada.

## Lectura local de las muestras originales

Se usó Tesseract local con ampliación, orientación y corrección de inclinación. Esta inspección no es una medición de exactitud universal ni una prueba de confirmación: contar un renglón reconocido no demuestra que todos sus números sean correctos.

| Muestra | Renglones reconocidos / visibles | Límite observado |
|---|---:|---|
| Roguizam | 0 / 4 | Cabecera parcial; la tabla no se recuperó con suficiente claridad. |
| Danec | 0 / 2 | Cabecera parcial; las columnas de detalle no se reconstruyeron con seguridad. |
| Ales | 5 / 5 | Se recuperan renglones, pero faltan encabezados y totales y hay cifras dudosas. |
| Coile | 2 / 3 | Lectura parcial de tabla y cabecera. |
| Arcor | 1 / 1 | Se reconoce el renglón; hay confusiones de cifras y proveedor incompleto. |
| Colombina | 6 / 6 | Se recuperan renglones; cantidades, importes y promociones aún requieren revisión. |

Los textos derivados se conservan solo localmente junto a la evidencia privada. No se copiaron originales reales al código, a datos semilla ni al paquete publicable. No se enviaron a OCR externo.

## Verificación técnica y límites

- Comprobación de tipos aprobada.
- Lint sin errores; conserva tres avisos conocidos: dependencias de efectos controlados por eventos y visor privado de imágenes sin un optimizador externo.
- Suite completa: **84 pruebas aprobadas**, incluyendo cálculo exacto, reconstrucción OCR/PDF, propuestas sin mutación, conflictos de versión, permisos, respaldo/restauración con categoría y respaldos legados, concurrencia y capacidad.
- Capacidad probada localmente con 10.000 productos, 50.000 documentos y cinco sesiones simultáneas. Los resultados locales no garantizan tiempos idénticos en el alojamiento.
- Compilación y empaquetado con recursos de OCR/PDF locales y migraciones incluidas. El archivo publicable contiene solo `dist/`.
- Límites: 20 MB por archivo, 20 páginas por PDF, 200 renglones por documento, OCR con cancelación y tiempo máximo por imagen. La copia completa tiene sus propios límites de datos y adjuntos indicados en la guía.
- Se verifica coherencia de valores; no se comprueba autorización en SRI ni se emiten documentos tributarios.

Referencia normativa consultada: [Circular SRI NAC-DGECCGC25-00000006 en el Registro Oficial, suplemento 192](https://esacc.corteconstitucional.gob.ec/storage/api/v1/10_DWL_FL/eyJjYXJwZXRhIjoicm8iLCJ1dWlkIjoiOWRkNGJkM2YtOTlhMC00MzAxLWJiY2QtMmRlNTJmZDc0YTJlLnBkZiJ9). Las tarifas del documento se conservan y revisan; la categoría comercial no asigna automáticamente un impuesto.


## Publicación

Actualización privada publicada correctamente en [Mi Tienda](https://tienda-costos-facturas-cp.archedfruit8.chatgpt.site), conservando su audiencia. Código publicado: `a04d59c6c6365d2701db6b7c591161716a947028`. El acceso requiere la cuenta de ChatGPT autorizada; la sesión del navegador de prueba mostró el acceso protegido, sin abrir información de la tienda.

El paquete `mi-tienda-publicacion-final.tar.gz` tiene 21,32 MB. Se inspeccionaron sus 310 entradas: todas pertenecen a `dist/`, incluye la nueva migración y el trabajador PDF local, y no contiene originales ni archivos de configuración privada. La aplicación quedó sin cambios locales pendientes en su repositorio.
