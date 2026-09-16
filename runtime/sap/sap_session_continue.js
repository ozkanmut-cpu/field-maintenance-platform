const {requireSafeSessionState}=require('./sap_dom_guard');
const {preserveExistingSessions}=require('./sap_session_preserve');
async function findContinue(page){
 const candidates=page.locator('a,button,input[type=button],input[type=submit]');
 const rows=await candidates.evaluateAll(es=>es.map((e,index)=>({index,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),text:(e.innerText||e.value||'').replace(/\s+/g,' ').trim()})));
 const hits=rows.filter(x=>x.visible&&x.text.toLocaleLowerCase('tr-TR')==='devam');
 if(hits.length!==1)throw new Error('SAFE_ABORT_EXISTING_SESSION:continue-control-not-unique');
 return candidates.nth(hits[0].index);
}
async function continueWithoutClosingOthers(page){
 const preserved=await preserveExistingSessions(page);
 await requireSafeSessionState(page);
 const control=await findContinue(page);
 await requireSafeSessionState(page);
 await control.click({timeout:3000});
 return {continued:true,preserved};
}
module.exports={continueWithoutClosingOthers,findContinue};
