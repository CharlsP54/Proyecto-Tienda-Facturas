---
name: muestras-y-reglas-ecuador
description: >-
  Referencia de dominio sobre facturación, notas de entrega, pedidos, redondeos
  de IVA, bonificaciones y casos reales ecuatorianos verificados en Mi Tienda
  (Roguizam, Danec, Ales, Coile, Arcor, Colombina), junto con las reglas de
  privacidad de muestras/originales. Usar cuando se ajusten reglas de cálculo,
  OCR, impuestos, promociones o validaciones de documentos de proveedores en Ecuador.
---

# Reglas Comerciales de Ecuador y Casos Reales de Referencia

Guía de dominio basada en `docs/ESPECIFICACION_INICIAL.md` y `docs/REVISION_MUESTRAS.md` para asegurar que cualquier mejora respete la realidad operativa de proveedores ecuatorianos.

## 1. Privacidad estricta de `muestras/originales/`

- La carpeta `muestras/originales/` contiene 6 documentos reales del propietario (`01-roguizam.png` a `06-colombina.png`).
- **Reglas absolutas:**
  1. Nunca copiar archivos de `muestras/` dentro de `aplicacion/` ni incluirlos en commits o en `mi-tienda-publicacion-final.tar.gz`.
  2. Nunca enviar imágenes de `muestras/originales/` a APIs externas.
  3. En pruebas automatizadas (`aplicacion/tests/*.test.ts`), representar únicamente los **importes y estructuras numéricas sintéticas** de cada caso, sin datos personales sensibles ni imágenes reales.

## 2. Los 6 casos reales que el motor nunca debe romper

Toda modificación en `lib/calculations.ts`, `lib/ocr.ts` o `app/page.tsx` debe seguir resolviendo exactamente estos escenarios (cubiertos en `tests/calculations.test.ts`):

1. **Caso 01 — Roguizam (Redondeo de IVA por línea vs. por grupo):**
   - Hay facturas donde sumar el IVA redondeado línea por línea difiere en `0.01` respecto a calcular el IVA sobre la suma agrupada de bases gravadas (referencia normativa de redondeo en comprobantes electrónicos del SRI).
   - **Regla:** Nunca ocultar ese centavo con tolerancias automáticas. Soportar `taxRoundingMode = "taxGroup"` (estándar) y `"line"` (cuando el proveedor redondea por ítem), dejando constancia explícita de qué método reproduce el impreso.

2. **Caso 02 — Danec (Precios unitarios con 4 decimales e IVA mixto `0 %` y gravado):**
   - Proveedores de consumo masivo facturan precios unitarios y descuentos unitarios con 4 decimales y combinan en el mismo documento productos con tarifa `0 %` y tarifa gravada (`15 %`).
   - **Regla:** Conservar hasta 6 decimales en entradas y costos unitarios, separar estrictamente bases por tarifa de IVA y cuadrar neto impreso, IVA impreso y total final por separado.

3. **Caso 03 — Industrias Ales (Precisión completa de descuento y promoción del `99 %`):**
   - El descuento por línea puede requerir precisión completa (no truncar el precio unitario descontado antes de multiplicar) y existen líneas promocionales con descuento explícito del `99 %` (se paga el `1 %` simbólico).
   - **Regla:** Un descuento del `99 %` es válido, no convierte el costo en cero y debe calcularse con precisión racional exacta. Cuidado con no descontar dos veces cuando el documento muestra tanto precio bruto como precio neto ya descontado.

4. **Caso 04 — Coile (Nota de entrega / registro comercial sin desglose fiscal):**
   - Documentos de entrega o notas comerciales traen cantidades y valores totales sin desglose formal de IVA.
   - **Regla:** Registrar como `kind = "delivery"` u `"order"`. Permitir cuadre parcial y costo provisional (`provisionalUnitCost`), vinculable a su factura posterior (`linkedDocumentId`), pero **jamás** publicarlo como costo confirmado de factura ni inferir un IVA no impreso.

5. **Caso 05 y 06 — Arcor / Colombina (Códigos propios de proveedor, presentaciones por display/funda y promociones cruzadas):**
   - Cada distribuidor usa su propio código interno para presentaciones como cajas, displays o fundas (`24 u`, `12 u`, etc.) y puede entregar bonificaciones del mismo producto o regalos de otro artículo distinto.
   - **Regla:**
     - Vincular códigos siempre por `(supplier_key, supplier_code)` en `supplier_products`.
     - Exigir `unitsPerPack` confirmado antes de publicar el costo por unidad de comparación.
     - Si la bonificación es del mismo artículo (`same_product`), dividir el total pagado de la línea entre `(unidades compradas + unidades bonificadas)`.
     - Si el regalo es otro artículo (`different_product`) sin asignación conocida de costo, mantener su costo pendiente (`unitCost = null`) en vez de publicar reposición a `$0.00`.

## 3. Reglas sobre impuestos y PVP en Ecuador

- **Tarifas de IVA:** No asumir una única tarifa fija histórica (`12 %`, `15 %`, `0 %`, `5 %`, etc. dependen del producto y la fecha del documento). Respetar siempre la tarifa impresa en el comprobante revisado y dejar `""` cuando no consta.
- **Cargos tipo ICE u otros impuestos:** Solo entran en la base imponible de IVA cuando se marca explícitamente (`otherTaxInIvaBase = true`), y los impuestos monetarios explícitos se suman una sola vez.
- **PVP impreso vs. precio de la tienda:** Muchos fabricantes imprimen un PVP referencial en empaque o factura; ese valor **no** es automáticamente `products.salePrice`. El precio de venta de la tienda solo se guarda si el usuario decide escribirlo (> 0).

