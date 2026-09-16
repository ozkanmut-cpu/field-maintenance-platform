function norm(s){return String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function pickDateOption(options){const hits=options.filter(o=>o.key==='W*2'||norm(o.text)==='<- 14 gün ->');if(hits.length!==1)throw new Error('SAFE_ABORT_SEARCH:date-option-not-unique:'+hits.length);return hits[0];}
module.exports={norm,pickDateOption};