# Pruebas del motor de cálculos

## Ejecutar

Desde la carpeta `aplicacion`:

```text
node --experimental-strip-types --test tests/calculations.test.ts tests/capacity.test.ts
```

Las pruebas usan el ejecutor incluido en Node.js y el motor de aritmética decimal exacta. No necesitan conexión con el SRI, datos privados ni credenciales.

## Cobertura

`calculations.test.ts` cubre 27 escenarios, entre ellos:

- Roguizam: IVA redondeado por renglón, 0,78 y total 5,90.
- Danec: cantidades 25 y 12, precios con cuatro decimales, descuentos completos por línea, IVA mixto y total 6,85. No descontar por segunda vez el descuento del resumen.
- Ales completo: neto 10,64, IVA por grupo 1,60 y total 12,24. Detectar el método por línea que produciría 1,59 y no corresponde al resumen de esta muestra.
- Descuento del 99 %, producto distinto bonificado con asignación pendiente y unidades gratis del mismo producto.
- Descuento general con IVA mixto y cargos adicionales; opción explícita de incluir un cargo en base del IVA.
- Reparto exacto de residuos de centavos; ningún ajuste silencioso para forzar coincidencias.
- Documentos comerciales con impuestos no informados: no deducir tarifa 0 % ni inferir un impuesto a partir del total.
- Datos inválidos, conversiones desconocidas, cantidades nulas, límites de tamaño y rango, duplicación de identificadores y fechas imposibles.
- Costos unitarios menores a seis decimales: mantener pendiente, sin publicar cero.
- Documento con 200 renglones, sin pérdida acumulada de centavos.

## Ejercicio sintético de volumen

`capacity.test.ts` valida 500 documentos sintéticos de 200 renglones: 100.000 renglones en total. Ejecuta cinco secuencias independientes de 100 documentos mediante cinco hilos de Node. Comprueba los resultados y que la validación no altere los datos de entrada. El diagnóstico muestra la versión de Node, duración total y tiempos por hilo.

Primera ejecución registrada: Node v24.20.0, 28 pruebas aprobadas, ejercicio de volumen aproximadamente 2,17 segundos de pared. El tiempo depende del equipo y de los otros procesos activos; no se utiliza como garantía de latencia.

Esta prueba mide únicamente el motor decimal puro. **No prueba cinco usuarios HTTP, carga de imágenes, lectura automática, base de datos, respaldos, restauración ni capacidad del alojamiento.** Esas funciones necesitan sus pruebas de integración y operación correspondientes.

Los importes de las muestras solo prueban relaciones aritméticas transcritas. No validan autenticidad del comprobante, clasificación tributaria de productos ni unidades comerciales que no estén confirmadas.
