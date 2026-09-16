const {tr}=require('./sap_dom_utils');
async function findLogout(page){
 const hits=[];for(const [fi,f] of page.frames().entries()){
  const els=f.locator('a,button,input[type=button],input[type=submit]');const n=await els.count();
  for(let i=0;i<n;i++){const e=els.nth(i);if(!(await e.isVisible().catch(()=>false)))continue;const text=tr((await e.innerText().catch(()=>''))||(await e.getAttribute('value'))||(await e.getAttribute('title')));if(text.includes('oturumu kapat'))hits.push({frame:fi,index:i,text});}
 }
 if(hits.length!==1)throw new Error('SAFE_ABORT_LOGOUT:control-not-unique:'+hits.length);return hits[0];
}
module.exports={findLogout};
