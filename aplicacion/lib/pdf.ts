import { sumExtractedAmounts, extractedTaxBaseIncludesCharges, parsePrintedTaxSummary } from './calculations.ts';
import { extractDocumentData, extractSuggestions, suggestCategory, isExplicitPromotion, recognizeImage, type FullExtractionData } from './ocr.ts';

type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };
export type DocumentReadResult = { text: string; data: FullExtractionData; pages: number; method: string };
export type ReadProgress = (message: string) => void;

/** Reconstruye renglones por coordenadas y conserva separadores de columna. */
export function arrangePdfText(items: TextItem[]): string {
  const rows: {y:number; items:TextItem[]}[]=[];
  for(const item of items){if(!item.str.trim())continue;const y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<2.5);if(!row){row={y,items:[]};rows.push(row);}row.items.push(item);}
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]).map((item,i,all)=>{
    if(!i)return item.str;const previous=all[i-1];const gap=item.transform[4]-previous.transform[4]-previous.width;return (gap>8?'\t':' ')+item.str;
  }).join('')).join('\n');
}
function textOf(root: Element|Document, tag:string):string{return root.getElementsByTagName(tag)[0]?.textContent?.trim()||'';}
/** Tabla 17 de la ficha SRI 2.34: los códigos 6 y 7 no representan tarifa 0 %. */
export function explicitXmlTaxRate(code:string,rate:string):string{return ['6','7'].includes(code)?'':rate;}
/** XML SRI: campos explícitos del emisor, detalle e impuestos; nunca se ejecuta contenido. */
export function readInvoiceXml(source:string):FullExtractionData {
 if(source.length>1000000||/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('XML no permitido: contiene declaraciones externas o supera el tamaño de lectura.');
 let doc=new DOMParser().parseFromString(source,'application/xml');
 if(doc.querySelector('parsererror'))throw new Error('El XML está incompleto o tiene un formato inválido.');
 const enclosed=textOf(doc,'comprobante');if(enclosed.trim().startsWith('<'))doc=new DOMParser().parseFromString(enclosed,'application/xml');
 if(doc.querySelector('parsererror')||/<!DOCTYPE|<!ENTITY/i.test(enclosed))throw new Error('El comprobante XML no es válido.');
 const info=doc.getElementsByTagName('infoTributaria')[0];const detail=doc.getElementsByTagName('infoFactura')[0];
 if(!info||!detail)throw new Error('Este XML no contiene una factura SRI reconocible.');
 const date=textOf(detail,'fechaEmision').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$2-$1');
 const parsed:FullExtractionData={kind:'invoice',supplier:textOf(info,'razonSocial')||textOf(info,'nombreComercial'),supplierRuc:textOf(info,'ruc'),number:[textOf(info,'estab'),textOf(info,'ptoEmi'),textOf(info,'secuencial')].filter(Boolean).join('-'),date,total:textOf(detail,'importeTotal'),lines:[],warnings:[]};
 for(const row of Array.from(doc.getElementsByTagName('detalle'))){const vat=Array.from(row.getElementsByTagName('impuesto')).find(t=>textOf(t,'codigo')==='2');const description=textOf(row,'descripcion');const others=Array.from(row.getElementsByTagName('impuesto')).filter(t=>textOf(t,'codigo')!=='2');const otherTax=others.length?sumExtractedAmounts(others.map(t=>textOf(t,'valor'))):'';parsed.lines.push({otherTax,otherTaxInBase:otherTax&&vat?extractedTaxBaseIncludesCharges(textOf(row,'precioTotalSinImpuesto'),otherTax,textOf(vat,'baseImponible')):undefined,id:`line-${parsed.lines.length+1}`,supplierCode:textOf(row,'codigoPrincipal'),description,quantity:textOf(row,'cantidad'),unitPrice:textOf(row,'precioUnitario'),discountAmount:textOf(row,'descuento'),discountPercent:'',taxRate:vat?textOf(vat,'tarifa'):'',taxAmount:vat?textOf(vat,'valor'):'',lineTotal:textOf(row,'precioTotalSinImpuesto'),unitsPerPack:'',bonusQuantity:'',promotion:isExplicitPromotion(description,textOf(row,'precioTotalSinImpuesto')),category:suggestCategory(description),sourceText:row.textContent?.trim().slice(0,2000)||''});}
 if(parsed.lines.length>200)throw new Error('El XML supera 200 productos.');
 // El IVA total se calcula después con el motor exacto; no se suma con Number.
 const taxes=Array.from(detail.getElementsByTagName('totalImpuesto')).filter(t=>textOf(t,'codigo')==='2');
 if(taxes.length)parsed.taxTotal=sumExtractedAmounts(taxes.map(t=>textOf(t,'valor')));
 const rates=new Map<string,string>();for(const tax of Array.from(doc.getElementsByTagName('impuesto'))){const rate=explicitXmlTaxRate(textOf(tax,'codigoPorcentaje'),textOf(tax,'tarifa'));if(textOf(tax,'codigo')==='2'&&rate)rates.set(textOf(tax,'codigoPorcentaje'),rate);}
 parsed.lines.forEach((line,index)=>{const vat=Array.from(doc.getElementsByTagName('detalle')[index].getElementsByTagName('impuesto')).find(tax=>textOf(tax,'codigo')==='2');if(vat&&['6','7'].includes(textOf(vat,'codigoPorcentaje'))){line.taxRate='';parsed.warnings?.push(`Producto ${index+1}: el XML indica ${textOf(vat,'codigoPorcentaje')==='6'?'no objeto de IVA':'exento de IVA'}. Requiere revisión específica; no se convirtió en tarifa 0 %.`);}});
 const explicit=taxes.filter(tax=>!['6','7'].includes(textOf(tax,'codigoPorcentaje'))).map(tax=>({taxRate:textOf(tax,'tarifa')||rates.get(textOf(tax,'codigoPorcentaje'))||'',base:textOf(tax,'baseImponible')}));
 if(explicit.length&&explicit.every(group=>group.taxRate!==''))try{parsed.taxSummary=parsePrintedTaxSummary(explicit);}catch{parsed.warnings?.push('Los subtotales de IVA del XML requieren revisión; no se inventó una base.');}
 parsed.warnings?.push('XML leído: revisa las unidades por presentación y la categoría comercial.');return parsed;
}
export function mergeDocumentPages(pages:FullExtractionData[]):FullExtractionData {
 const merged:FullExtractionData={lines:[],warnings:[]};
 for(const page of pages){if(merged.supplierRuc&&page.supplierRuc&&merged.supplierRuc!==page.supplierRuc)throw new Error('Los archivos pertenecen a proveedores distintos. Registra cada compra por separado.');if(merged.number&&page.number&&merged.number!==page.number)throw new Error('Los archivos contienen números de comprobante distintos. Registra cada factura por separado.');
  for(const key of ['kind','supplier','supplierRuc','number','date','seller','total','taxTotal','wordsTotal','discount'] as const){if(page[key])Object.assign(merged,{[key]:page[key]});}
  if(page.taxSummary?.length){if(merged.taxSummary?.length&&JSON.stringify(merged.taxSummary)!==JSON.stringify(page.taxSummary))throw new Error('Las páginas muestran subtotales por IVA distintos. Revisa si son documentos diferentes o subtotales de página.');merged.taxSummary=page.taxSummary;}
  merged.lines.push(...page.lines.map(l=>({...l,id:`line-${merged.lines.length+page.lines.indexOf(l)+1}`})));merged.warnings?.push(...page.warnings||[]);
 }
 if(merged.lines.length>200)throw new Error('El documento completo supera 200 productos.');return merged;
}
export async function readDocument(blob:Blob,name:string,rotation:number,progress:ReadProgress,signal:AbortSignal):Promise<DocumentReadResult>{
 if(signal.aborted)throw new DOMException('Lectura cancelada','AbortError');
 if(blob.size>20*1024*1024)throw new Error('El archivo supera 20 MB.');
 const check=()=>{if(signal.aborted)throw new DOMException('Lectura cancelada','AbortError');};
 if(/\.xml$/i.test(name)||/xml/.test(blob.type)){progress('Leyendo XML');const text=await blob.text();check();return {text,data:readInvoiceXml(text),pages:1,method:'XML estructurado'};}
 if(/\.txt$/i.test(name)||blob.type==='text/plain'){const text=await blob.text();check();return {text,data:extractDocumentData(text),pages:1,method:'Texto'};}
 if(blob.type!=='application/pdf'&&!/\.pdf$/i.test(name)){progress('Leyendo imagen');const r=await recognizeImage(blob,rotation,p=>progress(`Leyendo imagen · ${p} %`),signal);return {text:r.text,data:extractDocumentData(r.text),pages:1,method:'Imagen'};}
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/ocr/pdf.worker.min.mjs';
 const loading=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,cMapUrl:'/ocr/pdf-cmaps/',cMapPacked:true,standardFontDataUrl:'/ocr/pdf-fonts/',wasmUrl:'/ocr/pdf-wasm/',enableXfa:false});
 const abort=()=>{void loading.destroy();};signal.addEventListener('abort',abort,{once:true});
 try{const doc=await loading.promise;check();if(doc.numPages>20)throw new Error('El PDF supera 20 páginas. Divídelo antes de subirlo.');
 const parts:FullExtractionData[]=[];const texts:string[]=[];let usedOcr=false;
 for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){check();progress(`Leyendo PDF · página ${pageNumber} de ${doc.numPages}`);const page=await doc.getPage(pageNumber);const content=await page.getTextContent();let text=arrangePdfText(content.items.filter(i=>'str' in i));
 let parsed=extractDocumentData(text);
 if(text.replace(/\s/g,'').length<30||!parsed.lines.length){usedOcr=true;const base=page.getViewport({scale:1,rotation:page.rotate+rotation});const scale=Math.min(2,2200/Math.max(base.width,base.height));const viewport=page.getViewport({scale,rotation:page.rotate+rotation});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo preparar la página del PDF.');const render=page.render({canvas,canvasContext:ctx,viewport});const stop=()=>render.cancel();signal.addEventListener('abort',stop,{once:true});try{await render.promise;}finally{signal.removeEventListener('abort',stop);}check();const image=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Página no legible.')),'image/png'));const recognized=await recognizeImage(image,0,p=>progress(`Leyendo PDF escaneado · página ${pageNumber} · ${p} %`),signal);const scanned=extractDocumentData(recognized.text);const digital=parsed;parsed=scanned.lines.length>=digital.lines.length?scanned:digital;for(const key of ['kind','supplier','supplierRuc','number','date','seller','total','taxTotal','wordsTotal'] as const){if(!parsed[key]&&digital[key])Object.assign(parsed,{[key]:digital[key]});}text=recognized.text+'\n'+text;canvas.width=0;canvas.height=0;}
 texts.push(text);parts.push(parsed);page.cleanup();}
 return {text:texts.join('\n\n'),data:mergeDocumentPages(parts),pages:doc.numPages,method:usedOcr?'PDF escaneado con lectura local':'PDF digital'};
 }finally{signal.removeEventListener('abort',abort);await loading.destroy();}
}
export {extractSuggestions};
