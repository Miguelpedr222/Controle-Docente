// Fiscaliza Docente — integração inicial com Supabase (autenticação + sincronização manual)
const SUPABASE_URL = 'https://ecpttoacobvqddfxlabw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Z5J4rYHVUVDfB1lrW57CIw_7MexrAZ7';
const SESSION_KEY = 'fiscaliza-supabase-session-v1';

function getSession(){ try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function saveSession(session){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
async function request(path, options={}, token=null){
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json', ...(options.headers||{}) };
  if(token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if(!response.ok){ const msg = data?.msg || data?.message || data?.error_description || data?.error || `HTTP ${response.status}`; throw new Error(msg); }
  return data;
}
export async function signIn(email,password){
  const data = await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
  saveSession(data); return data.user;
}
export async function signOut(){ const s=getSession(); if(s?.access_token){ try{await request('/auth/v1/logout',{method:'POST'},s.access_token);}catch{}} clearSession(); }
export function sessionInfo(){ const s=getSession(); return s?.user ? {email:s.user.email, user:s.user} : null; }
async function validSession(){
  let s=getSession(); if(!s?.access_token || !s?.user?.id) throw new Error('Entre com seu usuário do Supabase antes de sincronizar.');
  if(s.expires_at && s.expires_at*1000 < Date.now()+60000){
    if(!s.refresh_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const refreshed=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})}); saveSession(refreshed); s=refreshed;
  }
  return s;
}
async function listCloud(s, type){
  const q=`/rest/v1/fiscaliza_records?select=record_type,record_key,payload&user_id=eq.${encodeURIComponent(s.user.id)}&record_type=eq.${encodeURIComponent(type)}&limit=5000`;
  return await request(q,{method:'GET'},s.access_token) || [];
}
async function pushRows(s,type,rows,keyFn){
  const out=[];
  for(let i=0;i<rows.length;i+=100){
    const chunk=rows.slice(i,i+100).map(row=>({user_id:s.user.id,record_type:type,record_key:keyFn(row),payload:row,updated_at:new Date().toISOString()}));
    if(!chunk.length) continue;
    await request('/rest/v1/fiscaliza_records?on_conflict=user_id,record_type,record_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(chunk)},s.access_token);
    out.push(...chunk);
  }
  return out.length;
}
export async function syncDatabase(db){
  const s=await validSession();
  const [schedule,inspections,settings]=await Promise.all([db.getAll('schedule'),db.getAll('inspections'),db.getAll('settings')]);
  // Upload local state first. Existing local records are authoritative on key conflicts.
  const uploaded = await Promise.all([
    pushRows(s,'schedule',schedule,x=>String(x.id)),
    pushRows(s,'inspections',inspections,x=>String(x.id)),
    pushRows(s,'settings',settings,x=>String(x.key))
  ]);
  // Pull only records missing locally, never overwrite local data during a sync.
  const [cloudSchedule,cloudInspections,cloudSettings]=await Promise.all([listCloud(s,'schedule'),listCloud(s,'inspections'),listCloud(s,'settings')]);
  const localSchedule=new Set(schedule.map(x=>String(x.id)));
  const localInspections=new Set(inspections.map(x=>String(x.id)));
  const localSettings=new Set(settings.map(x=>String(x.key)));
  let downloaded=0;
  for(const r of cloudSchedule){if(!localSchedule.has(String(r.record_key)) && r.payload){await db.put('schedule',r.payload);localSchedule.add(String(r.record_key));downloaded++;}}
  for(const r of cloudInspections){if(!localInspections.has(String(r.record_key)) && r.payload){const payload={...r.payload}; const id=Number(r.record_key); if(Number.isSafeInteger(id)&&id>0) payload.id=id; await db.put('inspections',payload);localInspections.add(String(r.record_key));downloaded++;}}
  for(const r of cloudSettings){if(!localSettings.has(String(r.record_key)) && r.payload){await db.put('settings',r.payload);localSettings.add(String(r.record_key));downloaded++;}}
  return {uploaded:uploaded.reduce((a,b)=>a+b,0),downloaded,email:s.user.email};
}
