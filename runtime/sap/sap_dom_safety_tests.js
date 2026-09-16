const {firefox}=require('/tmp/pw-firefox-test/node_modules/playwright');const assert=require('assert');
const {sessionState}=require('./sap_dom_guard');const {preserveExistingSessions}=require('./sap_session_preserve');const {findContinue}=require('./sap_session_continue');const {findLogout}=require('./sap_logout_dom');
(async()=>{const b=await firefox.launch({headless:true});const p=await b.newPage();let n=0;
await p.setContent('<label><input id="x" type="checkbox" checked>Mevcut tüm oturumlardan çık</label><a id="go">Devam</a>');let s=await sessionState(p);assert.equal(s.safe,false);assert.equal(s.control.index,0);n++;await preserveExistingSessions(p);s=await sessionState(p);assert.equal(s.safe,true);n++;assert.equal(await (await findContinue(p)).getAttribute('id'),'go');n++;
await p.setContent('<button>Devam</button><a>Devam</a>');await assert.rejects(()=>findContinue(p),/not-unique/);n++;
await p.setContent('<a id="out">Oturumu kapat</a>');assert.equal(await (await findLogout(p)).getAttribute('id'),'out');n++;
await p.setContent('<a>Oturumu kapat</a><button>Oturumu kapat</button>');await assert.rejects(()=>findLogout(p),/not-unique/);n++;
await b.close();console.log(JSON.stringify({ok:true,passed:n}));})().catch(e=>{console.error(e);process.exit(2)});
