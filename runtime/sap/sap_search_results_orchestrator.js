const {clickVerifiedSearch}=require('./sap_search_executor');const {waitForResultsReady}=require('./sap_results_contract');
async function executeSearchAndRequireResults(page){const search=await clickVerifiedSearch(page);if(!search.clicked)throw new Error('SAFE_ABORT_RESULTS:search-not-clicked');const results=await waitForResultsReady(page);return {search,results,ready:true};}
module.exports={executeSearchAndRequireResults};
