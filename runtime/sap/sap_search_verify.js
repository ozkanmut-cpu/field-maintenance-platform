function norm(s){return (s||'').replace(/\s+/g,' ').trim();}
function verifyCriteria(values){
 const product=norm(values.product),date=norm(values.date),max=norm(values.max).replace(/\D/g,'');
 if(product!=='203')throw new Error('SAFE_ABORT_SEARCH:product-not-203');
 if(!date.includes('14')||!date.toLocaleLowerCase('tr-TR').includes('gün'))throw new Error('SAFE_ABORT_SEARCH:date-not-14-days');
 if(max!=='1000')throw new Error('SAFE_ABORT_SEARCH:max-not-1000');
 return {product,date,max:'1000'};
}
module.exports={verifyCriteria};
