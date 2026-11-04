# Mi Tienda · Facturas y costos

Aplicación privada para una tienda en Ecuador (USD): documentos de compra, comprobación exacta de importes e historial de costos por producto y proveedor.

## Abrir la versión local

Doble clic en **INICIAR_MI_TIENDA.cmd**. El programa se abre en **http://127.0.0.1:4310**. En el primer inicio creas tu cuenta de encargado; no necesitas ChatGPT, alojamiento externo ni una base de datos en internet. **DETENER_MI_TIENDA.cmd** cierra el servidor de forma ordenada.

El paquete **MI_TIENDA_LOCAL/** incluye el motor de ejecución. La copia portable es **mi-tienda-local.zip**. Los datos se conservan separados del programa, en **%LOCALAPPDATA%\MiTienda**. No se incluyen compras reales, usuarios ni claves dentro del paquete.

Gemini es la única conexión externa opcional: introduces tu clave en **Lectura con IA** y autorizas los documentos de cada envío. Sin Gemini puedes leer archivos localmente y trabajar sin internet. La lectura siempre propone datos para revisar; no confirma compras por sí sola.

La versión anterior alojada en Sites no se ha actualizado ni eliminado. Sus registros no se trasladan automáticamente: descarga su copia desde Respaldo e impórtala en la tienda local vacía.

## Documentación

- [Guía de uso y recuperación](docs/GUIA_DE_USO.md).
- [Informe de versión local y comprobaciones](docs/VERSION_LOCAL_2026-11-03.md).
- [Código y ejecución para desarrollo](aplicacion/README.md).
- [Estado y pendientes](docs/ESTADO_Y_PENDIENTES.md).
- [Bitácora de cambios](docs/BITACORA_DE_CAMBIOS.md).
- [Reglas del proyecto](AGENTS.md).

Solo las facturas confirmadas publican costos definitivos. Precios de venta opcionales; referencias del 20, 25 y 30 % calculadas con aritmética decimal exacta. La comprobación interna no equivale a autorización del SRI ni sustituye declaraciones tributarias.

Los originales de referencia en muestras/originales permanecen fuera del código y de todos los paquetes y no se envían a IA externa.
