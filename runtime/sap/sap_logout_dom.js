function norm(s){return (s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
async function findLogout(page){
 const candidates=page.locator('a,button,input[type=button],input[type=submit]');
 const rows=await candidates.evaluateAll(es=>es.map((e,index)=>({index,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),text:(e.innerText||e.value||e.title||'').replace(/\s+/g,' ').trim()})));
 const hits=rows.filter(x=>x.visible&&norm(x.text)==='oturumu kapat');
 if(hits.length!==1)throw new Error('SAFE_ABORT_LOGOUT:logout-control-not-unique');
 return candidates.nth(hits[0].index);
}
async function logoutAutomationSession(page){
 const before=(await page.title()).trim();
 if(!before.toLocaleLowerCase('tr-TR').includes('sap crm'))throw new Error('SAFE_ABORT_LOGOUT:not-in-crm');
 const target=await findLogout(page);
 await target.click({timeout:3000});
 await page.waitForFunction(()=>!document.title.toLocaleLowerCase('tr-TR').includes('sap crm'),null,{timeout:10000}).catch(()=>{});
 const after=(await page.title()).trim();
 if(after===before)throw new Error('SAFE_ABORT_LOGOUT:logout-not-confirmed');
 return {loggedOut:true,titleBefore:before,titleAfter:after};
}
module.exports={findLogout,logoutAutomationSession};
