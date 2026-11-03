import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as reflection from '../reflection.js';
import {createReflectionWorker,reflectionWorkerFile} from '../reflection-worker.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'love-reflection-guidance-'));
try {
 const events=[{type:'turn/start',seq:0,data:{turn:1}},{type:'user/message',seq:1,data:{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'查看图片'},{type:'image',image:'fixture'}]}},{type:'turn/end',seq:2,data:{turn:1,reason:{kind:'completed'}}}];
 reflection.captureCompletedTurns(root,{id:'image',snapshotEvents:(a,b)=>events.filter(e=>e.seq>=a&&e.seq<b)},events[2]);
 const id=reflection.listReflections(root).jobs[0].id;
 const job=reflection.reflectionDetail(reflection.readReflection(root,'',id));
 assert.equal(job.diagnosis?.code,'incomplete_material','missing image needs a specific explanation');
 assert.equal(job.diagnosis.committed,false);assert.equal(job.diagnosis.recoveryAction,'provide_text');
 const {reflectionDiagnosis,withWorkerWait}=await import('../reflection-guidance.js');
 const legacy={status:'needs_review',complete:false};assert.equal(reflectionDiagnosis(legacy).code,'missing_snapshot');
 const huge={status:'needs_review',complete:false,materialArchive:{complete:true,materials:[{reference:'r',text:'字'.repeat(15000)}]}};
 assert.equal(reflectionDiagnosis(huge).code,'archive_limit');
 const small={status:'pending',complete:true};
 const daily=withWorkerWait(reflectionDiagnosis(small),{enabled:true,phase:'daily_limit',dailyCalls:6,maxCallsPerDay:6,resumeAt:Date.UTC(2026,10,3)});
 assert.equal(daily.code,'daily_limit');assert.equal(daily.recoveryAction,'wait_budget');assert.equal(daily.resumeAt,Date.UTC(2026,10,3));
 assert.equal(withWorkerWait(job.diagnosis,{enabled:true,phase:'daily_limit'}).code,'incomplete_material','budget does not hide missing material');
 const day=Date.UTC(2026,10,2,14);
 fs.writeFileSync(reflectionWorkerFile(root),JSON.stringify({format:'love-reflection-worker',schemaVersion:1,day:'2026-11-02',calls:6,nextAllowedAt:day-100,runs:[]}));
 const worker=createReflectionWorker({now:()=>day,config:()=>({}),scopes:()=>[],llm:()=>null});
 assert.equal(worker.describe(root).resumeAt,Date.UTC(2026,10,3),'daily wait must point at next UTC day, not expired cooldown');await worker.stop();
 console.log('ok   actionable material/legacy/limit/budget diagnostics and exact UTC resume time');
} finally {assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}
