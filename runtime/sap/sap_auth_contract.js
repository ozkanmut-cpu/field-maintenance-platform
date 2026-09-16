const fs=require('fs');const path=require('path');
function credentialMetadata(file){const st=fs.statSync(file);return {mode:(st.mode&0o777).toString(8),uid:st.uid,gid:st.gid,sizePositive:st.size>0};}
function assertCredentialMetadata(file){const m=credentialMetadata(file);if(m.mode!=='600')throw new Error('SAFE_ABORT_LOGIN:credential-permissions');if(!m.sizePositive)throw new Error('SAFE_ABORT_LOGIN:credential-file-empty');return m;}
function assertRuntimeOwnership(runtimeFile){const st=fs.statSync(runtimeFile);if(!st.isFile())throw new Error('SAFE_ABORT_LOGIN:runtime-not-file');return {file:path.basename(runtimeFile),uid:st.uid,gid:st.gid};}
module.exports={credentialMetadata,assertCredentialMetadata,assertRuntimeOwnership};
