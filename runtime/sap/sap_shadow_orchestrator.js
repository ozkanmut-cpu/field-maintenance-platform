const {RunState}=require('./sap_run_state');const {shadowAfterAuthentication}=require('./sap_authenticated_flow');
async function runAuthenticatedShadow(page){const run=new RunState();run.advance('AUTHENTICATED');const shadow=await shadowAfterAuthentication(page);run.advance('CRM_VERIFIED');if(!shadow.search?.ready)throw new Error('SAFE_ABORT_FLOW:search-not-ready');run.advance('SEARCH_VERIFIED');return {mode:'shadow',state:run.state,history:run.history,shadow};}
module.exports={runAuthenticatedShadow};
