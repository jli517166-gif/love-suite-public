/** Real filesystem/tool/worker boundary tests; no model responses or prompt-text assertions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.LOVE_TEST_ISOLATED='1';
const queue=await import('../reflection.js');
const {commitCoreMemory}=await import('../core-memory.js');
const {apply}=await import('../index.js');
const {createReflectionWorker}=await import('../reflection-worker.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'love-memory-boundaries-'));
function capture(ws,id='normal') {
  const events=[{type:'turn/start',seq:0,data:{turn:1}},{type:'user/message',seq:1,data:{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'我喜欢雨天'}]}},{type:'turn/end',seq:2,data:{turn:1,reason:{kind:'completed'}}}];
  const session={id,header:{cwd:ws},firstLiveSeq:0,seq:3,snapshotEvents:(a,b)=>events.filter(e=>e.seq>=a&&e.seq<b),requestHeader:()=>({config:{provider:'fixture',model:'fixture'}})};
  queue.captureCompletedTurns(ws,session,events[2]);return {session,event:events[2]};
}
try {
 if(!process.argv.includes('--policy-only')) {
  const ws=path.join(root,'revision');capture(ws);
  const lease=queue.claimReflection(ws);
  const input={jobId:lease.job.id,leaseToken:lease.leaseToken,operations:[],reason:'无新增内容'};
  assert.throws(()=>queue.completeReflection(ws,input),/版本/,'empty result requires a core revision');
  commitCoreMemory(ws,{expectedRevision:0,operations:[{op:'record_memory',ref:'$m',coreId:'self',content:'后续独立事件',kind:'reflection',epistemic:'inferred',importance:2,reason:'另一轮',source:{kind:'reflection',reference:'other'}}]});
  assert.throws(()=>queue.completeReflection(ws,{...input,expectedRevision:0}),/版本.*变化/,'ordinary empty result must reject stale core');
  assert.equal(queue.reflectionStatus(ws).leased,1,'rejected empty result leaves lease and job intact');
  const result=queue.completeReflection(ws,{...input,expectedRevision:1});assert.equal(result.status,'skipped');
  assert.deepEqual(queue.completeReflection(ws,{...input,expectedRevision:0}),result,'completed outcomes stay idempotent');
  console.log('ok   new empty outcomes require current revision; stale result cannot skip; existing receipt replay preserved');
 }
 if(!process.argv.includes('--revision-only')) {
  const ws=path.join(root,'policy');const {session,event}=capture(ws,'protected');
  const registered=new Map(),listeners=new Map();
  const cfg={workspace:ws,channel:'none',proactiveEnabled:false,reflectionBackgroundEnabled:false,memoryReadOnlySessionIds:['protected']};
  const dispose=await apply({tools:{register:t=>registered.set(t.name,t)},on:(name,fn)=>listeners.set(name,fn),logger:{info(){},warn(){}}},cfg);
  try {
   const execution={agent:{session}};const before=fs.readFileSync(queue.reflectionFile(ws),'utf8');
   for(const [name,args] of [
    ['love_reflection',{action:'next'}],['love_reflection',{action:'skip',jobId:queue.listReflections(ws).jobs[0].id,reason:'bypass'}],
    ['love_core_memory',{action:'commit',expectedRevision:0,operations:[]}],['love_record',{kind:'fact',key:'likes',value:'sugar'}],
    ['love_learn',{action:'add',text:'bypass'}],['love_self',{action:'write',text:'bypass'}],['love_life',{action:'add',text:'bypass'}],
    ['love_group',{action:'note',groupId:'12345678',text:'bypass'}],
   ]) await assert.rejects(()=>registered.get(name).execute({...args,memoryReadOnly:false},execution),e=>e.code==='LOVE_MEMORY_READ_ONLY',name+' must reject before mutation');
   assert.equal(fs.readFileSync(queue.reflectionFile(ws),'utf8'),before);
   assert.equal(fs.existsSync(path.join(ws,'memory/profile.json')),false);
   assert.equal(fs.existsSync(path.join(ws,'memory/core-memory.json')),false);
   assert.equal((await registered.get('love_core_memory').execute({action:'read'},execution)).ok,true);
   await listeners.get('session/event')(session,event);
   assert.equal(fs.readFileSync(queue.reflectionFile(ws),'utf8'),before,'protected capture must not advance queue');
   const {defaults}=await import('../runtime/storage.js');const initial=defaults(ws);
   for(const key of ['mood','relationship'])fs.writeFileSync(path.join(ws,'memory',key+'.json'),JSON.stringify({...initial[key],updated:'2000-01-01T00:00:00'}));
   const stateBefore=Object.fromEntries(['mood','relationship'].map(key=>[key,fs.readFileSync(path.join(ws,'memory',key+'.json'),'utf8')]));
   await registered.get('love_mood').execute({action:'get'},execution);
   for(const key of ['mood','relationship'])assert.equal(fs.readFileSync(path.join(ws,'memory',key+'.json'),'utf8'),stateBefore[key],'read-only mood get must not write '+key);
   await assert.rejects(()=>registered.get('love_mood').execute({action:'refresh'},execution),e=>e.code==='LOVE_MEMORY_READ_ONLY');
   await registered.get('love_recall').execute({},execution);
   assert.equal(fs.existsSync(path.join(ws,'memory/self.md')),false,'read-only recall must not create self narrative');
   for(const key of ['mood','relationship'])assert.equal(fs.readFileSync(path.join(ws,'memory',key+'.json'),'utf8'),stateBefore[key],'read-only recall must not write '+key);
   const other={agent:{session:{...session,id:'other'}}};
   assert.equal((await registered.get('love_record').execute({kind:'fact',key:'likes',value:'rain'},other)).ok,true,'unprotected session remains functional');
   let calls=0;
   const worker=createReflectionWorker({config:()=>cfg,scopes:()=>[{primary:ws,workspace:ws,groupId:''}],llm:()=>({prepareCall(){calls++;throw new Error('must not call');}})});
   await worker.tick();await worker.stop();assert.equal(calls,0,'protected queued job cannot spend worker calls');
   assert.equal(queue.reflectionStatus(ws).pending,1);
   console.log('ok   trusted session policy blocks explicit tools/capture/background; read and ordinary session remain available');
  } finally {await dispose?.();}
 }
} finally {assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}
