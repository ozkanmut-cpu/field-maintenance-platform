const {findUniqueFrameForText}=require('./sap_dom_utils');
async function nearbyEditable(frame,labelText){
 const label=frame.getByText(labelText,{exact:true}); if(await label.count()!==1)throw new Error('SAFE_ABORT_SEARCH:label:'+labelText);
 const h=await label.elementHandle(); const info=await h.evaluate(el=>{const lr=el.getBoundingClientRect();const all=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].map((e,i)=>{const r=e.getBoundingClientRect();return{i,id:e.id||'',name:e.name||'',tag:e.tagName,type:e.type||'',value:e.value||'',d:Math.hypot(r.left-lr.right,r.top-lr.top),visible:r.width>0&&r.height>0};}).filter(x=>x.visible).sort((a,b)=>a.d-b.d);return all.slice(0,5);});
 if(!info.length)throw new Error('SAFE_ABORT_SEARCH:no-editable:'+labelText); return info;
}
async function inspectTargetControls(page){const out={};for(const t of ['Kayıt tarihi (zaman çerçevesi)','Ürün tanıtıcısı','Azami sonuç sayısı']){const f=await findUniqueFrameForText(page,t);out[t]=await nearbyEditable(f,t);}return out;}
module.exports={nearbyEditable,inspectTargetControls};
