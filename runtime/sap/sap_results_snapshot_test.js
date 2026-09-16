const assert=require('assert');
const {inspectFrameSnapshot}=require('./sap_results_contract');
(async()=>{
 let calls=0;
 const good={evaluate:async()=>{calls++;return {nokta:1,date:1,exports:[{index:0,visible:true,tag:'A',title:'CSV Export',aria:'',href:''}]};}};
 let r=await inspectFrameSnapshot(good,7);assert.equal(calls,1);assert.equal(r.exports[0].frame,7);
 const empty={evaluate:async()=>undefined};r=await inspectFrameSnapshot(empty,1);
 assert.deepEqual(r,{nokta:0,date:0,exports:[]});
 console.log(JSON.stringify({ok:true,passed:3}));
})().catch(e=>{console.error(e.message);process.exit(2)});