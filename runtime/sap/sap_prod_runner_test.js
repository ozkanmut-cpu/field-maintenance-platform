const assert=require('assert');
const {requireCredentialEnv,buildDbArgs}=require('./sap_prod_runner');
let failed=false;try{requireCredentialEnv({})}catch(e){failed=e.message==='SAFE_ABORT_LOGIN:credentials-missing'}assert(failed);
assert.deepStrictEqual(requireCredentialEnv({SAP_USERNAME:'u',SAP_PASSWORD:'p'}),{username:'u',password:'p'});
assert.deepStrictEqual(buildDbArgs('/tmp/x.csv',true),['--dry-run','/tmp/x.csv']);
assert.deepStrictEqual(buildDbArgs('/tmp/x.csv',false),['/tmp/x.csv']);
console.log(JSON.stringify({ok:true,passed:4}));
