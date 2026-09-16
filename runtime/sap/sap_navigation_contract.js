function norm(s){return (s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
async function visibleExact(page,text){const hits=[];for(const [fi,f] of page.frames().entries()){
 const loc=f.locator('a,button,[role=menuitem],[role=link]');const rows=await loc.evaluateAll(es=>es.map((e,index)=>({index,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim()})));
 for(const r of rows)if(r.visible&&norm(r.text)===norm(text))hits.push({frame:fi,index:r.index});
}if(hits.length!==1)throw new Error(`SAFE_ABORT_NAV:${text}:not-unique:${hits.length}`);return hits[0];}
async function inspectNavigation(page){return {operation:await visibleExact(page,'Operasyon'),confirmations:await visibleExact(page,'Hizmet teyitleri')};}
module.exports={visibleExact,inspectNavigation};
