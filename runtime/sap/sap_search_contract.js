const TARGETS=['Kayıt tarihi (zaman çerçevesi)','Ürün tanıtıcısı','Azami sonuç sayısı'];
async function discoverSearchControls(page){
 const out={};
 for(const text of TARGETS){out[text]=[];for(const [i,f] of page.frames().entries()){const n=await f.getByText(text,{exact:false}).count().catch(()=>0);if(n)out[text].push({frame:i,count:n});}}
 return out;
}
function requireUniqueSearchLabels(found){for(const k of TARGETS){const total=(found[k]||[]).reduce((a,x)=>a+x.count,0);if(total!==1)throw new Error('SAFE_ABORT_SEARCH:label-not-unique:'+k+':'+total);}return true;}
module.exports={discoverSearchControls,requireUniqueSearchLabels};
