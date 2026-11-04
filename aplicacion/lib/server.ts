import { GeminiError, GEMINI_MODELS, geminiModel, sealGeminiKey, openGeminiKey, checkGeminiConnection, extractWithGemini, verifyGeminiReading, type GeminiConfig, type GeminiFile, type GeminiCatalogItem } from './gemini.ts';
import { validateInvoice, parsePrintedTaxSummary, resolvePurchaseColumns, innerUnitCount, purchaseCostIssues, type InvoiceInput } from './calculations.ts';
import { extractDocumentData } from './ocr.ts';
import {aliasKey,productMatches,latestPurchases,purchaseSummary,productReview,productContentIssues} from './catalog.ts';

export type Identity = { userId: string; email: string; displayName: string };
type Bindings = { DB?: D1Database; BUCKET?: R2Bucket; OWNER_EMAIL?: string; AI_CONFIG_SECRET?: string; AI_FETCH?: typeof fetch };
type Row = Record<string, unknown>;
type SqlParam = string | number | boolean | null | Uint8Array;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_ARCHIVE = 24 * 1024 * 1024;
const MAX_BACKUP_METADATA = 4 * 1024 * 1024;
const CORE_TABLES = ['suppliers', 'products', 'documents', 'files', 'audit'] as const;
const BACKUP_TABLES = ['suppliers', 'products', 'supplier_products', 'documents', 'product_aliases', 'reference_choices', 'files', 'audit'] as const;
const BACKUP_VERSION = 2;
const BACKUP_RETENTION = 30;
const BACKUP_TEXT_COLUMNS: Record<typeof BACKUP_TABLES[number], string[]> = {
  suppliers: ['id', 'name', 'name_key', 'created_at'],
  products: ['id', 'name', 'category', 'brand', 'content', 'barcode', 'presentation', 'comparison_unit', 'units_per_pack', 'tax_rate', 'sale_price', 'inner_units', 'inner_unit_label', 'contents_mode', 'created_at', 'updated_at'],
  supplier_products: ['id', 'supplier_key', 'supplier_name', 'supplier_code', 'supplier_description', 'product_id', 'created_at', 'updated_at'],
  documents: ['id', 'kind', 'supplier', 'supplier_key', 'number', 'date', 'seller', 'total', 'data', 'validation', 'related_id', 'review_of', 'operation_id', 'update_token', 'created_at', 'updated_at', 'created_by', 'updated_by'],
  product_aliases: ['id','supplier_key','supplier_name','description','description_key','product_id','document_id','confirmed_by','updated_at'],
  reference_choices: ['id', 'product_id', 'reference_date', 'document_id', 'line_id', 'reason', 'chosen_by', 'created_at'],
  files: ['detached', 'id', 'document_id', 'name', 'type', 'key', 'sha256', 'created_at'],
  audit: ['id', 'document_id', 'actor', 'action', 'detail', 'created_at'],
};
// UTF-8 bytes, doubled for escaped JSON and UTF-16 strings, plus a conservative row/object allowance.
const BACKUP_SIZE_SQL = BACKUP_TABLES.map(table => `(SELECT COALESCE(SUM(2048+2*(${BACKUP_TEXT_COLUMNS[table].map(column => `COALESCE(length(CAST(${column} AS BLOB)),0)`).join('+')})),0) FROM ${table})`).join('+');
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const str = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value);
const normalize = (s: string) => s.trim().normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g, ' ');
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function fail(status: number, message: string): never { throw new ApiError(status, message); }
function text(value: unknown, label: string, max = 200, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `${label}: texto inválido o demasiado largo.`);
  const v = value.trim();
  if (required && !v) fail(400, `${label}: completa este dato.`);
  return v;
}
function id(value: unknown) { const v = text(value, 'Identificador', 80, true); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(v)) fail(400, 'Identificador inválido.'); return v; }
function version(value: unknown) { if (!Number.isInteger(value) || Number(value) < 1) fail(400, 'La versión del documento es obligatoria. Vuelve a abrirlo.'); return Number(value); }
function decimal(value: unknown, label: string, max = 999999999) { const v = text(value ?? '', label, 30); if (v && (!/^\d+(?:[.,]\d{1,6})?$/.test(v) || Number(v.replace(',', '.')) > max)) fail(400, `${label}: ingresa un número positivo con hasta seis decimales.`); return v.replace(',', '.'); }
function optionalPrice(value: unknown, label: string, max = 999999999) {
  const v = text(value ?? '', label, 30);
  if (!v) return '';
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(v)) fail(400, `${label}: ingresa un importe en dólares con hasta dos decimales o déjalo vacío.`);
  const normalized = v.replace(',', '.');
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > max) fail(400, `${label}: debe ser mayor que cero o quedar vacío como opcional.`);
  const [whole, fraction = ''] = normalized.split('.');
  return `${BigInt(whole).toString()}.${fraction.padEnd(2, '0')}`;
}
function innerCount(value:unknown){try{return innerUnitCount(text(value??'','Unidades interiores',10));}catch(error){if(error instanceof ApiError)throw error;fail(400,error instanceof Error?error.message:'El contenido interior no es válido.');}}
async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') || 0) > limit) fail(413, 'El archivo o formulario supera el límite permitido.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > limit) { await reader.cancel(); fail(413, 'El archivo o formulario supera el límite permitido.'); } chunks.push(value); }
  const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
}
async function body(request: Request, limit = 1024 * 1024): Promise<Record<string, unknown>> {
  const value = new TextDecoder().decode(await readLimited(request, limit));
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'No se pudo leer la información enviada.');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail(400, 'No se pudo leer la información enviada.');
  }
}
function documentRow(row: Row) {
  return {
    ...row,
    relatedId: str(row.related_id),
    reviewOf: str(row.review_of),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    data: JSON.parse(str(row.data)) as InvoiceInput,
    validation: JSON.parse(str(row.validation)) as ReturnType<typeof validateInvoice>,
  };
}
function productRow(row: Row) {
  return {
    ...row,
    category: str(row.category),
    brand: str(row.brand),
    content: str(row.content),
    barcode: str(row.barcode),
    presentation: str(row.presentation),
    comparisonUnit: str(row.comparison_unit),
    unitsPerPack: str(row.units_per_pack),
    taxRate: str(row.tax_rate),
    salePrice: str(row.sale_price),
    innerUnits:str(row.inner_units),innerUnitLabel:str(row.inner_unit_label),contentsMode:str(row.contents_mode),review:productReview(row),
  };
}
function supplierProductRow(row: Row) {
  return {
    id: str(row.id),
    supplierKey: str(row.supplier_key),
    supplierName: str(row.supplier_name),
    supplierCode: str(row.supplier_code),
    supplierDescription: str(row.supplier_description),
    productId: str(row.product_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}
function fileRow(row: Row) { return { detached: Boolean(row.detached), id: str(row.id), documentId: str(row.document_id), name: str(row.name), type: str(row.type), size: Number(row.size || 0) }; }
function csvCell(value: unknown) { const s = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"'; }
function encode64(bytes: Uint8Array) { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); }
function decode64(value: string) { try { const raw = atob(value); return Uint8Array.from(raw, c => c.charCodeAt(0)); } catch { fail(400, 'El respaldo tiene un adjunto ilegible.'); } }
async function digest(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), x => x.toString(16).padStart(2, '0')).join(''); }
function sniff(bytes:Uint8Array):string {
 if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 const first=new TextDecoder().decode(bytes.subarray(0,512));
 if(first.startsWith('%PDF-'))return 'application/pdf';
 if(first.startsWith('RIFF')&&first.slice(8,12)==='WEBP')return 'image/webp';
 if(!bytes.subarray(0,512).includes(0)&&!/<(?:html|script|svg)\b/i.test(first)){
   if(/^\s*(?:<\?xml|<autorizacion|<factura)\b/i.test(first))return 'application/xml';
   if(/factura|nota de entrega|pedido|cantidad.*precio/i.test(first))return 'text/plain';
 }
 fail(400,'Formato no reconocido. Usa JPG, PNG, WebP, PDF, XML o TXT de una factura.');
}
async function resolveOriginal(db: D1Database, file: Row): Promise<Row> {
  let result = file; const visited = new Set<string>();
  while (str(result.key).startsWith('reference:')) {
    const currentId = str(result.id);
    if (visited.has(currentId) || visited.size > 20) fail(500, 'El vínculo del archivo necesita revisión.');
    visited.add(currentId);
    const target = await db.prepare('SELECT * FROM files WHERE id=?').bind(str(result.key).split(':')[1]).first<Row>();
    if (!target) fail(404, 'El original relacionado no está disponible.');
    result = target;
  }
  return result;
}

export async function handleApi(request: Request, env: Bindings, identity: Identity | null): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    if (request.method === 'GET' && parts[0] === 'health') return json({ status: 'ok' });
    if (!identity?.userId || !identity?.email) fail(401, 'Inicia sesión para acceder a la tienda.');
    if (!env.DB || !env.BUCKET) fail(503, 'El almacenamiento aún no está disponible. Intenta de nuevo en unos minutos.');
    const db = env.DB; const bucket = env.BUCKET; const actor = identity;
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if (!origin || origin !== url.origin) fail(403, 'Esta acción debe realizarse desde la aplicación.');
    }
    const timestamp = now(); const email = actor.email.toLowerCase();
    // A singleton key makes first-owner selection atomic even for simultaneous requests.
    const existingOwner = await db.prepare("SELECT value FROM settings WHERE key='owner'").first<Row>();
    if (!existingOwner && !env.OWNER_EMAIL) fail(503, 'El encargado debe configurar el correo propietario antes de iniciar la tienda.');
    if (!existingOwner) await db.batch([
      db.prepare("INSERT OR IGNORE INTO settings(key,value) SELECT 'owner',? WHERE ?=?").bind(actor.userId, email, (env.OWNER_EMAIL || '').toLowerCase()),
      db.prepare("INSERT OR IGNORE INTO members(email,user_id,role,active,created_at) SELECT ?,?,'admin',1,? WHERE (SELECT value FROM settings WHERE key='owner')=?").bind(email, actor.userId, timestamp, actor.userId),
    ]);
    const member = await db.prepare('SELECT * FROM members WHERE email=? AND active=1').bind(email).first<Row>();
    if (!member || (member.user_id && member.user_id !== actor.userId)) fail(403, 'Tu cuenta no está autorizada. Pide acceso al encargado.');
    if (!member.user_id) await db.prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL').bind(actor.userId, email).run();
    const role = str(member.role);
    const admin = () => { if (role !== 'admin') fail(403, 'Esta acción corresponde al encargado.'); };
    const user = { id: actor.userId, email, name: actor.displayName, role };
    const all = async (sql: string, ...values: SqlParam[]) => (await db.prepare(sql).bind(...values).all<Row>()).results;
    const getDoc = async (documentId: string) => { const row = await db.prepare('SELECT * FROM documents WHERE id=?').bind(documentId).first<Row>(); if (!row) fail(404, 'No se encontró el documento.'); return row; };
    const auditStatement = (action: string, detail: string, documentId = '') => db.prepare('INSERT INTO audit(id,document_id,actor,action,detail,created_at) VALUES(?,?,?,?,?,?)').bind(uuid(), documentId, email, action, detail, now());
    const guardedAudit = (action: string, detail: string, documentId: string, token: string) => db.prepare('INSERT INTO audit(id,document_id,actor,action,detail,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND update_token=?)').bind(uuid(), documentId, email, action, detail, now(), documentId, token);
    const snapshot = async () => {
      const data: Record<string, Row[]> = {};
      const estimated = await db.prepare(`SELECT ${BACKUP_SIZE_SQL} bytes`).first<Row>();
      if (Number(estimated?.bytes || 0) > MAX_BACKUP_METADATA) fail(413, 'Los datos superan el límite seguro de 4 MB para el respaldo integrado. Solicita una exportación del almacenamiento; no se generó una copia parcial.');
      // Recheck inside the consistent batch: a concurrent write cannot bypass the memory bound.
      const results = await db.batch([db.prepare(`SELECT ${BACKUP_SIZE_SQL} bytes`), ...BACKUP_TABLES.map(table => db.prepare(`SELECT * FROM ${table} WHERE (${BACKUP_SIZE_SQL})<=? LIMIT 50001`).bind(MAX_BACKUP_METADATA))]);
      if (Number((results[0].results[0] as Row | undefined)?.bytes || 0) > MAX_BACKUP_METADATA) fail(413, 'Los datos superan el límite seguro de 4 MB para el respaldo integrado. Solicita una exportación del almacenamiento; no se generó una copia parcial.');
      BACKUP_TABLES.forEach((table, index) => { data[table] = results[index + 1].results as Row[]; });
      if (Object.values(data).some(rows => rows.length > 50000)) fail(413, 'El respaldo supera 50.000 registros por tabla. Solicita una exportación del almacenamiento.');
      return { format: 'mi-tienda-backup', version: BACKUP_VERSION, createdAt: now(), data };
    };
    const backupDaily = async () => {
      const day = now().slice(0, 10); const key = `backups/${day}.json`;
      if (await bucket.head(key)) return;
      const copy = await snapshot();
      await bucket.put(key, JSON.stringify(copy), { httpMetadata: { contentType: 'application/json' } });
      // Retention: keep only the newest daily copies so old personal data does not accumulate forever.
      try {
        const listed = await bucket.list({ prefix: 'backups/', limit: 1000 });
        const keys = listed.objects.map(object => object.key).filter(name => /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
        for (const old of keys.slice(0, Math.max(0, keys.length - BACKUP_RETENTION))) await bucket.delete(old);
      } catch { /* retention is best effort; the new copy is already stored */ }
    };
    const saved = async (value: Row) => {
      try { await backupDaily(); return json(value); }
      catch (error) { return json({ ...value, backupWarning: error instanceof ApiError && error.status === 413 ? 'Los datos se guardaron. ' + error.message : 'Los datos se guardaron, pero no se pudo generar la copia diaria. Descarga un respaldo y avisa al encargado.' }); }
    };

    if (request.method === 'GET' && parts[0] === 'state') {
      const search = (url.searchParams.get('search') || '').trim().slice(0, 200);
      const status = url.searchParams.get('status') || '';
      const productCategory=text(url.searchParams.get('productCategory')||'','Categoría de búsqueda',120),productSort=url.searchParams.get('productSort')||'name';
      if(!['name','name_desc','newest','recent_purchase'].includes(productSort))fail(400,'Selecciona un orden de productos válido.');
      if (status && !['draft', 'confirmed', 'cancelled', 'discarded'].includes(status)) fail(400, 'Selecciona un estado de documento válido.');
      const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1') || 1));
      const offset = (page - 1) * 50; const like = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
      const docWhere = "(supplier LIKE ? ESCAPE '\\' OR number LIKE ? ESCAPE '\\' OR seller LIKE ? ESCAPE '\\')";
      const productSearchWhere = "(name LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM supplier_products sp WHERE sp.product_id=products.id AND sp.supplier_code LIKE ? ESCAPE '\\'))";
      const productConditions:string[]=[],productBindings:SqlParam[]=[];
      if(search){productConditions.push(productSearchWhere);productBindings.push(like,like,like,like,like,like);}if(productCategory){productConditions.push('category=?');productBindings.push(productCategory==='__uncategorized__'?'':productCategory);}
      const productWhere=productConditions.length?'WHERE '+productConditions.join(' AND '):'',recentJoin=productSort==='recent_purchase'?" LEFT JOIN (SELECT dp.product_id,MAX(d.date) recent_date FROM document_products dp JOIN documents d ON d.id=dp.document_id WHERE d.kind='invoice' AND d.status='confirmed' GROUP BY dp.product_id) latest_purchase ON latest_purchase.product_id=products.id ":'';
      const productOrder=productSort==='recent_purchase'?'latest_purchase.recent_date DESC,products.created_at DESC,products.id':productSort==='newest'?'products.created_at DESC,products.id DESC':productSort==='name_desc'?'products.name DESC,products.id':'products.name,products.id';
      const documentConditions: string[] = []; const documentBindings: SqlParam[] = [];
      if (search) { documentConditions.push(docWhere); documentBindings.push(like, like, like); }
      if (status) { documentConditions.push('status=?'); documentBindings.push(status); }else documentConditions.push("status<>'discarded'");
      const documentWhere = documentConditions.length ? 'WHERE ' + documentConditions.join(' AND ') : '';
      const statements = [
        db.prepare(`SELECT * FROM documents ${documentWhere} ORDER BY updated_at DESC,id DESC LIMIT 50 OFFSET ?`).bind(...documentBindings, offset),
        db.prepare(`SELECT products.* FROM products ${recentJoin} ${productWhere} ORDER BY ${productOrder} LIMIT 50 OFFSET ?`).bind(...productBindings,offset),
        search ? db.prepare("SELECT * FROM suppliers WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 50 OFFSET ?").bind(like, offset) : db.prepare('SELECT * FROM suppliers ORDER BY name LIMIT 50 OFFSET ?').bind(offset),
        db.prepare("SELECT (SELECT COUNT(*) FROM documents WHERE status<>'discarded') documents,(SELECT COUNT(*) FROM products) products,(SELECT COUNT(*) FROM suppliers) suppliers,(SELECT COUNT(*) FROM documents WHERE status='draft') pending,(SELECT COUNT(*) FROM documents WHERE status='confirmed') confirmed,(SELECT COUNT(*) FROM documents WHERE status='cancelled') cancelled,(SELECT COUNT(*) FROM documents WHERE status='discarded') discarded"),
        db.prepare(role === 'admin' ? 'SELECT email,role,active,created_at FROM members ORDER BY email' : 'SELECT email,role,active,created_at FROM members WHERE 0'),
        db.prepare(role === 'admin' ? 'SELECT * FROM audit ORDER BY created_at DESC,id LIMIT 100' : 'SELECT * FROM audit WHERE 0'),
        db.prepare(`SELECT COUNT(*) count FROM documents ${documentWhere}`).bind(...documentBindings),
        db.prepare(`SELECT COUNT(*) count FROM products ${productWhere}`).bind(...productBindings),
        search ? db.prepare("SELECT COUNT(*) count FROM suppliers WHERE name LIKE ? ESCAPE '\\'").bind(like) : db.prepare('SELECT COUNT(*) count FROM suppliers'),
        search ? db.prepare("SELECT * FROM supplier_products WHERE supplier_code LIKE ? ESCAPE '\\' OR supplier_name LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 200").bind(like, like) : db.prepare('SELECT * FROM supplier_products ORDER BY updated_at DESC LIMIT 200'),
        db.prepare("SELECT DISTINCT category FROM products WHERE category<>'' ORDER BY category LIMIT 501"),db.prepare("SELECT COUNT(DISTINCT category) count FROM products WHERE category<>''"),
      ];
      const results = await db.batch(statements);
      const [docs, prods, supps, countsRows, membersRows, auditRows, documentTotals, productTotals, supplierTotals, supplierCodeRows,categoryRows,categoryCounts] = results.map(result => result.results as Row[]);
      const counts = countsRows[0], documentTotal = documentTotals[0], productTotal = productTotals[0], supplierTotal = supplierTotals[0];
      const latestCosts=await latestPurchases(db,prods.map(p=>str(p.id)));
      const lastBackup = await bucket.head(`backups/${timestamp.slice(0, 10)}.json`);
      return json({
        user,
        documents: docs.map(documentRow),
        products: prods.map(product=>({...productRow(product),purchase:purchaseSummary(product,latestCosts.get(str(product.id)))})),
        supplierProducts: supplierCodeRows.map(supplierProductRow),
        suppliers: supps,
        counts,
        productCategories:categoryRows.slice(0,500).map(row=>str(row.category)),categoriesTruncated:Number(categoryCounts[0]?.count||0)>500,
        members: membersRows,
        audit: auditRows,
        pagination: { page, pageSize: 50, documents: Number(documentTotal?.count || 0), products: Number(productTotal?.count || 0), suppliers: Number(supplierTotal?.count || 0) },
        backup: { lastDaily: lastBackup?.uploaded?.toISOString() || null, note: 'La copia diaria incluye datos y referencias a originales conservados. Descarga un respaldo completo para una copia independiente.' },
      });
    }

    if (request.method === 'GET' && parts[0] === 'documents' && parts[1] && parts[2] === 'impact') {
      const row=await getDoc(id(parts[1]));const documentId=str(row.id);
      const linked=await all('SELECT id,number,kind,status FROM documents WHERE related_id=? OR review_of=? ORDER BY updated_at DESC LIMIT 21',documentId,documentId);
      const affected=await db.prepare('SELECT COUNT(DISTINCT product_id) count FROM document_products WHERE document_id=?').bind(documentId).first<Row>();
      return json({version:row.version,status:row.status,affectedProducts:Number(affected?.count||0),linked:linked.slice(0,20),hasMoreLinked:linked.length>20,
       consequences:row.status==='confirmed'?['Esta factura saldrá de los costos vigentes. El historial mostrará las compras confirmadas anteriores de cada producto.','Los productos del catálogo y los originales se conservarán. No se borrarán documentos relacionados.','Las referencias de precio se volverán a calcular al consultar el historial.']:['El borrador saldrá de la lista y quedará en Papelera. Podrás recuperarlo.','Sus archivos y productos del catálogo se conservarán. No cambia costos de compras confirmadas.'],
      });
    }
    if (request.method === 'GET' && parts[0] === 'documents' && parts[1]) {
      const row = await getDoc(id(parts[1]));
      const docId = str(row.id);
      const attachments=await all('SELECT * FROM files WHERE document_id=? ORDER BY created_at',docId);return json({document:documentRow(row),files:attachments.filter(f=>!f.detached).map(fileRow),removedFiles:attachments.filter(f=>f.detached).map(fileRow)});
    }
    if (request.method === 'POST' && parts[0] === 'documents' && !parts[1]) {
      const payload = await body(request); const input = payload.data as InvoiceInput;
      if (!input || typeof input !== 'object' || !Array.isArray(input.lines) || input.lines.length > 200) fail(400, 'El documento debe contener hasta 200 líneas.');
      const documentId = payload.id ? id(payload.id) : uuid();
      const kind = text(input.kind, 'Tipo', 20, true); if (!['invoice', 'delivery', 'order'].includes(kind)) fail(400, 'Selecciona el tipo de documento.');
      const supplier = text(input.supplier ?? '', 'Proveedor', 200); const number = text(input.number ?? '', 'Número', 100); const date = text(input.date ?? '', 'Fecha', 20); const seller = text(input.seller ?? '', 'Vendedor', 200);
      text(input.notes ?? '', 'Notas', 10000); const relatedId = input.relatedId ? id(input.relatedId) : '';
      if (relatedId === documentId) fail(400, 'Un documento no puede relacionarse consigo mismo.');
      if (relatedId) {
        const relatedRow = await getDoc(relatedId);
        if (str(relatedRow.related_id) === documentId) fail(400, 'Dos documentos no pueden relacionarse entre sí. Relaciona el pedido o la nota con la factura, y no al revés.');
        if (str(relatedRow.supplier_key) && normalize(supplier) && str(relatedRow.supplier_key) !== normalize(supplier)) fail(422, 'El documento relacionado pertenece a otro proveedor.');
      }
      const validation = validateInvoice(input);
      const token = uuid(); const existing = await db.prepare('SELECT * FROM documents WHERE id=?').bind(documentId).first<Row>();
      let result;
      if (existing) {
        if (payload.version === undefined && existing.status === 'draft' && existing.created_by === email && existing.data === JSON.stringify(input)) return json({ document: documentRow(existing), replayed: true });
        if (payload.version === undefined) fail(409, 'El documento ya existe y su contenido cambió. Reabre la versión actual antes de guardar.');
        const oldVersion = version(payload.version);
        if (existing.status !== 'draft') fail(409, 'Este documento ya fue confirmado o anulado. Crea una corrección.');
        const statements = [db.prepare("UPDATE documents SET version=version+1,kind=?,supplier=?,supplier_key=?,number=?,date=?,seller=?,total=?,data=?,validation=?,related_id=?,updated_at=?,updated_by=?,update_token=? WHERE id=? AND version=? AND status='draft'").bind(kind, supplier, normalize(supplier), number, date, seller, String(input.total ?? ''), JSON.stringify(input), JSON.stringify(validation), relatedId, timestamp, email, token, documentId, oldVersion), guardedAudit('draft_updated', 'Borrador actualizado', documentId, token)];
        result = (await db.batch(statements))[0];
      } else {
        if (payload.version !== undefined) fail(409, 'Este documento no existe. Vuelve a cargar la lista.');
        result = (await db.batch([db.prepare("INSERT OR IGNORE INTO documents(id,version,status,kind,supplier,supplier_key,number,date,seller,total,data,validation,related_id,review_of,update_token,created_at,updated_at,created_by,updated_by) VALUES(?,1,'draft',?,?,?,?,?,?,?,?,?,?,'',?,?,?,?,?)").bind(documentId, kind, supplier, normalize(supplier), number, date, seller, String(input.total ?? ''), JSON.stringify(input), JSON.stringify(validation), relatedId, token, timestamp, timestamp, email, email), guardedAudit('draft_created', 'Borrador creado', documentId, token)]))[0];
      }
      if (!result.meta.changes) fail(409, 'Otra persona modificó este documento. Reabre la versión actual antes de guardar.');
      // Possible duplicates are only a warning for human review: documents are never merged or rejected by total alone.
      const savedTotal = String(input.total ?? '');
      const possibleDuplicates = normalize(supplier) && (number || (date && savedTotal))
        ? (await all("SELECT id,kind,status,number,date,total,supplier FROM documents WHERE supplier_key=? AND id<>? AND status NOT IN ('cancelled','discarded') AND ((?<>'' AND number=? AND kind=?) OR (?<>'' AND date=? AND ?<>'' AND total=?)) ORDER BY updated_at DESC LIMIT 5", normalize(supplier), documentId, number, number, kind, date, date, savedTotal, savedTotal)).map(row => ({ id: str(row.id), kind: str(row.kind), status: str(row.status), number: str(row.number), date: str(row.date), total: str(row.total), supplier: str(row.supplier) }))
        : [];
      return saved({ document: documentRow(await getDoc(documentId)), possibleDuplicates });
    }

    if (request.method === 'POST' && parts[0] === 'documents' && parts[1]) {
      const documentId = id(parts[1]); const payload = await body(request); const row = await getDoc(documentId);
      if(parts[2]==='discard'||parts[2]==='recover'){
        if(role!=='admin'&&row.created_by!==email)fail(403,'Solo el autor del borrador o el encargado puede moverlo o recuperarlo.');
        const expected=version(payload.version),discard=parts[2]==='discard',status=discard?'discarded':'draft',before=discard?'draft':'discarded',token=uuid();
        if(row.status===status&&row.version===expected+1)return json({document:documentRow(row),replayed:true});
        if(row.status!==before||row.version!==expected)fail(409,'El documento cambió. Reabre su versión actual antes de continuar.');
        const result=await db.batch([db.prepare('UPDATE documents SET status=?,version=version+1,update_token=?,updated_at=?,updated_by=? WHERE id=? AND version=? AND status=?').bind(status,token,timestamp,email,documentId,expected,before),guardedAudit(discard?'draft_discarded':'draft_recovered',discard?'Borrador movido a papelera; originales conservados':'Borrador recuperado de papelera',documentId,token)]);
        if(!result[0].meta.changes)fail(409,'Otra persona modificó el documento. No se cambió su estado.');return saved({document:documentRow(await getDoc(documentId))});
      }
      admin();
      if (parts[2] === 'confirm') {
        const operationId = id(payload.operationId); const expected = version(payload.version);
        if (row.status === 'confirmed' && row.operation_id === operationId) return json({ document: documentRow(row), replayed: true });
        if (row.status !== 'draft' || row.version !== expected) fail(409, 'El documento cambió. Ábrelo de nuevo para revisar su versión actual.');
        const input = JSON.parse(str(row.data)) as InvoiceInput; const validation = validateInvoice(input);
        if (!validation.valid) return json({ error: 'Corrige los datos pendientes antes de confirmar.', validation }, 422);
        if (!str(row.number)) fail(422, 'Registra un número o referencia del documento antes de confirmar.');
        const relatedDocId = str(row.related_id);
        const supplierKey = str(row.supplier_key);
        const reviewOf = str(row.review_of);
        if (relatedDocId) { const related = await getDoc(relatedDocId); if (str(related.supplier_key) !== supplierKey) fail(422, 'El documento relacionado pertenece a otro proveedor.'); if (related.kind === 'invoice' && row.kind === 'invoice' && !reviewOf) fail(422, 'Dos facturas de la misma compra deben corregirse mediante una revisión, no confirmarse como compras distintas.'); }
        const codeAssignments = new Map<string, { productId: string; description: string }>();
        for (const line of input.lines) {
          if (!line.productId) fail(422, 'Relaciona cada línea con un producto antes de confirmar.');
          const product = await db.prepare('SELECT * FROM products WHERE id=?').bind(line.productId).first<Row>();
          if (!product) fail(422, 'Una línea hace referencia a un producto inexistente.');
          if(input.kind==='invoice'){const issues=[...productReview(product).issues,...purchaseCostIssues(line),...productContentIssues(product,line)];if(issues.length)fail(422,'Producto «'+line.description+'» pendiente de revisión: '+issues.join(' '));}
          if (input.kind === 'invoice' && str(product.tax_rate) && line.taxRate && str(product.tax_rate) !== line.taxRate && !String(input.notes || '').trim()) fail(422, 'Un IVA difiere del registrado en el producto. Explica la revisión en las notas.');
          const lineCode = text(line.supplierCode ?? '', 'Código del proveedor', 100);
          if (input.kind === 'invoice' && lineCode) {
            const previousInDoc = codeAssignments.get(lineCode);
            if (previousInDoc && previousInDoc.productId !== line.productId) fail(422, `El código de proveedor ${lineCode} está asignado a dos productos distintos en este documento.`);
            codeAssignments.set(lineCode, { productId: line.productId, description: line.description });
            const existingCode = await db.prepare('SELECT product_id FROM supplier_products WHERE supplier_key=? AND supplier_code=?').bind(supplierKey, lineCode).first<Row>();
            if (existingCode && str(existingCode.product_id) !== line.productId && !String(input.notes || '').trim()) {
              fail(422, `El código ${lineCode} de este proveedor estaba vinculado a otro producto. Explica el cambio en las notas antes de confirmar.`);
            }
          }
        }
        const token = uuid(); const statements: D1PreparedStatement[] = [];
        if (reviewOf) {
          const original = await getDoc(reviewOf);
          const originalId = str(original.id);
          if (original.status !== 'confirmed') fail(409, 'El documento original ya cambió. Revisa esta corrección.');
          statements.push(db.prepare("UPDATE documents SET status='cancelled',version=version+1,updated_at=?,updated_by=?,update_token=? WHERE id=? AND status='confirmed' AND EXISTS(SELECT 1 FROM documents WHERE id=? AND status='draft' AND version=?)").bind(timestamp, email, token, originalId, documentId, expected));
          statements.push(guardedAudit('replaced', `Reemplazado por ${documentId}`, originalId, token));
        }
        const updateIndex = statements.length;
        const revisionGuard = reviewOf ? " AND EXISTS(SELECT 1 FROM documents original WHERE original.id=? AND original.status='cancelled' AND original.update_token=?)" : '';
        const confirmValues: SqlParam[] = [JSON.stringify(validation), operationId, token, timestamp, email, documentId, expected];
        if (reviewOf) confirmValues.push(reviewOf, token);
        statements.push(db.prepare("UPDATE documents SET status='confirmed',version=version+1,validation=?,operation_id=?,update_token=?,updated_at=?,updated_by=? WHERE id=? AND version=? AND status='draft'" + revisionGuard).bind(...confirmValues));
        // The supplier named on a confirmed document always exists in the supplier catalogue (relation documents.supplier_key -> suppliers.name_key).
        statements.push(db.prepare("INSERT OR IGNORE INTO suppliers(id,name,name_key,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND status='confirmed' AND update_token=?)").bind(uuid(), str(row.supplier), supplierKey, timestamp, documentId, token));
        if (input.kind === 'invoice') {
          for (const line of input.lines) {
            const computed = validation.lines.find(item => item.id === line.id);
            const promotion = line.promotion || Number(line.bonusQuantity || 0) > 0 || Number(line.discountPercent || 0) > 0 || Number(line.discountAmount || 0) > 0;
            const lineCode = text(line.supplierCode ?? '', 'Código del proveedor', 100);
            const description=text(line.description,'Descripción del proveedor',500,true);
            statements.push(db.prepare("INSERT INTO product_aliases(id,supplier_key,supplier_name,description,description_key,product_id,document_id,confirmed_by,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND status='confirmed' AND update_token=?) ON CONFLICT(supplier_key,description_key,product_id) DO UPDATE SET description=excluded.description,document_id=excluded.document_id,confirmed_by=excluded.confirmed_by,updated_at=excluded.updated_at").bind(uuid(),supplierKey,str(row.supplier),description,aliasKey(description),line.productId,documentId,email,timestamp,documentId,token));
            statements.push(db.prepare("INSERT INTO document_products(document_id,line_id,product_id,unit_cost,net_unit_cost,units_per_pack,tax_rate,supplier_code,promotion) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND status='confirmed' AND update_token=?)").bind(documentId, line.id, line.productId, computed?.unitCost ?? null, computed?.netUnitCost ?? null, line.unitsPerPack || '', line.taxRate || '', lineCode, promotion ? 1 : 0, documentId, token));
          }
          for (const [code, info] of codeAssignments.entries()) {
            statements.push(db.prepare("INSERT INTO supplier_products(id,supplier_key,supplier_name,supplier_code,supplier_description,product_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND status='confirmed' AND update_token=?) ON CONFLICT(supplier_key,supplier_code) DO UPDATE SET supplier_name=excluded.supplier_name,supplier_description=excluded.supplier_description,product_id=excluded.product_id,updated_at=excluded.updated_at").bind(uuid(), supplierKey, str(row.supplier), code, info.description.slice(0, 500), info.productId, timestamp, timestamp, documentId, token));
          }
        }
        statements.push(guardedAudit('confirmed', 'Revisión interna confirmada; no equivale a autorización SRI', documentId, token));
        const result = await db.batch(statements);
        if (!result[updateIndex].meta.changes) fail(409, 'Otra persona modificó este documento. Vuelve a abrirlo.');
        return saved({ document: documentRow(await getDoc(documentId)) });
      }
      if (parts[2] === 'cancel') {
        const expected = version(payload.version); const reason = text(payload.reason, 'Motivo de anulación', 2000, true); const token = uuid();
        if (row.status === 'cancelled') fail(409, 'El documento ya está anulado.');
        const result = await db.batch([db.prepare("UPDATE documents SET status='cancelled',version=version+1,update_token=?,updated_at=?,updated_by=? WHERE id=? AND version=? AND status NOT IN ('cancelled','discarded')").bind(token, timestamp, email, documentId, expected), guardedAudit('cancelled', reason, documentId, token)]);
        if (!result[0].meta.changes) fail(409, 'El documento cambió. Vuelve a abrirlo antes de anular.');
        return saved({ document: documentRow(await getDoc(documentId)) });
      }
      if (parts[2] === 'revise') {
        const expected = version(payload.version); const reason = text(payload.reason, 'Motivo de corrección', 2000, true);
        if (!['confirmed','cancelled'].includes(str(row.status)) || row.version !== expected) fail(409, 'Solo se puede crear una revisión de la versión actual confirmada o anulada.');
        const revisionId = uuid(); const token = uuid(); const data = JSON.parse(str(row.data)) as InvoiceInput; data.notes = `${data.notes || ''}\nCorrección: ${reason}`.trim();
        const originals = await all('SELECT * FROM files WHERE document_id=? AND detached=0', documentId);
        const statements = [db.prepare("INSERT INTO documents(id,version,status,kind,supplier,supplier_key,number,date,seller,total,data,validation,related_id,review_of,update_token,created_at,updated_at,created_by,updated_by) SELECT ?,1,'draft',kind,supplier,supplier_key,number,date,seller,total,?,validation,related_id,CASE WHEN status='confirmed' THEN id ELSE '' END,?,?,?,?,? FROM documents WHERE id=? AND status IN ('confirmed','cancelled') AND version=?").bind(revisionId, JSON.stringify(data), token, timestamp, timestamp, email, email, documentId, expected), guardedAudit('revision_created', reason, revisionId, token)];
        for (const f of originals) { const source = await resolveOriginal(db, f); statements.push(db.prepare('INSERT INTO files(id,document_id,name,type,size,key,sha256,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND update_token=?)').bind(uuid(), revisionId, str(f.name), str(f.type), Number(f.size || 0), `reference:${str(source.id)}:${revisionId}`, str(f.sha256), timestamp, revisionId, token)); }
        const result = await db.batch(statements);
        if (!result[0].meta.changes) fail(409, 'El documento cambió. Vuelve a abrirlo.');
        // Images remain immutable and are also referenced by the replacement draft.
        return saved({ document: documentRow(await getDoc(revisionId)), originalId: documentId });
      }
    }

    if(request.method==='POST'&&parts[0]==='product-matches'){
      const payload=await body(request),supplier=text(payload.supplier??'','Proveedor',200);if(!Array.isArray(payload.lines)||payload.lines.length>200)fail(400,'Revisa hasta 200 productos a la vez.');
      const catalogue=(await db.prepare('SELECT id,name,brand,content,presentation FROM products ORDER BY id LIMIT 10001').all<Row>()).results,results:Row[]=[];
      for(const value of payload.lines){if(!value||typeof value!=='object')fail(400,'Producto de consulta inválido.');const line=value as Row;const lineId=id(line.id),description=text(line.description??'','Descripción',500),code=text(line.supplierCode??'','Código',100);results.push({lineId,candidates:await productMatches(db,supplier,description,code,catalogue)});}
      return json({matches:results});
    }
    if(request.method==='GET'&&parts[0]==='products'&&parts[1]&&!parts[2]){const productId=id(parts[1]),product=await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();if(!product)fail(404,'No se encontró el producto.');const latest=await latestPurchases(db,[productId]);return json({product:{...productRow(product),purchase:purchaseSummary(product,latest.get(productId))}});}
    if(request.method==='GET'&&parts[0]==='products'&&parts[1]&&parts[2]==='suppliers'){
      const productId=id(parts[1]),product=await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();if(!product)fail(404,'No se encontró el producto.');
      const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page')||'1')||1));
      const known=`WITH known AS(SELECT supplier_key,supplier_name name,'mapping' source FROM supplier_products WHERE product_id=? UNION ALL SELECT supplier_key,supplier_name,'alias' FROM product_aliases WHERE product_id=? UNION ALL SELECT d.supplier_key,d.supplier,'invoice' FROM document_products p JOIN documents d ON d.id=p.document_id WHERE p.product_id=? AND d.status='confirmed' AND d.kind='invoice' UNION ALL SELECT d.supplier_key,d.supplier,'commercial' FROM documents d JOIN json_each(d.data,'$.lines') line WHERE d.kind IN ('order','delivery') AND d.status NOT IN ('cancelled','discarded') AND json_extract(CASE WHEN line.type='object' THEN line.value ELSE '{}' END,'$.productId')=?)`;
      const params=[productId,productId,productId,productId];const count=await db.prepare(known+" SELECT COUNT(DISTINCT supplier_key) count FROM known WHERE supplier_key<>''").bind(...params).first<Row>();
      const rows=await db.prepare(known+" SELECT supplier_key supplierKey,MIN(name) name,MAX(source='invoice') hasInvoice,MAX(source='commercial') hasCommercial FROM known WHERE supplier_key<>'' GROUP BY supplier_key ORDER BY name,supplier_key LIMIT 50 OFFSET ?").bind(...params,(page-1)*50).all<Row>();
      const latest=await latestPurchases(db,[productId],rows.results.map(row=>str(row.supplierKey)));const global=await latestPurchases(db,[productId]);
      const entries:Row[]=[];for(const row of rows.results){const descriptions=await db.prepare(`SELECT description FROM (SELECT description,updated_at FROM product_aliases WHERE product_id=? AND supplier_key=? UNION ALL SELECT supplier_description,updated_at FROM supplier_products WHERE product_id=? AND supplier_key=?) WHERE description<>'' GROUP BY description ORDER BY MAX(updated_at) DESC LIMIT 3`).bind(productId,row.supplierKey,productId,row.supplierKey).all<Row>();entries.push({...row,descriptions:descriptions.results.map(item=>str(item.description)),purchase:purchaseSummary(product,latest.get(JSON.stringify([productId,row.supplierKey])))});}
      return json({product:{...productRow(product),purchase:purchaseSummary(product,global.get(productId))},suppliers:entries,pagination:{page,pageSize:50,total:Number(count?.count||0)}});
    }
    if (request.method === 'POST' && parts[0] === 'products') {
      const payload = await body(request);
      const productId = payload.id ? id(payload.id) : uuid();
      const storedProduct=await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();
      const innerUnits=innerCount(payload.innerUnits??storedProduct?.inner_units??''),innerUnitLabel=text(payload.innerUnitLabel??storedProduct?.inner_unit_label??'','Nombre de la unidad interior',60);
      const contentsMode=text(payload.contentsMode??storedProduct?.contents_mode??(innerUnits?'multiple':''),'Tipo de presentación',20);if(contentsMode&&!['single','multiple'].includes(contentsMode))fail(400,'Selecciona un tipo de presentación válido.');
      if(!!innerUnits!==!!innerUnitLabel)fail(400,'Completa cuántas unidades interiores hay y cómo se llaman, o deja ambos datos vacíos.');
      const name = text(payload.name, 'Nombre del producto', 250, true);
      const category = text(payload.category ?? '', 'Categoría', 120);
      const brand = text(payload.brand ?? '', 'Marca', 150);
      const content = text(payload.content ?? '', 'Contenido', 120);
      const barcode = text(payload.barcode ?? '', 'Código de barras', 100);
      const presentation = text(payload.presentation ?? '', 'Presentación', 200);
      const comparisonUnit = text(payload.comparisonUnit ?? '', 'Unidad de comparación', 80);
      const units = decimal(payload.unitsPerPack, 'Unidades por presentación');
      const tax = decimal(payload.taxRate, 'IVA', 100);
      const salePrice = optionalPrice(payload.salePrice, 'Precio de venta actual');
      if (units && Number(units) <= 0) fail(400, 'Las unidades por presentación deben ser mayores que cero.');
      const proposedProduct={name,category,presentation,comparison_unit:comparisonUnit,units_per_pack:units,contents_mode:contentsMode,inner_units:innerUnits,inner_unit_label:innerUnitLabel};const productIssues=productReview(proposedProduct).issues;
      if(payload.sourceDocumentId&&productIssues.length)fail(422,'Completa la ficha antes de publicar el producto: '+productIssues.join(' '));
      if(payload.sourceDocumentId){
        const documentId=id(payload.sourceDocumentId),source=await getDoc(documentId),expected=version(payload.sourceVersion),input=JSON.parse(str(source.data)) as InvoiceInput,line=input.lines.find(l=>l.id===payload.sourceLineId);
        if(source.status!=='draft'||source.version!==expected||!line||line.description.trim()!==name)fail(409,'La línea cambió. Revisa la factura antes de crear un artículo.');
        if(productContentIssues(proposedProduct,line).length)fail(422,'El contenido de la ficha no coincide con el contenido explícito de la factura.');
        const arithmetic=validateInvoice({...input,lines:input.lines.map((item,index)=>({...item,productId:item.productId||'revision-'+index}))});if(!arithmetic.valid)fail(422,'La factura tiene valores pendientes o incoherentes. Revisa sus cálculos antes de publicar productos.');
        if(input.lines.some(item=>purchaseCostIssues(item).length))fail(422,'Hay conversiones de compra pendientes en la factura. Revísalas antes de publicar productos.');
        const existing=await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();if(existing)return json({product:productRow(existing),replayed:true});
        const matches=await productMatches(db,input.supplier,line.description,line.supplierCode||'');
        if((matches.length||line.productCandidates?.length)&&(!line.newProductAcknowledged||!String(line.identityNote||'').trim()))fail(409,'Hay productos del catálogo que podrían ser este artículo. Vincúlalo o explica por qué es un producto distinto antes de crearlo.');
        const guard="EXISTS(SELECT 1 FROM documents WHERE id=? AND version=? AND status='draft')",same="NOT EXISTS(SELECT 1 FROM products WHERE lower(trim(name))=? AND lower(trim(brand))=? AND lower(trim(content))=?)";
        const result=await db.batch([db.prepare(`INSERT OR IGNORE INTO products(id,name,category,brand,content,barcode,presentation,comparison_unit,units_per_pack,tax_rate,sale_price,inner_units,inner_unit_label,contents_mode,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} AND (? OR ${same})`).bind(productId,name,category,brand,content,barcode,presentation,comparisonUnit,units,tax,salePrice,innerUnits,innerUnitLabel,contentsMode,timestamp,timestamp,documentId,expected,line.newProductAcknowledged?1:0,normalize(name),normalize(brand),normalize(content)),db.prepare(`INSERT INTO audit(id,document_id,actor,action,detail,created_at) SELECT ?,?,?,'product_created_from_invoice',?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND created_at=?) AND ${guard}`).bind(uuid(),documentId,email,name+(line.identityNote?' · Artículo distinto: '+text(line.identityNote,'Motivo de identidad',500):''),timestamp,productId,timestamp,documentId,expected)]);
        if(!result[0].meta.changes)fail(409,'El catálogo o la factura cambió. Revisa las coincidencias antes de crear otro artículo.');return saved({product:productRow((await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>())!)});
      }
      if (payload.id && await db.prepare('SELECT id FROM products WHERE id=?').bind(productId).first()) admin();
      if (barcode) {
        const barcodeOwner = await db.prepare('SELECT name FROM products WHERE barcode=? AND id<>?').bind(barcode, productId).first<Row>();
        if (barcodeOwner) fail(409, `Ese código de barras ya pertenece al producto «${str(barcodeOwner.name)}». Revisa si es el mismo artículo.`);
      }
      // Same name, brand, content and presentation is probably the same article: warn, never merge or block silently.
      const warnings: string[] = [];
      const twin = await db.prepare("SELECT name FROM products WHERE id<>? AND lower(trim(name))=? AND lower(trim(brand))=? AND lower(trim(content))=? AND lower(trim(presentation))=? LIMIT 1").bind(productId, normalize(name), normalize(brand), normalize(content), normalize(presentation)).first<Row>();
      if (twin) warnings.push(`Ya existe un producto con el mismo nombre, marca, contenido y presentación («${str(twin.name)}»). Comprueba que no sea un duplicado.`);
      await db.batch([
        db.prepare('INSERT INTO products(id,name,category,brand,content,barcode,presentation,comparison_unit,units_per_pack,tax_rate,sale_price,inner_units,inner_unit_label,contents_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,brand=excluded.brand,content=excluded.content,barcode=excluded.barcode,presentation=excluded.presentation,comparison_unit=excluded.comparison_unit,units_per_pack=excluded.units_per_pack,tax_rate=excluded.tax_rate,sale_price=excluded.sale_price,inner_units=excluded.inner_units,inner_unit_label=excluded.inner_unit_label,contents_mode=excluded.contents_mode,updated_at=excluded.updated_at')
          .bind(productId, name, category, brand, content, barcode, presentation, comparisonUnit, units, tax, salePrice, innerUnits, innerUnitLabel, contentsMode, timestamp, timestamp),
        auditStatement('product_saved',JSON.stringify({name,before:storedProduct?{unit:str(storedProduct.comparison_unit),mode:str(storedProduct.contents_mode),count:str(storedProduct.inner_units),innerUnit:str(storedProduct.inner_unit_label)}:null,after:{unit:comparisonUnit,mode:contentsMode,count:innerUnits,innerUnit:innerUnitLabel},salePrice})),
      ]);
      return saved({ product: productRow((await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>())!), warnings });
    }
    if (request.method === 'GET' && parts[0] === 'supplier-products') {
      const productId = url.searchParams.get('productId') ? id(url.searchParams.get('productId')) : '';
      const supplier = text(url.searchParams.get('supplier') ?? '', 'Proveedor', 200);
      const rows = productId
        ? await all('SELECT * FROM supplier_products WHERE product_id=? ORDER BY supplier_name,supplier_code LIMIT 500', productId)
        : supplier
          ? await all('SELECT * FROM supplier_products WHERE supplier_key=? ORDER BY supplier_code LIMIT 500', normalize(supplier))
          : await all('SELECT * FROM supplier_products ORDER BY updated_at DESC LIMIT 500');
      return json({ supplierProducts: rows.map(supplierProductRow) });
    }
    if (request.method === 'POST' && parts[0] === 'supplier-products') {
      const payload = await body(request);
      if (payload.remove === true) {
        admin();
        const mappingId = id(payload.id);
        const existing = await db.prepare('SELECT * FROM supplier_products WHERE id=?').bind(mappingId).first<Row>();
        if (!existing) fail(404, 'No se encontró el código de proveedor.');
        await db.batch([
          db.prepare('DELETE FROM supplier_products WHERE id=?').bind(mappingId),
          auditStatement('supplier_code_removed', `${str(existing.supplier_name)} [${str(existing.supplier_code)}]`),
        ]);
        return saved({ removed: mappingId });
      }
      const supplierName = text(payload.supplierName ?? payload.supplier, 'Proveedor', 200, true);
      const supplierKey = normalize(supplierName);
      const supplierCode = text(payload.supplierCode ?? payload.code, 'Código del proveedor', 100, true);
      const supplierDescription = text(payload.supplierDescription ?? payload.description ?? '', 'Descripción del proveedor', 500);
      const productId = id(payload.productId);
      const product = await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();
      if (!product) fail(404, 'Selecciona un producto existente del catálogo.');
      const existing = await db.prepare('SELECT * FROM supplier_products WHERE supplier_key=? AND supplier_code=?').bind(supplierKey, supplierCode).first<Row>();
      if (existing && str(existing.product_id) !== productId) admin();
      const mappingId = existing ? str(existing.id) : uuid();
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO suppliers(id,name,name_key,created_at) VALUES(?,?,?,?)').bind(uuid(), supplierName, supplierKey, timestamp),
        db.prepare('INSERT INTO supplier_products(id,supplier_key,supplier_name,supplier_code,supplier_description,product_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(supplier_key,supplier_code) DO UPDATE SET supplier_name=excluded.supplier_name,supplier_description=excluded.supplier_description,product_id=excluded.product_id,updated_at=excluded.updated_at')
          .bind(mappingId, supplierKey, supplierName, supplierCode, supplierDescription, productId, timestamp, timestamp),
        auditStatement('supplier_code_saved', `${supplierName} [${supplierCode}] -> ${str(product.name)}`),
      ]);
      const stored = await db.prepare('SELECT * FROM supplier_products WHERE supplier_key=? AND supplier_code=?').bind(supplierKey, supplierCode).first<Row>();
      return saved({ supplierProduct: supplierProductRow(stored!) });
    }
    if (request.method === 'POST' && parts[0] === 'suppliers') {
      const payload = await body(request); const name = text(payload.name, 'Nombre del proveedor', 200, true); const supplierId = uuid();
      await db.batch([db.prepare('INSERT OR IGNORE INTO suppliers(id,name,name_key,created_at) VALUES(?,?,?,?)').bind(supplierId, name, normalize(name), timestamp), auditStatement('supplier_saved', name)]);
      return saved({ supplier: await db.prepare('SELECT * FROM suppliers WHERE name_key=?').bind(normalize(name)).first<Row>() });
    }
    if (request.method === 'POST' && parts[0] === 'members') {
      admin(); const payload = await body(request); const targetEmail = text(payload.email, 'Correo', 250, true).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) fail(400, 'Escribe un correo válido.');
      const targetRole = str(payload.role);
      if (!['admin', 'collaborator'].includes(targetRole)) fail(400, 'Selecciona un permiso válido.');
      if (payload.active !== undefined && typeof payload.active !== 'boolean') fail(400, 'Estado de usuario inválido.');
      const ownerId = await db.prepare("SELECT value FROM settings WHERE key='owner'").first<Row>();
      const target = await db.prepare('SELECT * FROM members WHERE email=?').bind(targetEmail).first<Row>();
      if (target?.user_id === ownerId?.value && (targetRole !== 'admin' || payload.active === false)) fail(400, 'La cuenta propietaria debe conservar acceso de encargado.');
      await db.batch([db.prepare('INSERT INTO members(email,role,active,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,active=excluded.active').bind(targetEmail, targetRole, payload.active === false ? 0 : 1, timestamp), auditStatement('member_updated', `${targetEmail}: ${targetRole}, activo=${payload.active !== false}`)]);
      return saved({ members: await all('SELECT email,role,active,created_at FROM members ORDER BY email') });
    }

    if (request.method === 'GET' && parts[0] === 'history') {
      const productId = id(url.searchParams.get('productId'));
      const product = await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();
      if (!product) fail(404, 'No se encontró el producto.');
      const supplierCodes = await all('SELECT * FROM supplier_products WHERE product_id=? ORDER BY supplier_name,supplier_code LIMIT 200', productId);
      const rows = await all("SELECT d.id,d.date,d.number,d.supplier,d.seller,d.total,CASE WHEN p.net_unit_cost IS NULL OR p.units_per_pack='' THEN d.data ELSE '' END data,(SELECT j.value FROM json_each(CASE WHEN json_valid(d.data) THEN d.data ELSE '{}' END,'$.lines') j WHERE j.type='object' AND json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.id')=p.line_id LIMIT 1) source_line,p.line_id,p.unit_cost,p.net_unit_cost,p.units_per_pack,p.tax_rate,p.supplier_code,p.promotion FROM document_products p JOIN documents d ON d.id=p.document_id WHERE p.product_id=? AND d.status='confirmed' AND d.kind='invoice' ORDER BY d.date DESC,d.id,p.line_id LIMIT 1000", productId);
      const history = rows.map(row => {
        const lineId = str(row.line_id);
        let netUnitCost = row.net_unit_cost == null ? null : str(row.net_unit_cost);
        let unitsPerPack = str(row.units_per_pack);
        let taxRate = str(row.tax_rate);
        let supplierCode = str(row.supplier_code);
        let issues=productReview(product).issues;
        try{const source=row.source_line?JSON.parse(str(row.source_line)) as InvoiceInput['lines'][number]:null;issues=[...issues,...(source?[...purchaseCostIssues(source),...productContentIssues(product,source)]:['Falta comprobar la línea original.'])];}catch{issues=[...issues,'No se pudo comprobar el original de esta compra.'];}
        if ((netUnitCost === null && row.unit_cost !== null) || (!unitsPerPack && row.data)) {
          try {
            const parsed = JSON.parse(str(row.data)) as InvoiceInput;
            const sourceLine = parsed.lines?.find(item => item.id === lineId);
            if (sourceLine) {
              unitsPerPack ||= sourceLine.unitsPerPack || '';
              taxRate ||= sourceLine.taxRate || '';
              supplierCode ||= sourceLine.supplierCode || '';
            }
            if (netUnitCost === null && row.unit_cost !== null) {
              const computed = validateInvoice(parsed).lines.find(item => item.id === lineId);
              netUnitCost = computed?.netUnitCost ?? null;
            }
          } catch { }
        }
        return {
          documentId: str(row.id),
          lineId,
          date: str(row.date),
          number: str(row.number),
          supplier: str(row.supplier),
          seller: str(row.seller),
          total: str(row.total),
          unitCost: issues.length||row.unit_cost == null ? null : str(row.unit_cost),
          netUnitCost:issues.length?null:netUnitCost,reviewIssues:issues,
          unitsPerPack,
          taxRate,
          supplierCode,
          promotion: Boolean(row.promotion),
          kind: 'invoice',
        };
      });
      const warnings: string[] = [];
      if(productReview(product).issues.length)warnings.push('Ficha pendiente de revisión: '+productReview(product).issues.join(' '));
      if (history.length >= 1000) warnings.push('Se muestran las 1.000 compras más recientes de este producto.');
      // Same-date ties are never resolved by upload order: an administrator must choose the reference with a reason.
      const latestDate = history.reduce((max, row) => row.date > max ? row.date : max, '');
      const tied = latestDate ? history.filter(row => row.date === latestDate) : [];
      const choiceRow = tied.length > 1 ? await db.prepare('SELECT * FROM reference_choices WHERE product_id=? AND reference_date=?').bind(productId, latestDate).first<Row>() : null;
      const chosen = choiceRow ? tied.find(row => row.unitCost!==null&&row.documentId === str(choiceRow.document_id) && row.lineId === str(choiceRow.line_id)) : undefined;
      const referenceChoice = chosen && choiceRow ? { documentId: chosen.documentId, lineId: chosen.lineId, reason: str(choiceRow.reason), chosenBy: str(choiceRow.chosen_by), createdAt: str(choiceRow.created_at) } : null;
      if (tied.length > 1 && !referenceChoice) warnings.push(tied.every(row=>row.unitCost===null)?'Las compras de la fecha más reciente están pendientes de revisión; todavía no hay un costo válido para elegir.':'Hay varias compras en la fecha más reciente. Elige con un motivo cuál será la referencia; no se decide por el orden de carga.');
      if (!(tied.length > 1) && history[0]?.unitCost === null) warnings.push('El documento más reciente tiene costo efectivo pendiente.');
      // Orders and delivery notes give identified provisional references only; they never enter the confirmed history.
      const productNeedle = `"productId":"${productId}"`;
      const commercialRows = await all("SELECT id,kind,status,number,date,supplier,seller,related_id,data FROM documents WHERE kind IN ('order','delivery') AND status NOT IN ('cancelled','discarded') AND instr(data, ?) > 0 ORDER BY date DESC,id LIMIT 20", productNeedle);
      const provisional: Row[] = [];
      for (const commercial of commercialRows) {
        let parsed: InvoiceInput; try { parsed = JSON.parse(str(commercial.data)) as InvoiceInput; } catch { continue; }
        const calculated = validateInvoice(parsed);
        const invoiced = await db.prepare("SELECT 1 found FROM document_products p JOIN documents d ON d.id=p.document_id WHERE p.product_id=? AND d.status='confirmed' AND d.kind='invoice' AND (d.id=? OR d.related_id=?) LIMIT 1").bind(productId, str(commercial.related_id), str(commercial.id)).first<Row>();
        for (const line of parsed.lines || []) {
          if (line.productId !== productId) continue;
          const computed = calculated.lines.find(item => item.id === line.id);
          provisional.push({ documentId: str(commercial.id), lineId: line.id, kind: str(commercial.kind), status: str(commercial.status), number: str(commercial.number), date: str(commercial.date), supplier: str(commercial.supplier), seller: str(commercial.seller), provisionalUnitCost: computed?.provisionalUnitCost ?? null, provisionalNetUnitCost: computed?.provisionalNetUnitCost ?? null, promotion: Boolean(line.promotion), alreadyInvoiced: Boolean(invoiced) });
        }
      }
      return json({ product: productRow(product), supplierCodes: supplierCodes.map(supplierProductRow), history, warnings, tie: tied.length > 1, referenceChoice, provisional });
    }
    if (request.method === 'POST' && parts[0] === 'reference-choices') {
      admin(); const payload = await body(request);
      const productId = id(payload.productId); const documentId = id(payload.documentId); const lineId = text(payload.lineId, 'Línea', 200, true); const reason = text(payload.reason, 'Motivo de la referencia', 1000, true);
      const product=await db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Row>();if(!product||productReview(product).issues.length)fail(422,'Completa la ficha del producto antes de elegir una referencia de costo.');
      const picked = await db.prepare("SELECT d.date,p.unit_cost FROM document_products p JOIN documents d ON d.id=p.document_id WHERE p.product_id=? AND p.document_id=? AND p.line_id=? AND d.status='confirmed' AND d.kind='invoice'").bind(productId, documentId, lineId).first<Row>();
      if (!picked) fail(404, 'Esa compra confirmada no existe para este producto.');
      const source=JSON.parse(str((await getDoc(documentId)).data)) as InvoiceInput,sourceLine=source.lines.find(line=>line.id===lineId);if(!sourceLine||purchaseCostIssues(sourceLine).length||productContentIssues(product,sourceLine).length)fail(422,'La conversión de esta compra está pendiente; corrige la factura antes de usarla como referencia.');
      const pickedDate = str(picked.date);
      const sameDate = await db.prepare("SELECT COUNT(*) count FROM document_products p JOIN documents d ON d.id=p.document_id WHERE p.product_id=? AND d.status='confirmed' AND d.kind='invoice' AND d.date=?").bind(productId, pickedDate).first<Row>();
      const latest = await db.prepare("SELECT MAX(d.date) date FROM document_products p JOIN documents d ON d.id=p.document_id WHERE p.product_id=? AND d.status='confirmed' AND d.kind='invoice'").bind(productId).first<Row>();
      if (pickedDate !== str(latest?.date) || Number(sameDate?.count || 0) < 2) fail(422, 'Solo se elige referencia cuando hay varias compras confirmadas en la fecha más reciente.');
      if (picked.unit_cost == null) fail(422, 'Esa compra tiene costo pendiente; elige una compra con costo confirmado.');
      await db.batch([
        db.prepare('INSERT INTO reference_choices(id,product_id,reference_date,document_id,line_id,reason,chosen_by,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(product_id,reference_date) DO UPDATE SET document_id=excluded.document_id,line_id=excluded.line_id,reason=excluded.reason,chosen_by=excluded.chosen_by,created_at=excluded.created_at').bind(uuid(), productId, pickedDate, documentId, lineId, reason, email, timestamp),
        auditStatement('reference_chosen', `Referencia de ${pickedDate} fijada con motivo: ${reason}`, documentId),
      ]);
      return saved({ referenceChoice: { documentId, lineId, reason, chosenBy: email, createdAt: timestamp } });
    }

    const resolveFile = (file: Row) => resolveOriginal(db, file);
    if (request.method === 'POST' && parts[0] === 'upload') {
      if (Number(request.headers.get('content-length') || 0) > MAX_FILE + 65536) fail(413, 'El archivo supera 20 MB.');
      const limited = await readLimited(request, MAX_FILE + 65536);
      const form = await new Response(limited as BodyInit, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData(); const documentId = id(form.get('documentId')); const upload = form.get('file');
      if (!(upload instanceof File)) fail(400, 'Selecciona una imagen o PDF.');
      if (!upload.size || upload.size > MAX_FILE) fail(413, 'Cada archivo debe tener entre 1 byte y 20 MB.');
      const row = await getDoc(documentId); if (row.status !== 'draft') fail(409, 'Solo se pueden adjuntar páginas a un borrador.');
      const count = await db.prepare('SELECT COUNT(*) count FROM files WHERE document_id=?').bind(documentId).first<Row>();
      if (Number(count?.count || 0) >= 20) fail(413, 'Este documento ya tiene 20 páginas o archivos. Divide el registro en documentos relacionados.');
      const bytes = new Uint8Array(await upload.arrayBuffer()); const type = sniff(bytes); const hash = await digest(bytes);
      const duplicate = await db.prepare('SELECT * FROM files WHERE document_id=? AND sha256=?').bind(documentId, hash).first<Row>();
      if(duplicate){
        if(duplicate.detached){const token=uuid();const result=await db.batch([db.prepare("UPDATE documents SET version=version+1,update_token=?,updated_at=?,updated_by=? WHERE id=? AND status='draft' AND version=?").bind(token,timestamp,email,documentId,Number(row.version)),db.prepare('UPDATE files SET detached=0 WHERE id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND update_token=?)').bind(str(duplicate.id),documentId,token),guardedAudit('file_reattached','Original recuperado al seleccionarlo de nuevo',documentId,token)]);if(!result[0].meta.changes)fail(409,'El borrador cambió. Vuelve a abrirlo.');}
        return json({file:fileRow({...duplicate,detached:0}),document:documentRow(await getDoc(documentId)),duplicate:true});
      }
      const fileId = uuid(); const key = `originals/${documentId}/${fileId}`; const name = upload.name.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 200) || 'documento';
      await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
      try {
        const token=uuid();const result=await db.batch([
          db.prepare("UPDATE documents SET version=version+1,update_token=?,updated_at=?,updated_by=? WHERE id=? AND status='draft' AND version=? AND (SELECT COUNT(*) FROM files WHERE document_id=?)<20").bind(token,timestamp,email,documentId,Number(row.version),documentId),
          db.prepare("INSERT INTO files(id,document_id,name,type,size,key,sha256,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND status='draft' AND update_token=?)").bind(fileId,documentId,name,type,bytes.byteLength,key,hash,timestamp,documentId,token),
          guardedAudit('file_uploaded',name,documentId,token),
        ]);
        if(!result[0].meta.changes){await bucket.delete(key);fail(409,'El documento cambió mientras cargabas el archivo. Reabre su versión actual.');}
      } catch (error) { await bucket.delete(key); throw error; }
      return saved({file:{id:fileId,documentId,name,type,size:bytes.byteLength},document:documentRow(await getDoc(documentId))});
    }
    if(request.method==='POST'&&parts[0]==='files'&&parts[1]&&['detach','reattach'].includes(parts[2])){
      const payload=await body(request),file=await db.prepare('SELECT * FROM files WHERE id=?').bind(id(parts[1])).first<Row>();if(!file)fail(404,'No se encontró ese original.');
      const documentId=str(file.document_id),row=await getDoc(documentId),expected=version(payload.version),detached=parts[2]==='detach'?1:0,token=uuid();
      if(row.status!=='draft'||row.version!==expected)fail(409,'Solo puedes retirar o recuperar originales del borrador actual.');
      if(Number(file.detached||0)===detached)return json({document:documentRow(row),replayed:true});
      const result=await db.batch([db.prepare("UPDATE documents SET version=version+1,update_token=?,updated_at=?,updated_by=? WHERE id=? AND version=? AND status='draft'").bind(token,timestamp,email,documentId,expected),db.prepare('UPDATE files SET detached=? WHERE id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND update_token=?)').bind(detached,str(file.id),documentId,token),guardedAudit(detached?'file_detached':'file_reattached',str(file.name),documentId,token)]);
      if(!result[0].meta.changes)fail(409,'El borrador cambió mientras seleccionabas el original.');
      const attachments=await all('SELECT * FROM files WHERE document_id=? ORDER BY created_at',documentId);
      return saved({document:documentRow(await getDoc(documentId)),files:attachments.filter(f=>!f.detached).map(fileRow),removedFiles:attachments.filter(f=>f.detached).map(fileRow)});
    }
    if (request.method === 'GET' && parts[0] === 'files' && parts[1]) {
      const file = await db.prepare('SELECT * FROM files WHERE id=?').bind(id(parts[1])).first<Row>(); if (!file) fail(404, 'Archivo no encontrado.');
      const original = await resolveFile(file); const stored = await bucket.get(str(original.key)); if (!stored) fail(404, 'No se encontró el original. Restaura una copia de respaldo.');
      const mimeType = str(original.type);
      return new Response(stored.body, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(str(file.name))}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': mimeType === 'application/pdf' ? "default-src 'self' 'unsafe-inline'; frame-ancestors 'self'" : "default-src 'none'; sandbox",
        },
      });
    }

    if (parts[0] === 'ai' && parts[1] === 'config') {
      const stored=await db.prepare("SELECT value FROM settings WHERE key='gemini_config'").first<Row>();
      let config:GeminiConfig|null=null;try{config=stored?JSON.parse(str(stored.value)) as GeminiConfig:null;}catch{fail(503,'La conexión de Gemini debe configurarse nuevamente.');}
      if(request.method==='POST'){
        admin();const payload=await body(request);
        if(payload.disconnect===true){await db.batch([db.prepare("DELETE FROM settings WHERE key='gemini_config'"),auditStatement('gemini_disconnected','Conexión de Gemini retirada')]);return json({provider:'local',hasKey:false,model:GEMINI_MODELS[0],models:GEMINI_MODELS,secretReady:!!env.AI_CONFIG_SECRET});}
        if(payload.provider&&payload.provider!=='gemini')fail(400,'Esta conexión corresponde a Gemini.');
        const model=geminiModel(payload.model||config?.model||GEMINI_MODELS[0]);
        const key=payload.apiKey?text(payload.apiKey,'Clave de Gemini',4096,true).trim():config?await openGeminiKey(config.encryptedKey,env.AI_CONFIG_SECRET||''):'';
        const encryptedKey=await sealGeminiKey(key,env.AI_CONFIG_SECRET||'');
        await checkGeminiConnection(key,model,env.AI_FETCH);
        await db.batch([db.prepare("INSERT INTO settings(key,value) VALUES('gemini_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({model,encryptedKey})),auditStatement('gemini_connected','Conexión protegida de Gemini comprobada; modelo '+model)]);
        config={model,encryptedKey};
      }
      return json({provider:config?'gemini':'local',hasKey:!!config,model:config?.model||GEMINI_MODELS[0],models:GEMINI_MODELS,secretReady:!!env.AI_CONFIG_SECRET,canConfigure:role==='admin'});
    }
    if(request.method==='POST'&&parts[0]==='ai'&&parts[1]==='check-reading'){
      admin();const payload=await body(request);if(payload.consent!==true)fail(403,'Autoriza la prueba con una factura ficticia; puede consumir cuota de tu cuenta de Google.');
      const stored=await db.prepare("SELECT value FROM settings WHERE key='gemini_config'").first<Row>();if(!stored)fail(503,'Conecta Gemini primero desde Lectura con IA.');
      const config=JSON.parse(str(stored.value)) as GeminiConfig,model=geminiModel(payload.model||config.model),token=uuid()+':'+(Date.now()+180000);
      const lock=await db.prepare("INSERT INTO settings(key,value) VALUES('gemini_probe_job',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(substr(settings.value,instr(settings.value,':')+1) AS INTEGER)<?").bind(token,Date.now()).run();
      if(!lock.meta.changes)fail(409,'Ya hay una prueba de lectura en curso. Espera su resultado.');
      try{await auditStatement('gemini_probe_requested','Prueba autorizada con PDF ficticio; modelo '+model).run();const result=await verifyGeminiReading(await openGeminiKey(config.encryptedKey,env.AI_CONFIG_SECRET||''),model,request.signal,env.AI_FETCH);await auditStatement('gemini_probe_passed','Dos productos y total 5.30 comprobados; modelo '+model).run();return json(result);}
      finally{await db.prepare("DELETE FROM settings WHERE key='gemini_probe_job' AND value=?").bind(token).run();}
    }
    if (request.method === 'POST' && parts[0] === 'ai' && parts[1] === 'extract-document') {
      const payload=await body(request);const documentId=id(payload.documentId);const row=await getDoc(documentId);
      if(row.status!=='draft'||row.version!==version(payload.version))fail(409,'El borrador cambió durante la lectura. Conserva tu revisión y abre la versión actual.');
      if(payload.provider&&!['local','gemini'].includes(str(payload.provider)))fail(403,'Selecciona lectura local o Gemini.');
      const source=text(payload.text??'','Texto leído',500000);
      if(payload.provider!=='gemini'&&!source.trim()&&!payload.structured)fail(422,'No se encontró texto legible. Reintenta la lectura del original.');
      const incoming=payload.structured;
      let parsed:Record<string,unknown>=incoming&&typeof incoming==='object'&&!Array.isArray(incoming)?incoming as Record<string,unknown>:extractDocumentData(source) as unknown as Record<string,unknown>;
      const aiCandidateIds=new Set<string>();
      if(payload.provider==='gemini'){
        if(payload.consent!==true)fail(403,'Autoriza el envío de estos originales a Gemini antes de iniciar la lectura.');
        if(!Array.isArray(payload.fileIds)||!payload.fileIds.length||payload.fileIds.length>20)fail(400,'Selecciona los originales de esta factura.');
        const fileIds=[...new Set(payload.fileIds.map(value=>id(value)))];
        const stored=await db.prepare("SELECT value FROM settings WHERE key='gemini_config'").first<Row>();if(!stored)fail(503,'Conecta Gemini primero desde Lectura con IA.');
        const config=JSON.parse(str(stored.value)) as GeminiConfig;const model=geminiModel(payload.model||config.model);
        const originals:Row[]=[];let size=0;
        for(const fileId of fileIds){const f=await db.prepare('SELECT * FROM files WHERE id=? AND document_id=? AND detached=0').bind(fileId,documentId).first<Row>();if(!f)fail(409,'Un original ya no pertenece a este borrador. Vuelve a abrirlo.');const original=await resolveFile(f);size+=Number(original.size||0);originals.push(original);}
        if(size>12*1024*1024)fail(413,'La lectura con Gemini admite hasta 12 MB de originales en total. Divide el PDF o selecciona menos páginas.');
        const lockKey='gemini_job:'+documentId,lockValue=uuid()+':'+(Date.now()+180000),time=Date.now();
        const lock=await db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(substr(settings.value,instr(settings.value,':')+1) AS INTEGER)<?").bind(lockKey,lockValue,time).run();
        if(!lock.meta.changes)fail(409,'Ya hay una lectura de Gemini en curso para este documento. Espera su resultado antes de volver a enviarlo.');
        try{
          const files:GeminiFile[]=[];for(const original of originals){const data=await bucket.get(str(original.key));if(!data)fail(404,'Falta un original guardado.');files.push({bytes:new Uint8Array(await data.arrayBuffer()),mimeType:str(original.type)});}
          await auditStatement('gemini_requested',`Envío autorizado de ${files.length} originales; modelo ${model}`,documentId).run();
          const catalogue:GeminiCatalogItem[]=payload.catalogConsent===true?(await all('SELECT id,name,brand,content,presentation,barcode FROM products ORDER BY name,id LIMIT 500')).map(p=>({id:str(p.id),name:str(p.name),brand:str(p.brand),content:str(p.content),presentation:str(p.presentation),barcode:str(p.barcode)})):[];for(const p of catalogue)aiCandidateIds.add(p.id);
          parsed=await extractWithGemini(await openGeminiKey(config.encryptedKey,env.AI_CONFIG_SECRET||''),model,files,request.signal,env.AI_FETCH,catalogue) as unknown as Record<string,unknown>;
          const current=await getDoc(documentId);if(current.status!=='draft'||current.version!==row.version)fail(409,'El borrador cambió mientras Gemini lo leía. No se aplicó la propuesta.');
          await auditStatement('gemini_proposed','Propuesta de Gemini terminada; requiere revisión humana',documentId).run();
        }finally{await db.prepare('DELETE FROM settings WHERE key=? AND value=?').bind(lockKey,lockValue).run();}
      }
      if(!Array.isArray(parsed.lines)||parsed.lines.length>200)fail(400,'La lectura debe contener hasta 200 productos.');
      const previous=JSON.parse(str(row.data)) as InvoiceInput;
      let taxSummary;try{taxSummary=parsePrintedTaxSummary(parsed.taxSummary);}catch(e){fail(422,e instanceof Error?e.message:'Los subtotales por IVA no son válidos.');}
      const supplier=text(parsed.supplier??previous.supplier,'Proveedor leído',200);
      const warnings:string[]=Array.isArray(parsed.warnings)?parsed.warnings.filter((v):v is string=>typeof v==='string').slice(0,300):[];
      const lines:InvoiceInput['lines']=[];let learnedCount=0;const matchingCatalogue=(await db.prepare('SELECT * FROM products ORDER BY id LIMIT 10001').all<Row>()).results;
      for(const raw of parsed.lines){
        if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(400,'La lectura contiene un producto inválido.');
        const item=raw as Record<string,unknown>;const description=text(item.description??'','Descripción leída',500,true);const supplierCode=text(item.supplierCode??'','Código leído',100);
        let product:Row|null=null;let matchSource='new';
        const candidates=await productMatches(db,supplier,description,supplierCode,matchingCatalogue);
        const codeMatch=candidates.find(c=>c.matchSource==='supplier_code'),aliases=candidates.filter(c=>c.matchSource==='supplier_description'),exact=candidates.filter(c=>c.matchSource==='exact_name');
        const known=codeMatch||(aliases.length===1?aliases[0]:undefined)||(aliases.length===0&&exact.length===1?exact[0]:undefined);
        if(known){product=matchingCatalogue.find(p=>p.id===known.id)||await db.prepare('SELECT * FROM products WHERE id=?').bind(known.id).first<Row>();matchSource=known.matchSource==='supplier_code'?'learned_code':known.matchSource==='supplier_description'?'learned_description':'catalog';if(matchSource!=='catalog')learnedCount++;}
        if(aliases.length>1||exact.length>1)warnings.push(`Producto ${lines.length+1}: hay varios artículos posibles; revisa la vinculación y presentación.`);
        if(typeof item.suggestedProductId==='string'&&aiCandidateIds.has(item.suggestedProductId)){const proposal=await db.prepare('SELECT * FROM products WHERE id=?').bind(item.suggestedProductId).first<Row>();if(proposal){const previous=candidates.findIndex(c=>c.id===proposal.id);if(previous>=0)candidates.splice(previous,1);candidates.unshift({id:str(proposal.id),name:str(proposal.name),brand:str(proposal.brand),content:str(proposal.content),presentation:str(proposal.presentation),reason:'Sugerencia de Gemini: revisa marca, tamaño y variante antes de vincular.',matchSource:'gemini'});}}
        const columns=item.purchaseColumns&&typeof item.purchaseColumns==='object'&&!Array.isArray(item.purchaseColumns)?item.purchaseColumns as Row:{};
        const purchase=resolvePurchaseColumns(decimal(item.quantity??'','Cantidad leída'),decimal(item.unitsPerPack??'','Unidades leídas'),{unitLabel:text(columns.unitLabel??'','Unidad de compra',50),boxes:decimal(columns.boxes??'','Cajas leídas'),units:decimal(columns.units??'','Unidades sueltas leídas'),total:decimal(columns.total??'','Cantidad total leída'),packEvidence:text(columns.packEvidence??'','Respaldo de conversión',200)});
        const line:InvoiceInput['lines'][number]={id:uuid(),productId:product?str(product.id):'',supplierCode,description,
          ...purchase,bonusQuantity:decimal(item.bonusQuantity??'','Bonificación leída'),grossLineTotal:decimal(item.grossLineTotal??'','Total con IVA de línea leído'),
          unitPrice:decimal(item.unitPrice??'','Precio leído'),discountPercent:decimal(item.discountPercent??'','Descuento porcentual',100),discountAmount:decimal(item.discountAmount??'','Descuento leído'),taxRate:decimal(item.taxRate??'','IVA leído',100),otherTax:decimal(item.otherTax??'','Otros impuestos leídos'),otherTaxInBase:typeof item.otherTaxInBase==='boolean'?item.otherTaxInBase:undefined,lineTotal:decimal(item.lineTotal??'','Importe leído'),taxAmount:decimal(item.taxAmount??'','IVA de línea leído'),promotion:item.promotion===true,
          costUnit:text(product?.comparison_unit||item.costUnit||'','Unidad del costo leída',80),contentsMode:['single','multiple'].includes(str(product?.contents_mode||item.contentsMode))?str(product?.contents_mode||item.contentsMode) as 'single'|'multiple':'',innerUnits:decimal(product?.inner_units||item.innerUnits||'','Contenido interior leído'),innerUnitLabel:text(product?.inner_unit_label||item.innerUnitLabel||'','Unidad interior leída',60),productCandidates:candidates,newProductAcknowledged:false,category:text(product?.category||item.category||'','Categoría sugerida',120),sourceText:text(item.sourceText??'','Renglón original',2000)};
        if(matchSource==='learned_description')warnings.push(`Producto ${lines.length+1}: vinculación propuesta por descripción ya revisada de este proveedor; compara tamaño y variante.`);
        if(matchSource==='learned_code')warnings.push(`Producto ${lines.length+1}: vinculación propuesta por código de este proveedor; revisa que sea el mismo artículo.`);
        if(!line.taxRate)warnings.push(`Producto ${lines.length+1}: el IVA no está informado; no se supuso una tarifa.`);
        if(!line.quantity||!line.unitsPerPack)warnings.push(`Producto ${lines.length+1}: ${purchase.purchaseReading.explanation}`);
        lines.push(line);
      }
      const kind=['invoice','delivery','order'].includes(str(parsed.kind))?str(parsed.kind) as InvoiceInput['kind']:previous.kind;
      const extracted:InvoiceInput={...previous,kind,supplier,supplierRuc:text(parsed.supplierRuc??'','RUC leído',13),number:text(parsed.number??previous.number,'Número leído',200),date:text(parsed.date??previous.date,'Fecha leída',20),seller:text(parsed.seller??previous.seller,'Vendedor leído',200),total:decimal(parsed.total??previous.total,'Total leído'),taxTotal:decimal(parsed.taxTotal??previous.taxTotal,'IVA total leído'),wordsTotal:text(parsed.wordsTotal??previous.wordsTotal??'','Importe en letras',500),taxSummary,taxReconciliation:undefined,lines,extractionWarnings:[...new Set(warnings)]};
      // Solo se propone: nunca se actualiza un documento ni se aprende una asignación sin revisión.
      return json({extracted,validation:validateInvoice(extracted),learningStats:{totalLines:lines.length,learnedLines:learnedCount,newLines:lines.filter(l=>!l.productId).length},warnings:extracted.extractionWarnings});
    }
    if (request.method === 'POST' && parts[0] === 'supplier-products' && parts[1] === 'learn') {
      fail(403,'Las asociaciones de productos se recuerdan al confirmar una factura revisada.');
    }

    if (request.method === 'GET' && parts[0] === 'backup') {
      admin(); const copy = await snapshot(); const attachments: { fileId: string; base64: string }[] = []; const contentsByHash = new Map<string, string>();
      let totalBytes = 0;
      for (const f of copy.data.files) {
        const original = await resolveFile(f); const originalHash = str(original.sha256); const fileId = str(f.id);
        const existingContent = contentsByHash.get(originalHash); if (existingContent) { f.contentId = existingContent; continue; }
        const value = await bucket.get(str(original.key)); if (!value) fail(409, `Falta el original de ${str(f.name)}; no se generó un respaldo incompleto.`);
        const bytes = new Uint8Array(await value.arrayBuffer()); totalBytes += bytes.length;
        if (await digest(bytes) !== originalHash) fail(409, `El original de ${str(f.name)} no coincide con su huella digital. Revisa el almacenamiento antes de respaldar.`);
        if (totalBytes > 12 * 1024 * 1024) fail(413, 'El respaldo completo supera 12 MB de adjuntos. Solicita al administrador técnico una exportación del almacenamiento. No se descargó un respaldo parcial.');
        attachments.push({ fileId, base64: encode64(bytes) }); contentsByHash.set(originalHash, fileId); f.contentId = fileId;
      }
      const contents = JSON.stringify({ ...copy, attachments }); if (new TextEncoder().encode(contents).length > MAX_ARCHIVE) fail(413, 'El respaldo supera el tamaño de descarga permitido. Solicita una exportación del almacenamiento.');
      await auditStatement('backup_exported', 'Respaldo completo descargado').run();
      return new Response(contents, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="mi-tienda-respaldo-${timestamp.slice(0, 10)}.json"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (request.method === 'POST' && parts[0] === 'restore') {
      admin(); const payload = await body(request, MAX_ARCHIVE);
      const copy = (payload.backup && typeof payload.backup === 'object' ? payload.backup : payload) as Record<string, unknown>;
      const count = await db.prepare('SELECT (SELECT COUNT(*) FROM documents)+(SELECT COUNT(*) FROM products)+(SELECT COUNT(*) FROM suppliers)+(SELECT COUNT(*) FROM supplier_products)+(SELECT COUNT(*) FROM files)+(SELECT COUNT(*) FROM product_aliases) count').first<Row>();
      if (Number(count?.count || 0)) fail(409, 'La restauración solo se permite en una tienda vacía para evitar sobrescribir información.');
      const copyData = copy.data as Record<string, unknown> | undefined;
      const copyAttachments = copy.attachments;
      // Version 1 (first delivery) lacks supplier_products/reference_choices and extended columns; version 2 includes them.
      if (copy.format !== 'mi-tienda-backup' || ![1, BACKUP_VERSION].includes(Number(copy.version)) || !copyData || typeof copyData !== 'object' || !Array.isArray(copyAttachments)) fail(400, 'Este archivo no es un respaldo compatible.');
      for (const table of CORE_TABLES) if (!Array.isArray(copyData[table]) || (copyData[table] as unknown[]).length > 50000) fail(400, 'El respaldo contiene tablas inválidas o supera el límite de restauración.');
      for (const optional of ['supplier_products', 'reference_choices'] as const) if (copyData[optional] !== undefined && (!Array.isArray(copyData[optional]) || (copyData[optional] as unknown[]).length > 50000)) fail(400, `El respaldo contiene datos inválidos en ${optional}.`);
      const rawProducts = copyData.products as Row[];
      const rawDocuments = copyData.documents as Row[];
      const rawFiles = copyData.files as Row[];
      const rawSuppliers = copyData.suppliers as Row[];
      const rawAudit = copyData.audit as Row[];
      const rawSupplierProducts = (Array.isArray(copyData.supplier_products) ? copyData.supplier_products : []) as Row[];
      const rawAliases=(Array.isArray(copyData.product_aliases)?copyData.product_aliases:[]) as Row[];
      if(copyData.product_aliases===undefined){const seen=new Set<string>();for(const document of rawDocuments){if(document.kind!=='invoice'||document.status!=='confirmed')continue;let input:InvoiceInput;try{input=JSON.parse(str(document.data)) as InvoiceInput;}catch{continue;}for(const line of input.lines||[]){if(!line.productId||!line.description?.trim())continue;const key=JSON.stringify([normalize(input.supplier),aliasKey(line.description),line.productId]);if(seen.has(key))continue;seen.add(key);rawAliases.push({id:uuid(),supplier_name:input.supplier,description:line.description,product_id:line.productId,document_id:document.id,confirmed_by:document.updated_by||document.created_by,updated_at:document.updated_at||timestamp});}}}
      const rawChoices = (Array.isArray(copyData.reference_choices) ? copyData.reference_choices : []) as Row[];
      const documentIds = new Set(rawDocuments.map(d => id(d.id))); const productIds = new Set(rawProducts.map(p => id(p.id)));
      if (documentIds.size !== rawDocuments.length || productIds.size !== rawProducts.length) fail(400, 'El respaldo contiene identificadores repetidos.');
      const seenSupplierNames = new Set<string>();
      const normalizedSuppliers: Row[] = rawSuppliers.map(s => {
        const name = text(s.name, 'Proveedor restaurado', 200, true); const key = normalize(name);
        if (seenSupplierNames.has(key)) fail(400, 'El respaldo contiene proveedores repetidos.');
        seenSupplierNames.add(key);
        return { id: id(s.id), name, name_key: key, created_at: text(s.created_at ?? timestamp, 'Fecha creación proveedor', 60, true) };
      });
      const normalizedAudit: Row[] = rawAudit.map(a => ({
        id: id(a.id), document_id: text(a.document_id ?? '', 'Documento de auditoría', 80), actor: text(a.actor, 'Autor de auditoría', 250, true),
        action: text(a.action, 'Acción de auditoría', 100, true), detail: text(a.detail ?? '', 'Detalle de auditoría', 10000), created_at: text(a.created_at ?? timestamp, 'Fecha de auditoría', 60, true),
      }));
      const normalizedChoices: Row[] = rawChoices.map(c => {
        const choiceProduct = id(c.product_id); const choiceDocument = id(c.document_id);
        if (!productIds.has(choiceProduct) || !documentIds.has(choiceDocument)) fail(400, 'Una referencia elegida en el respaldo apunta a un producto o documento inexistente.');
        return { id: id(c.id), product_id: choiceProduct, reference_date: text(c.reference_date, 'Fecha de referencia', 20, true), document_id: choiceDocument, line_id: text(c.line_id, 'Línea de referencia', 200, true), reason: text(c.reason, 'Motivo de referencia', 1000, true), chosen_by: text(c.chosen_by, 'Autor de referencia', 250, true), created_at: text(c.created_at ?? timestamp, 'Fecha de referencia elegida', 60, true) };
      });
      const aliasIdentities=new Set<string>();const normalizedAliases:Row[]=rawAliases.map(a=>{const productId=id(a.product_id),documentId=id(a.document_id),supplierName=text(a.supplier_name,'Proveedor de descripción',200,true),description=text(a.description,'Descripción del proveedor',500,true),key=JSON.stringify([normalize(supplierName),aliasKey(description),productId]);if(!productIds.has(productId)||!documentIds.has(documentId))fail(400,'Una descripción vinculada apunta a un producto o documento inexistente.');if(aliasIdentities.has(key))fail(400,'Hay descripciones vinculadas repetidas en el respaldo.');aliasIdentities.add(key);return {id:id(a.id),supplier_key:normalize(supplierName),supplier_name:supplierName,description,description_key:aliasKey(description),product_id:productId,document_id:documentId,confirmed_by:text(a.confirmed_by,'Autor de la vinculación',250,true),updated_at:text(a.updated_at,'Fecha de vinculación',60,true)};});
      const normalizedProducts: Row[] = rawProducts.map(p => ({
        id: id(p.id),
        name: text(p.name, 'Producto restaurado', 250, true),
        brand: text(p.brand ?? '', 'Marca restaurada', 150),
        content: text(p.content ?? '', 'Contenido restaurado', 120),
        barcode: text(p.barcode ?? '', 'Código de barras restaurado', 100),
        presentation: text(p.presentation ?? '', 'Presentación restaurada', 200),
        comparison_unit: text(p.comparison_unit ?? '', 'Unidad restaurada', 80),
        units_per_pack: decimal(p.units_per_pack ?? '', 'Unidades restauradas'),
        tax_rate: decimal(p.tax_rate ?? '', 'IVA restaurado', 100),
        sale_price: optionalPrice(p.sale_price ?? '', 'Precio de venta restaurado'),
        inner_units:innerCount(p.inner_units??''),inner_unit_label:text(p.inner_unit_label??'','Unidad interior restaurada',60),contents_mode:text(p.contents_mode??(p.inner_units?'multiple':''),'Tipo de presentación restaurado',20),
        category: text(p.category ?? '', 'Categoría restaurada', 120),
        created_at: text(p.created_at ?? timestamp, 'Fecha creación producto', 60, true),
        updated_at: text(p.updated_at ?? timestamp, 'Fecha edición producto', 60, true),
      }));
      for(const product of normalizedProducts){if(!!product.inner_units!==!!product.inner_unit_label)fail(400,'Un contenido interior del respaldo está incompleto.');if(product.contents_mode&&!['single','multiple'].includes(str(product.contents_mode)))fail(400,'Un tipo de presentación del respaldo es inválido.');}
      const seenSupplierCodes = new Set<string>();
      const normalizedSupplierProducts: Row[] = rawSupplierProducts.map(sp => {
        const spId = id(sp.id);
        const sName = text(sp.supplier_name, 'Proveedor de código restaurado', 200, true);
        const sKey = normalize(sName);
        const sCode = text(sp.supplier_code, 'Código de proveedor restaurado', 100, true);
        const pId = id(sp.product_id);
        if (!productIds.has(pId)) fail(400, 'Un código de proveedor en el respaldo apunta a un producto inexistente.');
        const composite = `${sKey}::${sCode}`;
        if (seenSupplierCodes.has(composite)) fail(400, 'El respaldo contiene códigos repetidos para el mismo proveedor.');
        seenSupplierCodes.add(composite);
        return {
          id: spId,
          supplier_key: sKey,
          supplier_name: sName,
          supplier_code: sCode,
          supplier_description: text(sp.supplier_description ?? '', 'Descripción de proveedor restaurada', 500),
          product_id: pId,
          created_at: text(sp.created_at ?? timestamp, 'Fecha creación código', 60, true),
          updated_at: text(sp.updated_at ?? timestamp, 'Fecha edición código', 60, true),
        };
      });
      for (const d of rawDocuments) {
        const docStatus = str(d.status);
        if (!['draft', 'confirmed', 'cancelled', 'discarded'].includes(docStatus) || !Number.isInteger(d.version) || Number(d.version) < 1) fail(400, 'El respaldo contiene un estado de documento inválido.');
        let data: InvoiceInput; try { data = JSON.parse(str(d.data)) as InvoiceInput; } catch { fail(400, 'Hay un documento ilegible en el respaldo.'); }
        if (!data || !['invoice', 'delivery', 'order'].includes(data.kind) || !Array.isArray(data.lines) || data.lines.length > 200) fail(400, 'Un documento del respaldo no tiene estructura válida.');
        const restoredSupplier = text(data.supplier ?? '', 'Proveedor restaurado', 200);
        d.kind = data.kind; d.supplier = restoredSupplier; d.supplier_key = normalize(restoredSupplier); d.number = text(data.number ?? '', 'Número restaurado', 100); d.date = text(data.date ?? '', 'Fecha restaurada', 20); d.seller = text(data.seller ?? '', 'Vendedor restaurado', 200); d.total = String(data.total ?? ''); d.related_id = data.relatedId || ''; d.update_token = uuid();
        const validation = validateInvoice(data);
        if (docStatus === 'confirmed' && !validation.valid) fail(400, 'Un documento confirmado no supera la revisión de cálculos del respaldo.');
        for (const line of data.lines || []) if (docStatus === 'confirmed' && line.productId && !productIds.has(line.productId)) fail(400, 'El respaldo hace referencia a un producto inexistente en una compra confirmada.');
        d.validation = JSON.stringify(validation);
        if (str(d.related_id) && !documentIds.has(str(d.related_id))) fail(400, 'El respaldo tiene documentos relacionados faltantes.');
        if (str(d.review_of) && !documentIds.has(str(d.review_of))) fail(400, 'Falta el original de una corrección en el respaldo.');
      }
      const uploadKeys: string[] = []; const restoredFiles: Row[] = []; const restoredContents = new Map<string, { fileId: string; hash: string; type: string; size: number }>(); let bytesTotal = 0;
      const attachments = copyAttachments as Row[];
      try {
        for (const f of rawFiles) {
          if(f.detached!==undefined&&f.detached!==0&&f.detached!==1)fail(400,'El respaldo contiene un estado de adjunto inválido.');f.detached=f.detached??0;
          const fId = id(f.id); if (!documentIds.has(str(f.document_id))) fail(400, 'Un archivo del respaldo no tiene documento.');
          const contentId = str(f.contentId || fId);
          const attachment = attachments.find(a => str(a.fileId) === contentId); if (!attachment || typeof attachment.base64 !== 'string') fail(400, 'El respaldo está incompleto: faltan adjuntos.');
          const cached = restoredContents.get(contentId);
          const fHash = str(f.sha256); const fType = str(f.type);
          if (cached) { if (cached.hash !== fHash || cached.type !== fType) fail(400, 'Un adjunto compartido no coincide con su huella digital.'); restoredFiles.push({ ...f, key: `reference:${cached.fileId}:${fId}`, size: cached.size }); continue; }
          const bytes = decode64(attachment.base64); bytesTotal += bytes.length;
          if (!bytes.length || bytes.length > MAX_FILE || bytesTotal > 12 * 1024 * 1024) fail(413, 'Los adjuntos superan el límite de restauración.');
          if (sniff(bytes) !== fType || await digest(bytes) !== fHash) fail(400, 'Un adjunto está alterado o no coincide con su huella digital.');
          const key = `originals/restored/${uuid()}`; uploadKeys.push(key); await bucket.put(key, bytes, { httpMetadata: { contentType: fType } }); restoredFiles.push({ ...f, key, size: bytes.length }); restoredContents.set(contentId, { fileId: fId, hash: fHash, type: fType, size: bytes.length });
        }
        const columns: Record<typeof BACKUP_TABLES[number], string[]> = {
          suppliers: ['id', 'name', 'name_key', 'created_at'],
          products: ['id', 'name', 'category', 'brand', 'content', 'barcode', 'presentation', 'comparison_unit', 'units_per_pack', 'tax_rate', 'sale_price', 'inner_units', 'inner_unit_label', 'contents_mode', 'created_at', 'updated_at'],
          supplier_products: ['id', 'supplier_key', 'supplier_name', 'supplier_code', 'supplier_description', 'product_id', 'created_at', 'updated_at'],
          product_aliases: ['id','supplier_key','supplier_name','description','description_key','product_id','document_id','confirmed_by','updated_at'],
          documents: ['id', 'version', 'status', 'kind', 'supplier', 'supplier_key', 'number', 'date', 'seller', 'total', 'data', 'validation', 'related_id', 'review_of', 'operation_id', 'update_token', 'created_at', 'updated_at', 'created_by', 'updated_by'],
          reference_choices: ['id', 'product_id', 'reference_date', 'document_id', 'line_id', 'reason', 'chosen_by', 'created_at'],
          files: ['detached', 'id', 'document_id', 'name', 'type', 'size', 'key', 'sha256', 'created_at'],
          audit: ['id', 'document_id', 'actor', 'action', 'detail', 'created_at'],
        };
        const rowsByTable: Record<typeof BACKUP_TABLES[number], Row[]> = {
          suppliers: normalizedSuppliers,
          products: normalizedProducts,
          supplier_products: normalizedSupplierProducts,
          product_aliases: normalizedAliases,
          documents: rawDocuments,
          reference_choices: normalizedChoices,
          files: restoredFiles,
          audit: normalizedAudit,
        };
        const statements: D1PreparedStatement[] = [];
        // The unique singleton guard prevents two restores or a concurrent first write.
        statements.push(db.prepare("INSERT INTO settings(key,value) VALUES('restore_lock',(SELECT CASE WHEN (SELECT COUNT(*) FROM documents)+(SELECT COUNT(*) FROM products)+(SELECT COUNT(*) FROM suppliers)+(SELECT COUNT(*) FROM supplier_products)+(SELECT COUNT(*) FROM files)+(SELECT COUNT(*) FROM product_aliases)=0 THEN ? ELSE NULL END))").bind(uuid()));
        for (const table of BACKUP_TABLES) for (const row of rowsByTable[table]) {
          const fields = columns[table];
          statements.push(db.prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`).bind(...fields.map(f => (row[f] ?? null) as SqlParam)));
        }
        for (const doc of rawDocuments) if (doc.kind === 'invoice' && doc.status === 'confirmed') {
          const input = JSON.parse(str(doc.data)) as InvoiceInput; const validation = JSON.parse(str(doc.validation)) as ReturnType<typeof validateInvoice>;
          for (const line of input.lines) {
            if (!line.productId) continue;
            const computed = validation.lines.find(item => item.id === line.id);
            const promotion = line.promotion || Number(line.bonusQuantity || 0) > 0 || Number(line.discountPercent || 0) > 0 || Number(line.discountAmount || 0) > 0;
            const lineCode = text(line.supplierCode ?? '', 'Código del proveedor restaurado', 100);
            statements.push(db.prepare('INSERT INTO document_products(document_id,line_id,product_id,unit_cost,net_unit_cost,units_per_pack,tax_rate,supplier_code,promotion) VALUES(?,?,?,?,?,?,?,?,?)').bind(str(doc.id), line.id, line.productId, computed?.unitCost ?? null, computed?.netUnitCost ?? null, line.unitsPerPack || '', line.taxRate || '', lineCode, promotion ? 1 : 0));
          }
        }
        statements.push(auditStatement('restored', 'Respaldo completo restaurado; usuarios conservados de la tienda destino'));
        await db.batch(statements);
      } catch (error) { for (const key of uploadKeys) await bucket.delete(key); throw error; }
      return saved({ restored: true, documents: rawDocuments.length, products: normalizedProducts.length, files: restoredFiles.length });
    }
    if (request.method === 'GET' && parts[0] === 'export') {
      const rows = await all('SELECT id,status,kind,supplier,number,date,seller,total FROM documents ORDER BY date DESC,id LIMIT 20001');
      if (rows.length > 20000) fail(413, 'La exportación supera 20.000 documentos. Solicita una exportación del almacenamiento.');
      const keys = ['id', 'status', 'kind', 'supplier', 'number', 'date', 'seller', 'total'];
      const content = '\ufeff' + [keys.map(csvCell).join(','), ...rows.map(row => keys.map(k => csvCell(row[k])).join(','))].join('\r\n');
      return new Response(content, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="documentos-tienda.csv"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return json({ error: 'Esta función no existe.' }, 404);
  } catch (error) {
    if(error instanceof GeminiError)return json({error:error.message,code:error.code,providerStatus:error.providerStatus,retryAfterSeconds:error.retryAfterSeconds,retryable:error.retryable},error.status);
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    const message = String((error as Error)?.message || '');
    if (/UNIQUE constraint|unique constraint|SQLITE_CONSTRAINT/i.test(message)) return json({ error: 'Ya existe un registro con ese número, código o identificador. Revisa posibles duplicados.' }, 409);
    return json({ error: 'No se pudo completar la operación. Conserva el borrador e intenta de nuevo. Si el problema continúa, avisa al encargado.' }, 500);
  }
}
