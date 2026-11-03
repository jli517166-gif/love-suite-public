/** Credential boundaries exercise real capture, public reads, worker input and stored repair. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as reflection from '../reflection.js';
import { reflectionInput } from '../reflection-worker.js';
import { coreBatchDigest } from '../core-memory.js';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-material-privacy-'));
const secret = 'fixture-credential-8f213x';
const text = `技术状态：正常\naccessToken: ${secret}\npassword: |\n  ${secret}\n` + String.raw`{"password":"abc\"${secret}"}` + '\n用户喜欢雨天';
const events = [
  {type:'turn/start',seq:0,data:{turn:1}},
  {type:'user/message',seq:1,data:{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text}]}},
  {type:'turn/end',seq:2,data:{turn:1,reason:{kind:'completed'}}},
];
try {
  reflection.captureCompletedTurns(root, {id:'privacy',snapshotEvents:(a,b)=>events.filter(e=>e.seq>=a&&e.seq<b)}, events[2]);
  const file=reflection.reflectionFile(root);
  assert.ok(!fs.readFileSync(file,'utf8').includes(secret),'capture must redact credentials before saving');
  const privacy=await import('../material-privacy.js');
  for (const input of [`{"api_key":"${secret}"}`,`{"Authorization":"Bearer ${secret}"}`,`Authorization: Bearer ${secret}`,`https://u:${secret}@example.test/?api_key=${secret}`,`password = '${secret}'`,`token: ${secret}`,`-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----`]) {
    const result=privacy.redactMaterialText(input);
    assert.ok(!result.text.includes(secret), 'supported credential representations must be masked');
    assert.equal(privacy.redactMaterialText(result.text).text,result.text,'redaction must be idempotent');
  }
  assert.equal(privacy.redactMaterialText('用户说 token 数量为 4096；我不喜欢甜饮料').text,'用户说 token 数量为 4096；我不喜欢甜饮料');
  assert.ok(!privacy.redactMaterialText('password: __REDACTED__'+secret).text.includes(secret),'mask prefix cannot bypass credential masking');
  for (const input of [String.raw`{"password":"abc\"${secret}"}`, `password: |\n  ${secret}\nstatus: ok`, `  password: >-\n    ${secret}\n  status: ok`]) {
    assert.ok(!privacy.redactMaterialText(input).text.includes(secret),'escaped JSON or YAML blocks cannot leave a credential suffix');
  }
  assert.equal(privacy.redactMaterialText(`- password: |\n    ${secret}\n  status: ok\n`).text,'- password: __REDACTED__\n  status: ok\n','YAML sibling fields must survive block masking');
  // Simulate pre-upgrade queue, including source digest, without using the redactor to build expectations.
  const old=JSON.parse(fs.readFileSync(file));const job=old.jobs[0];
  job.materials[0].text=text;job.materialArchive.materials[0].text=text;
  job.materialArchive.digest=coreBatchDigest(job.materialArchive.materials);
  job.status='leased';job.attempts=1;job.lease={token:'stale-lease',expiresAt:Date.now()+300000};
  fs.writeFileSync(file,JSON.stringify(old));
  const publicJob=reflection.readReflection(root,'',job.id);
  assert.ok(!JSON.stringify(publicJob).includes(secret),'legacy queue read cannot leak original credential');
  assert.equal(publicJob.status,'needs_review');assert.equal(publicJob.lease,null);
  assert.throws(()=>reflection.completeReflection(root,{jobId:job.id,leaseToken:'stale-lease',expectedRevision:0,operations:[],reason:'old read'}),/失效/);
  const input=reflectionInput({workspace:root,groupId:''},publicJob);
  assert.ok(!JSON.stringify(input).includes(secret),'worker request cannot carry legacy credential');
  assert.ok(publicJob.materials[0].text.includes('用户喜欢雨天'));
  const repaired=reflection.sanitizeReflectionQueue(root);
  assert.equal(repaired.changedJobs,1);assert.ok(fs.existsSync(repaired.backup));
  assert.ok(!fs.readFileSync(file,'utf8').includes(secret));
  const bytes=fs.readFileSync(file,'utf8');
  assert.equal(reflection.sanitizeReflectionQueue(root).changedJobs,0);
  assert.equal(fs.readFileSync(file,'utf8'),bytes,'repeat repair must not bump revision');
  assert.equal(reflection.reflectionStatus(root).revision,old.revision+1);
  console.log('ok   material privacy: capture, legacy reads, requests and idempotent stored repair');
} finally {
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});
}
