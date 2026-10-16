export class ConflictError extends Error{constructor(){super('This record changed on another device. Refresh and review the latest version.');this.status=409;}}
export class FirestoreStore{
  constructor(db){this.db=db;this.meta=db.doc('gubae_meta/state');}
  async seed(meetings){await this.db.runTransaction(async tx=>{const meta=await tx.get(this.meta);if(meta.data()?.initialized)return;const refs=meetings.map(m=>this.db.doc('gubae_meetings/'+m.id));const docs=await tx.getAll(...refs);for(let i=0;i<docs.length;i++)if(!docs[i].exists)tx.create(refs[i],{...meetings[i],revision:1,recipient:'',teacherId:null,sent:{},updatedAt:new Date().toISOString()});tx.set(this.meta,{initialized:true,version:(meta.data()?.version||0)+1});});}
  collection(name){return this.db.collection('gubae_'+name);}
  async get(name,id){const d=await this.collection(name).doc(id).get();return d.exists?{...d.data(),id:d.id}:null;}
  async list(name){const q=await this.collection(name).get();return q.docs.map(d=>({...d.data(),id:d.id}));}
  async version(){return(await this.meta.get()).data()?.version||0;}
  async write(name,id,expected,updater){return this.db.runTransaction(async tx=>{const ref=this.collection(name).doc(id);const[record,meta]=await tx.getAll(ref,this.meta);const old=record.exists?{...record.data(),id}:null;if(expected!==undefined&&expected!==null&&(old?.revision||0)!==expected)throw new ConflictError();const next={...updater(old),id,revision:(old?.revision||0)+1,updatedAt:new Date().toISOString()};tx.set(ref,next);tx.set(this.meta,{version:(meta.data()?.version||0)+1},{merge:true});return next;});}
}
