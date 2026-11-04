export const fakeKey='clave-ficticia-para-pruebas-sin-cuenta-real';
export const fakeSecret='proteccion-ficticia-de-pruebas-12345678901234567890';
export function invoiceResponse(){return {candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({kind:'invoice',supplier:'PROVEEDOR FICTICIO',supplierRuc:'0999999999001',number:'001-001-000000001',date:'2026-11-03',seller:'VENDEDOR',total:'3.45',taxTotal:'0.45',wordsTotal:'',warnings:[],multipleDocuments:false,lines:[{description:'ARROZ FICTICIO',supplierCode:'A100',quantity:'2',unitsPerPack:'1',unitPrice:'1.50',discountAmount:'',discountPercent:'',discountBasis:'',taxRate:'15',taxAmount:'',otherTax:'',lineTotal:'3.00',bonusQuantity:'',category:'Alimentos',sourceText:'2 ARROZ FICTICIO 1.50 3.00 IVA 15%',promotion:false}]})}]}}]};}

export function twoProductResponse(){
 const response=invoiceResponse(),data=JSON.parse(response.candidates[0].content.parts[0].text);data.total='5.30';data.taxTotal='0.30';data.lines[0].taxRate='0';data.lines[0].sourceText='2 A100 ARROZ FICTICIO 1.50 0% 3.00';
 data.lines.push({...data.lines[0],description:'DETERGENTE FICTICIO',supplierCode:'L200',quantity:'1',unitPrice:'2.0000',taxRate:'15',lineTotal:'2.00',category:'Limpieza',sourceText:'1 L200 DETERGENTE FICTICIO 2.0000 15% 2.00'});response.candidates[0].content.parts[0].text=JSON.stringify(data);return response;
}
