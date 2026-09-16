const {firefox}=require('/tmp/pw-firefox-test/node_modules/playwright');
const {verifyAndHandleCurrentPage}=require('./sap_playwright_bridge');
async function inspectFreshAutomationPage(){
 const ctx=await firefox.launchPersistentContext('/tmp/sap-playwright-automation',{headless:true});
 try{
  const pages=ctx.pages(); const page=pages[0]||await ctx.newPage();
  if(page.url()==='about:blank') await page.goto('https://demirbas.efespilsen.com.tr/',{waitUntil:'domcontentloaded',timeout:20000});
  const state=await verifyAndHandleCurrentPage(page);
  return {url:new URL(page.url()).origin,title:await page.title(),state};
 } finally {await ctx.close();}
}
if(require.main===module) inspectFreshAutomationPage().then(x=>{console.log(JSON.stringify(x));}).catch(e=>{console.error(e.message);process.exit(2);});
module.exports={inspectFreshAutomationPage};
