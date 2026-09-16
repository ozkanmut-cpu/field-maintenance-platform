async function assertLoginContract(page){
 const checks={
  user:await page.locator('#sap-user').count(),
  pass:await page.locator('#sap-password').count(),
  logon:await page.locator('#LOGON_BUTTON').count(),
  client:await page.locator('input[name="sap-client"]').getAttribute('value'),
  language:await page.locator('#sap-language').getAttribute('value')
 };
 if(checks.user!==1||checks.pass!==1||checks.logon!==1) throw new Error('SAFE_ABORT_LOGIN:contract-shape');
 if(checks.client!=='300'||checks.language!=='TR') throw new Error('SAFE_ABORT_LOGIN:contract-context');
 return checks;
}
module.exports={assertLoginContract};
