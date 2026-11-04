import {calculatePriceReferences,calculateInnerUnitCost,validateInvoice,productCostIssues,purchaseCostIssues,type InvoiceInput,type ProductCandidate} from './calculations.ts';
import {suggestInnerContents} from './ocr.ts';

type Row=Record<string,unknown>;
const str=(value:unknown)=>value==null?'':String(value);
export const aliasKey=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g,' ');
const words=(value:string)=>new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d)\s+(ml|kg|gr|g|l)\b/g,'$1$2').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(w=>w.length>1&&!['de','del','la','el','las','los','un','una','por'].includes(w)));

export function similarProducts(description:string,products:Row[]):ProductCandidate[]{
 const query=words(description);if(!query.size)return [];
 return products.map(product=>{const tokens=words([product.name,product.brand,product.content].map(str).join(' ')),common=[...query].filter(w=>tokens.has(w)).length,exact=aliasKey(description)===aliasKey(str(product.name));
  return {product,common,score:exact?1000:Math.floor(200*common/(query.size+tokens.size||1)),exact};
 }).filter(item=>item.exact||(item.common>=2&&item.score>=55)).sort((a,b)=>b.score-a.score||str(a.product.id).localeCompare(str(b.product.id))).slice(0,5).map(({product,exact})=>candidate(product,exact?'Mismo nombre en el catálogo; revisa la presentación.':'Nombre parecido; compara marca, tamaño y variante.',exact?'exact_name':'similar_name'));
}
function candidate(row:Row,reason:string,matchSource:ProductCandidate['matchSource']):ProductCandidate{return {matchSource,id:str(row.id),name:str(row.name),brand:str(row.brand),content:str(row.content),presentation:str(row.presentation),reason};}
export async function productMatches(db:D1Database,supplier:string,description:string,supplierCode='',catalog?:Row[]):Promise<ProductCandidate[]>{
 const key=aliasKey(supplier),matches:ProductCandidate[]=[];
 if(key&&supplierCode){const row=await db.prepare('SELECT p.* FROM products p JOIN supplier_products sp ON sp.product_id=p.id WHERE sp.supplier_key=? AND sp.supplier_code=?').bind(key,supplierCode).first<Row>();if(row)matches.push(candidate(row,'Código ya vinculado por este proveedor.','supplier_code'));}
 if(key&&description){const rows=await db.prepare('SELECT DISTINCT p.* FROM products p JOIN product_aliases a ON a.product_id=p.id WHERE a.supplier_key=? AND (a.description_key=? OR a.description=?) ORDER BY p.id LIMIT 6').bind(key,aliasKey(description),description.trim()).all<Row>();for(const row of rows.results)if(!matches.some(m=>m.id===row.id))matches.push(candidate(row,'Descripción de este proveedor vinculada en una factura revisada.','supplier_description'));}
 const exact=await db.prepare('SELECT id,name,brand,content,presentation FROM products WHERE lower(trim(name))=? ORDER BY id LIMIT 6').bind(aliasKey(description)).all<Row>();for(const row of exact.results)if(!matches.some(m=>m.id===row.id))matches.push(candidate(row,'Mismo nombre en el catálogo; compara contenido y presentación.','exact_name'));
 const tokens=[...words(description)].sort((a,b)=>b.length-a.length).slice(0,4);
 const available=catalog||(tokens.length?(await db.prepare('SELECT id,name,brand,content,presentation FROM products WHERE '+tokens.map(()=>"(name LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')").join(' OR ')+' ORDER BY name,id LIMIT 200').bind(...tokens.flatMap(token=>{const like='%'+token.replace(/[\\%_]/g,'\\$&')+'%';return [like,like,like];})).all<Row>()).results:[]);
 for(const match of similarProducts(description,available))if(!matches.some(m=>m.id===match.id))matches.push(match);
 return matches.slice(0,5);
}

/** Última fecha del documento; un empate queda pendiente salvo elección explícita vigente. Nunca ordena dinero con float. */
export async function latestPurchases(db:D1Database,productIds:string[],supplierKeys?:string[]):Promise<Map<string,Row>>{
 if(!productIds.length||supplierKeys?.length===0)return new Map();
 const scoped=!!supplierKeys,params=[...productIds,...(supplierKeys||[])],where=`p.product_id IN (${productIds.map(()=>'?').join(',')})${scoped?` AND d.supplier_key IN (${supplierKeys!.map(()=>'?').join(',')})`:''}`;
 const fields:Record<string,string>={documentId:'d.id',lineId:'p.line_id',number:'d.number',supplier:'d.supplier',seller:'d.seller',unitCost:'p.unit_cost',netUnitCost:'p.net_unit_cost',unitsPerPack:'p.units_per_pack',supplierCode:'p.supplier_code'};
 const columns=Object.entries(fields).map(([key,column])=>`CASE WHEN COUNT(*)=1 THEN MAX(${column}) ELSE MAX(CASE WHEN d.id=rc.document_id AND p.line_id=rc.line_id THEN ${column} END) END AS ${key}`).join(',');
 const result=await db.prepare(`WITH latest AS(SELECT p.product_id${scoped?',d.supplier_key':''},MAX(d.date) latest_date FROM document_products p JOIN documents d ON d.id=p.document_id WHERE ${where} AND d.status='confirmed' AND d.kind='invoice' GROUP BY p.product_id${scoped?',d.supplier_key':''}) SELECT p.product_id productId${scoped?',d.supplier_key supplierKey':''},latest.latest_date date,COUNT(*) candidates,${columns},MAX(rc.reason) referenceReason FROM latest JOIN document_products p ON p.product_id=latest.product_id JOIN documents d ON d.id=p.document_id AND d.date=latest.latest_date${scoped?' AND d.supplier_key=latest.supplier_key':''} LEFT JOIN reference_choices rc ON rc.product_id=p.product_id AND rc.reference_date=d.date WHERE d.status='confirmed' AND d.kind='invoice' GROUP BY p.product_id${scoped?',d.supplier_key':''},latest.latest_date`).bind(...params).all<Row>();
 const originals=new Map<string,InvoiceInput|null>();
 for(const row of result.results){if(!row.documentId)continue;const documentId=str(row.documentId);if(!originals.has(documentId)){const original=await db.prepare('SELECT data FROM documents WHERE id=?').bind(documentId).first<Row>();try{originals.set(documentId,JSON.parse(str(original?.data)) as InvoiceInput);}catch{originals.set(documentId,null);}}
  const original=originals.get(documentId),line=original?.lines?.find(line=>line.id===row.lineId);row.sourceLine=line;row.reviewIssues=line?purchaseCostIssues(line):['Falta la línea original para comprobar la unidad del costo.'];
  if(row.unitCost!=null&&row.netUnitCost==null){try{row.netUnitCost=original?validateInvoice(original).lines.find(line=>line.id===row.lineId)?.netUnitCost??null:null;}catch{row.netUnitCost=null;}}
 }
 return new Map(result.results.map(row=>[scoped?JSON.stringify([row.productId,row.supplierKey]):str(row.productId),row]));
}
export function purchaseSummary(product:Row,row?:Row){
 const issues=[...productReview(product).issues,...(Array.isArray(row?.reviewIssues)?row.reviewIssues as string[]:[]),...(row?.sourceLine?productContentIssues(product,row.sourceLine as InvoiceInput['lines'][number]):[])],safe=issues.length===0;
 const references=calculatePriceReferences({unitCost:!safe||row?.unitCost==null?null:str(row.unitCost),netUnitCost:!safe||row?.netUnitCost==null?null:str(row.netUnitCost),salePrice:str(product.sale_price),base:'gross'});
 return {status:!safe?'pending':!row?'none':!row.documentId?'ambiguous':!references.baseCost?'pending':'ready',issues,date:str(row?.date),candidates:Number(row?.candidates||0),documentId:str(row?.documentId),lineId:str(row?.lineId),number:str(row?.number),supplier:str(row?.supplier),seller:str(row?.seller),unitCost:references.baseCost,netUnitCost:!safe||row?.netUnitCost==null?null:str(row.netUnitCost),unitsPerPack:str(row?.unitsPerPack),referenceReason:str(row?.referenceReason),references,inner:calculateInnerUnitCost(references.baseCost,!safe||row?.netUnitCost==null?null:str(row.netUnitCost),str(product.inner_units),str(product.inner_unit_label))};
}
export function productReview(product:Row){
 const issues=[...productCostIssues({name:str(product.name),category:str(product.category),presentation:str(product.presentation),comparisonUnit:str(product.comparison_unit),unitsPerPack:str(product.units_per_pack),contentsMode:str(product.contents_mode),innerUnits:str(product.inner_units),innerUnitLabel:str(product.inner_unit_label)}),...productContentIssues(product,{description:str(product.presentation)})];
 return {status:issues.length?'pending':'ready',issues};
}
/** Si el texto identifica el contenido de la misma presentación, debe coincidir con la ficha. */
export function productContentIssues(product:Row,line:Pick<InvoiceInput['lines'][number],'description'|'sourceText'>){
 const explicit=suggestInnerContents(line.description)||suggestInnerContents(line.sourceText||'');if(!explicit||aliasKey(str(product.comparison_unit))!==explicit.costUnit)return [];
 if(product.contents_mode!=='multiple'||str(product.inner_units)!==explicit.quantity)return ['El documento indica '+explicit.quantity+' '+explicit.unitLabel+' por '+explicit.costUnit+', pero la ficha tiene otro contenido. Revisa la presentación antes de usar sus costos.'];
 return [];
}
