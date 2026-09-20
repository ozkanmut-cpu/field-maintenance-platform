const assert=require('node:assert/strict');
const test=require('node:test');
const {applyRows}=require('./sap_db_writer');
const row={confirmationId:'c1',productId:'203',recordDate:new Date('2026-09-15T00:00:00Z'),status:'*Onay Bekliyor'};

test('real sync stamps even unchanged rows and creates the receipt inside the transaction',async()=>{
 const calls=[];const tx={sapConfirmation:{update:async x=>calls.push(['update',x]),create:async x=>calls.push(['create',x]),deleteMany:async()=>({count:0})},sapImportRun:{create:async x=>calls.push(['receipt',x])}};
 const prisma={sapConfirmation:{findMany:async q=>q.where.confirmationId? [row]:[row]},$transaction:async fn=>fn(tx)};
 await applyRows(prisma,[row],{importRunId:'run-1'});
 assert.equal(calls[0][0],'update');assert.equal(calls[0][1].data.lastSeenImportId,'run-1');assert.equal(calls.at(-1)[0],'receipt');
});

test('dry run creates no receipt',async()=>{
 const prisma={sapConfirmation:{findMany:async()=>[]},$transaction:async()=>{throw new Error('must not transact')}};
 const result=await applyRows(prisma,[row],{dryRun:true});assert.equal(result.dryRun,true);
});
