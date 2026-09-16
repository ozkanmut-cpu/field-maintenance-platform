const fs=require('fs');
const modules=['sap_dom_utils','sap_dom_guard','sap_session_preserve','sap_session_continue','sap_session_flow','sap_playwright_bridge','sap_login_contract','sap_login_dom','sap_login_live','sap_crm_contract','sap_search_contract','sap_search_discovery','sap_search_actions','sap_results_contract','sap_export_contract','sap_logout_contract'];
for(const m of modules)require('./'+m);
const mode=(fs.statSync('/opt/field-maintenance/sap-runtime/.sap_credentials').mode&0o777).toString(8);
if(mode!=='600')throw new Error('credential-mode:'+mode);
console.log(JSON.stringify({ok:true,modules:modules.length,credentialMode:mode}));
