import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './sites-env.mjs';

const targetArg = process.argv[2];
const archivePath = targetArg
  ? path.resolve(process.cwd(), targetArg)
  : path.resolve(projectRoot, '..', 'mi-tienda-publicacion-final.tar.gz');

const requiredPaths = [
  'dist/client',
  'dist/server/wrangler.json',
  'dist/.openai/hosting.json',
  'dist/.openai/drizzle',
];
for (const rel of requiredPaths) {
  if (!existsSync(path.join(projectRoot, rel))) {
    throw new Error(`Falta ${rel}. Ejecuta "npm run build" antes de empaquetar.`);
  }
}

const sourceMigrations = readdirSync(path.join(projectRoot, 'drizzle')).filter(f => f.endsWith('.sql')).sort();
const distMigrations = readdirSync(path.join(projectRoot, 'dist/.openai/drizzle')).filter(f => f.endsWith('.sql')).sort();
if (JSON.stringify(sourceMigrations) !== JSON.stringify(distMigrations)) {
  throw new Error('Las migraciones en dist/.openai/drizzle no coinciden con drizzle/. Ejecuta "npm run build" de nuevo.');
}

const forbiddenInDist = ['dist/.dev.vars', 'dist/.env', 'dist/muestras'];
for (const rel of forbiddenInDist) {
  if (existsSync(path.join(projectRoot, rel))) {
    throw new Error(`Se detectó un archivo privado o local no permitido en ${rel}.`);
  }
}

const tar = spawnSync('tar', ['-czf', archivePath, '-C', projectRoot, 'dist'], { stdio: 'inherit' });
if (tar.status !== 0) {
  throw new Error(`No se pudo generar el archivo tar.gz (código ${tar.status ?? 1}).`);
}

const sizeMb = (statSync(archivePath).size / (1024 * 1024)).toFixed(2);
console.log(`Paquete de publicación listo: ${archivePath} (${sizeMb} MB, ${distMigrations.length} migraciones SQL incluidas).`);

