import { createWorker } from 'tesseract.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Explicit local smoke test against a user-supplied sample; no network OCR.
const sample = process.argv[2];
if (!sample) throw new Error('Indica la ruta local de una imagen de prueba.');
await mkdir('.sites-runtime/ocr-cache', { recursive: true });
const started = performance.now();
const worker = await createWorker('spa', 1, {
  langPath: resolve('public/ocr/lang'),
  cachePath: resolve('.sites-runtime/ocr-cache'),
});
try {
  const result = await worker.recognize(resolve(sample));
  const summary = {
    recognizedCharacters: result.data.text.length,
    confidence: result.data.confidence,
    elapsedMs: Math.round(performance.now() - started),
    foundAlesTotal: /12[.,]\s?24/.test(result.data.text),
    foundAlesBase: /10[.,]\s?64/.test(result.data.text),
    note: 'Una lectura no confirma por sí sola los datos. Revisión humana obligatoria.',
  };
  await writeFile('.sites-runtime/ocr-check.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (summary.recognizedCharacters < 50) throw new Error('La lectura no obtuvo texto suficiente.');
} finally { await worker.terminate(); }
