#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const APP = '/opt/field-maintenance/app';
for (const line of fs.readFileSync(path.join(APP, '.env'), 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}
const { PrismaClient } = require(path.join(APP, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

function parseCsv(file) {
  const text = fs.readFileSync(file).toString('utf16le').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.shift()?.trim().toLowerCase() !== 'sep=;') throw new Error('Unexpected CSV preamble');
  const parseLine = (s) => {
    const out=[]; let cur=''; let q=false;
    for (let i=0;i<s.length;i++) { const c=s[i]; if(c==='"'){ if(q && s[i+1]==='"'){cur+='"';i++;} else q=!q; } else if(c===';'&&!q){out.push(cur);cur='';} else cur+=c; }
    out.push(cur); return out;
  };
  const headers = parseLine(lines.shift());
  const required = ['Tanıtıcı','Nokta Kodu','Kayıt tarihi'];
  for (const h of required) if (!headers.includes(h)) throw new Error(`Required header missing: ${h}`);
  return lines.map(line => Object.fromEntries(headers.map((h,i)=>[h,parseLine(line)[i] ?? ''])));
}
function dateOnly(v) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v || '');
  if (!m) throw new Error(`Invalid date: ${v}`);
  return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
}
function money(v) {
  if (!v) return null;
  const n = Number(v.replace(/\./g,'').replace(',','.'));
  if (!Number.isFinite(n)) throw new Error(`Invalid net value: ${v}`);
  return n;
}
function same(a,b) { return (a ?? null) === (b ?? null); }

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error('CSV file argument missing');
  const raw = parseCsv(file);
  if (raw.length < 100) throw new Error(`Safety stop: only ${raw.length} rows; delete disabled`);
  const ids = raw.map(r=>r['Tanıtıcı']).filter(Boolean);
  if (ids.length !== raw.length || new Set(ids).size !== ids.length) throw new Error('Missing or duplicate confirmation IDs');
  const rows = raw.map(r=>({
    confirmationId:r['Tanıtıcı'], dealer:r['Bayi']||null, pointCode:r['Nokta Kodu']||null,
    pointName:r['Nokta']||null, recordDate:dateOnly(r['Kayıt tarihi']), creator:r['Yaratan']||null,
    netValue:money(r['Net değer']), status:r['KlncDrm']||null, contact:r['İlgili kişi']||null,
    costCenter:r['Masraf Yeri']||null, transactionType:r['İşlem Tipi']||null,
    systemStatus:r['Sistem durumu']||null, productId:'203'
  }));
  const cutoff = new Date(Math.min(...rows.map(r=>r.recordDate.getTime())));
  const newest = new Date(Math.max(...rows.map(r=>r.recordDate.getTime())));
  const now=Date.now();
  if (cutoff.getTime() < now-21*86400000 || newest.getTime() > now+86400000) throw new Error(`Safety stop: suspicious date range ${cutoff.toISOString()}..${newest.toISOString()}`);

  const existing = await prisma.sapConfirmation.findMany({where:{confirmationId:{in:ids}}});
  const byId = new Map(existing.map(r=>[r.confirmationId,r]));
  let inserted=0, updated=0, unchanged=0, deleted=0;
  await prisma.$transaction(async tx => {
    for (const r of rows) {
      const e=byId.get(r.confirmationId);
      if (!e) { await tx.sapConfirmation.create({data:r}); inserted++; continue; }
      const changed = !same(e.dealer,r.dealer)||!same(e.pointCode,r.pointCode)||!same(e.pointName,r.pointName)||
        e.recordDate.getTime()!==r.recordDate.getTime()||!same(e.creator,r.creator)||String(e.netValue??'')!==String(r.netValue??'')||
        !same(e.status,r.status)||!same(e.contact,r.contact)||!same(e.costCenter,r.costCenter)||
        !same(e.transactionType,r.transactionType)||!same(e.systemStatus,r.systemStatus)||e.productId!==r.productId;
      if (changed) { await tx.sapConfirmation.update({where:{confirmationId:r.confirmationId},data:{...r,sourceSyncedAt:new Date()}}); updated++; }
      else unchanged++;
    }
    const res=await tx.sapConfirmation.deleteMany({where:{productId:'203',recordDate:{gte:cutoff},confirmationId:{notIn:ids}}});
    deleted=res.count;
  }, {timeout:60000});
  const summary={ok:true,file,rows:rows.length,cutoff:cutoff.toISOString().slice(0,10),newest:newest.toISOString().slice(0,10),inserted,updated,unchanged,deleted};
  fs.writeFileSync('/opt/field-maintenance/sap-runtime/logs/last-db-sync.json',JSON.stringify({...summary,at:new Date().toISOString()},null,2));
  console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
