import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './sites-env.mjs';

const devVarsPath = path.join(projectRoot, '.dev.vars');
if (!existsSync(devVarsPath)) {
  writeFileSync(devVarsPath, 'OWNER_EMAIL=seedy@sites.test\n', 'utf8');
  console.log('Creado .dev.vars local con OWNER_EMAIL=seedy@sites.test');
}

const builtConfig = path.join(projectRoot, 'dist/server/wrangler.json');
let configPath = builtConfig;
if (!existsSync(builtConfig)) {
  const runtimeDir = path.join(projectRoot, '.sites-runtime');
  mkdirSync(runtimeDir, { recursive: true });
  configPath = path.join(runtimeDir, 'wrangler-migrate.json');
  writeFileSync(configPath, JSON.stringify({
    name: 'mi-tienda-facturas',
    compatibility_date: '2026-05-15',
    d1_databases: [{
      binding: 'DB',
      database_name: 'site-creator-d1',
      database_id: '00000000-0000-4000-8000-000000000000',
    }],
  }, null, 2));
}

const wranglerBin = path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const persistDir = path.join(projectRoot, '.wrangler/state');

function runD1(extraArgs, captureJson = false) {
  const result = spawnSync(
    process.execPath,
    ['--import', './scripts/sites-env.mjs', wranglerBin, 'd1', 'execute', 'DB', '--local', '--config', configPath, '--persist-to', persistDir, ...(captureJson ? ['--json'] : []), ...extraArgs],
    { cwd: projectRoot, encoding: 'utf8', stdio: captureJson ? ['ignore', 'pipe', 'pipe'] : 'inherit' },
  );
  if (result.status !== 0) {
    if (captureJson && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Fallo al ejecutar Wrangler D1 (código ${result.status ?? 1}).`);
  }
  return captureJson ? JSON.parse(result.stdout) : null;
}

runD1(['--command', 'CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);'], true);

const inspect = runD1([
  '--command',
  "SELECT name FROM sqlite_master WHERE type='table'; SELECT name FROM _local_migrations;",
], true);

const existingTables = new Set((inspect?.[0]?.results || []).map(row => row.name));
const applied = new Set((inspect?.[1]?.results || []).map(row => row.name));

const files = readdirSync(path.join(projectRoot, 'drizzle'))
  .filter(file => file.endsWith('.sql'))
  .sort();

const legacyDetectors = {
  '0000_careless_supernaut.sql': () => existingTables.has('settings') && existingTables.has('documents'),
  '0001_even_beast.sql': () => existingTables.has('document_products'),
  '0002_tiny_gressill.sql': () => existingTables.has('supplier_products'),
  '0003_cold_morbius.sql': () => existingTables.has('reference_choices'),
};

let appliedNow = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  if (legacyDetectors[file]?.()) {
    const safeName = file.replace(/'/g, "''");
    runD1(['--command', `INSERT OR IGNORE INTO _local_migrations(name, applied_at) VALUES('${safeName}', datetime('now'));`], true);
    console.log(`Migración ya presente en base local: ${file}`);
    continue;
  }
  console.log(`Aplicando migración local: ${file}`);
  runD1(['--file', path.join('drizzle', file)], false);
  const safeName = file.replace(/'/g, "''");
  runD1(['--command', `INSERT OR IGNORE INTO _local_migrations(name, applied_at) VALUES('${safeName}', datetime('now'));`], true);
  appliedNow++;
}

console.log(appliedNow ? `Listo: ${appliedNow} migración(es) aplicada(s) en .wrangler/state.` : 'Base local al día: no hay migraciones pendientes.');

