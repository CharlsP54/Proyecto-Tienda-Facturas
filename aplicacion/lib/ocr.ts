import { deriveExtractedUnitPrice, multiplyExtractedAmount, parsePrintedTaxSummary, resolvePurchaseColumns, innerUnitCount, type PrintedTaxGroup, type PurchaseColumns, type PurchaseReading } from './calculations.ts';

export type ExtractedLineData = {
  id: string; supplierCode: string; description: string; quantity: string; unitPrice: string;
  discountPercent: string; discountAmount: string; taxRate: string; lineTotal: string;
  unitsPerPack: string; bonusQuantity: string; promotion: boolean; category: string;
  sourceText: string; taxAmount?: string; otherTax?: string; otherTaxInBase?: boolean;
  matchSource?: 'learned_code' | 'learned_description' | 'catalog' | 'new'; productId?: string;
  suggestedProductId?: string;
  purchaseColumns?:PurchaseColumns;purchaseReading?:PurchaseReading;grossLineTotal?:string;
  costUnit?:string;contentsMode?:'single'|'multiple'|'';innerUnits?:string;innerUnitLabel?:string;
  contentWarning?:string;
};
export type FullExtractionData = {
  kind?: 'invoice' | 'delivery' | 'order'; supplier?: string; supplierRuc?: string;
  number?: string; date?: string; seller?: string; total?: string; taxTotal?: string;
  wordsTotal?: string; discount?: string; lines: ExtractedLineData[]; warnings?: string[];
  taxSummary?:PrintedTaxGroup[];
};
export type RecognitionResult = {
  text: string; confidence: number;
  suggestions: Partial<Record<'number'|'date'|'total'|'taxTotal'|'wordsTotal'|'supplier'|'supplierRuc',string>>;
  lines?: ExtractedLineData[];
};
const norm = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const numeric = (s:string) => /^\d+(?:[.,]\d{1,6})?$/.test(s.replace(/\$/g,'').trim()) ? s.replace(/\$/g,'').trim().replace(',','.') : '';
const moneyToken = /^\$?\d+(?:[.,]\d{1,6})?%?$/;

/** Conserva bases rotuladas con porcentaje; no confunde «no sujeto» o «exento» con 0 %. */
export function extractTaxSummary(text:string):PrintedTaxGroup[]{
 const found:PrintedTaxGroup[]=[];
 for(const row of text.replace(/\r/g,'').split('\n')){const match=norm(row).match(/\b(?:subtotal|base(?:\s+imponible)?)(?:\s+tarifa)?\s*(\d{1,3}(?:[.,]\d{1,6})?)\s*%\s*[:$|\t ]*\$?\s*(\d{1,9}[.,]\d{2})\s*(?:usd)?\s*[|]?\s*$/);if(!match)continue;
  try{const group=parsePrintedTaxSummary([{taxRate:numeric(match[1]),base:numeric(match[2])}])[0];if(!found.some(old=>old.taxRate===group.taxRate&&old.base===group.base))found.push(group);}catch{/* Un subtotal ilegible permanece sin propuesta. */}
 }
 return found;
}

/** La categoría es una sugerencia comercial; nunca determina impuestos. */
export function suggestCategory(description:string):string {
  const s=norm(description);
  const rules:[RegExp,string][]=[[/shampoo|champu|jabon|desodorante|sachet.*h&s|dentifrico|cepillo dental/,'Cuidado personal'],[/detergente|cloro|lejia|lavavajilla|suavizante|limpiador|sanson/,'Limpieza'],[/galleta|caramelo|chocolate|bombon|bon bon|chocoman|wafer|snack|nikolo|piazza|nucita/,'Dulces y snacks'],[/gaseosa|bebida|agua |jugo|refresco/,'Bebidas'],[/leche|yogur|queso/,'Lácteos'],[/aceite|arroz|fideo|harina|atun|sal |azucar|sazonador|comino|canela|salsa/,'Alimentos y condimentos']];
  return rules.find(([pattern])=>pattern.test(s))?.[1]||'';
}

/** Una rotulación explícita permite proponer promoción, nunca un costo de reposición cero. */
export function isExplicitPromotion(description:string,total:string):boolean {
 return /\bpromo(?:cion)?\b|bonificacion|gratis/.test(norm(description))&&/^0(?:[.,]0+)?$/.test(total);
}
/** Solo sugiere un contenido interior con rótulo inequívoco; la persona debe guardarlo en el catálogo. */
export function suggestInnerContents(description:string){
 const match=norm(description).match(/\b(cajita|caja|display|paquete|funda)\s+(?:x\s*|de\s+|con\s+)?(\d{1,6})\s*(sobres?|botellas?|fundas?|unidades?|piezas?|chupetes?|caramelos?|galletas?|tabletas?|sachets?)\b/);if(!match)return null;
 return {costUnit:match[1],quantity:match[2],unitLabel:match[3]==='unidades'?'unidad':match[3].replace(/s$/,'')};
}
/** Propuesta de contenido explícito: nunca se utiliza como factor de recepción ni oculta contradicciones. */
export function productReadingDetails(line:ExtractedLineData):Partial<ExtractedLineData>{
 const proposed=suggestInnerContents(line.description)||suggestInnerContents(line.sourceText);if(!proposed){
  const chained=/\b\d+\s*[x×]\s*\d+/i.test(line.description)&&!/[x×]\s*\d+\s*(?:cm|mm|metros?)\b/i.test(line.description);
  if(chained||line.contentsMode==='multiple')return {contentsMode:'',innerUnits:'',innerUnitLabel:'',contentWarning:'El contenido no tiene un nivel de empaque inequívoco. Una cadena como 24X28 no indica cuál cifra corresponde a la funda; confirma el contenido antes de publicar.'};
  return /^(?:un|uni|und|u)$/i.test(line.costUnit||'')?{costUnit:'unidad'}:{};
 }
 const unit=line.costUnit?.trim()||'',generic=/^(?:un|uni|und|u|unidad(?:es)?)$/i.test(unit),columns=line.purchaseColumns;
 const unitReceipt=columns&&(/^(?:un|uni|und|u|unidad(?:es)?)$/i.test(columns.unitLabel.trim())||columns.boxes==='0'&&!!columns.units);
 let count='';try{count=innerUnitCount(line.innerUnits||'');}catch{count='invalid';}
 if(count&&count!==proposed.quantity||line.contentsMode==='single'||unit&&!generic&&norm(unit)!==proposed.costUnit)return {contentsMode:'',innerUnits:'',innerUnitLabel:'',contentWarning:'El contenido leído contradice la presentación explícita del nombre. Confirma la unidad comprada y su contenido; no se eligió una cifra para completar el producto.'};
 if((!unit||generic)&&!unitReceipt)return {costUnit:'',contentsMode:'multiple',innerUnits:line.innerUnits||proposed.quantity,innerUnitLabel:line.innerUnitLabel||proposed.unitLabel,contentWarning:'Se identificó contenido interior, pero falta comprobar qué presentación corresponde al precio.'};
 return {costUnit:!unit||generic?proposed.costUnit:unit,contentsMode:'multiple',innerUnits:line.innerUnits||proposed.quantity,innerUnitLabel:line.innerUnitLabel||proposed.unitLabel,contentWarning:'Contenido propuesto desde un rótulo explícito: '+proposed.quantity+' '+proposed.unitLabel+' por '+proposed.costUnit+'. Revisa la presentación; no cambia las unidades recibidas.'};
}
export function extractSuggestions(text:string):RecognitionResult['suggestions'] {
  const out:RecognitionResult['suggestions']={}; const textLines=text.replace(/\r/g,'').split('\n');
  const n=textLines.join('\n');
  const number=n.match(/(?:factura|nota\s+de\s+entrega|n[uú]mero|no\.?)[^\n\d]{0,24}(\d{3}[- ]\d{3}[- ]\d{6,9})/i);
  if(number)out.number=number[1].replace(/ /g,'-');
  const date=n.match(/(?:emisi[oó]n|fecha(?:\s+del\s+pedido)?)[^\n\d]{0,16}(\d{4})[-/](\d{2})[-/](\d{2})/i);
  const local=!date&&n.match(/(?:emisi[oó]n|fecha(?:\s+del\s+pedido)?)[^\n\d]{0,16}(\d{2})[-/](\d{2})[-/](\d{4})/i);
  const d=date?`${date[1]}-${date[2]}-${date[3]}`:local?`${local[3]}-${local[2]}-${local[1]}`:'';
  if(d){const v=new Date(d+'T12:00:00Z');if(Number.isFinite(v.valueOf())&&v.toISOString().slice(0,10)===d)out.date=d;}
  const totals=[...n.matchAll(/(?:^|\n)\s*(?:valor\s+a\s+pagar|total\s+a\s+pagar|total)\s*[:$]?\s*\$?\s*(\d{1,8}[.,]\d{2})\s*(?:USD)?\s*(?=$|\n)/gi)];
  if(totals.length===1)out.total=totals[0][1].replace(',','.');
  const taxes=[...n.matchAll(/(?:^|\n)\s*(?:total\s+)?I\.?V\.?A\.?\s*(?:\d{1,2}\s*%)?\s*[:$]?\s*(\d{1,8}[.,]\d{2})\s*(?=$|\n)/gi)];
  if(taxes.length===1)out.taxTotal=taxes[0][1].replace(',','.');
  const words=n.match(/(?:^|\n)\s*(?:son|valor\s+en\s+letras|importe\s+en\s+letras)\s*:?\s*([^\n]+(?:\d{1,2}\s*\/\s*100)[^\n]*)/i);
  if(words)out.wordsTotal=words[1].trim();
  // Solo se busca identidad en cabecera, antes de los datos del comprador.
  const header:string[]=[];
  for(const line of textLines.slice(0,45)){
    if(/\b(?:cliente|señores|senores|raz[oó]n\s+social\s+del\s+cliente)\s*:/i.test(line))break;
    if(/(?:cant(?:idad)?|c[oó]digo).*?(?:descripci[oó]n|producto|art[ií]culo)/i.test(line))break;
    header.push(line);
  }
  const h=header.join('\n');
  const ruc=h.match(/R\.?\s*U\.?\s*C\.?\s*[:]?\s*(\d{13})\b/i);if(ruc)out.supplierRuc=ruc[1];
  const labeled=h.match(/(?:^|\n)\s*(?:proveedor|emisor|raz[oó]n\s+social)\s*:\s*([^\n]{3,200})/i);
  const named=header.map(l=>l.trim()).find(l=>l.length>=4&&l.length<=200&&/distribuidora|comercializadora|industrial|industrias|\bcoile\b|\bS\.?\s*A\.?\b/i.test(l)&&!/(?:correo|email|direcci[oó]n|cliente|@|www\.)/i.test(l));
  if(labeled||named)out.supplier=(labeled?.[1]||named||'').trim();
  return out;
}

type Col='code'|'barcode'|'quantity'|'description'|'price'|'discount'|'percent'|'tax'|'total'|'unit'|'category'|'pvp'|'netprice'|'unitDiscount'|'other'|'boxes'|'looseUnits'|'totalQuantity'|'packFactor'|'netTotal'|'grossTotal';
function column(s:string):Col {
 const n=norm(s).replace(/[.]/g,'');
 if(/^caj(?:a|as)?$/.test(n.trim()))return 'boxes';if(/^(?:uni|uds|unidades sueltas)$/.test(n.trim()))return 'looseUnits';if(/^t\s*cant|total\s*cant|cant.*total/.test(n))return 'totalQuantity';
 if(/fraccion|unid.*(?:por|x|\/)\s*(?:caj|pac|paq|disp)|factor|conversion/.test(n))return 'packFactor';if(/subtotal|sub total/.test(n))return 'netTotal';
 if(/pvp/.test(n))return 'pvp';if(/barras|auxiliar/.test(n))return 'barcode';
 if(/codigo|^cod\b/.test(n))return 'code';if(/cant|^qty|^unid.*comprad/.test(n))return 'quantity';
 if(/descrip|producto|articulo|detalle/.test(n))return 'description';if(/categoria/.test(n))return 'category';
 if(/iva|tarifa/.test(n))return 'tax';if(/(?:desc|dscto|dcto).*%|%.*(?:desc|dscto)/.test(n))return 'percent';
 if(/(?:desc|dscto|dcto).*unit/.test(n))return 'unitDiscount';if(/desc|dscto|dcto/.test(n))return 'discount';if(/total|importe/.test(n))return 'total';
 if(/precio|unitario|p unit|p lista/.test(n))return 'price';if(/^unid|^und|unidad|fraccion/.test(n))return 'unit';return 'other';
}
const splitCells=(s:string)=>s.trim().split(/\t+|\s{2,}|\s*\|\s*/).map(s=>s.trim()).filter(Boolean);

/** Ordena palabras por su posición real: el texto OCR plano puede leer primero una columna completa. */
export function arrangeOcrTsv(tsv: string): string {
 const words = tsv.split('\n').slice(1).flatMap(row => {
  const cell=row.split('\t');if(cell[0]!=='5'||!cell[11]?.trim())return [];
  const [x,y,width,height]=cell.slice(6,10).map(Number);
  return [x,y,width,height].every(Number.isFinite)?[{text:cell.slice(11).join('\t').trim(),x,y,width,height}]:[];
 });
 const rows:{center:number;height:number;words:typeof words}[]=[];
 for(const word of words.sort((a,b)=>a.y-b.y||a.x-b.x)){
  const center=word.y+word.height/2;
  let row=rows.find(r=>Math.abs(r.center-center)<=Math.max(4,Math.min(r.height,word.height)*0.55));
  if(!row){row={center,height:word.height,words:[]};rows.push(row);}row.words.push(word);
 }
 return rows.sort((a,b)=>a.center-b.center).map(row=>row.words.sort((a,b)=>a.x-b.x).map((word,index,all)=>{
  if(!index)return word.text;const prev=all[index-1],gap=word.x-prev.x-prev.width;
  return (gap>Math.max(12,row.height*0.8)?'\t':' ')+word.text;
 }).join('')).join('\n');
}
function emptyLine(index:number,raw:string):ExtractedLineData {return {id:`line-${index+1}`,supplierCode:'',description:'',quantity:'',unitPrice:'',discountPercent:'',discountAmount:'',taxRate:'',lineTotal:'',unitsPerPack:'',bonusQuantity:'',promotion:false,category:'',sourceText:raw,purchaseColumns:{unitLabel:'',boxes:'',units:'',total:'',packEvidence:''}};}

export function extractDocumentData(text:string):FullExtractionData {
 if(typeof text!=='string'||text.length>500000)throw new Error('El texto excede el límite de lectura. Divide el documento en archivos más pequeños.');
 const rows=text.replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(Boolean);
 const suggestions=extractSuggestions(text);const warnings:string[]=[];
 const out:FullExtractionData={...suggestions,taxSummary:extractTaxSummary(text),lines:[],warnings};
 if(/nota\s+de\s+entrega|documento\s+sin\s+valor\s+tributario/i.test(text))out.kind='delivery';
 else if(/fecha\s+del\s+pedido|orden\s+de\s+pedido|preventa/i.test(text))out.kind='order';
 else if(/factura/i.test(text))out.kind='invoice';
 const seller=text.match(/(?:^|\n)\s*(?:vendedor|usuario)\s*:\s*([^\n]{2,150})/i);if(seller)out.seller=seller[1].trim();
 const headerIndex=rows.findIndex(l=>(norm(l).match(/cantidad|\bcant\b|codigo|descrip|producto|articulo|precio|unitario|\btotal\b/g)||[]).length>=3);
 const header=headerIndex>=0?rows[headerIndex]:''; const cols=splitCells(header).map(column);
 if(/lista/i.test(header)&&cols.filter(c=>c==='price').length>1)cols[cols.lastIndexOf('price')]='netprice';
 if(cols.includes('netTotal'))cols.forEach((col,index)=>{if(col==='total')cols[index]='grossTotal';});
 const structured=cols.length>=4&&cols.includes('description')&&cols.some(col=>['quantity','looseUnits','totalQuantity'].includes(col))&&cols.includes('price');
 const profile=/p\.?\s*v\.?\s*p/i.test(header)?'pvp':/lista|%\s*d(?:esc|scto)/i.test(header)?'list':'standard';
 const start=headerIndex>=0?headerIndex+1:0;
 for(let i=start;i<rows.length;i++){
   const raw=rows[i];if(/^(?:subtotal|sub\s*total|base\b|iva\b|i\.v\.a|total\b|suman\b|valor\s+a\s+pagar|son\b|observaci[oó]n|autorizaci[oó]n|informaci[oó]n\s+adicional|forma\s+de\s+pago)/i.test(raw))break;
   if(/^(?:R\.?U\.?C|fecha|cliente|direcci[oó]n|tel[eé]fono|vendedor|p[aá]gina|factura|pedido|nota\s+de\s+entrega)\b/i.test(raw))continue;
   const line=emptyLine(out.lines.length,raw);const cells=splitCells(raw.replace(/^\*\s*/,''));
   if(structured&&cells.length===cols.length){
     cols.forEach((c,j)=>{const v=cells[j];switch(c){case 'code':line.supplierCode=v;break;case 'quantity':line.quantity=numeric(v);break;case 'boxes':line.purchaseColumns!.boxes=numeric(v);break;case 'looseUnits':line.purchaseColumns!.units=numeric(v);break;case 'totalQuantity':line.purchaseColumns!.total=numeric(v);line.quantity=numeric(v);break;case 'packFactor':{const amount=v.match(/^\d+(?:[.,]\d+)?/);if(amount){line.unitsPerPack=numeric(amount[0]);line.purchaseColumns!.packEvidence=splitCells(header)[j]+': '+v;}break;}case 'description':line.description=v;break;case 'price':line.unitPrice=numeric(v);break;case 'discount':line.discountAmount=numeric(v);break;case 'unitDiscount':break;case 'percent':line.discountPercent=numeric(v.replace('%',''));break;case 'tax':line.taxRate=numeric(v.replace('%',''));break;case 'total':case 'netTotal':line.lineTotal=numeric(v);break;case 'grossTotal':line.grossLineTotal=numeric(v);break;case 'unit':{const bought=v.match(/^(\d+(?:[.,]\d+)?)\s+(UN|UNI|UND|DP|CJ|CAJA|PAQ)\b/i);if(bought)line.quantity=numeric(bought[1]);line.purchaseColumns!.unitLabel=bought?.[2]||v;if(/^(?:UN|UNI|UND|UNIDAD(?:ES)?)$/i.test(v)||bought&&/^(UN|UNI|UND)$/i.test(bought[2]))line.unitsPerPack='1';break;}case 'category':line.category=v;break;}});
     const unitDiscount=cols.indexOf('unitDiscount');if(unitDiscount>=0)line.discountAmount=multiplyExtractedAmount(numeric(cells[unitDiscount]),line.quantity);
   }else{
     const tokens=raw.replace(/\s*\|\s*/g,' ').split(/\s+/);let end=tokens.length-1;const nums:string[]=[];
     while(end>=0&&moneyToken.test(tokens[end])){nums.unshift(tokens[end--]);}
     if(!nums.length)continue;
     const rest=tokens.slice(0,end+1);let begin=0;
     const isQty=(v:string|undefined)=>!!v&&/^\d{1,4}(?:[.,]\d{1,6})?$/.test(v);
     const isCode=(v:string|undefined)=>!!v&&/^[A-Z0-9_-]{2,30}$/i.test(v)&&/\d/.test(v);
     if(isQty(rest[0])){line.quantity=numeric(rest[0]);begin=1;if(isCode(rest[1])){line.supplierCode=rest[1];begin=2;}}
     else if(isCode(rest[0])){line.supplierCode=rest[0];begin=1;if(/^\d{13}$/.test(rest[1]||''))begin=2;if(isQty(rest[begin]))line.quantity=numeric(rest[begin++]);}
     let description=rest.slice(begin).join(' ');
     const qUnit=description.match(/\s(\d+(?:[.,]\d+)?)\s+(UN|UNI|UND|DP|CJ|CAJA|PAQ)\b(.*)$/i);
     if(!line.quantity&&qUnit){line.quantity=numeric(qUnit[1]);line.purchaseColumns!.unitLabel=qUnit[2];description=description.slice(0,qUnit.index);if(/^(?:UN|UNI|UND)$/i.test(qUnit[2]))line.unitsPerPack='1';}
     const explicitTax=description.match(/\s(\d{1,2}(?:[.,]\d+)?)\s+(UN|UNI|UND)$/i);
     if(explicitTax){line.taxRate=numeric(explicitTax[1]);line.unitsPerPack='1';line.purchaseColumns!.unitLabel=explicitTax[2];description=description.slice(0,explicitTax.index);}
     line.description=description.trim();line.lineTotal=numeric(nums.at(-1)||'');
     const pct=nums.find(v=>v.endsWith('%'));if(pct)line.taxRate=numeric(pct.slice(0,-1));
     const values=nums.filter(v=>!v.endsWith('%')).map(numeric);
     if(profile==='pvp'&&values.length>=4){line.unitPrice=values[values.length-3];line.discountAmount=multiplyExtractedAmount(values[values.length-2],line.quantity);}
     else if(profile==='list'&&values.length>=4){line.unitPrice=values[values.length-4];line.discountPercent=values[values.length-3];}
     else if(values.length>=3){line.unitPrice=values[values.length-3];line.discountAmount=values[values.length-2];}
     else if(values.length===2)line.unitPrice=values[0];
     else if(values.length===1&&line.quantity){line.unitPrice=deriveExtractedUnitPrice(line.lineTotal,line.quantity);if(line.unitPrice)warnings.push(`Producto ${out.lines.length+1}: precio calculado exactamente desde cantidad e importe; comprueba la presentación.`);}
   }
   if(!line.description||!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(line.description)||!line.lineTotal)continue;
   // Un RUC, una dirección o un pie de página con números no son productos.
   if(!line.quantity&&!line.unitPrice)continue;
   const purchase=resolvePurchaseColumns(line.quantity,line.unitsPerPack,line.purchaseColumns!);Object.assign(line,purchase);
   Object.assign(line,productReadingDetails(line));if(line.contentWarning)warnings.push(`Producto ${out.lines.length+1}: ${line.contentWarning}`);
   if(!line.category)line.category=suggestCategory(line.description);
   if(isExplicitPromotion(line.description,line.lineTotal)){line.promotion=true;warnings.push(`Producto ${out.lines.length+1}: el documento lo rotula como promoción; revisa su relación y asignación de costo.`);}
   if(line.category)warnings.push(`Producto ${out.lines.length+1}: categoría sugerida por descripción; revísala.`);
   if(!line.quantity||!line.unitPrice||!line.taxRate||!line.unitsPerPack)warnings.push(`Producto ${out.lines.length+1}: hay campos no legibles o no informados; revisa los marcados.`);
   out.lines.push(line);if(out.lines.length>200)throw new Error('El documento supera 200 productos. Divide el archivo antes de continuar.');
 }
 if(!out.lines.length)warnings.push('No se reconoció una tabla de productos con suficiente claridad. Reintenta la lectura con otra orientación o una imagen más nítida.');
 if(!out.supplier)warnings.push('No se pudo identificar el nombre del proveedor en la cabecera.');
 return out;
}

async function prepareImage(blob: Blob, rotation: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 35_000_000) throw new Error("La foto supera 35 megapíxeles. Usa una imagen más pequeña o registra los datos manualmente.");
    const canvas = document.createElement("canvas");
    const quarter = rotation % 180 !== 0;
    const longest=Math.max(bitmap.width,bitmap.height);
    const scale=longest<2200?Math.min(2.5,2200/longest):Math.min(1,3600/longest);
    canvas.width = Math.round((quarter ? bitmap.height : bitmap.width)*scale);
    canvas.height = Math.round((quarter ? bitmap.width : bitmap.height)*scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(scale,scale);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("No se pudo preparar la foto.")), "image/png"));
  } finally {
    bitmap.close();
  }
}

export async function recognizeImage(
  blob: Blob,
  rotation: number,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<RecognitionResult> {
  if (signal.aborted) throw new DOMException("Lectura cancelada", "AbortError");
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let expired = false;
  let lastProgress = 0;
  let stopped = false;
  let rejectStop: (reason: Error) => void = () => {};
  const stoppedPromise = new Promise<never>((_, reject) => { rejectStop = reject; });
  const abort = () => { stopped = true; if (worker) void worker.terminate(); rejectStop(new DOMException("Lectura cancelada", "AbortError")); };
  const timeout = setTimeout(() => { expired = true; abort(); }, 150_000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    const task = async (): Promise<RecognitionResult> => {
      const image = await prepareImage(blob, rotation);
      if (signal.aborted || stopped) throw new DOMException("Lectura cancelada", "AbortError");
      const created = await createWorker("spa", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        logger: message => {
          if (!stopped && message.status === "recognizing text") {
            lastProgress=Math.max(lastProgress,Math.min(99,Math.round((message.progress||0)*100)));onProgress(lastProgress);
          }
        }
      });
      worker = created;
      if (signal.aborted || stopped) { await created.terminate(); throw new DOMException("Lectura cancelada", "AbortError"); }
      await created.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:PSM.AUTO});
      const result = await created.recognize(image, {rotateAuto:true}, {text:true,tsv:true});
      if (signal.aborted || stopped) throw new DOMException("Lectura cancelada", "AbortError");
      onProgress(100);
      const text=result.data.tsv?arrangeOcrTsv(result.data.tsv):result.data.text;
      const suggestions = extractSuggestions(text);
      const full = extractDocumentData(text);
      return {
        text,
        confidence: result.data.confidence,
        suggestions,
        lines: full.lines,
      };
    };
    return await Promise.race([task(), stoppedPromise]);
  } catch (error) {
    if (signal.aborted) throw new DOMException("Lectura cancelada", "AbortError");
    if (expired) throw new Error("La lectura tardó demasiado. Puedes reintentar o ingresar los datos manualmente.");
    throw new Error(`No pudimos leer esta imagen. Puedes ingresar sus datos manualmente. ${error instanceof Error ? error.message : ""}`);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    const activeWorker = worker as Awaited<ReturnType<typeof createWorker>> | null;
    if (activeWorker) try { await activeWorker.terminate(); } catch {}
  }
}
