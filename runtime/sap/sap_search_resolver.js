function scoreCandidate(label,c){
 let s=0;const id=(c.id||'').toLowerCase(),name=(c.name||'').toLowerCase(),type=(c.type||'').toLowerCase();
 if(!c.visible||type==='hidden')return -999;if(c.rightOfLabel)s+=50;if(c.sameRow)s+=30;s-=Math.min(c.distance||9999,500)/10;
 const l=label.toLocaleLowerCase('tr-TR');if(l.includes('azami')&&(type==='text'||type==='number'))s+=20;if(l.includes('ürün')&&type==='text')s+=15;if(l.includes('kayıt')&&(type==='text'||c.tag==='SELECT'))s+=15;if(id||name)s+=5;return s;
}
function resolveUnique(label,candidates){const ranked=candidates.map(c=>({...c,score:scoreCandidate(label,c)})).filter(c=>c.score>-900).sort((a,b)=>b.score-a.score);if(!ranked.length)throw new Error('SAFE_ABORT_SEARCH:no-candidate:'+label);if(ranked[1]&&ranked[0].score-ranked[1].score<8)throw new Error('SAFE_ABORT_SEARCH:ambiguous-candidate:'+label);return ranked[0];}
module.exports={scoreCandidate,resolveUnique};
