'use client';
import { useEffect,useState } from 'react';
type S={status:string;at:string;rows:number;inserted:number;updated:number;unchanged:number;deleted:number;blockedDeletes:number;oldest:string;newest:string};
export default function SapSyncStatus(){
 const [s,setS]=useState<S|null>(null),[e,setE]=useState('');
 async function load(){try{const r=await fetch('/api/backend/admin/sap-sync/status',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);setS(await r.json());setE('')}catch(x){setE(x instanceof Error?x.message:String(x))}}
 useEffect(()=>{void load()},[]);
 return <section className="panel"><div className="panelHeader"><div><h2>SAP Senkronizasyonu</h2><p>Son doğrulanmış import çalışması.</p></div><button className="ghost" onClick={()=>void load()}>Yenile</button></div>{e?<div className="error">{e}</div>:s?<div className="stats"><div className="stat"><strong>{s.rows}</strong><span>Satır</span></div><div className="stat"><strong>{s.inserted}/{s.updated}/{s.deleted}</strong><span>Ekle / Güncelle / Sil</span></div><div className="stat"><strong>{new Date(s.at).toLocaleString('tr-TR')}</strong><span>Son başarılı çalışma</span></div><div className="stat"><strong>{s.oldest} — {s.newest}</strong><span>Veri aralığı</span></div></div>:<p>Yükleniyor…</p>}</section>
}
