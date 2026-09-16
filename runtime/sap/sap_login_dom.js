const {verifyAndHandleCurrentPage}=require('./sap_playwright_bridge');
const {assertLoginContract}=require('./sap_login_contract');
async function submitLogin(page,username,password){
 const state=await verifyAndHandleCurrentPage(page);
 if(!state.loginRequired) return state;
 await assertLoginContract(page);
 const user=page.locator('#sap-user'); const pass=page.locator('#sap-password');
 if(await user.count()!==1||await pass.count()!==1) throw new Error('SAFE_ABORT_LOGIN:login-fields-not-unique');
 await user.fill(username); await pass.fill(password);
 const submit=page.locator('#LOGON_BUTTON');
 if(await submit.count()!==1) throw new Error('SAFE_ABORT_LOGIN:logon-button-not-unique');
 await submit.click(); await page.waitForLoadState('domcontentloaded',{timeout:10000}).catch(()=>{});
 return verifyAndHandleCurrentPage(page);
}
module.exports={submitLogin};
