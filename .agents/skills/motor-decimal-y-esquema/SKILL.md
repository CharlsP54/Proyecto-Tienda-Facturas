---
name: motor-decimal-y-esquema
description: >-
  Guía técnica para ampliar o modificar el motor decimal exacto
  (lib/calculations.ts), el esquema Drizzle/D1 (db/schema.ts), los lotes
  atómicos con control optimista CAS y los respaldos retrocompatibles
  (lib/server.ts). Usar antes de cambiar cálculos de precios/impuestos, agregar
  tablas o columnas, crear endpoints en la API o tocar respaldos y restauraciones.
---

# Motor Decimal Exacto, Esquema D1 y API Transaccional

Checklist técnico obligatorio para evolucionar el backend y el motor contable de `aplicacion/` manteniendo exactitud monetaria, atomicidad e integridad de respaldos.

## 1. Cambios en `aplicacion/lib/calculations.ts`

1. **Usar siempre `Rational` (`bigint`):**
   - Convertir cadenas de entrada mediante `parseNumber(raw)` o constructores de `Rational`.
   - Rechazar entradas con signo negativo, notación exponencial (`1e3`), separadores de miles ambiguos, `NaN`, `Infinity` o caracteres de control. Aceptar coma o punto decimal único (`12,50` o `12.50`).
2. **Escalas de salida estándar:**
   - Totales monetarios e importes impresos/calculados de factura: **2 decimales** (`toFixed(2)` con `roundHalfUp`).
   - Costos unitarios por unidad de comparación (`unitCost`, `netUnitCost`, `provisionalUnitCost`): **6 decimales** (`toFixed(6)`) para no perder precisión en cajas grandes (ej. 24, 48 o 100 unidades).
   - Cantidades y factores: hasta **6 decimales** (`MAX_DECIMALS = 6`), normalizados con `trimFixed`.
3. **Semántica de vacío vs. cero:**
   - `""` nunca equivale a `0`. Antes de operar, verificar si el campo está vacío; si es obligatorio para confirmar una factura (`invoice`), agregar un bloqueo explícito en `confirmBlockers`.
4. **Sin dependencias externas:**
   - `lib/calculations.ts` debe seguir siendo 100 % puro (sin `cloudflare:workers`, sin Drizzle, sin DOM) para correr instantáneamente con `npm --prefix aplicacion run test:unit`.

## 2. Cambios en `aplicacion/db/schema.ts` y Migraciones Drizzle

1. Definir nuevas columnas con tipos explícitos y valores `default(...)` seguros para filas existentes en SQLite/D1 (por ejemplo `text('campo').notNull().default('')` cuando `""` representa "no registrado").
2. Generar la migración SQL numerada:
   ```powershell
   npm --prefix aplicacion run db:generate
   ```
3. Revisar el archivo `.sql` generado en `aplicacion/drizzle/` y confirmar que aparece en `aplicacion/drizzle/meta/_journal.json`:
   - En SQLite/D1, preferir `ALTER TABLE ... ADD ...` e índices `CREATE UNIQUE INDEX` / `CREATE INDEX` aditivos para no recrear tablas con datos en producción.
   - Durante `npm run build`, `sites-vite-plugin.ts` copia `aplicacion/drizzle/` a `dist/.openai/drizzle/` para que ChatGPT Sites aplique automáticamente la nueva migración al desplegar.
4. Si se necesita detección de bases locales previas sin tabla `_local_migrations`, verificar [db-migrate-local.mjs](../../../aplicacion/scripts/db-migrate-local.mjs).

## 3. Cambios en `aplicacion/lib/server.ts` (CAS, Idempotencia y Auditoría)

1. **Autenticación y roles:**
   - Usar `requireUser(request, env, db)` en toda ruta `/api/*`.
   - Restringir a `admin` (`requireAdmin`) las acciones de confirmación definitiva, corrección/anulación de confirmados, eliminación de mapeos de códigos de proveedor, gestión de equipo y restauración de respaldos.
2. **Idempotencia y concurrencia optimista (CAS):**
   - En mutaciones críticas (`POST` de guardado, confirmación, anulación, corrección), soportar `operationId` mediante `checkIdempotency` / `saveIdempotencyStatement`.
   - Al actualizar registros versionados (`documents`, `products`), exigir coincidencia de `version` y `update_token` en el `WHERE` del `UPDATE`, verificar `meta.changes === 1` y devolver `409 Conflict` con el estado actual si otro usuario modificó el registro antes.
   - Agrupar escrituras relacionadas + `audit_log` + `idempotency_keys` dentro de un único `await db.batch([...])`.
3. **Respaldos y restauración retrocompatibles (obligatorio al tocar esquema):**
   - Actualizar `BACKUP_TABLES` y `BACKUP_SIZE_SQL` para contabilizar el tamaño real estimado de las nuevas columnas/tablas dentro del techo preventivo de `4 MB` de tablas (`MAX_BACKUP_DATA_BYTES`) y `24 MB` de JSON total.
   - Incluir la nueva tabla/columna en `GET /api/backup` y en los respaldos diarios en R2.
   - En `POST /api/restore`:
     - Seguir exigiendo tienda vacía (0 productos y 0 documentos) y rol `admin`.
     - Soportar **tanto respaldos nuevos como respaldos de versiones anteriores** donde la nueva tabla o columna aún no existía (usar `clean(..., '')` por defecto y validar relaciones foráneas antes de insertar).

## 4. Pruebas obligatorias para cada cambio

- Agregar casos unitarios en [calculations.test.ts](../../../aplicacion/tests/calculations.test.ts) para toda regla aritmética nueva (incluyendo bordes de centavo, campos vacíos y entradas hostiles).
- Agregar casos de integración en [server.test.ts](../../../aplicacion/tests/server.test.ts) cubriendo permisos (`admin` vs `member`), conflicto `409`, validaciones `422` y ciclo completo `GET /api/backup` → `POST /api/restore` (incluyendo respaldo legado si se tocó el esquema).

