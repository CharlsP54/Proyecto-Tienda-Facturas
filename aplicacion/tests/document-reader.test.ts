import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangePdfText, mergeDocumentPages } from '../lib/pdf.ts';
import { arrangeOcrTsv, extractDocumentData, extractSuggestions, isExplicitPromotion } from '../lib/ocr.ts';
import { multiplyExtractedAmount, deriveExtractedUnitPrice, calculateCostChange, sumExtractedAmounts, extractedTaxBaseIncludesCharges } from '../lib/calculations.ts';

test('el proveedor y RUC se toman del impreso y nunca de una lista inventada',()=>{
  const result=extractSuggestions('INDUSTRIAS ALES S.A.\nRUC: 1234567890001\nCLIENTE: Tienda\nRUC: 9999999999001\n');
  assert.equal(result.supplier,'INDUSTRIAS ALES S.A.'); assert.equal(result.supplierRuc,'1234567890001');
  assert.equal(extractSuggestions('INDUSTRIAS ALES S.A.\nFACTURA\n').supplierRuc,undefined);
  assert.equal(extractSuggestions('CLIENTE: ALES\n').supplier,undefined);
});
test('no se asigna IVA a una línea a partir del IVA total del documento',()=>{
  const result=extractDocumentData('FACTURA\nCANT  CODIGO  DESCRIPCION  PRECIO  TOTAL\n2  A100  ARROZ  1.50  3.00\nIVA 0.45\nTOTAL 3.45');
  assert.equal(result.lines[0].taxRate,''); assert.equal(result.lines[0].quantity,'2');
});

test('un RUC o texto de identificación aislado no se inventa como producto',()=>{
 const result=extractDocumentData('.U.C.  1399999999001\nRazón Social: CLIENTE Identificación:  1319999999001');
 assert.equal(result.lines.length,0);
});

test('un regalo solo se propone como promoción cuando está rotulado explícitamente',()=>{
 assert.equal(isExplicitPromotion('PROMO GALLETA MUU LECHE','0.00'),true);
 assert.equal(isExplicitPromotion('GALLETAS','0.00'),false);
 assert.equal(isExplicitPromotion('PROMO GALLETA','1.00'),false);
});
test('columnas digitales conservan tarifa cero, precio, importe y categoría sugerida',()=>{
  const result=extractDocumentData('PROVEEDOR: PRUEBA\nCANT\tCODIGO\tDESCRIPCION\tUNIDAD\tPRECIO\tIVA\tTOTAL\n2\tA100\tARROZ 1KG\tUN\t1.5000\t0%\t3.00\nTOTAL 3.00');
  const row=result.lines[0];assert.equal(row.taxRate,'0');assert.equal(row.unitsPerPack,'1');assert.equal(row.description,'ARROZ 1KG');assert.equal(row.unitPrice,'1.5000');assert.equal(row.category,'Alimentos y condimentos');
});
test('descuento unitario de seis decimales se convierte con racionales exactos',()=>{
  assert.equal(multiplyExtractedAmount('0.1222','12'),'1.4664');assert.equal(deriveExtractedUnitPrice('2.12','20'),'0.106');assert.equal(deriveExtractedUnitPrice('1','3'),'');
});

test('las subidas y bajadas comparan costos exactos y conservan desconocidos',()=>{
  assert.deepEqual(calculateCostChange('0.30','0.10'),{amount:'0.200000',percent:'200.00'});
  assert.deepEqual(calculateCostChange('1.50','2.00'),{amount:'-0.500000',percent:'-25.00'});
  assert.equal(calculateCostChange('', '2.00'),null);
  assert.equal(calculateCostChange('2.00','0'),null);
});

test('el XML suma grupos de IVA sin flotantes y conserva una base de cargos explícita',()=>{
 assert.equal(sumExtractedAmounts(['0.00','0.10','0.20']),'0.30');
 assert.equal(sumExtractedAmounts(['','0.20']),'');
 assert.equal(sumExtractedAmounts(['0.001']),'');
 assert.equal(extractedTaxBaseIncludesCharges('10.00','1.00','11.00'),true);
 assert.equal(extractedTaxBaseIncludesCharges('10.00','1.00','10.00'),false);
 assert.equal(extractedTaxBaseIncludesCharges('10.00','1.00',''),undefined);
});
test('la reconstrucción PDF agrupa por coordenadas y conserva columnas',()=>{
  const text=arrangePdfText([{str:'2',width:8,transform:[1,0,0,1,10,100]},{str:'ARROZ',width:30,transform:[1,0,0,1,90,100]},{str:'3.00',width:25,transform:[1,0,0,1,200,100]},{str:'TOTAL 3.00',width:80,transform:[1,0,0,1,10,70]}]);
  assert.equal(text,'2\tARROZ\t3.00\nTOTAL 3.00');
});

test('OCR reconstruye una tabla aunque el motor lea las columnas en bloques separados',()=>{
 const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
 const word=(x:number,y:number,width:number,text:string)=>`5\t1\t1\t1\t1\t1\t${x}\t${y}\t${width}\t20\t95\t${text}`;
 const tsv=[header,word(10,10,45,'CANT'),word(10,50,10,'2'),word(90,10,65,'CODIGO'),word(90,50,45,'A100'),word(180,10,100,'DESCRIPCION'),word(180,50,65,'ARROZ'),word(400,10,60,'PRECIO'),word(400,50,40,'1.50'),word(500,10,30,'IVA'),word(500,50,20,'0%'),word(600,10,60,'TOTAL'),word(600,50,40,'3.00')].join('\n');
 const rows=extractDocumentData(arrangeOcrTsv(tsv)).lines;
 assert.equal(rows.length,1);assert.equal(rows[0].description,'ARROZ');assert.equal(rows[0].quantity,'2');assert.equal(rows[0].unitPrice,'1.50');assert.equal(rows[0].taxRate,'0');assert.equal(rows[0].lineTotal,'3.00');
});
test('las páginas se unen sin perder renglones ni combinar facturas distintas',()=>{
  const first=extractDocumentData('FACTURA 001-001-000000001\n1 ARROZ 1.00 1.00\n');
  const second=extractDocumentData('FACTURA 001-001-000000001\n1 JABON 2.00 2.00\nTOTAL 3.00');
  const result=mergeDocumentPages([first,second]);assert.equal(result.lines.length,2);assert.notEqual(result.lines[0].id,result.lines[1].id);assert.equal(result.total,'3.00');
  assert.throws(()=>mergeDocumentPages([first,{...second,number:'001-001-000000002'}]),/distintos/);
  assert.throws(()=>mergeDocumentPages([{...first,supplierRuc:'1111111111001'},{...second,supplierRuc:'2222222222001'}]),/proveedores distintos/);
});
