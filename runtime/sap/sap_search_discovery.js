const {frameKey}=require('./sap_frame_utils');
const LABELS=['Kayıt tarihi (zaman çerçevesi)','Ürün tanıtıcısı','Azami sonuç sayısı'];
async function discover(page){const out=[];for(const [fi,f] of page.frames().entries()){
 const rows=await f.locator('input,select,textarea,button,a').evaluateAll(es=>es.map((e,i)=>({i,tag:e.tagName,type:e.type||'',id:e.id||'',name:e.name||'',value:e.type==='password'?'':(e.value||''),title:e.title||'',aria:e.getAttribute('aria-label')||''})).filter(x=>x.id||x.name||x.title||x.aria));
 if(rows.length)out.push({...frameKey(f,fi),controls:rows.slice(0,250)});
}return {labels:LABELS,frames:out};}
module.exports={discover,LABELS};
