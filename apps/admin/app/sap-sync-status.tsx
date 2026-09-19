'use client';
import { useEffect,useState } from 'react';
export type SapSyncRun={status:string;at:string;rows:number;inserted:number;updated:number;unchanged:number;deleted:number;blockedDeletes:number;oldest:string;newest:string;guard?:string[]};

export function SapSyncStatusDetails({ sync }: { sync: SapSyncRun }) {
 const isSuccessful = sync.status.toLowerCase() === 'success';
 return <div className="stats"><div className="stat"><strong>{sync.status}</strong><span>Durum</span></div><div className="stat"><strong>{sync.rows}</strong><span>Satır</span></div><div className="stat"><strong>{sync.inserted} / {sync.updated} / {sync.unchanged}</strong><span>Ekle / Güncelle / Değişmedi</span></div><div className="stat"><strong>{sync.deleted} / {sync.blockedDeletes}</strong><span>Sil / Engellenen silme</span></div><div className="stat"><strong>{new Date(sync.at).toLocaleString('tr-TR')}</strong><span>{isSuccessful ? 'Son başarılı çalışma' : 'Son çalışma'}</span></div><div className="stat"><strong>{sync.oldest} — {sync.newest}</strong><span>Veri aralığı</span></div><div className="stat"><strong>Silme koruması nedenleri</strong>{sync.guard?.length ? <ul>{sync.guard.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <span>Yok</span>}</div></div>;
}
export default function SapSyncStatus(){
 const [s,setS]=useState<SapSyncRun|null>(null),[e,setE]=useState('');
 async function load(){try{const r=await fetch('/api/backend/admin/sap-sync/status',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);setS(await r.json());setE('')}catch(x){setE(x instanceof Error?x.message:String(x))}}
 useEffect(()=>{void load()},[]);
 return <section className="panel"><div className="panelHeader"><div><h2>SAP Senkronizasyonu</h2><p>En son import çalışmasının ayrıntıları.</p></div><button className="ghost" onClick={()=>void load()}>Yenile</button></div>{e?<div className="error">{e}</div>:s?<SapSyncStatusDetails sync={s}/>:<p>Yükleniyor…</p>}</section>
}