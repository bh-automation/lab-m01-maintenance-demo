// A deliberately narrow publication guard, not a complete security audit.
'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let files=0;
const patterns=[/gh[pousr]_[A-Za-z0-9]{25,}/,/github_pat_[A-Za-z0-9_]{30,}/,/ya29\.[A-Za-z0-9_-]{20,}/,/AIza[A-Za-z0-9_-]{30,}/,/-----BEGIN (?:RSA |EC )?PRIVATE KEY/];
function walk(dir) {
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})) {
  if(['.git','node_modules'].includes(ent.name))continue;
  const p=path.join(dir,ent.name);
  if(ent.isDirectory()){walk(p);continue;}
  const text=fs.readFileSync(p,'utf8'); files++;
  for(const re of patterns)assert.ok(!re.test(text),`Credential pattern: ${path.relative(root,p)}`);
  assert.ok(!/https?:\/\/[^\s"<>]*\.n8n\.cloud/i.test(text),'Active cloud endpoint');
  assert.ok(!/tel:\+?[0-9]/i.test(text),'Telephone link');
  assert.ok(!/\+49[ \d]{8,}/.test(text),'Telephone number');
  assert.ok(!/[A-Z]:[\\/]Users[\\/]/i.test(text),'Local user path');
  const emails=text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[];
  assert.ok(emails.every(x=>x==='b.havertz2000@gmail.com'),'Unexpected email address');
 }
}
walk(root);
console.log(JSON.stringify({files,publication_guard:'PASS',scope:'Known patterns; manual review also required'}));
