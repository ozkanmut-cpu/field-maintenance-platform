function classify(state){if(state?.alreadyInCrm)return 'crm';if(state?.handled)return 'session-conflict-handled';if(state?.loginRequired)return 'login';return 'unknown';}
function requireAuthenticated(state){const c=classify(state);if(c!=='crm'&&c!=='session-conflict-handled')throw new Error('SAFE_ABORT_LOGIN:not-authenticated:'+c);return c;}
module.exports={classify,requireAuthenticated};
