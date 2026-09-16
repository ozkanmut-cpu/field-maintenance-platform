const DANGER_TEXT='mevcut tüm oturumlardan çık';
function norm(s){return (s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();}
async function sessionState(page){
 const controls=page.locator('input[type=checkbox],input[type=radio]');
 const rows=await controls.evaluateAll(es=>es.map((e,index)=>({index,id:e.id||'',name:e.name||'',type:e.type,checked:!!e.checked,text:((e.labels&&e.labels[0]&&e.labels[0].innerText)||e.parentElement?.innerText||'').trim()})));
 const matches=rows.filter(x=>norm(x.text).includes(DANGER_TEXT));
 if(matches.length!==1)return {safe:false,reason:matches.length?'danger-control-not-unique':'danger-control-missing',matches:matches.length};
 const control=matches[0];
 return {safe:control.checked===false,reason:control.checked?'danger-control-checked':'verified-unchecked',matches:1,control};
}
async function requireSafeSessionState(page){const s=await sessionState(page);if(!s.safe)throw new Error('SAFE_ABORT_EXISTING_SESSION:'+s.reason);return s;}
module.exports={sessionState,requireSafeSessionState};
