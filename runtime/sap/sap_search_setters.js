async function setEditable(locator,value,verifyFn=(actual,expected)=>actual===expected){
 if(await locator.count()!==1)throw new Error('SAFE_ABORT_SEARCH:editable-not-unique');if(!(await locator.isVisible()))throw new Error('SAFE_ABORT_SEARCH:editable-not-visible');
 const tag=await locator.evaluate(e=>e.tagName);if(tag==='SELECT')await locator.selectOption({label:value}).catch(()=>locator.selectOption(value));else await locator.fill(value);
 await locator.press('Tab').catch(()=>{});const actual=await locator.inputValue();if(!verifyFn(actual,value))throw new Error(`SAFE_ABORT_SEARCH:value-not-committed:${actual}`);return actual;
}
function digitsEqual(actual,expected){return String(actual).replace(/\D/g,'')===String(expected).replace(/\D/g,'');}
async function setByStableId(frame,id,value,verifyFn){const loc=frame.locator('#'+id.replace(/([\\"#.;:[\](),>+~*^$|=])/g,'\\$1'));return setEditable(loc,value,verifyFn);}
module.exports={setEditable,setByStableId,digitsEqual};
