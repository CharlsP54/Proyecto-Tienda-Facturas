/** Fichas completas para pruebas cuyo objetivo no es validar campos pendientes.
 * Los vacíos explícitos de cada caso se conservan y las pruebas de revisión usan la API sin esta ayuda. */
export function completeProductFixture(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const product=value as Record<string,unknown>;
 return {category:'General',presentation:'Unidad',comparisonUnit:'unidad',contentsMode:product.innerUnits?'multiple':'single',...product};
}
