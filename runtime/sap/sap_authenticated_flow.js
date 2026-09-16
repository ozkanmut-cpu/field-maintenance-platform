const {verifyAndHandleCurrentPage}=require('./sap_playwright_bridge');
const {inspectAuthenticatedCrm}=require('./sap_shadow_inspector');
async function waitForCrm(page,timeout=15000){
 const end=Date.now()+timeout;let last='';
 while(Date.now()<end){const s=await verifyAndHandleCurrentPage(page);last=s.title||'';if(s.alreadyInCrm||s.handled){if((await page.title()).toLocaleLowerCase('tr-TR').includes('sap crm'))return true;}await page.waitForTimeout(250);}
 throw new Error('SAFE_ABORT_LOGIN:crm-not-reached:'+last);
}
async function shadowAfterAuthentication(page){await waitForCrm(page);return inspectAuthenticatedCrm(page);}
module.exports={waitForCrm,shadowAfterAuthentication};
