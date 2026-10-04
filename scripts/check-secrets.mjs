import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const patterns=[/\bsk-[a-zA-Z0-9]{20,}\b/,/\bAIza[a-zA-Z0-9_-]{25,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const forbidden=/(^|\/)(node_modules|\.venv|research|release|dist|test-results)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:db|dpapi|key)$/;
let failed=false;
for(const name of files){if(forbidden.test(name)){console.error('Forbidden tracked path:',name);failed=true;continue;}
  const bytes=await readFile(name);if(bytes.includes(0))continue;
  if(patterns.some(p=>p.test(bytes.toString('utf8')))){console.error('Credential pattern found in file:',name);failed=true;}
}
if(failed)process.exit(1);console.log('PASS: no credential patterns or forbidden data/artifact paths in Git inputs.');
