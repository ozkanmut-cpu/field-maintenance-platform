function safeOrigin(url){
 try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.origin:`${u.protocol}//`;}
 catch{return 'invalid://';}
}
function frameKey(frame,index){return {index,name:frame.name()||'',url:frame.url(),origin:safeOrigin(frame.url())};}
module.exports={safeOrigin,frameKey};
