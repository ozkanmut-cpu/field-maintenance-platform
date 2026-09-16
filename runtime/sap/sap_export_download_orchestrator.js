const {clickExport}=require('./sap_export_executor');const {finalizeDownload}=require('./sap_download_complete');
async function exportAndFinalize(page,meta,opts={}){const clicked=await clickExport(page,meta,{timeout:opts.timeout||5000});const finalized=await finalizeDownload(clicked.download,{dir:opts.dir,minBytes:opts.minBytes||100});return {exported:true,clicked:true,downloadValidated:true,...finalized};}
module.exports={exportAndFinalize};
