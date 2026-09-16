function slotBase(prefix,slot){return `${prefix}_PARAMETERS[${slot}]`;}
function requireUniqueSlots(rows){const d=rows.filter(x=>x.key==='DATE_RANGE'),p=rows.filter(x=>x.key==='PRODUCT_ID');if(d.length!==1)throw new Error('SAFE_ABORT_SEARCH:date-slot-not-unique:'+d.length);if(p.length!==1)throw new Error('SAFE_ABORT_SEARCH:product-slot-not-unique:'+p.length);return {date:d[0].slot,product:p[0].slot};}
module.exports={slotBase,requireUniqueSlots};
