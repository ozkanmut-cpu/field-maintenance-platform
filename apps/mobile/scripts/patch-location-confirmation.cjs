const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/CorporateApp.tsx');
let source = fs.readFileSync(file, 'utf8');

if (source.includes('locationPresenceConfirmed')) {
  console.log('Location confirmation flow is already present in source.');
} else {
  throw new Error('Location confirmation flow must live in CorporateApp.tsx source, not only in a build patch');
}
