/** Actual live failure: malformed temporary references must give safe actionable retry feedback. */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as queue from '../reflection.js';import {createReflectionWorker} from '../reflection-worker.js';import {readCoreMemory} from '../core-memory.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'love-ref-feedback-'));let time=Date.now(),calls=0;
const events=[{type:'turn/start',seq:0,data:{turn:1}},{type:'user/message',seq:1,data:{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'今天试做手账，不确定是否长期喜欢'}]}},{type:'turn/end',seq:2,data:{turn:1,reason:{kind:'completed'}}}];
try {
 queue.captureCompletedTurns(root,{id:'actual-ref-failure',snapshotEvents:(a,b)=>events.filter(e=>e.seq>=a&&e.seq<b),requestHeader:()=>({config:{provider:'fixture',model:'fixture'}})},events[2]);
 const worker=createReflectionWorker({now:()=>time,scopes:()=>[{primary:root,workspace:root,groupId:''}],config:()=>({reflectionCooldownMinutes:1}),llm:()=>({async prepareCall(config){return {config,async *stream(options){calls++;const input=JSON.parse(options.messages[0].content[0].text);if(calls===2)assert.match(input.previousAttempt.lastError,/REFLECTION_REFERENCE_FORMAT/);yield {type:'text-delta',text:JSON.stringify({reason:'单次尝试',operations:[{op:'record_memory',ref:calls===1?'m_bad':'$m',coreId:'self',content:'今天试做手账，不确定是否长期喜欢',kind:'event',epistemic:'reported',importance:2,reason:'单次陈述',source:{kind:'conversation',reference:input.materials[0].reference}}]})};yield {type:'finish',reason:{kind:'stop'}};}};}})});
 await worker.tick();assert.equal(readCoreMemory(root).revision,0);
 const job=queue.readReflection(root,'',queue.listReflections(root).jobs[0].id);
 assert.match(job.lastError,/REFLECTION_REFERENCE_FORMAT/,'retry must explain malformed ref without echoing model content');
 time+=61000;await worker.tick();await worker.stop();assert.equal(readCoreMemory(root).revision,1);assert.equal(worker.describe(root).dailyCalls,2);
 console.log('ok   malformed ref rejected with safe retry feedback; corrected retry retains budget and commits once');
} finally {assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}
