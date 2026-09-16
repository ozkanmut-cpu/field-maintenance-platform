const STATES=['INIT','AUTHENTICATED','CRM_VERIFIED','SEARCH_VERIFIED','EXPORTED','CSV_VALIDATED','DB_SYNCED','LOGGED_OUT'];
const NEXT={INIT:'AUTHENTICATED',AUTHENTICATED:'CRM_VERIFIED',CRM_VERIFIED:'SEARCH_VERIFIED',SEARCH_VERIFIED:'EXPORTED',EXPORTED:'CSV_VALIDATED',CSV_VALIDATED:'DB_SYNCED',DB_SYNCED:'LOGGED_OUT'};
class RunState{constructor(){this.state='INIT';this.history=['INIT'];}advance(next){if(NEXT[this.state]!==next)throw new Error(`SAFE_ABORT_FLOW:invalid-transition:${this.state}->${next}`);this.state=next;this.history.push(next);return this;}canLogout(){return this.state==='DB_SYNCED';}}
module.exports={RunState,STATES};
