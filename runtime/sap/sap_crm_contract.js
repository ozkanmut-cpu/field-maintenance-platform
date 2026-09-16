const {frameKey}=require('./sap_frame_utils');
async function inspectCrm(page){
 const title=(await page.title()).trim();const frames=page.frames().map((f,i)=>frameKey(f,i));
 const labels=['Operasyon','Hizmet teyitleri','Kayıt tarihi (zaman çerçevesi)','Ürün tanıtıcısı','Azami sonuç sayısı','Ara','Oturumu kapat'];const found={};
 for(const label of labels){let n=0;for(const f of page.frames())n+=await f.getByText(label,{exact:false}).count().catch(()=>0);found[label]=n;}
 return {title,isCrm:title.toLocaleLowerCase('tr-TR').includes('sap crm'),frameCount:frames.length,frames,found};
}
module.exports={inspectCrm};
