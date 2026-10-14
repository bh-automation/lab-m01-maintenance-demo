'use strict';
const assert = require('node:assert/strict');
const core = require('../src/core.cjs');
const cases = require('../examples/workshop-cases.json');
const ctx = structuredClone(require('../examples/fixture.json'));
ctx.konfig.mail_aktiv = true;
let count=0, mailObjects=0, resetEvents=0;
function check(value, name) { assert.ok(value,name); count++; }
for (const c of cases) {
  const e=structuredClone(c.input), ex=c.expected;
  ctx.zeitpunkt=e.submittedAt;
  const fn=c.kind==='A'?core.verarbeiteEntnahme:c.kind==='B'?core.verarbeiteZugang:core.verarbeiteOel;
  const r=fn(e,ctx);
  if(r.mail)mailObjects++;
  if(c.kind==='B' && r.warnung?.status==='RESET')resetEvents++;
  check(r.status===ex.status,c.id+' status');
  if(c.kind!=='C') {
    check(r.journal.buchbestand_vorher===ex.before && r.journal.buchbestand_nachher===ex.after,c.id+' independently specified balances');
    check(r.journal.delta===(c.kind==='A'?-e.menge:e.menge),c.id+' signed movement');
  } else check(r.meldung.schmierstoff_id_demo===e.schmierstoff_id_angezeigt,c.id+' mapping');
  check(c.kind==='B'?r.warnung?.status==='RESET':Boolean(r.mail)===ex.mail,c.id+' warning/reset/mail decision');
  // In-memory doubles only: no persistence and no actual mail provider.
  if(r.journal)ctx.journal.push(r.journal);
  if(r.warnung)ctx.warnungen.push({...r.warnung,email_status:r.mail?'GESENDET':r.warnung.email_status});
  if(r.meldung)ctx.meldungen.push({...r.meldung,mail_status:'GESENDET'});
  const replay=fn(e,ctx);
  check(!replay.journal&&!replay.warnung&&!replay.meldung&&!replay.mail,c.id+' replay has no extra writes');
}
check(ctx.journal.length===9&&ctx.meldungen.length===4,'9 movements / 4 reports');
check(new Set(cases.filter(c=>c.kind==='B').map(c=>c.input.lieferschein_demo)).size===4,'4 unique receipts');
check(mailObjects===8 && resetEvents===4,'8 actual local mail objects / 4 receipt reset events; receipt email is outside this core');
console.log(JSON.stringify({cases:cases.length,assertions:count,failed:0,scope:'OFFLINE_ONLY; persistence and mail simulated'},null,2));
