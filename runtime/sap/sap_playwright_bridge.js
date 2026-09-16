const path=require('path');
const {handleSessionConflictIfPresent}=require('./sap_session_flow');
async function verifyAndHandleCurrentPage(page){
 const title=(await page.title()).trim();
 const low=title.toLocaleLowerCase('tr-TR');
 if(low.includes('oturum açma durumu kontrolü')) return handleSessionConflictIfPresent(page);
 if(low.includes('sap crm')) return {handled:false,alreadyInCrm:true,title};
 if(low==='oturum açma'||low.includes('oturum açma')) return {handled:false,loginRequired:true,title};
 throw new Error(`SAFE_ABORT_UNEXPECTED_SAP_PAGE:${title}`);
}
module.exports={verifyAndHandleCurrentPage};
