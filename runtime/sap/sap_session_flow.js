const {continueWithoutClosingOthers}=require('./sap_session_continue');
const CONFLICT='oturum açma durumu kontrolü';
function isConflict(title){return (title||'').toLocaleLowerCase('tr-TR').includes(CONFLICT);}
async function handleSessionConflictIfPresent(page){
 const title=(await page.title()).trim();
 if(!isConflict(title))return {handled:false,title};
 const result=await continueWithoutClosingOthers(page);
 try{await page.waitForFunction(t=>!document.title.toLocaleLowerCase('tr-TR').includes(t),CONFLICT,{timeout:10000});}
 catch{throw new Error('SAFE_ABORT_EXISTING_SESSION:continue-did-not-leave-conflict-page');}
 const after=(await page.title()).trim();
 if(isConflict(after))throw new Error('SAFE_ABORT_EXISTING_SESSION:continue-did-not-leave-conflict-page');
 return {handled:true,titleBefore:title,titleAfter:after,result};
}
module.exports={handleSessionConflictIfPresent,isConflict};
