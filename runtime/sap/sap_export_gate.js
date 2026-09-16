const fs=require('fs');
function assertDownloadedCsv(file){
 if(!file||!fs.existsSync(file))throw new Error('SAFE_ABORT_EXPORT:file-missing');const st=fs.statSync(file);if(!st.isFile()||st.size<100)throw new Error('SAFE_ABORT_EXPORT:file-too-small');if(!/\.csv$/i.test(file))throw new Error('SAFE_ABORT_EXPORT:not-csv');return {file,size:st.size};
}
function allowLogout({downloadValidated,dbSyncSucceeded}){if(!downloadValidated)throw new Error('SAFE_ABORT_LOGOUT:download-not-validated');if(!dbSyncSucceeded)throw new Error('SAFE_ABORT_LOGOUT:db-sync-not-successful');return true;}
module.exports={assertDownloadedCsv,allowLogout};
