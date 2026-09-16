const {findLogout:findLogoutMeta}=require('./sap_logout_contract');
async function findLogout(page){const hit=await findLogoutMeta(page);const f=page.frames()[hit.frame];if(!f)throw new Error('SAFE_ABORT_LOGOUT:frame-missing');const candidates=f.locator('a,button,input[type=button],input[type=submit]'),target=candidates.nth(hit.index);if(await target.count()!==1||!(await target.isVisible().catch(()=>false)))throw new Error('SAFE_ABORT_LOGOUT:logout-control-not-visible');return target;}
function isLogoutDialog(message){const m=(message||'').toLocaleLowerCase('tr-TR');return (m.includes('oturum')&&(m.includes('kapat')||m.includes('çık')))||m.includes('logout')||m.includes('logoff');}
async function logoutAutomationSession(page){
 const before=(await page.title()).trim();if(!before.toLocaleLowerCase('tr-TR').includes('sap crm'))throw new Error('SAFE_ABORT_LOGOUT:not-in-crm');
 const target=await findLogout(page);let unexpected='';const onDialog=async d=>{try{if(isLogoutDialog(d.message()))await d.accept();else{unexpected=d.message();await d.dismiss();}}catch{unexpected=unexpected||'dialog-handler-failed';}};
 page.on('dialog',onDialog);try{await target.click({timeout:3000});await page.waitForFunction(()=>!document.title.toLocaleLowerCase('tr-TR').includes('sap crm'),null,{timeout:10000}).catch(()=>{});}finally{page.off('dialog',onDialog);}
 if(unexpected)throw new Error('SAFE_ABORT_LOGOUT:unexpected-dialog');const after=(await page.title()).trim();if(after===before)throw new Error('SAFE_ABORT_LOGOUT:logout-not-confirmed');
 return {loggedOut:true,titleBefore:before,titleAfter:after};
}
module.exports={findLogout,isLogoutDialog,logoutAutomationSession};