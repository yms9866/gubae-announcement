import{programOf}from'../dist/programs.mjs';
export class ConflictError extends Error{constructor(){super('This record changed on another device. Refresh and review the latest version.');this.status=409;}}
export class QuotaExceededError extends Error{constructor(retryAfter){super('The database daily read limit has been reached. Your change was not saved. Try again later; the limit resets daily.');this.status=503;this.code=8;this.reason='quota-exceeded';this.retryAfter=retryAfter;this.expose=true;}}
export class DatabaseUnavailableError extends Error{constructor(code){super('The database is temporarily unavailable. Your change was not confirmed. Try again in a minute.');this.status=503;this.code=code;this.reason='database-unavailable';this.retryAfter=30;this.expose=true;}}
const QUOTA=8,TRANSIENT=new Set([4,10,13,14]);
const NAMED={'resource-exhausted':8,RESOURCE_EXHAUSTED:8,'deadline-exceeded':4,DEADLINE_EXCEEDED:4,aborted:10,ABORTED:10,internal:13,INTERNAL:13,unavailable:14,UNAVAILABLE:14};
export const firestoreCode=e=>Number.isInteger(e?.code)?e.code:NAMED[e?.code]??(/RESOURCE_EXHAUSTED|quota exceeded/i.test(String(e?.message))?QUOTA:undefined);
const clone=v=>v==null?v:structuredClone(v);
const envMs=(name,fallback)=>{const v=Number(process.env[name]);return Number.isFinite(v)&&v>=0?v:fallback};

// Shared per-process cache. Every write bumps gubae_meta/state.version inside its transaction,
// so an expired entry is revalidated by reading that single document instead of the collection.
export class FirestoreStore{
    constructor(db,{cacheTtlMs=envMs('FIRESTORE_CACHE_TTL_MS',45000),cacheMaxAgeMs=envMs('FIRESTORE_CACHE_MAX_AGE_MS',21600000),quotaCooldownMs=envMs('FIRESTORE_QUOTA_COOLDOWN_MS',300000),retries=2,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),logger=console}={}){
    this.db=db;this.meta=db.doc('gubae_meta/state');
    Object.assign(this,{ttl:cacheTtlMs,maxAge:cacheMaxAgeMs,quotaCooldownMs,retries,now,sleep,logger});
    this.entries=new Map();this.inflight=new Map();this.generations=new Map();this.blockedUntil=0;
  }
  async run(op,name,fn,{retry=false}={}){
    const wait=this.blockedUntil-this.now();if(wait>0)throw new QuotaExceededError(Math.ceil(wait/1000));
    for(let attempt=0;;attempt++){
      try{return await fn();}catch(e){
        if(e instanceof ConflictError||(Number.isInteger(e?.status)&&e.status<500))throw e;
        const code=firestoreCode(e);
        if(code===QUOTA){this.blockedUntil=this.now()+this.quotaCooldownMs;this.logFailure(op,name,code,e);throw new QuotaExceededError(Math.ceil(this.quotaCooldownMs/1000));}
        if(retry&&TRANSIENT.has(code)&&attempt<this.retries){await this.sleep(Math.random()*Math.min(4000,250*2**attempt));continue;}
        this.logFailure(op,name,code,e);
        throw TRANSIENT.has(code)?new DatabaseUnavailableError(code):e;
      }
    }
  }
  logFailure(op,collection,code,e){this.logger.error('Firestore '+op+' failed: '+JSON.stringify({collection,code:code??e?.name??'unknown',error:String(e?.details||e?.message||e).slice(0,300)}));}
  invalidateKey(key){this.generations.set(key,(this.generations.get(key)||0)+1);this.inflight.delete(key);}
  clearCache(){for(const key of new Set([...this.entries.keys(),...this.inflight.keys()]))this.invalidateKey(key);this.entries.clear();}
  forget(name,id){for(const key of ['list:'+name,'doc:'+name+'/'+id]){this.invalidateKey(key);this.entries.delete(key);}}
  flight(key,op,name,fetch){
    const running=this.inflight.get(key);if(running)return running;
    const generation=this.generations.get(key)||0;
    const promise=(async()=>{
      const version=key==='version'?undefined:await this.version();
      const value=await this.run(op,name,fetch,{retry:true});
      if((this.generations.get(key)||0)===generation){const t=this.now();this.entries.set(key,{value,version,fetchedAt:t,checkedAt:t});}
      return value;
    })().finally(()=>{if(this.inflight.get(key)===promise)this.inflight.delete(key);});
    this.inflight.set(key,promise);return promise;
  }
  async valid(entry){
    if(!entry)return false;const t=this.now();
    if(t-entry.checkedAt<this.ttl)return true;
    if(t-entry.fetchedAt>=this.maxAge)return false;
    if(await this.version()!==entry.version)return false;
    entry.checkedAt=this.now();return true;
  }
  async read(key,op,name,fetch){
    const entry=this.entries.get(key);
    try{if(await this.valid(entry))return clone(entry.value);return clone(await this.flight(key,op,name,fetch));}
    catch(e){if(entry&&e.status===503)return clone(entry.value);throw e;}
  }
  async version(){
    const entry=this.entries.get('version');
    if(entry&&this.now()-entry.checkedAt<this.ttl)return entry.value;
    try{return await this.flight('version','get','meta',async()=>(await this.meta.get()).data()?.version||0);}
    catch(e){if(entry&&e.status===503)return entry.value;throw e;}
  }
  async list(name){return this.read('list:'+name,'list',name,async()=>(await this.collection(name).get()).docs.map(d=>({...d.data(),id:d.id})));}
  async get(name,id){
    const listed=this.entries.get('list:'+name);
    if(listed){try{if(await this.valid(listed))return clone(listed.value.find(r=>r.id===id)||null);}catch(e){if(e.status===503)return clone(listed.value.find(r=>r.id===id)||null);throw e;}}
    return this.read('doc:'+name+'/'+id,'get',name,async()=>{const d=await this.collection(name).doc(id).get();return d.exists?{...d.data(),id:d.id}:null;});
  }
  // Applies a committed transaction to the cache. Versions are consecutive, so an entry tagged
  // version-1 saw every earlier commit and stays exact after applying these changes.
  commit(changes,version){
    const t=this.now(),docs=new Map(),lists=new Map();
    for(const c of changes){docs.set('doc:'+c.name+'/'+c.id,c);lists.set('list:'+c.name,[...(lists.get('list:'+c.name)||[]),c]);}
    for(const [key,entry] of this.entries){
      if(key==='version')continue;
      const doc=docs.get(key),list=lists.get(key);
      if(doc||list)this.invalidateKey(key);
      if(entry.version!==version-1){if(doc||list)this.entries.delete(key);continue;}
      if(list){const rows=entry.value.filter(r=>!list.some(c=>c.id===r.id));for(const c of list)if(c.value)rows.push(clone(c.value));entry.value=rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
      if(doc)entry.value=clone(doc.value);
      entry.version=version;
    }
    for(const [key,c] of docs)if(!this.entries.has(key)){this.invalidateKey(key);this.entries.set(key,{value:clone(c.value),version,fetchedAt:t,checkedAt:t});}
    const known=this.entries.get('version');
    if(!known||known.value<version){this.invalidateKey('version');this.entries.set('version',{value:version,fetchedAt:t,checkedAt:t});}
  }
  async transaction(name,fn){const result=await this.run('transaction',name,()=>this.db.runTransaction(fn));this.commit(result.changes,result.version);return result.value;}
  async seed(meetings){await this.run('transaction','meta',()=>this.db.runTransaction(async tx=>{const meta=await tx.get(this.meta);if(meta.data()?.initialized)return;const refs=meetings.map(m=>this.db.doc('gubae_meetings/'+m.id));const docs=await tx.getAll(...refs);for(let i=0;i<docs.length;i++)if(!docs[i].exists)tx.create(refs[i],{...meetings[i],revision:1,recipient:'',teacherId:null,sent:{},updatedAt:new Date().toISOString()});tx.set(this.meta,{initialized:true,version:(meta.data()?.version||0)+1});}));this.clearCache();}
  async createProgram(program,meetings){return this.transaction('programs',async tx=>{const ref=this.collection('programs').doc(program.id);const[existing,meta]=await tx.getAll(ref,this.meta);if(existing.exists)throw new ConflictError();const refs=meetings.map(m=>this.collection('meetings').doc(m.id));const docs=await tx.getAll(...refs);if(docs.some(d=>d.exists))throw new ConflictError();const updatedAt=new Date().toISOString(),changes=[];for(let i=0;i<meetings.length;i++){const data={...meetings[i],revision:1,updatedAt};tx.create(refs[i],data);changes.push({name:'meetings',id:meetings[i].id,value:{...data,id:meetings[i].id}});}const record={...program,revision:1,updatedAt};tx.create(ref,record);const version=(meta.data()?.version||0)+1;tx.set(this.meta,{version},{merge:true});return{value:record,version,changes:[...changes,{name:'programs',id:program.id,value:{...record,id:program.id}}]};});}
  async saveMeetingReport(id,meetingRevision,reportRevision,data){return this.transaction('reports',async tx=>{const meetingRef=this.collection('meetings').doc(id),reportRef=this.collection('reports').doc(id);const [meeting,report,meta]=await Promise.all([tx.get(meetingRef),tx.get(reportRef),tx.get(this.meta)]);if(!meeting.exists)throw Object.assign(Error('Gubae not found.'),{status:404});if(meeting.data().revision!==meetingRevision||(report.data()?.revision||0)!==reportRevision)throw new ConflictError();const updatedAt=new Date().toISOString(),record={...data,id,revision:reportRevision+1,updatedAt};const nextMeeting={...meeting.data(),outcome:'held',outcomeReason:'',revision:meetingRevision+1,updatedAt};tx.set(reportRef,record);tx.set(meetingRef,nextMeeting);const version=(meta.data()?.version||0)+1;tx.set(this.meta,{version},{merge:true});return{value:record,version,changes:[{name:'reports',id,value:record},{name:'meetings',id,value:{...nextMeeting,id}}]};}).catch(e=>{if(e instanceof ConflictError){this.forget('meetings',id);this.forget('reports',id);}throw e;});}
  async updateProgram(id,expected,label){return this.transaction('programs',async tx=>{const ref=this.collection('programs').doc(id);const [doc,meta,meetings]=await Promise.all([tx.get(ref),tx.get(this.meta),tx.get(this.collection('meetings'))]);if(!doc.exists&&!meetings.docs.some(d=>programOf(d.data())===id))throw Object.assign(Error('Month not found.'),{status:404});if((doc.data()?.revision||0)!==expected)throw new ConflictError();const record={id,month:id,label,revision:expected+1,updatedAt:new Date().toISOString()};tx.set(ref,record);const version=(meta.data()?.version||0)+1;tx.set(this.meta,{version},{merge:true});return{value:record,version,changes:[{name:'programs',id,value:record}]};}).catch(e=>{if(e instanceof ConflictError)this.forget('programs',id);throw e;});}
  async deleteProgram(id,expected){return this.transaction('programs',async tx=>{const ref=this.collection('programs').doc(id);const [doc,meta,snapshot]=await Promise.all([tx.get(ref),tx.get(this.meta),tx.get(this.collection('meetings'))]);const meetings=snapshot.docs.filter(d=>programOf(d.data())===id);if(!doc.exists&&!meetings.length)throw Object.assign(Error('Month not found.'),{status:404});if((doc.data()?.revision||0)!==expected)throw new ConflictError();if(meetings.length>150)throw Object.assign(Error('This month is too large to delete in one operation.'),{status:400});const changes=[{name:'programs',id,value:null}];for(const m of meetings){tx.delete(m.ref);tx.delete(this.collection('reports').doc(m.id));tx.delete(this.collection('report_links').doc(m.id));for(const name of ['meetings','reports','report_links'])changes.push({name,id:m.id,value:null});}tx.delete(ref);const version=(meta.data()?.version||0)+1;tx.set(this.meta,{version},{merge:true});return{value:{deleted:meetings.length},version,changes};}).catch(e=>{if(e instanceof ConflictError)this.forget('programs',id);throw e;});}
  collection(name){return this.db.collection('gubae_'+name);}
  async write(name,id,expected,updater){try{const next=await this.transaction(name,async tx=>{const ref=this.collection(name).doc(id);const[record,meta]=await tx.getAll(ref,this.meta);const old=record.exists?{...record.data(),id}:null;if(expected!==undefined&&expected!==null&&(old?.revision||0)!==expected)throw new ConflictError();const next={...updater(old),id,revision:(old?.revision||0)+1,updatedAt:new Date().toISOString()};tx.set(ref,next);const version=(meta.data()?.version||0)+1;tx.set(this.meta,{version},{merge:true});return{value:next,version,changes:[{name,id,value:next}]};});return clone(next);}catch(e){if(e instanceof ConflictError)this.forget(name,id);throw e;}}
}
