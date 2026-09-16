function validateExportHeaders(headers){
 const norm=headers.map(x=>(x||'').trim().toLocaleLowerCase('tr-TR'));
 const required=['nokta kodu','kayıt tarihi'];
 const missing=required.filter(x=>!norm.includes(x));
 if(missing.length) throw new Error('SAFE_ABORT_EXPORT:missing-columns:'+missing.join(','));
 return {ok:true,columnCount:headers.length};
}
module.exports={validateExportHeaders};
