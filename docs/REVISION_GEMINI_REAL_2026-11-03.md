# Revisión de lectura real con Gemini · 03/11/2026

## Causas reproducidas

Se utilizó la conexión que el propietario ya configuró, sin mostrar su clave y sin copiarla a archivos de prueba. Los envíos de diagnóstico usaron exclusivamente documentos ficticios. No se enviaron las seis muestras originales ni facturas del negocio.

Se detectaron dos problemas independientes:

1. **Saturación de Google:** Gemini 3.8 Flash respondió HTTP 503/UNAVAILABLE indicando alta demanda. Ocurrió también con la solicitud corregida. Ver el modelo con una clave válida no garantiza que Google pueda ejecutar una lectura en ese momento.
2. **Fallo de integración propio:** enviar `maxItems: 200` dentro del esquema complejo de los renglones produjo HTTP 400/INVALID_ARGUMENT con Gemini 3.5 Flash-Lite. La misma imagen y solicitud funcionaron al retirar únicamente ese límite del esquema remoto. El programa mantiene el límite de 200 renglones al recibir la respuesta, y rechaza una tabla mayor sin truncarla ni publicarla.

El aviso anterior ocultaba ambos casos bajo un mensaje de servicio genérico. Las pruebas simuladas de la primera entrega no habían detectado esta incompatibilidad del esquema con el servicio real.

## Correcciones

- Esquema de respuesta corregido; se elimina también la configuración de temperatura no recomendada para estos modelos actuales. Se conservan importes como cadenas y el motor decimal independiente.
- Errores diferenciados: saturación 503, cuota 429, solicitud inválida 400, permisos, modelo, saldo, tamaño, espera, desconexión, bloqueo de contenido y respuesta incompleta. Se incluyen códigos seguros y espera indicada por Google, sin mostrar texto arbitrario del proveedor que pueda contener datos privados.
- Ante fallo aparece **Reintentar o cambiar modelo**, junto a **Leer localmente**. La elección se hace antes del consentimiento del nuevo envío. No se cambia el modelo guardado ni se repiten solicitudes automáticamente.
- La configuración ahora dice **Clave de Gemini verificada**. Se añade **Probar lectura con ejemplo**: envía un PDF ficticio generado en memoria y verifica realmente dos productos y sus importes. Pide autorización porque puede consumir cuota; no crea documentos ni productos del negocio.
- La prueba de ejemplo requiere encargado y tiene bloqueo de concurrencia, cancelación y tiempo límite. Una segunda solicitud no duplica el envío.
- Se conserva el borrador ante fallos y se rechaza una propuesta si el documento cambia mientras Google lo procesa. Los resultados tardíos cancelados no se aplican.
- Un RUC leído con cantidad incorrecta de dígitos genera advertencia; no se inventan dígitos ni se afirma una validación SRI.

## Pruebas con Google real

Gemini 3.5 Flash-Lite respondió correctamente a la solicitud corregida:

| Prueba | Resultado |
|---|---|
| Imagen ficticia, llamada directa | Dos productos, cantidades, precios e IVA reconocidos; total 5.30 e IVA 0.30 |
| PDF ficticio del nuevo comprobador | Dos productos e importes comprobados por el motor decimal |
| Imagen ficticia, recorrido completo en navegador | Adjuntar → autorizar → Google real → campos completos → guardar borrador → comprobar total 5.30 |
| Botón Probar lectura con ejemplo, en navegador | Lectura real comprobada, sin crear compras |
| PDF escaneado ficticio, recorrido completo en navegador | Dos productos, categorías, cantidades, precios, RUC, fecha, impuestos y total propuestos; sin reinicio de lectura; confirmación ficticia, catálogo e historial comprobados |

Para las pruebas de pantalla se utilizó un servidor aislado en 4311 con cuentas ficticias. El acceso a Google se limitó por huella digital a los archivos ficticios conocidos y al ejemplo generado, con máximo tres llamadas reales. La clave real estuvo solo en memoria; en la base de pruebas se guardó únicamente una clave ficticia cifrada. La saturación 503 se representó en esa pantalla con la misma respuesta que ya se había reproducido de Google real; las tres lecturas posteriores con 3.5 Flash-Lite sí hicieron llamadas reales a Google.

El formato de imagen tuvo una lectura de RUC de 12 dígitos en lugar de 13, aunque productos e importes cuadraron. Esto motivó la advertencia adicional. El PDF escaneado recuperó el RUC completo. Por eso una comprobación aritmética correcta no equivale a que todos los datos estén transcritos perfectamente: se mantiene la revisión humana frente al original.

## Verificación del programa

Tipos, ESLint sin errores (una advertencia conocida del visor privado), suite completa de 106 pruebas, compilación local y compilación de compatibilidad. Se añaden pruebas de regresión del esquema, respuesta de más de 200 productos, RUC incompleto, estados HTTP, privacidad de mensajes, ejemplo con cifras erróneas, consentimiento y rol, concurrencia y cambio de documento durante una lectura. El paquete local se actualiza conservando los datos del usuario; no se publica ni modifica Sites.

Evidencia visual: `outputs/revision-gemini-real/foto-gemini-cuadre.jpg`, `prueba-real-servicio.jpg` y `pdf-escaneado-gemini-cuadre.jpg`. Los datos de esas imágenes son ficticios.

## Operación recomendada tras actualizar

Recargar Mi Tienda local. En el aviso de lectura elegir **Reintentar o cambiar modelo**, seleccionar **gemini-3.5-flash-lite** y autorizar. Ese modelo completó las pruebas de esta revisión; no se garantiza que conserve capacidad o cuota disponible en el futuro.

Si se desea dejarlo como modelo habitual, seleccionarlo en Lectura con IA y guardar la conexión dejando la clave vacía para conservarla. El programa no lo cambia por su cuenta. La prueba con ejemplo permite comprobar el servicio antes de enviar originales del negocio.

Google puede tener caídas, saturación o restricciones de cuota; ninguna modificación local puede garantizar que desaparezcan. La mitigación es un aviso concreto, elección explícita de modelo o lectura local, conservación del borrador y ausencia de envíos repetidos sin autorización.

## Documentación del proveedor consultada

- [Guía de errores y solicitudes a Gemini](https://aistudio.google.com/docs/troubleshooting).
- [Salidas estructuradas y sus límites](https://aistudio.google.com/docs/structured-output).
- [Gemini 3.5 Flash-Lite y documentos](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite).

Antes de activar la actualización se detuvo el programa y se creó una copia íntegra privada en %LOCALAPPDATA%\MiTienda-copias. Las dos bases copiadas superaron PRAGMA integrity_check. Se reinició con la cuenta y la conexión existentes; los datos siguen fuera de OneDrive.
