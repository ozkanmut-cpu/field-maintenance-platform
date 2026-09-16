const {firefox}=require('/tmp/pw-firefox-test/node_modules/playwright');
const {submitLogin}=require('./sap_login_dom');
async function runWithCredentials(username,password){
 if(!username||!password) throw new Error('SAFE_ABORT_LOGIN:credentials-missing');
 const c=await firefox.launchPersistentContext('/tmp/sap-playwright-automation',{headless:true});
 try{const page=c.pages()[0]||await c.newPage(); if(page.url()==='about:blank') await page.goto('https://demirbas.efespilsen.com.tr/',{waitUntil:'domcontentloaded',timeout:20000}); return await submitLogin(page,username,password);}
 finally{await c.close();}
}
module.exports={runWithCredentials};
