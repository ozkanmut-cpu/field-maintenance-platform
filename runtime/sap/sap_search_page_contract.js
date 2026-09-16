const {prepareSearch}=require('./sap_search_execute_guard');const {inspectResults}=require('./sap_results_contract');
async function inspectSearchPage(page){const prep=await prepareSearch(page);let results=null;try{results=await inspectResults(page)}catch(e){if(!e.message.startsWith('SAFE_ABORT_RESULTS:nokta-kodu-column-missing'))throw e;}
 return {ready:prep.ready,criteria:prep.verified.verified,searchButton:prep.button,results};}
module.exports={inspectSearchPage};
