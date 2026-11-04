import { mkdir, copyFile, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Assets are served by this Site. Images never go to an external OCR endpoint.
await mkdir('public/ocr/core', { recursive: true });
await mkdir('public/ocr/lang', { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (/\.wasm(?:\.js)?$/.test(file)) await copyFile(join('node_modules/tesseract.js-core', file), join('public/ocr/core', file));
}
const target = 'public/ocr/lang/spa.traineddata.gz';
let exists = false;
try { exists = (await stat(target)).size > 100000; } catch {}
if (!exists) {
  const response = await fetch('https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz', { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('No se pudo descargar el modelo público de lectura en español.');
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.length < 100000 || data[0] !== 31 || data[1] !== 139) throw new Error('El modelo descargado no es válido.');
  await writeFile(target, data);
}
const hash = createHash('sha256').update(await readFile(target)).digest('hex');
await writeFile('public/ocr/NOTICE.txt', `Lectura local: tesseract.js 6.0.1 (Apache-2.0), tesseract.js-core, modelo spa de tessdata.projectnaptha.com/4.0.0.\nModelo SHA-256: ${hash}\nNo se envían imágenes a estos proveedores.\n`);
console.log('Recursos de lectura local listos. Modelo español SHA-256:', hash);

// PDF.js y sus recursos también se sirven desde este Site.
await copyFile('node_modules/pdfjs-dist/LICENSE','public/ocr/PDFJS-LICENSE.txt');
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/ocr/pdf.worker.min.mjs');
const { cp } = await import('node:fs/promises');
for (const [source,target] of [['cmaps','pdf-cmaps'],['standard_fonts','pdf-fonts'],['wasm','pdf-wasm']]) {
 await cp('node_modules/pdfjs-dist/'+source,'public/ocr/'+target,{recursive:true});
}
