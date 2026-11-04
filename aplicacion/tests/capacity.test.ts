import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { validateInvoice } from '../lib/calculations.ts';
import type { InvoiceInput } from '../lib/calculations.ts';

/** Synthetic calculation exercise only: no HTTP, database, file upload, OCR or hosting. */
function fixture(worker: number, iteration: number): InvoiceInput {
  return {
    kind: 'invoice', supplier: `Proveedor sintético ${worker}`, number: `${worker}-${iteration}`,
    date: '2026-08-15', seller: `Usuario sintético ${worker}`, relatedId: '', discount: '0.17',
    rounding: 'total', taxTotal: '29.97', total: '229.80', notes: 'Datos sintéticos para prueba del motor.',
    lines: Array.from({ length: 200 }, (_, index) => ({
      id: `line-${index}`, productId: `product-${worker}-${index}`, description: `Producto sintético ${index}`,
      quantity: '3', unitsPerPack: '1', bonusQuantity: '', unitPrice: '0.333333', discountPercent: '',
      discountAmount: '', taxRate: '15', otherTax: '', lineTotal: '1.00', taxAmount: '', promotion: false,
    })),
  };
}

if (!isMainThread) {
  const count = workerData.count as number, actor = workerData.actor as number;
  const started = performance.now();
  for (let iteration = 0; iteration < count; iteration++) {
    const source = fixture(actor, iteration), original = JSON.stringify(source);
    const result = validateInvoice(source);
    assert.equal(result.valid, true, result.errors.join('; '));
    assert.equal(result.total, '229.80');
    assert.equal(result.lines.length, 200);
    assert.equal(JSON.stringify(source), original, 'validation must not mutate source data');
  }
  parentPort!.postMessage({ documents: count, lines: count * 200, elapsedMs: performance.now() - started });
} else {
  test('calculation capacity: five isolated sequences, 500 synthetic documents of 200 lines', { timeout: 60000 }, async context => {
    const started = performance.now();
    const metrics = await Promise.all(Array.from({ length: 5 }, (_, actor) => new Promise<{ documents: number; lines: number; elapsedMs: number }>((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { actor, count: 100 }, execArgv: ['--experimental-strip-types'] });
      let result: { documents: number; lines: number; elapsedMs: number } | undefined;
      worker.once('message', message => { result = message; });
      worker.once('error', reject);
      worker.once('exit', code => {
        if (code !== 0 || !result) reject(new Error(`Calculation worker ${actor} failed with exit ${code}`));
        else resolve(result);
      });
    })));
    assert.equal(metrics.reduce((sum, item) => sum + item.documents, 0), 500);
    assert.equal(metrics.reduce((sum, item) => sum + item.lines, 0), 100000);
    context.diagnostic(JSON.stringify({
      scope: 'Motor decimal puro, 5 procesos lógicos aislados en hilos; no prueba capacidad del servidor ni usuarios HTTP.',
      node: process.version, workers: 5, documents: 500, lines: 100000,
      wallMs: Math.round(performance.now() - started), workerMs: metrics.map(item => Math.round(item.elapsedMs)),
    }));
  });
}
