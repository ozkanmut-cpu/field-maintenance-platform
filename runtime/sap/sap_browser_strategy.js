const {inspectProcess}=require('./sap_connection_preflight');
function chooseStrategy(pid){const x=inspectProcess(pid);if(x.attachable)return {mode:'attach-existing',reason:'automation-endpoint-present',process:x};return {mode:'isolated-playwright',reason:'existing-session-not-attachable-do-not-restart',process:x};}
module.exports={chooseStrategy};if(require.main===module)console.log(JSON.stringify(chooseStrategy(Number(process.argv[2]))));
