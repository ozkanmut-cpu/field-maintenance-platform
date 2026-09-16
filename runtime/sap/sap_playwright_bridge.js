const {handleSessionConflictIfPresent}=require('./sap_session_flow');
async function stableTitle(page,{timeout=10000}={}){const end=Date.now()+timeout;let title='';while(Date.now()<end){title=(await page.title()).trim();if(title)return title;if(page.waitForTimeout)await page.waitForTimeout(100);else await new Promise(r=>setTimeout(r,100));}return title;}
async function verifyAndHandleCurrentPage(page){
 const title=await stableTitle(page);const low=title.toLocaleLowerCase('tr-TR');
 if(low.includes('oturum açma durumu kontrolü')) return handleSessionConflictIfPresent(page);
 if(low.includes('sap crm')) return {handled:false,alreadyInCrm:true,title};
 if(low==='oturum açma'||low.includes('oturum açma')) return {handled:false,loginRequired:true,title};
 throw new Error(`SAFE_ABORT_UNEXPECTED_SAP_PAGE:${title}`);
}
module.exports={verifyAndHandleCurrentPage,stableTitle};
