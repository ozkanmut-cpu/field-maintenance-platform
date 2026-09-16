const {requireSafeSessionState,sessionState}=require('./sap_dom_guard');
async function preserveExistingSessions(page){
 const before=await sessionState(page);
 if(before.matches!==1)throw new Error('SAFE_ABORT_EXISTING_SESSION:'+before.reason);
 if(before.safe)return {changed:false,state:await requireSafeSessionState(page)};
 const controls=page.locator('input[type=checkbox],input[type=radio]');
 const target=controls.nth(before.control.index);
 if(await target.count()!==1)throw new Error('SAFE_ABORT_EXISTING_SESSION:danger-control-index-invalid');
 await target.uncheck({timeout:3000});
 const after=await requireSafeSessionState(page);
 if(after.control.index!==before.control.index)throw new Error('SAFE_ABORT_EXISTING_SESSION:danger-control-identity-changed');
 return {changed:true,state:after};
}
module.exports={preserveExistingSessions};
