const fs=require('fs');
function inspectProcess(pid){
 const raw=fs.readFileSync(`/proc/${pid}/cmdline`);const args=raw.toString().split('\0').filter(Boolean);
 const profileIndex=args.indexOf('--profile');const profile=profileIndex>=0?args[profileIndex+1]:null;
 const attachArg=args.find(x=>/remote-debugging|juggler/i.test(x))||null;
 return {pid,profile,attachable:!!attachArg,attachArg};
}
function requireSafeAttach(info){if(!info.attachable)throw new Error('SAFE_ABORT_ATTACH:existing-firefox-has-no-automation-endpoint');return info;}
module.exports={inspectProcess,requireSafeAttach};
if(require.main===module){const x=inspectProcess(Number(process.argv[2]));console.log(JSON.stringify(x));}
