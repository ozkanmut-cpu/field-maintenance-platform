const assert=require('assert');const {slotBase,requireUniqueSlots}=require('./sap_real_search');
assert.equal(slotBase('X',2),'X_PARAMETERS[2]');assert.deepEqual(requireUniqueSlots([{slot:2,key:'DATE_RANGE'},{slot:1,key:'PRODUCT_ID'}]),{date:2,product:1});assert.throws(()=>requireUniqueSlots([{slot:2,key:'DATE_RANGE'}]),/product/);console.log(JSON.stringify({ok:true,passed:3}));
