const assert=require('assert');const {verifyAndHandleCurrentPage}=require('./sap_playwright_bridge');
let n=0;const page={title:async()=>++n<3?'':'Oturum açma',waitForTimeout:async()=>{}};
verifyAndHandleCurrentPage(page).then(r=>{assert(r.loginRequired);assert(n>=3);console.log(JSON.stringify({ok:true,titleReads:n}))}).catch(e=>{console.error(e.message);process.exit(1)});
