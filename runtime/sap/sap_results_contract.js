const EXPORT_SELECTOR='[id$="EXPORT_TO_EXCEL"],[title*="CSV" i],[title*="Excel" i],[aria-label*="CSV" i],[aria-label*="Excel" i],a[href*="export" i]';
async function inspectFrameSnapshot(frame,fi){
 const r=await frame.evaluate(selector=>{
  const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
  let nokta=0,date=0;
  for(const e of document.querySelectorAll('th,td,span,div,a')){
   if(!visible(e)||e.children.length)continue;
   const t=(e.innerText||e.textContent||'').trim();
   if(/^Nokta Kodu$/i.test(t))nokta++;
   if(/^Kayıt tarihi$/i.test(t))date++;
  }
  const exports=Array.from(document.querySelectorAll(selector)).map((e,index)=>({index,visible:visible(e),tag:e.tagName,title:e.title||'',aria:e.getAttribute('aria-label')||'',href:e.getAttribute('href')||''})).filter(x=>x.visible);
  return {nokta,date,exports};
 },EXPORT_SELECTOR);
 if(!r||typeof r!=='object')return {nokta:0,date:0,exports:[]};
 return {nokta:r.nokta,date:r.date,exports:r.exports.map(x=>({...x,frame:fi}))};
}
async function exportCandidates(frame,fi){return (await inspectFrameSnapshot(frame,fi)).exports;}
async function inspectResults(page){let nokta=0,date=0,exports=[];for(const [fi,f] of page.frames().entries()){const r=await inspectFrameSnapshot(f,fi);nokta+=r.nokta;date+=r.date;exports.push(...r.exports);}if(nokta!==1)throw new Error('SAFE_ABORT_RESULTS:nokta-kodu-column-not-unique:'+nokta);if(date<1)throw new Error('SAFE_ABORT_RESULTS:kayit-tarihi-column-missing');if(exports.length!==1)throw new Error('SAFE_ABORT_RESULTS:export-control-not-unique:'+exports.length);return {ready:true,nokta,date,export:exports[0]};}
async function waitForResultsReady(page,timeout=15000){const end=Date.now()+timeout;let last='';while(Date.now()<end){try{return await inspectResults(page)}catch(e){last=e.message;await page.waitForTimeout(250);}}throw new Error('SAFE_ABORT_RESULTS:timeout:'+last);}
module.exports={EXPORT_SELECTOR,inspectFrameSnapshot,inspectResults,waitForResultsReady,exportCandidates};