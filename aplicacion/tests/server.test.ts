import {completeProductFixture} from './fixtures/products.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { handleApi, type Identity } from '../lib/server.ts';
import type { InvoiceInput } from '../lib/calculations.ts';

type CountRow = { count: number };
type JsonRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let mf: Miniflare; let db: D1Database; let bucket: R2Bucket;
const owner: Identity = { userId: 'owner-test', email: 'admin@tienda.test', displayName: 'Encargado' };
const collaborator: Identity = { userId: 'other-test', email: 'ayuda@tienda.test', displayName: 'Colaborador' };
let productId = ''; let secondProductId = ''; let documentId = ''; let activeVersion = 1; let backup: JsonRecord;
const env = () => ({ DB: db, BUCKET: bucket, OWNER_EMAIL: owner.email });
const data = (extra: Partial<InvoiceInput> = {}): InvoiceInput => ({
  kind: 'invoice', supplier: 'Proveedor de prueba', number: '001-001-123', date: '2026-08-20',
  seller: 'Vendedor', relatedId: '', discount: '', rounding: 'line', taxTotal: '0.30', total: '2.30', notes: '',
  lines: [{ id: 'line1', productId, supplierCode: 'PROV-100', description: 'Producto', quantity: '2', unitsPerPack: '1', bonusQuantity: '', unitPrice: '1', discountPercent: '', discountAmount: '', taxRate: '15', otherTax: '', lineTotal: '2.00', taxAmount: '0.30', promotion: false }],
  ...extra,
});
async function call(path: string, payload?: unknown, identity: Identity | null = owner, bindings = env()) {
  if(path==='products'&&payload!==undefined)payload=completeProductFixture(payload);
  const req = new Request('https://tienda.test/api/' + path, payload === undefined ? {} : { method: 'POST', headers: { origin: 'https://tienda.test', 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const response = await handleApi(req, bindings, identity); const raw = await response.text();
  let parsed: JsonRecord | string; try { parsed = JSON.parse(raw) as JsonRecord; } catch { parsed = raw; }
  return { status: response.status, value: parsed as JsonRecord, headers: response.headers };
}
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-05-15', d1Databases: { DB: 'test-database' }, r2Buckets: ['BUCKET'] });
  db = await mf.getD1Database('DB') as unknown as D1Database; bucket = await mf.getR2Bucket('BUCKET') as unknown as R2Bucket;
  const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(n => n.endsWith('.sql')).sort();
  assert.ok(migrations.length, 'Generate migrations before running server tests');
  for (const name of migrations) { const sql = await readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8'); for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run(); }
});
after(async () => { await mf?.dispose(); });

test('health has no sensitive data; anonymous access cannot initialize owner', async () => {
  assert.equal((await call('health', undefined, null)).status, 200);
  assert.equal((await call('state', undefined, null)).status, 401);
  assert.equal((await call('state', undefined, collaborator)).status, 403);
  assert.equal(await db.prepare("SELECT value FROM settings WHERE key='owner'").first(), null);
});
test('configured owner starts shop, sessions have noncached state', async () => {
  const result = await call('state'); assert.equal(result.status, 200); assert.equal(result.value.user.role, 'admin'); assert.equal(result.value.counts.documents, 0); assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('cross-site mutation is rejected', async () => {
  const response = await handleApi(new Request('https://tienda.test/api/products', { method: 'POST', headers: { origin: 'https://attacker.test' }, body: '{}' }), env(), owner); assert.equal(response.status, 403);
});
test('catalog creates exact product, extended fields, optional salePrice and normalized supplier', async () => {
  const created = await call('products', {
    name: 'Producto', brand: 'Marca Uno', content: '500 ml', barcode: '123456789',
    presentation: 'Caja x 1', comparisonUnit: 'botella', unitsPerPack: '1', taxRate: '15', salePrice: '',
  });
  assert.equal(created.status, 200);
  productId = created.value.product.id;
  assert.equal(created.value.product.brand, 'Marca Uno');
  assert.equal(created.value.product.content, '500 ml');
  assert.equal(created.value.product.comparisonUnit, 'botella');
  assert.equal(created.value.product.salePrice, '');

  const second = await call('products', {
    name: 'Segundo Producto', brand: 'Marca Dos', content: '750 g', barcode: '',
    presentation: 'Funda', comparisonUnit: 'funda', unitsPerPack: '1', taxRate: '0', salePrice: '1,5',
  });
  assert.equal(second.status, 200);
  secondProductId = second.value.product.id;
  assert.equal(second.value.product.salePrice, '1.50');

  assert.equal((await call('products', { name: 'Precio cero inválido', presentation: 'u', salePrice: '0' })).status, 400);
  assert.equal((await call('products', { name: 'Otro', barcode: '123456789', unitsPerPack: '1', taxRate: '15' })).status, 409);
  const first = await call('suppliers', { name: ' Proveedor de prueba ' }); const next = await call('suppliers', { name: 'proveedor de prueba' }); assert.equal(first.value.supplier.id, next.value.supplier.id);
});
test('supplier product codes are scoped per supplier and searchable in catalog', async () => {
  const codeA = await call('supplier-products', { supplierName: 'Proveedor Alfa', supplierCode: '0099', supplierDescription: 'PROD ALFA', productId });
  const codeB = await call('supplier-products', { supplierName: 'Proveedor Beta', supplierCode: '0099', supplierDescription: 'PROD BETA', productId: secondProductId });
  assert.equal(codeA.status, 200);
  assert.equal(codeB.status, 200);
  assert.notEqual(codeA.value.supplierProduct.productId, codeB.value.supplierProduct.productId);

  const bySupplier = await call('supplier-products?supplier=proveedor%20alfa');
  assert.equal(bySupplier.value.supplierProducts.length, 1);
  assert.equal(bySupplier.value.supplierProducts[0].productId, productId);

  const searched = await call('state?search=0099');
  assert.equal(searched.value.products.length, 2);
});
test('draft validation is fresh and selling price is not required', async () => {
  const result = await call('documents', { data: data() }); assert.equal(result.status, 200, JSON.stringify(result.value)); documentId = result.value.document.id; activeVersion = result.value.document.version; assert.equal(result.value.document.validation.valid, true);
  assert.equal(result.value.document.validation.lines[0].netUnitCost, '1.000000');
  const detail = await call('documents/' + documentId); assert.equal(detail.value.document.status, 'draft'); assert.deepEqual(detail.value.files, []);
});
test('first-create response lost can be retried with a stable client id without duplicate or overwrite', async () => {
  const id = crypto.randomUUID(); const input = data({ number: 'stable-first-save' });
  const created = await call('documents', { id, data: input }); assert.equal(created.status, 200);
  const replay = await call('documents', { id, data: input }); assert.equal(replay.status, 200); assert.equal(replay.value.replayed, true); assert.equal(replay.value.document.version, 1);
  assert.equal((await call('documents', { id, data: { ...input, seller: 'Different' } })).status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) count FROM documents WHERE id=?').bind(id).first<CountRow>())?.count, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE document_id=? AND action='draft_created'").bind(id).first<CountRow>())?.count, 1);
});
test('simultaneous draft writers get one success and one conflict; audit has no ghost entry', async () => {
  const [a, b] = await Promise.all([call('documents', { id: documentId, version: activeVersion, data: data({ notes: 'Cambio A' }) }), call('documents', { id: documentId, version: activeVersion, data: data({ notes: 'Cambio B' }) })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  activeVersion = (await call('documents/' + documentId)).value.document.version;
  const count = await db.prepare("SELECT COUNT(*) count FROM audit WHERE document_id=? AND action='draft_updated'").bind(documentId).first<CountRow>(); assert.equal(count?.count, 1);
});
test('collaborator can draft and create new product, but cannot edit existing product, confirm or manage members', async () => {
  assert.equal((await call('members', { email: collaborator.email, role: 'collaborator' })).status, 200);
  const state = await call('state', undefined, collaborator); assert.equal(state.value.user.role, 'collaborator'); assert.deepEqual(state.value.members, []);
  assert.equal((await call('products', { id: productId, name: 'Intento edición', presentation: 'u' }, collaborator)).status, 403);
  assert.equal((await call(`documents/${documentId}/confirm`, { version: activeVersion, operationId: 'op-denied' }, collaborator)).status, 403);
  assert.equal((await call('members', { email: 'x@test.ec', role: 'admin' }, collaborator)).status, 403);
});
test('confirmation is idempotent, records supplier code + netUnitCost, and historic snapshot is immutable', async () => {
  const result = await call(`documents/${documentId}/confirm`, { version: activeVersion, operationId: 'op-confirm-once' }); assert.equal(result.status, 200, JSON.stringify(result.value)); activeVersion = result.value.document.version;
  const repeat = await call(`documents/${documentId}/confirm`, { version: activeVersion - 1, operationId: 'op-confirm-once' }); assert.equal(repeat.status, 200); assert.equal(repeat.value.replayed, true);
  assert.equal((await call('documents', { id: documentId, version: activeVersion, data: data() })).status, 409);
  const count = await db.prepare("SELECT COUNT(*) count FROM audit WHERE document_id=? AND action='confirmed'").bind(documentId).first<CountRow>(); assert.equal(count?.count, 1);
  const history = await call('history?productId=' + productId);
  assert.equal(history.value.history[0].unitCost, '1.150000');
  assert.equal(history.value.history[0].netUnitCost, '1.000000');
  assert.equal(history.value.history[0].supplierCode, 'PROV-100');
  assert.ok(history.value.supplierCodes.some((sc: JsonRecord) => sc.supplierCode === 'PROV-100'));
});
test('changing a supplier code to another product requires an explanation note before confirming', async () => {
  const conflictingInput = data({
    number: 'code-conflict-1',
    notes: '',
    taxTotal: '0.00',
    total: '2.00',
    lines: [{ id: 'line1', productId: secondProductId, supplierCode: 'PROV-100', description: 'Otro producto con mismo código', quantity: '2', unitsPerPack: '1', bonusQuantity: '', unitPrice: '1', discountPercent: '', discountAmount: '', taxRate: '0', otherTax: '', lineTotal: '2.00', taxAmount: '0.00', promotion: false }],
  });
  const draft = await call('documents', { data: conflictingInput });
  assert.equal((await call(`documents/${draft.value.document.id}/confirm`, { version: 1, operationId: 'code-conflict-no-note' })).status, 422);
});
test('duplicate confirmed invoice rejected and does not create confirmation audit', async () => {
  const created = await call('documents', { data: data() }); const id = created.value.document.id;
  assert.equal((await call(`documents/${id}/confirm`, { version: 1, operationId: 'duplicate-confirm' })).status, 409);
  const row = await call('documents/' + id); assert.equal(row.value.document.status, 'draft');
  assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE document_id=? AND action='confirmed'").bind(id).first<CountRow>())?.count, 0);
});
test('wrong arithmetic blocks confirmation', async () => {
  const result = await call('documents', { data: data({ number: 'bad-total', total: '20.30' }) }); assert.equal(result.value.document.validation.valid, false);
  assert.equal((await call(`documents/${result.value.document.id}/confirm`, { version: 1, operationId: 'bad-total' })).status, 422);
});
test('older invoice completes history without becoming latest', async () => {
  const result = await call('documents', { data: data({ number: 'old-invoice', date: '2025-01-01' }) }); await call(`documents/${result.value.document.id}/confirm`, { version: 1, operationId: 'old-confirm' });
  const history = await call('history?productId=' + productId); assert.equal(history.value.history.length, 2); assert.equal(history.value.history[0].documentId, documentId); assert.equal(history.value.history[0].unitCost, '1.150000');
});
test('commercial order with unknown tax cannot replace invoice history', async () => {
  const input = data({ kind: 'order', number: 'order-1', taxTotal: '', total: '2.00' }); input.lines[0].taxRate = ''; input.lines[0].taxAmount = '';
  const result = await call('documents', { data: input }); const confirmed = await call(`documents/${result.value.document.id}/confirm`, { version: 1, operationId: 'order-confirm' }); assert.equal(confirmed.status, 200, JSON.stringify(confirmed.value));
  const history = await call('history?productId=' + productId); assert.equal(history.value.history.length, 2);
});
test('upload checks bytes instead of filename, download private and duplicate does not repeat file', async () => {
  const draft = await call('documents', { data: data({ number: 'with-file' }) }); const id = draft.value.document.id;
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
  async function upload(bytes: Uint8Array) { const form = new FormData(); form.set('documentId', id); form.set('file', new File([bytes as BlobPart], 'foto.png', { type: 'image/png' })); const response = await handleApi(new Request('https://tienda.test/api/upload', { method: 'POST', headers: { origin: 'https://tienda.test' }, body: form }), env(), owner); return { status: response.status, value: await response.json() as JsonRecord }; }
  assert.equal((await upload(new TextEncoder().encode('<script>alert(1)</script>'))).status, 400);
  const file = await upload(png); assert.equal(file.status, 200, JSON.stringify(file.value));
  const repeat = await upload(png); assert.equal(repeat.value.duplicate, true);
  assert.equal((await call('documents/' + id)).value.files.length, 1);
  assert.equal((await call('files/' + file.value.file.id, undefined, null)).status, 401);
  const download = await handleApi(new Request('https://tienda.test/api/files/' + file.value.file.id), env(), owner); assert.equal(download.status, 200); assert.deepEqual(new Uint8Array(await download.arrayBuffer()), png);
});
test('revision confirms replacement atomically and preserves original cancelled snapshot', async () => {
  const result = await call(`documents/${documentId}/revise`, { version: activeVersion, reason: 'Corregir vendedor' }); assert.equal(result.status, 200, JSON.stringify(result.value)); const revision = result.value.document;
  const edited = await call('documents', { id: revision.id, version: revision.version, data: { ...revision.data, seller: 'Vendedor correcto' } });
  const confirmed = await call(`documents/${revision.id}/confirm`, { version: edited.value.document.version, operationId: 'revision-confirm' }); assert.equal(confirmed.status, 200, JSON.stringify(confirmed.value));
  const original = (await call('documents/' + documentId)).value.document; assert.equal(original.status, 'cancelled'); assert.equal(original.data.seller, 'Vendedor');
  const history = await call('history?productId=' + productId); assert.equal(history.value.history[0].seller, 'Vendedor correcto');
});
test('two replacement confirmations cannot both supersede the same invoice', async () => {
  const currentId = (await call('history?productId=' + productId)).value.history[0].documentId;
  const current = (await call('documents/' + currentId)).value.document;
  const [a, b] = await Promise.all([call(`documents/${currentId}/revise`, { version: current.version, reason: 'Revisión A' }), call(`documents/${currentId}/revise`, { version: current.version, reason: 'Revisión B' })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const edited = await Promise.all([a, b].map((r, index) => call('documents', { id: r.value.document.id, version: r.value.document.version, data: { ...r.value.document.data, number: 'replacement-' + index } })));
  const results = await Promise.all(edited.map((r, index) => call(`documents/${r.value.document.id}/confirm`, { version: r.value.document.version, operationId: 'race-replace-' + index })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const replacements = await db.prepare("SELECT COUNT(*) count FROM documents WHERE review_of=? AND status='confirmed'").bind(currentId).first<CountRow>(); assert.equal(replacements?.count, 1);
});
test('multiple revision drafts share one original image without collisions or reference cycles', async () => {
  const originalFile = await db.prepare("SELECT * FROM files WHERE key NOT LIKE 'reference:%' LIMIT 1").first<{ id: string; document_id: string }>(); assert.ok(originalFile);
  const original = (await call('documents/' + originalFile.document_id)).value.document;
  const confirmed = await call(`documents/${original.id}/confirm`, { version: original.version, operationId: 'confirm-with-image' }); assert.equal(confirmed.status, 200);
  const revisions = await Promise.all([0, 1].map(i => call(`documents/${original.id}/revise`, { version: confirmed.value.document.version, reason: 'Revisión con imagen ' + i })));
  assert.deepEqual(revisions.map(r => r.status), [200, 200]);
  const referenceKeys: string[] = [];
  for (const revision of revisions) {
    const detail = await call('documents/' + revision.value.document.id); assert.equal(detail.value.files.length, 1);
    const file = detail.value.files[0]; const row = await db.prepare('SELECT * FROM files WHERE id=?').bind(file.id).first<{ key: string }>();
    assert.ok(row); referenceKeys.push(row.key); assert.equal(row.key.split(':')[1], originalFile.id);
    const response = await handleApi(new Request('https://tienda.test/api/files/' + file.id), env(), owner); assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 10);
  }
  assert.notEqual(referenceKeys[0], referenceKeys[1]); assert.equal((await bucket.list({ prefix: 'originals/' })).objects.length, 1);
  const ref = await db.prepare("SELECT * FROM files WHERE key LIKE 'reference:%' LIMIT 1").first<{ id: string; key: string }>();
  assert.ok(ref);
  await db.prepare('UPDATE files SET key=? WHERE id=?').bind('reference:' + ref.id + ':cycle-test', ref.id).run();
  assert.equal((await call('files/' + ref.id)).status, 500);
  await db.prepare('UPDATE files SET key=? WHERE id=?').bind(ref.key, ref.id).run();
});
const lineFor = (product: string, over: Partial<InvoiceInput['lines'][number]> = {}) => ({ id: 'l1', productId: product, supplierCode: '', description: 'Producto de prueba', quantity: '2', unitsPerPack: '1', bonusQuantity: '', unitPrice: '1', discountPercent: '', discountAmount: '', taxRate: '0', otherTax: '', lineTotal: '', taxAmount: '0.00', promotion: false, ...over });
test('same-date purchases need an explained reference choice by an administrator, never the upload order', async () => {
  const attributes = { name: 'Producto empate', brand: 'Marca', content: '1 L', presentation: 'Botella', comparisonUnit: 'botella', unitsPerPack: '1', taxRate: '0' };
  const created = await call('products', attributes); assert.equal(created.status, 200); const tieId = created.value.product.id as string;
  assert.deepEqual(created.value.warnings, []);
  const twin = await call('products', attributes); assert.equal(twin.status, 200); assert.equal(twin.value.warnings.length, 1, 'same name, brand, content and presentation warns without merging');
  const barcodeA = await call('products', { name: 'Con barras', barcode: '7750001', presentation: 'u', unitsPerPack: '1', taxRate: '0' }); assert.equal(barcodeA.status, 200);
  const barcodeB = await call('products', { name: 'Otro con barras', barcode: '7750001', presentation: 'u', unitsPerPack: '1', taxRate: '0' }); assert.equal(barcodeB.status, 409); assert.ok(barcodeB.value.error.includes('Con barras'));
  assert.equal((await call('history?productId=does-not-exist')).status, 404);
  const confirmTie = async (number: string, price: string, total: string, date = '2026-09-10') => {
    const draft = await call('documents', { data: data({ number, date, taxTotal: '0.00', total, lines: [lineFor(tieId, { unitPrice: price, lineTotal: total })] }) }); assert.equal(draft.status, 200, JSON.stringify(draft.value));
    const confirmed = await call(`documents/${draft.value.document.id}/confirm`, { version: draft.value.document.version, operationId: 'tie-' + number }); assert.equal(confirmed.status, 200, JSON.stringify(confirmed.value)); return draft.value.document.id as string;
  };
  const firstId = await confirmTie('TIE-A', '1', '2.00'); const secondId = await confirmTie('TIE-B', '2', '4.00');
  const tied = await call('history?productId=' + tieId); assert.equal(tied.value.tie, true); assert.equal(tied.value.referenceChoice, null); assert.ok(tied.value.warnings.some((w: string) => w.includes('Elige con un motivo')));
  const pick = (documentId: string, reason: string, identity: Identity = owner) => call('reference-choices', { productId: tieId, documentId, lineId: 'l1', reason }, identity);
  assert.equal((await pick(firstId, 'Compra completa', collaborator)).status, 403);
  assert.equal((await pick(firstId, '')).status, 400, 'a reason is mandatory');
  assert.equal((await call('reference-choices', { productId: productId, documentId: firstId, lineId: 'l1', reason: 'Otro producto' })).status, 404);
  assert.equal((await pick(firstId, 'Es la factura que corresponde al lote vigente')).status, 200);
  assert.equal((await pick(secondId, 'Corregida tras revisar el original')).status, 200);
  const chosen = await call('history?productId=' + tieId); assert.equal(chosen.value.referenceChoice.documentId, secondId); assert.equal(chosen.value.referenceChoice.reason, 'Corregida tras revisar el original'); assert.equal(chosen.value.warnings.length, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='reference_chosen'").first<CountRow>())?.count, 2);
  await confirmTie('TIE-C', '3', '6.00', '2026-09-11');
  const afterNewer = await call('history?productId=' + tieId); assert.equal(afterNewer.value.tie, false); assert.equal(afterNewer.value.referenceChoice, null);
  assert.equal((await pick(firstId, 'Ya no empata')).status, 422, 'a choice only exists while the latest date is tied');
});
test('orders and delivery notes are provisional references flagged once invoiced; duplicate candidates only warn; supplier registry follows confirmation', async () => {
  const provisionalProduct = (await call('products', { name: 'Producto provisional', presentation: 'Caja x 5', comparisonUnit: 'unidad', unitsPerPack: '5', taxRate: '0' })).value.product.id as string;
  const supplier = 'Proveedor Provisional';
  const orderInput = data({ kind: 'order', supplier, number: 'ORD-PROV-1', date: '2026-09-01', taxTotal: '', total: '10.00', lines: [lineFor(provisionalProduct, { unitsPerPack: '5', unitPrice: '5', taxRate: '', taxAmount: '' })] });
  const order = await call('documents', { data: orderInput }); assert.equal(order.status, 200, JSON.stringify(order.value)); assert.deepEqual(order.value.possibleDuplicates, []);
  const orderId = order.value.document.id as string;
  const before = await call('history?productId=' + provisionalProduct); assert.equal(before.value.history.length, 0, 'orders never enter confirmed history');
  assert.equal(before.value.provisional.length, 1); assert.equal(before.value.provisional[0].provisionalNetUnitCost, '1.000000'); assert.equal(before.value.provisional[0].provisionalUnitCost, null); assert.equal(before.value.provisional[0].alreadyInvoiced, false);
  const sameTotal = await call('documents', { data: data({ ...orderInput, number: 'ORD-PROV-2' }) }); assert.equal(sameTotal.status, 200);
  assert.deepEqual(sameTotal.value.possibleDuplicates.map((d: JsonRecord) => d.id), [orderId], 'same supplier, date and total is only a warning');
  const sameNumber = await call('documents', { data: data({ ...orderInput, date: '2026-09-02', total: '11.00', lines: orderInput.lines }) }); assert.equal(sameNumber.status, 200);
  assert.ok(sameNumber.value.possibleDuplicates.some((d: JsonRecord) => d.id === orderId), 'same supplier, kind and number is flagged');
  assert.equal((await call('documents', { data: data({ ...orderInput, supplier: 'Otro proveedor', number: 'X', relatedId: orderId }) })).status, 422, 'a related document must belong to the same supplier');
  const invoice = await call('documents', { data: data({ supplier, number: 'FAC-PROV-1', date: '2026-09-03', taxTotal: '0.00', total: '10.00', relatedId: orderId, lines: [lineFor(provisionalProduct, { unitsPerPack: '5', unitPrice: '5', lineTotal: '10.00' })] }) }); assert.equal(invoice.status, 200, JSON.stringify(invoice.value));
  assert.equal((await call('documents', { id: orderId, version: order.value.document.version, data: { ...orderInput, relatedId: invoice.value.document.id } })).status, 400, 'documents cannot point at each other');
  assert.equal((await call('state?search=Proveedor%20Provisional')).value.suppliers.length, 0, 'drafts do not register suppliers');
  assert.equal((await call(`documents/${invoice.value.document.id}/confirm`, { version: 1, operationId: 'prov-invoice' })).status, 200);
  assert.equal((await call('state?search=Proveedor%20Provisional')).value.suppliers.length, 1, 'confirming registers the supplier of the document');
  const after = await call('history?productId=' + provisionalProduct); assert.equal(after.value.history[0].unitCost, '1.000000'); assert.equal(after.value.provisional.find((row: JsonRecord) => row.documentId === orderId).alreadyInvoiced, true);
});
test('complete backup has attachments and supplier codes, and restore into occupied shop is rejected', async () => {
  const result = await call('backup'); assert.equal(result.status, 200, JSON.stringify(result.value)); backup = result.value; assert.equal(backup.format, 'mi-tienda-backup'); assert.equal(backup.attachments.length, 1);
  assert.ok(Array.isArray(backup.data.supplier_products) && backup.data.supplier_products.length >= 2);
  assert.equal(backup.version, 2, 'new backups declare format version 2');
  assert.ok(Array.isArray(backup.data.reference_choices) && backup.data.reference_choices.length >= 1, 'explained reference choices travel with the backup');
  assert.ok(backup.data.suppliers.length >= 1, 'suppliers of confirmed documents are part of the backup');
  assert.equal((await call('restore', { backup })).status, 409);
  assert.ok(await bucket.head('backups/' + new Date().toISOString().slice(0, 10) + '.json'));
});
test('CSV escapes formula injection and state handles pagination', async () => {
  await call('documents', { data: data({ number: '=HYPERLINK("bad")', supplier: '+Danger' }) });
  const result = await call('export'); assert.equal(result.status, 200); assert.ok(String(result.value).includes("'+Danger"));
  const state = await call('state?search=Proveedor&page=1'); assert.equal(state.value.pagination.pageSize, 50); assert.ok(state.value.pagination.documents > 0);
});
test('status filter searches all documents before pagination and keeps global counts', async () => {
  const timestamp = '2099-01-01T00:00:00.000Z';
  await db.prepare("WITH RECURSIVE n(v) AS(SELECT 0 UNION ALL SELECT v+1 FROM n WHERE v<59) INSERT INTO documents(id,version,status,kind,supplier,supplier_key,number,date,seller,total,data,validation,related_id,review_of,update_token,created_at,updated_at,created_by,updated_by) SELECT 'paging-'||printf('%d',v),1,'draft','invoice','Proveedor de prueba','proveedor de prueba','PAGING-'||printf('%d',v),'2026-08-20','Vendedor','2.30',?,'{}','','','paging-token-'||printf('%d',v),?,?,?,? FROM n").bind(JSON.stringify(data()), timestamp, timestamp, owner.email, owner.email).run();
  const first = await call('state?page=1'); assert.equal(first.value.documents.length, 50); assert.ok(first.value.documents.every((d: JsonRecord) => d.status === 'draft'));
  const filtered = await call('state?status=confirmed&page=1'); assert.equal(filtered.status, 200); assert.ok(filtered.value.documents.length > 0); assert.ok(filtered.value.documents.every((d: JsonRecord) => d.status === 'confirmed')); assert.equal(filtered.value.pagination.documents, filtered.value.counts.confirmed); assert.equal(filtered.value.counts.documents, first.value.counts.documents);
  const combined = await call('state?status=confirmed&search=Proveedor&page=1'); assert.equal(combined.status, 200); assert.ok(combined.value.documents.every((d: JsonRecord) => d.status === 'confirmed' && d.supplier.includes('Proveedor')));
  assert.equal((await call('state?status=invalid')).status, 400);
});
test('body limit enforced even if content-length is absent', async () => {
  const response = await handleApi(new Request('https://tienda.test/api/products', { method: 'POST', headers: { origin: 'https://tienda.test' }, body: JSON.stringify({ name: 'a'.repeat(1024 * 1024 + 5) }) }), env(), owner); assert.equal(response.status, 413);
});
test('daily copies keep only the newest 30 and the CSV is served with nosniff', async () => {
  const today = new Date().toISOString().slice(0, 10); await bucket.delete('backups/' + today + '.json');
  for (let day = 0; day < 34; day++) await bucket.put(`backups/${new Date(Date.UTC(2020, 0, 1 + day)).toISOString().slice(0, 10)}.json`, '{}');
  const saved = await call('suppliers', { name: 'Proveedor para retención' }); assert.equal(saved.status, 200); assert.equal(saved.value.backupWarning, undefined);
  const keys = (await bucket.list({ prefix: 'backups/' })).objects.map(object => object.key).sort();
  assert.equal(keys.length, 30); assert.ok(keys.includes('backups/' + today + '.json')); assert.ok(!keys.includes('backups/2020-01-01.json'), 'the oldest copies are pruned');
  assert.equal((await call('export')).headers.get('x-content-type-options'), 'nosniff');
});
test('restore checks hashes, metadata, extended catalog and legacy v1 backups into empty destination', async () => {
  const second = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-05-15', d1Databases: { DB: 'restore-database', LEGACY_DB: 'legacy-database' }, r2Buckets: ['BUCKET', 'LEGACY_BUCKET'] });
  try {
    const restoreDb = await second.getD1Database('DB') as unknown as D1Database; const restoreBucket = await second.getR2Bucket('BUCKET') as unknown as R2Bucket; const bindings = { DB: restoreDb, BUCKET: restoreBucket, OWNER_EMAIL: owner.email };
    const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(n => n.endsWith('.sql')).sort();
    for (const name of migrations) for (const statement of (await readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await restoreDb.prepare(statement).run();
    const corrupt = structuredClone(backup); corrupt.data.files[0].sha256 = 'wrong'; assert.equal((await call('restore', { backup: corrupt }, owner, bindings)).status, 400);
    assert.equal((await call('restore', { backup: { ...backup, version: 99 } }, owner, bindings)).status, 400, 'unknown backup versions are refused');
    const brokenChoice = structuredClone(backup); brokenChoice.data.reference_choices[0].document_id = 'missing-document'; assert.equal((await call('restore', { backup: brokenChoice }, owner, bindings)).status, 400, 'chosen references must point at restored documents');
    assert.equal((await call('state', undefined, owner, bindings)).value.counts.documents, 0);
    let inserted = false;
    const racingBucket = {
      head: restoreBucket.head.bind(restoreBucket), get: restoreBucket.get.bind(restoreBucket), delete: restoreBucket.delete.bind(restoreBucket),
      put: async (...args: Parameters<R2Bucket['put']>) => {
        if (!inserted) { inserted = true; await restoreDb.prepare('INSERT INTO products(id,name,barcode,presentation,units_per_pack,tax_rate,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind('racing-product', 'Alta simultánea', '', '', '1', '15', new Date().toISOString(), new Date().toISOString()).run(); }
        return restoreBucket.put(...args);
      },
    } as unknown as R2Bucket;
    const race = await call('restore', { backup }, owner, { ...bindings, BUCKET: racingBucket }); assert.equal(race.status, 409, JSON.stringify(race.value));
    assert.equal((await restoreDb.prepare('SELECT COUNT(*) count FROM documents').first<CountRow>())?.count, 0);
    assert.equal((await restoreDb.prepare('SELECT COUNT(*) count FROM files').first<CountRow>())?.count, 0);
    await restoreDb.prepare("DELETE FROM products WHERE id='racing-product'").run();
    const alteredMetadata = structuredClone(backup); alteredMetadata.data.documents[0].supplier = 'Forged supplier';
    const restored = await call('restore', { backup: alteredMetadata }, owner, bindings); assert.equal(restored.status, 200, JSON.stringify(restored.value));
    const state = await call('state', undefined, owner, bindings); assert.equal(state.value.counts.documents, backup.data.documents.length); assert.ok(state.value.documents.every((d: JsonRecord) => d.supplier === d.data.supplier));
    assert.equal(state.value.supplierProducts.length, backup.data.supplier_products.length);
    assert.equal((await restoreDb.prepare('SELECT COUNT(*) count FROM reference_choices').first<CountRow>())?.count, backup.data.reference_choices.length);
    const restoredHistory = await call('history?productId=' + productId, undefined, owner, bindings);
    assert.equal(restoredHistory.value.history[0].netUnitCost, '1.000000');
    const original = await handleApi(new Request('https://tienda.test/api/files/' + backup.data.files[0].id), bindings, owner); assert.equal(original.status, 200); assert.equal((await original.arrayBuffer()).byteLength, 10);
    assert.equal((await restoreBucket.list({ prefix: 'originals/' })).objects.length, 1, 'shared references restore one physical image');

    // Legacy v1 backup without supplier_products or extended product columns restores cleanly too.
    const legacyDb = await second.getD1Database('LEGACY_DB') as unknown as D1Database;
    const legacyBucket = await second.getR2Bucket('LEGACY_BUCKET') as unknown as R2Bucket;
    for (const name of migrations) for (const statement of (await readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await legacyDb.prepare(statement).run();
    const legacyBackup = structuredClone(backup);
    legacyBackup.version = 1; delete legacyBackup.data.supplier_products; delete legacyBackup.data.reference_choices;
    for (const p of legacyBackup.data.products) { delete p.brand; delete p.content; delete p.comparison_unit; delete p.sale_price; }
    const legacyRestore = await call('restore', { backup: legacyBackup }, owner, { DB: legacyDb, BUCKET: legacyBucket, OWNER_EMAIL: owner.email });
    assert.equal(legacyRestore.status, 200, JSON.stringify(legacyRestore.value));
  } finally { await second.dispose(); }
});
test('oversized backup metadata is rejected before loading rows and daily failure is explicit', async () => {
  const timestamp = new Date().toISOString(); const largeInput = data({ notes: 'x'.repeat(50000) });
  await db.prepare("WITH RECURSIVE n(v) AS(SELECT 0 UNION ALL SELECT v+1 FROM n WHERE v<199) INSERT INTO documents(id,version,status,kind,supplier,supplier_key,number,date,seller,total,data,validation,related_id,review_of,update_token,created_at,updated_at,created_by,updated_by) SELECT 'oversize-'||printf('%d',v),1,'draft','invoice','Proveedor de prueba','proveedor de prueba','LARGE-'||printf('%d',v),'2026-08-20','Vendedor','2.30',?,'{}','','','large-token-'||printf('%d',v),?,?,?,? FROM n").bind(JSON.stringify(largeInput), timestamp, timestamp, owner.email, owner.email).run();
  let loadedRows = false; const guardedDb = { prepare(sql: string) { if (/^SELECT \* FROM (documents|products|supplier_products|files|audit|suppliers)/i.test(sql)) loadedRows = true; return db.prepare(sql); }, batch: db.batch.bind(db) } as unknown as D1Database;
  const result = await call('backup', undefined, owner, { ...env(), DB: guardedDb }); assert.equal(result.status, 413); assert.ok(result.value.error.includes('4 MB')); assert.equal(loadedRows, false, 'preflight rejected without preparing any snapshot row loads');
  await bucket.delete('backups/' + timestamp.slice(0, 10) + '.json');
  const saved = await call('products', { name: 'Guardado con aviso', barcode: '', unitsPerPack: '1', taxRate: '15' }); assert.equal(saved.status, 200); assert.ok(saved.value.product.id); assert.ok(saved.value.backupWarning.includes('4 MB')); assert.equal(await bucket.head('backups/' + timestamp.slice(0, 10) + '.json'), null);
});
