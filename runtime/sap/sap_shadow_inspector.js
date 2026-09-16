const {inspectCrm}=require('./sap_crm_contract');const {inspectSearchPage}=require('./sap_search_page_contract');const {findLogout}=require('./sap_logout_dom');
async function inspectAuthenticatedCrm(page){const crm=await inspectCrm(page);if(!crm.isCrm)throw new Error('SAFE_ABORT_SHADOW:not-in-crm');const out={crm,search:null,logout:false};
 try{out.search=await inspectSearchPage(page)}catch(e){out.search={ready:false,error:e.message};}
 try{await findLogout(page);out.logout=true}catch(e){out.logoutError=e.message;}
 return out;}
module.exports={inspectAuthenticatedCrm};
