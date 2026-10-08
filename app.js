import { INITIAL_DATA, APP_META, TEACHER_ALIASES } from './data.js';
import * as db from './database.js';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const todayISO=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const deviceNow=()=>new Date();
const deviceClock=()=>{const d=deviceNow();return {date:todayISO(),time:d.toTimeString().slice(0,5),timestamp:d.getTime()};};
const deviceTime=()=>deviceNow().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const timeToMinutes=v=>{if(!v)return 9999;const m=String(v).match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):9999};
const rondaTiming=x=>{const clock=deviceClock();const date=String(x.date||'');if(date<clock.date)return {key:'overdue',label:'ATRASADA',className:'overdue'};if(date>clock.date)return {key:'future',label:'PRÓXIMA',className:'upcoming'};const now=timeToMinutes(clock.time),start=timeToMinutes(x.start);if(start===9999)return {key:'unknown',label:'SEM HORÁRIO',className:'unknown'};if(now<start)return {key:'future',label:'PRÓXIMA',className:'upcoming'};if(now<start+10)return {key:'live',label:'NO HORÁRIO',className:'active'};return {key:'overdue',label:'ATRASADA',className:'overdue'};};
const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString('pt-BR'): '—';
const statusClass=s=>{s=(s||'').toLowerCase();if(s.includes('presente'))return'present';if(s.includes('substit'))return'substitute';if(s.includes('atras'))return'late';if(s.includes('falta')||s.includes('ausente')||s.includes('localizado'))return'absent';if(s.includes('just'))return'justified';if(s.includes('unific')||s.includes('cancel')||s.includes('outro'))return'other';return'pending'};
const unique=a=>[...new Set(a.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
const state={view:'dashboard',schedule:[],inspections:[],rounds:[],settings:{},date:todayISO(),search:'',status:'',historyMonth:todayISO().slice(0,7),historyStatus:'',selectedTeacher:'',skippedRounds:loadSkippedRounds()};
const titles={dashboard:'Início',ronda:'Rondas',escala:'Escala',historico:'Histórico',professores:'Professores',ficha:'Ficha do docente',salas:'Salas',relatorios:'Relatórios',config:'Configurações'};

window.addEventListener('error',e=>console.error('Fiscaliza Docente:',e.error||e.message));

document.addEventListener('DOMContentLoaded',async()=>{
  try{
    bindNavigation();
    await db.seedIfEmpty(INITIAL_DATA);
    await syncScheduleMetadata();
    await syncInspectionTeacherNames();
    await reload();
    await migrateLegacyRoomChecks();
    await cleanupDuplicateData();
    await reload();
    render();
  }catch(err){console.error(err);showError(err.message||'Falha ao iniciar o aplicativo.');}
});

function bindNavigation(){
  document.addEventListener('click',e=>{
    const v=e.target.closest('[data-view]');
    if(v){e.preventDefault();navigate(v.dataset.view);return;}
    const inspect=e.target.closest('[data-inspect]');
    if(inspect){e.preventDefault();openInspection(inspect.dataset.inspect, inspect.dataset.inspectMode||'normal', inspect.dataset.inspectRoom||'');return;}
    const next=e.target.closest('[data-next-ronda]');
    if(next){e.preventDefault();const item=nextRonda();if(item){state.date=item.date;state.view='ronda';render();window.scrollTo({top:0,behavior:'smooth'});}return;}
    const skip=e.target.closest('[data-skip-ronda]');
    if(skip){e.preventDefault();const item=skipCurrentRound();if(item){state.date=item.date;state.view='ronda';render();toast('Ronda pulada sem registrar ocorrência. Próxima ronda carregada.');}else{render();toast('Não há outra ronda pendente.');}return;}
    const clearSkip=e.target.closest('[data-clear-skips]');
    if(clearSkip){e.preventDefault();clearSkippedForDate(state.date);render();toast('Rondas puladas foram reabertas.');return;}
    const restoreSkip=e.target.closest('[data-restore-skip]');
    if(restoreSkip){e.preventDefault();restoreSkippedRound(restoreSkip.dataset.restoreSkip);render();toast('Ronda devolvida à fila.');return;}
    const newClass=e.target.closest('[data-new-class]');
    if(newClass){e.preventDefault();openNewClass();return;}
    const teacher=e.target.closest('[data-teacher]');
    if(teacher){e.preventDefault();state.selectedTeacher=teacher.dataset.teacher;state.view='ficha';render();window.scrollTo({top:0,behavior:'smooth'});return;}
    const back=e.target.closest('[data-back-professores]');
    if(back){e.preventDefault();state.selectedTeacher='';state.view='professores';render();return;}
    const go=e.target.closest('[data-go]');
    if(go){e.preventDefault();navigate(go.dataset.go);return;}
  });
  $('#menuBtn').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#backdrop').classList.add('show')});
  $('#backdrop').addEventListener('click',closeMenu);
  $('#moreBtn').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#backdrop').classList.add('show')});
  $('#closeDialog').addEventListener('click',closeDialog);$('#cancelDialog').addEventListener('click',closeDialog);
  $('#inspectionForm').addEventListener('submit',saveInspection);$('#newClassForm').addEventListener('submit',saveNewClass);$('#closeClassDialog').addEventListener('click',closeNewClass);$('#cancelClassDialog').addEventListener('click',closeNewClass);
}
function closeMenu(){$('#sidebar').classList.remove('open');$('#backdrop').classList.remove('show')}
function navigate(view){if(!titles[view])view='dashboard';state.view=view;closeMenu();$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.bottom-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));render();window.scrollTo({top:0,behavior:'smooth'})}
async function reload(){state.schedule=await db.getAll('schedule');state.inspections=await db.getAll('inspections');state.settings=await db.get('settings','app')||{};state.rounds=loadRounds();populateTeachers()}
async function migrateLegacyRoomChecks(){const inspections=await db.getAll('inspections');const schedules=await db.getAll('schedule');for(const x of schedules){let checks=normalizeRoomChecks(x);const rel=inspections.filter(i=>String(i.scheduleId||'')===String(x.id));for(const c of checks){const hit=rel.find(i=>String(i.plannedRoom||i.presentRoom||'').trim()===String(c.room).trim())||rel.find(i=>String(i.plannedRoom||'').toLowerCase().includes(String(c.room).toLowerCase()));if(hit){c.done=true;c.status=hit.status||c.status;c.presentTeacher=hit.presentTeacher||c.presentTeacher;c.presentRoom=hit.presentRoom||c.presentRoom||c.room;c.checkedTime=hit.checkedTime||c.checkedTime;c.realStart=(hit.realTime||'').split('/')[0]||c.realStart;c.realEnd=(hit.realTime||'').split('/')[1]||c.realEnd;c.notes=hit.notes||c.notes;c.followUpPending=!!hit.followUpPending;c.initialStatus=hit.initialStatus||c.initialStatus;c.initialCheckedTime=hit.initialCheckedTime||c.initialCheckedTime;c.initialNotes=hit.initialNotes||c.initialNotes;c.followUpCheckedTime=hit.followUpCheckedTime||c.followUpCheckedTime;c.followUpTeacher=hit.followUpTeacher||c.followUpTeacher;c.followUpNotes=hit.followUpNotes||c.followUpNotes;}}const complete=checks.every(c=>c.done);const next={...x,roomChecks:checks,recordStatus:complete?'Fiscalizado':'Pendente',status:complete?(checks.map(c=>c.status).filter(Boolean).length?(new Set(checks.map(c=>c.status).filter(Boolean)).size===1?checks.find(c=>c.status)?.status:'Fiscalização concluída'):null):null,followUpPending:checks.some(c=>c.followUpPending)};await db.put('schedule',next)}}
async function cleanupDuplicateData(){
  // Limpeza idempotente: pode rodar novamente sem apagar registros legítimos.
  const schedules=await db.getAll('schedule');
  const inspections=await db.getAll('inspections');
  const deletedRec=await db.get('settings','deletedScheduleIds')||{key:'deletedScheduleIds',ids:[]};
  const deleted=new Set(deletedRec.ids||[]);
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[–—−]/g,'-').replace(/\s+/g,' ');
  const canonRoom=v=>splitRooms(v).map(norm).sort().join(' + ');
  const canonSubject=v=>String(v??'').split(/\n+/).map(norm).filter(Boolean).sort().join(' / ');
  const scheduleKey=x=>[norm(x.date),norm(x.start),norm(x.end),norm(x.period),canonRoom(x.room),norm(canonicalTeacher(x.scheduledTeacher)),canonSubject(x.subject)].join('|');
  const score=x=>{
    const checks=Array.isArray(x.roomChecks)?x.roomChecks:[];
    return (x.status?4:0)+(x.recordStatus==='Fiscalizado'?3:0)+(checks.filter(c=>c.done).length*2)+(x.followUpPending?2:0)+(x.notes?1:0)+(x.presentTeacher?1:0)+(x.updatedAt?1:0);
  };
  const groups=new Map();
  for(const x of schedules){
    if(deleted.has(x.id)) continue;
    const key=scheduleKey(x);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(x);
  }
  const removedScheduleIds=new Set();
  for(const group of groups.values()){
    if(group.length<2) continue;
    group.sort((a,b)=>score(b)-score(a) || String(a.updatedAt||a.createdAt||'').localeCompare(String(b.updatedAt||b.createdAt||'')) || String(a.id).localeCompare(String(b.id)));
    const keep=group[0];
    const drops=group.slice(1);
    // Junta o nível de sala do duplicado ao registro que será mantido.
    let mergedChecks=normalizeRoomChecks(keep);
    for(const drop of drops){
      const dc=normalizeRoomChecks(drop);
      for(const d of dc){
        const idx=mergedChecks.findIndex(c=>norm(c.room)===norm(d.room));
        if(idx>=0 && (!mergedChecks[idx].done || d.followUpPending)){
          if(d.done) mergedChecks[idx]={...mergedChecks[idx],...d,room:mergedChecks[idx].room};
        }
      }
      const related=inspections.filter(i=>String(i.scheduleId)===String(drop.id));
      for(const i of related){
        const room=norm(i.presentRoom||i.plannedRoom);
        const already=inspections.some(j=>String(j.scheduleId)===String(keep.id) && norm(j.presentRoom||j.plannedRoom)===room && norm(j.status)===norm(i.status) && norm(j.checkedTime)===norm(i.checkedTime) && norm(j.notes)===norm(i.notes));
        if(!already) await db.put('inspections',{...i,scheduleId:keep.id});
        if(i.id!=null) await db.remove('inspections',i.id);
      }
      removedScheduleIds.add(drop.id);
      await db.remove('schedule',drop.id);
    }
    const complete=mergedChecks.length>0 && mergedChecks.every(c=>c.done);
    await db.put('schedule',{...keep,roomChecks:mergedChecks,recordStatus:complete?'Fiscalizado':'Pendente',status:complete?roomStatusSummary({...keep,roomChecks:mergedChecks}):null,followUpPending:mergedChecks.some(c=>c.followUpPending)});
  }

  // Limpa histórico duplicado por conteúdo real. scheduleId não participa da chave,
  // pois cópias da mesma fiscalização podem estar ligadas a IDs de ronda diferentes.
  const current=await db.getAll('inspections');
  const seen=new Map();
  for(const i of current){
    const key=[norm(i.date),norm(i.scheduledTeacher||i.assignedName),norm(i.presentTeacher),canonRoom(i.presentRoom||i.plannedRoom),norm(i.status),norm(i.checkedTime),norm(i.realTime),norm(i.notes),norm(i.followUpCheckedTime),norm(i.followUpTeacher),norm(i.followUpNotes)].join('|');
    const old=seen.get(key);
    if(!old){seen.set(key,i);continue;}
    const keep=String(i.updatedAt||i.createdAt||'')>String(old.updatedAt||old.createdAt||'')?i:old;
    const drop=keep===i?old:i;
    seen.set(key,keep);
    if(drop.id!=null) await db.remove('inspections',drop.id);
  }
  if(removedScheduleIds.size || deleted.size) await db.put('settings',{key:'deletedScheduleIds',ids:[...new Set([...deleted,...removedScheduleIds])]});
  await db.put('settings',{key:'duplicateCleanupVersion',version:2,ranAt:new Date().toISOString()});
}

async function deleteRound(id){
  const x=state.schedule.find(r=>String(r.id)===String(id));
  if(!x){toast('Ronda não encontrada.','error');return;}
  const label=`${fmtDate(x.date)} • ${x.start||'--:--'} • ${x.room||'sala não definida'} • ${x.scheduledTeacher||'professor não informado'}`;
  if(!confirm(`Excluir definitivamente esta ronda?\n\n${label}\n\nA ronda será removida da escala e os registros de histórico ligados a ela também serão removidos. Essa ação não pode ser desfeita sem um backup.`))return;
  const rec=await db.get('settings','deletedScheduleIds')||{key:'deletedScheduleIds',ids:[]};
  const ids=new Set(rec.ids||[]);ids.add(x.id);
  const related=await db.getAll('inspections');
  for(const i of related.filter(i=>String(i.scheduleId)===String(x.id))) if(i.id!=null) await db.remove('inspections',i.id);
  await db.remove('schedule',x.id);
  await db.put('settings',{key:'deletedScheduleIds',ids:[...ids]});
  state.skippedRounds=state.skippedRounds.filter(k=>k!==roundKey(x));saveSkippedRounds();
  await reload();render();toast('Ronda excluída. Ela não voltará pela sincronização da escala.');
}

function canonicalTeacher(name){if(!name)return name;return TEACHER_ALIASES[name]||name;}
async function syncInspectionTeacherNames(){const inspections=await db.getAll('inspections');const writes=[];for(const old of inspections){const next={...old};const a=canonicalTeacher(old.scheduledTeacher);const b=canonicalTeacher(old.presentTeacher);const c=canonicalTeacher(old.assignedName);if(a!==old.scheduledTeacher||b!==old.presentTeacher||c!==old.assignedName){if(old.scheduledTeacher!=null)next.scheduledTeacher=a;if(old.presentTeacher!=null)next.presentTeacher=b;if(old.assignedName!=null)next.assignedName=c;writes.push(next);}}if(writes.length)await db.bulkPut('inspections',writes)}
function splitRooms(room){const raw=String(room||'').split(/\s+e\s+/i).map(v=>v.trim()).filter(Boolean);if(raw.length<=1)return raw.length?raw:['Sala não definida'];const first=raw[0];const m=first.match(/^(.*?)(\d+[A-Za-z]?)$/);const prefix=m?m[1]:'';return raw.map((part,i)=>i===0?part:(/^\d/.test(part)&&prefix?prefix+part:part));}
function emptyRoomCheck(room){return {room,done:false,status:'',presentTeacher:'',presentRoom:'',checkedTime:'',realStart:'',realEnd:'',notes:'',followUpPending:false,followUpCheckedTime:'',followUpTeacher:'',followUpNotes:''};}
function normalizeRoomChecks(x){const rooms=splitRooms(x.room);const old=Array.isArray(x.roomChecks)?x.roomChecks.map(c=>({...c})):null;let checks=rooms.map(room=>{const found=old?.find(c=>String(c.room||'').trim()===room);return found?{...emptyRoomCheck(room),...found,room}:{...emptyRoomCheck(room)}});if(!old&&x.status&&rooms.length===1){checks=checks.map(c=>({...c,done:true,status:x.status,presentTeacher:x.presentTeacher||'',presentRoom:x.presentRoom||'',checkedTime:x.checkedTime||'',realStart:x.realStart||'',realEnd:x.realEnd||'',notes:x.notes||'',followUpPending:x.status==='Atraso'}));}return checks;}
async function syncScheduleMetadata(){const current=await db.getAll('schedule');const byId=new Map(current.map(x=>[String(x.id),x]));const writes=[];for(const base of INITIAL_DATA.schedule){const old=byId.get(String(base.id));if(!old){writes.push({...base,roomChecks:normalizeRoomChecks(base)});continue;}const merged={...old,...base};for(const key of ['status','presentTeacher','presentRoom','checkedTime','realStart','realEnd','notes','recordStatus','createdAt','updatedAt','verifiedBy','realTime','roomChecks','followUpPending','followUpCheckedTime','followUpTeacher','followUpNotes']){if(Object.prototype.hasOwnProperty.call(old,key))merged[key]=old[key];}merged.roomChecks=normalizeRoomChecks(merged);if(old.recordStatus==null&&old.status)merged.recordStatus='Fiscalizado';writes.push(merged);}if(writes.length)await db.bulkPut('schedule',writes)}
function loadRounds(){try{return JSON.parse(localStorage.getItem('fiscaliza-docente-rounds')||'[]')}catch{return []}}
function saveRounds(){localStorage.setItem('fiscaliza-docente-rounds',JSON.stringify(state.rounds))}
function loadSkippedRounds(){try{return JSON.parse(localStorage.getItem('fiscaliza-docente-skipped-rounds')||'[]')}catch{return []}}
function saveSkippedRounds(){localStorage.setItem('fiscaliza-docente-skipped-rounds',JSON.stringify(state.skippedRounds))}
function roundKey(x){return [x.date,x.id].map(v=>String(v||'').trim()).join('|')}
function skipCurrentRound(){const groups=rondaGroups(pendingRowsForDate(state.date));const current=groups[0]?.[0];if(!current)return null;const key=roundKey(current);if(!state.skippedRounds.includes(key)){state.skippedRounds.push(key);saveSkippedRounds();}return nextRonda();}
function clearSkippedForDate(date){state.skippedRounds=state.skippedRounds.filter(k=>!k.startsWith(String(date)+'|'));saveSkippedRounds();}
function restoreSkippedRound(key){state.skippedRounds=state.skippedRounds.filter(k=>k!==key);saveSkippedRounds();}
function roomProgress(x){const checks=normalizeRoomChecks(x);const done=checks.filter(c=>c.done).length;const pending=checks.filter(c=>!c.done);const followUps=checks.filter(c=>c.followUpPending);return {checks,done,total:checks.length,pending,followUps,complete:done===checks.length};}
function roundIsPending(x){return !roomProgress(x).complete;}
function roundNeedsFollowUp(x){return roomProgress(x).followUps.length>0;}
function roomStatusSummary(x){const statuses=roomProgress(x).checks.map(c=>c.status).filter(Boolean);if(!statuses.length)return null;if(new Set(statuses).size===1)return statuses[0];return 'Fiscalização concluída';}
function populateTeachers(){$('#teacherList').innerHTML=unique(state.schedule.flatMap(x=>[x.scheduledTeacher,x.presentTeacher])).map(n=>`<option value="${esc(n)}"></option>`).join('')}
function render(){try{$('#todayText').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});const fn={dashboard:dashboard,ronda:ronda,escala:escala,historico:historico,professores:professores,ficha:ficha,salas:salas,relatorios:relatorios,config:config}[state.view];$('#view').innerHTML=fn();}catch(err){console.error(err);showError('Não foi possível renderizar esta tela.');}}
let liveClockTimer=setInterval(()=>{if(state.view==='ronda'||state.view==='dashboard')render();},30000);
function showError(msg){$('#view').innerHTML=`<div class="card empty"><strong>O aplicativo encontrou um erro.</strong><p>${esc(msg)}</p><button class="btn primary" onclick="location.reload()">Recarregar aplicativo</button></div>`}
function pageHead(title,text,actions=''){return `<div class="page-head"><div><h1>${title}</h1><p>${text}</p></div><div class="toolbar">${actions}</div></div>`}
function badge(s){return `<span class="badge ${statusClass(s)}">${esc(s||'Pendente')}</span>`}
function metric(label,n,sub){return `<article class="metric"><span class="label">${label}</span><strong>${n}</strong><small>${sub}</small></article>`}
function pendingRowsForDate(date){return state.schedule.filter(x=>x.date===date&&roundIsPending(x)&&!state.skippedRounds.includes(roundKey(x))).sort((a,b)=>String(a.start||'99:99').localeCompare(String(b.start||'99:99'))||String(a.room||'').localeCompare(String(b.room||''),'pt-BR')||String(a.scheduledTeacher||'').localeCompare(String(b.scheduledTeacher||''),'pt-BR'));}
function rondaGroups(rows){return rows.map(x=>[x]).sort((a,b)=>String(a[0]?.start||'99:99').localeCompare(String(b[0]?.start||'99:99'))||String(a[0]?.room||'').localeCompare(String(b[0]?.room||''),'pt-BR'));}
function nextRonda(){const base=state.date||todayISO();const pending=state.schedule.filter(x=>roundIsPending(x)&&!state.skippedRounds.includes(roundKey(x))&&String(x.date||'')>=base);pending.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start||'99:99').localeCompare(String(b.start||'99:99'))||String(a.room||'').localeCompare(String(b.room||''),'pt-BR'));return pending[0]||null;}
function followUpRowsForDate(date){return state.schedule.filter(x=>x.date===date&&roundNeedsFollowUp(x)).sort((a,b)=>String(a.start||'99:99').localeCompare(String(b.start||'99:99')));}
function dashboard(){
  const all=state.schedule, done=all.filter(x=>x.status), present=done.filter(x=>x.status==='Presente'), pending=all.length-done.length;
  const subs=done.filter(x=>(x.status||'').includes('Substit')), abs=done.filter(x=>['Falta','Professor não localizado'].includes(x.status));
  const late=done.filter(x=>x.status==='Atraso'), justified=done.filter(x=>x.status==='Justificada');
  const pct=all.length?Math.round(done.length/all.length*100):0;
  const next=nextRonda(), nowText=deviceTime(), timing=next?rondaTiming(next):null;
  const today=all.filter(x=>x.date===state.date).slice(0,6);
  const nextLabel=timing?.key==='overdue'?'RONDA ATRASADA':'PRÓXIMA RONDA';
  const nextHint=timing?.key==='overdue'?'O horário desta aula já começou e ela ainda está pendente. Faça esta sala agora.':(String(next?.date||'')===todayISO()?'Próxima aula pendente de hoje.':'Próxima aula pendente na escala.');
  const nextCard=next?`<section class="next-round card panel ${timing.key==='overdue'?'is-overdue':''}"><div class="next-round-label">${nextLabel}</div><div class="device-clock">Horário do dispositivo: <strong>${nowText}</strong></div><div class="next-round-main"><div><span class="muted">${fmtDate(next.date)} • ${esc(next.start||'--:--')} — ${esc(next.end||'--:--')}</span><h2>${esc(next.room||'Sala não definida')}</h2><p>${esc((next.subject||'').replace(/\n/g,' • '))}</p><div class="next-teacher">${esc(nextHint)}<br>Professor escalado: <strong>${esc(next.scheduledTeacher||'Não informado')}</strong></div></div><button class="btn primary" data-next-ronda>Ir para a ronda →</button></div></section>`:`<section class="card panel"><div class="empty"><strong>Nenhuma ronda pendente encontrada.</strong><p>Horário do dispositivo: <strong>${nowText}</strong>. Você pode cadastrar uma nova aula pela Escala.</p></div></section>`;
  const statusData=[['Presente',present.length,'#159447'],['Atraso',late.length,'#d98a00'],['Falta',abs.length,'#d64545'],['Substituição',subs.length,'#4d6fd8'],['Justificada',justified.length,'#7b61c8'],['Outras',Math.max(0,done.length-present.length-late.length-abs.length-subs.length-justified.length),'#718096']];
  const topTeachers=teacherAnalytics().sort((a,b)=>b.occurrences-a.occurrences).slice(0,6);
  const maxOcc=Math.max(1,...topTeachers.map(x=>x.occurrences));
  const month=state.date.slice(0,7);
  const monthly=monthlyAnalytics(month);
  return `<section class="hero"><img class="hero-mark" src="./unig-logo-transparent.png" alt=""><div><small>UNIVERSIDADE IGUAÇU • MEDICINA</small><h1>Fiscaliza Docente</h1><p>Central de acompanhamento das rondas, ocorrências e histórico docente.</p><div class="hero-actions"><button class="btn light" data-next-ronda>Próxima ronda</button><button class="btn" style="background:rgba(255,255,255,.12);color:#fff" data-new-class>+ Nova aula</button><button class="btn" style="background:rgba(255,255,255,.12);color:#fff" data-go="professores">Fichas dos docentes</button></div></div></section>
  ${nextCard}
  ${pageHead('Visão geral','Indicadores calculados automaticamente a partir dos registros já salvos.')}
  <section class="metrics">${metric('Registros',all.length,'base carregada')}${metric('Fiscalizados',done.length,`${pct}% concluído`)}${metric('Presenças',present.length,'situação registrada')}${metric('Ocorrências',done.length-present.length,'não presenciais')}${metric('Pendentes',pending,'aguardando ronda')}</section>
  <div class="analytics-grid">
    <section class="card panel chart-card"><div class="panel-head"><div><h2>Distribuição das situações</h2><span class="muted">Todos os registros fiscalizados</span></div></div><div class="bar-chart">${statusData.map(([label,val,color])=>`<div class="bar-row"><span>${esc(label)}</span><div class="bar-track"><i style="width:${done.length?Math.max(val/done.length*100,val?3:0):0}%;background:${color}"></i></div><strong>${val}</strong></div>`).join('')}</div></section>
    <section class="card panel chart-card"><div class="panel-head"><div><h2>Professores com mais ocorrências</h2><span class="muted">Clique em um professor para abrir a ficha</span></div></div>${topTeachers.length?`<div class="rank-chart">${topTeachers.map(x=>`<button class="rank-row" data-teacher="${esc(x.name)}"><span class="rank-pos">${x.rank}</span><span class="rank-name">${esc(x.name)}</span><div class="rank-track"><i style="width:${Math.max(x.occurrences/maxOcc*100,x.occurrences?4:0)}%"></i></div><strong>${x.occurrences}</strong></button>`).join('')}</div>`:`<div class="empty">Ainda não há ocorrências suficientes para montar o ranking.</div>`}</section>
  </div>
  <section class="card panel chart-card"><div class="panel-head"><div><h2>Evolução mensal</h2><span class="muted">Registros fiscalizados por mês</span></div></div><div class="monthly-chart">${monthly.map(m=>`<div class="month-col"><div class="month-value">${m.total}</div><div class="month-bar-wrap"><i style="height:${m.max?Math.max(m.total/m.max*100,m.total?5:0):0}%"></i></div><span>${m.label}</span></div>`).join('')}</div></section>
  <div class="dashboard-grid"><section class="card panel"><div class="panel-head"><h2>Ronda selecionada</h2><span class="muted">${fmtDate(state.date)}</span></div><div style="margin-bottom:14px"><div class="muted" style="margin-bottom:7px">Progresso geral</div><div class="progress"><span style="width:${pct}%"></span></div></div>${today.length?today.map(x=>miniRow(x)).join(''):`<div class="empty"><strong>Nenhuma escala cadastrada para ${fmtDate(state.date)}.</strong>Escolha outra data em Escala ou Rondas.</div>`}</section><section class="card panel"><div class="panel-head"><h2>Situações</h2></div>${[['Presente',present.length],['Substituição',subs.length],['Falta',abs.length],['Atraso',late.length],['Justificada',justified.length],['Pendente',pending]].map(([n,v])=>`<div class="kpi"><span>${n}</span>${badge(n==='Pendente'?'Pendente':n)}<strong style="margin-left:auto;margin-right:4px">${v}</strong></div>`).join('')}</section></div>`;
}
function teacherAnalytics(){
  const names=unique(state.schedule.flatMap(x=>[x.scheduledTeacher,x.presentTeacher]));
  return names.map(name=>{
    const rows=teacherRows(name); const done=rows.filter(x=>x.status); const occurrences=done.filter(x=>x.status!=='Presente').length;
    const present=done.filter(x=>x.status==='Presente').length; const rate=done.length?Math.round(present/done.length*100):0;
    return {name,rows,done,occurrences,present,rate};
  }).filter(x=>x.done.length>0).sort((a,b)=>b.occurrences-a.occurrences||a.name.localeCompare(b.name,'pt-BR')).map((x,i)=>({...x,rank:i+1}));
}
function teacherRows(name){
  const rows=state.schedule.filter(x=>x.scheduledTeacher===name||x.presentTeacher===name);
  const history=state.inspections.filter(x=>x.scheduledTeacher===name||x.presentTeacher===name).map(x=>({...x,source:'Histórico'}));
  const merged=[...rows.map(x=>({...x,plannedRoom:x.room})),...history]; const seen=new Set();
  return merged.filter(x=>{const k=[x.date,x.scheduledTeacher,x.presentTeacher,x.status,x.presentRoom||x.plannedRoom,x.notes].map(v=>String(v||'')).join('|');if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}
function teacherStatus(analytics){
  if(analytics.done.length<3) return {label:'Em acompanhamento',className:'monitor',reason:'Ainda há poucos registros para formar um indicador estável.'};
  if(analytics.rate>=90 && analytics.occurrences<=Math.max(2,Math.ceil(analytics.done.length*.1))) return {label:'Regularidade alta',className:'good',reason:'Predominância de registros com presença e poucas ocorrências.'};
  if(analytics.rate>=75 && analytics.occurrences<=Math.max(4,Math.ceil(analytics.done.length*.25))) return {label:'Acompanhamento necessário',className:'watch',reason:'Existem ocorrências pontuais que merecem acompanhamento.'};
  return {label:'Atenção',className:'attention',reason:'A quantidade de ocorrências está acima do parâmetro de regularidade.'};
}
function ficha(){
  const name=state.selectedTeacher; const analytics=teacherAnalytics().find(x=>x.name===name);
  if(!analytics) return `${pageHead('Ficha do docente','O professor selecionado não foi encontrado.',`<button class="btn ghost" data-back-professores>← Voltar</button>`)}<div class="empty card">Selecione um professor na área de Professores.</div>`;
  const s=teacherStatus(analytics), rows=analytics.rows, byStatus=unique(rows.map(x=>x.status)).map(status=>[status,rows.filter(x=>x.status===status).length]);
  return `${pageHead('Ficha do docente','Histórico individual consolidado a partir das fiscalizações registradas.',`<button class="btn ghost" data-back-professores>← Todos os professores</button>`)}<section class="teacher-profile card"><div class="profile-main"><div class="avatar">${esc(name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div><span class="muted">DOCENTE MONITORADO</span><h2>${esc(name)}</h2><p>${analytics.done.length} fiscalizações com situação registrada</p></div></div><div class="profile-status ${s.className}"><strong>${s.label}</strong><span>${s.reason}</span></div></section>
  <section class="metrics profile-metrics">${metric('Fiscalizações',analytics.done.length,'registros com situação')}${metric('Presenças',analytics.present,'sem ocorrência registrada')}${metric('Ocorrências',analytics.occurrences,'atrasos, faltas etc.')}${metric('Regularidade',analytics.rate+'%','presença entre fiscalizados')}</section>
  <div class="dashboard-grid"><section class="card panel"><div class="panel-head"><h2>Resumo da ficha</h2></div>${byStatus.length?byStatus.map(([st,n])=>`<div class="kpi"><span>${esc(st)}</span>${badge(st)}<strong style="margin-left:auto">${n}</strong></div>`).join(''):`<div class="empty">Nenhuma situação registrada.</div>`}</section><section class="card panel"><div class="panel-head"><h2>Disciplinas / salas</h2></div>${unique(rows.map(x=>`${x.subject||'Disciplina não informada'} • ${x.presentRoom||x.plannedRoom||x.room||'Sala não informada'}`)).slice(0,10).map(v=>`<div class="kpi"><span>${esc(v)}</span></div>`).join('')||'<div class="empty">Sem dados.</div>'}</section></div>
  <section class="card panel"><div class="panel-head"><div><h2>Histórico de ocorrências</h2><span class="muted">Somente registros efetivamente salvos</span></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Disciplina</th><th>Sala</th><th>Situação</th><th>Professor presente</th><th>Observação</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(fmtDate(x.date))}</td><td>${esc((x.subject||'—').replace(/\n/g,' • '))}</td><td>${esc(x.presentRoom||x.plannedRoom||x.room||'—')}</td><td>${badge(x.status)}</td><td>${esc(x.presentTeacher||'—')}</td><td>${esc(x.notes||'—')}</td></tr>`).join(''):`<tr><td colspan="6">Nenhum registro.</td></tr>`}</tbody></table></div></section>`;
}
function monthlyAnalytics(month){
  const months=[]; const base=new Date(month+'-01T00:00:00'); for(let i=5;i>=0;i--){const d=new Date(base.getFullYear(),base.getMonth()-i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const total=state.schedule.filter(x=>String(x.date||'').startsWith(key)&&x.status).length;months.push({key,total,label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')});} const max=Math.max(1,...months.map(x=>x.total)); return months.map(x=>({...x,max}));
}
function miniRow(x){const p=roomProgress(x);const label=p.complete?(p.followUps.length?'Retorno pendente':roomStatusSummary(x)):`${p.done}/${p.total} sala(s) fiscalizada(s)`;return `<div class="kpi"><div><strong>${esc(x.room||'Sala não definida')}</strong><div class="muted">${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.period||'')}</div><small>${esc(label)}</small></div><div style="display:flex;align-items:center;gap:8px"><span class="badge ${p.complete?'present':'pending'}">${p.complete?(p.followUps.length?'Retorno':'Fiscalizado'):'Pendente'}</span><button class="btn small primary" data-inspect="${esc(x.id)}">${p.complete?'Abrir':'Fiscalizar'}</button></div></div>`}
function roomCardLine(x,c){return `<div class="room-check-row ${c.done?'is-done':'is-pending'}"><div><strong>${esc(c.room)}</strong><small>${c.done?esc(c.status||'Fiscalizada'):'Ainda não fiscalizada'}${c.followUpPending?' • Retorno necessário':''}</small></div><button class="btn ${c.followUpPending?'primary':'ghost'} small" data-inspect="${esc(x.id)}" data-inspect-room="${esc(c.room)}" data-inspect-mode="${c.followUpPending?'followup':'normal'}">${c.followUpPending?'Retorno':'Abrir'}</button></div>`}
function ronda(){
  const rows=state.schedule.filter(x=>x.date===state.date);
  const pending=pendingRowsForDate(state.date); const groups=rondaGroups(pending);
  const skippedRows=state.schedule.filter(x=>x.date===state.date&&roundIsPending(x)&&state.skippedRounds.includes(roundKey(x))); const skippedGroups=rondaGroups(skippedRows);
  const followUps=followUpRowsForDate(state.date);
  const completed=rows.filter(x=>roomProgress(x).complete).length; const selectedToday=state.date===todayISO();
  const overdueGroups=groups.filter(g=>rondaTiming(g[0]).key==='overdue'); const activeGroups=groups.filter(g=>['future','live'].includes(rondaTiming(g[0]).key)); const orderedGroups=[...overdueGroups,...activeGroups];
  const current=orderedGroups[0]?.[0]; const currentTiming=current?rondaTiming(current):null; const nowText=deviceTime(); const overdueCount=overdueGroups.length;
  const skippedHtml=skippedGroups.length?`<section class="card panel skipped-rounds"><div class="panel-head"><div><h2>Rondas adiadas</h2><span class="muted">Você pode voltar qualquer uma para a fila.</span></div><button class="btn ghost small" data-clear-skips>Reabrir todas</button></div><div class="route-list">${skippedGroups.map(group=>{const x=group[0],p=roomProgress(x);return `<article class="route-item"><div class="route-index">↩</div><div class="route-info"><strong>${esc(x.room||'Sala não definida')}</strong><span>${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.period||'')}</span><small>${p.done}/${p.total} sala(s) fiscalizada(s) • ${esc((x.subject||'').replace(/\n/g,' • '))}</small></div><button class="btn primary small" data-restore-skip="${esc(roundKey(x))}">Voltar para fila</button></article>`}).join('')}</div></section>`:'';
  const followUpHtml=followUps.length?`<section class="card panel followup-panel"><div class="panel-head"><div><h2>Retornos necessários</h2><span class="muted">Professor marcado como atraso precisa ser revisado.</span></div><strong class="badge late">${followUps.reduce((n,x)=>n+roomProgress(x).followUps.length,0)}</strong></div><div class="route-list">${followUps.flatMap(x=>roomProgress(x).followUps.map(c=>`<article class="route-item"><div class="route-index">↻</div><div class="route-info"><strong>${esc(c.room)}</strong><span>${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.period||'')}</span><small>${esc(x.scheduledTeacher||'Professor escalado')} • Atraso registrado${c.checkedTime?' às '+esc(c.checkedTime):''}</small></div><button class="btn primary small" data-inspect="${esc(x.id)}" data-inspect-room="${esc(c.room)}" data-inspect-mode="followup">Verificar chegada</button></article>`)).join('')}</div></section>`:'';
  const completedRooms=rows.flatMap(x=>roomProgress(x).checks.filter(c=>c.done).map(c=>({x,c})));
  const completedHtml=completedRooms.length?`<section class="card panel completed-rounds"><div class="panel-head"><div><h2>Já fiscalizadas</h2><span class="muted">Cada sala aparece aqui assim que for conferida.</span></div><strong>${completedRooms.length} sala(s)</strong></div><div class="route-list">${completedRooms.map(({x,c})=>`<article class="route-item"><div class="route-index">✓</div><div class="route-info"><strong>${esc(c.room)}</strong><span>${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.scheduledTeacher||'Professor não informado')}</span><small>${esc(c.status||'Fiscalizado')}${c.followUpPending?' • retorno necessário':''}${c.presentTeacher?' • '+esc(c.presentTeacher):''}</small></div><button class="btn ghost small" data-inspect="${esc(x.id)}" data-inspect-mode="${c.followUpPending?'followup':'normal'}" data-inspect-room="${esc(c.room)}">${c.followUpPending?'Verificar chegada':'Abrir'}</button></article>`).join('')}</div></section>`:`<section class="card panel"><div class="empty"><strong>Nenhuma sala fiscalizada ainda.</strong><p>As salas concluídas aparecerão aqui após o registro.</p></div></section>`;
  const callout=currentTiming?.key==='overdue'?'⚠ Ronda atrasada — mais de 10 min':currentTiming?.key==='live'?'✓ Horário da aula — faça a ronda agora':'✓ Próxima aula pendente';
  return `${pageHead('Rondas','Cada sala é controlada separadamente. A aula só sai da fila quando todas as salas forem fiscalizadas.',`<span class="device-clock compact">Agora: <strong>${nowText}</strong></span><input class="control" type="date" id="rondaDate" value="${state.date}"><button class="btn ghost" data-new-class>+ Nova aula</button><button class="btn primary" data-next-ronda>Próxima</button>`)}${selectedToday?`<div class="ronda-live card"><div><strong>Horário do dispositivo</strong><span>${nowText}</span></div><div><strong>${overdueCount}</strong><span>ronda(s) atrasada(s)</span></div><div><strong>${orderedGroups.length}</strong><span>ronda(s) pendente(s)</span></div></div>`:''}<div class="ronda-summary"><div><strong>${pending.length}</strong><span>rondas pendentes</span></div><div><strong>${completed}</strong><span>salas/rondas completas</span></div><div><strong>${rows.length}</strong><span>registros no dia</span></div></div>${followUpHtml}${skippedHtml}${current?`<section class="next-focus card ${currentTiming.key==='overdue'?'is-overdue':''}"><div class="next-round-label">${currentTiming.label}</div><div class="next-focus-grid"><div><span class="status-callout ${currentTiming.className}">${callout}</span><span class="muted">${esc(current.start||'--:--')} — ${esc(current.end||'--:--')}</span><h2>${esc(current.room||'Sala não definida')}</h2><p>${esc((current.subject||'').replace(/\n/g,' • '))}</p><div class="teacher-stack"><span>${esc(current.scheduledTeacher||'Professor não informado')}</span></div><div class="room-check-list">${roomProgress(current).checks.map(c=>roomCardLine(current,c)).join('')}</div></div><div style="display:flex;flex-direction:column;gap:8px;align-items:stretch"><button class="btn ghost small" data-skip-ronda>Passar para próxima ronda</button><button class="btn ghost small" data-delete-round="${esc(current.id)}">Excluir ronda</button></div></div></section>`:''}${orderedGroups.length>1?`<div class="section-caption"><strong>${overdueGroups.length>0?'Fila de rondas':'Próximas salas'}</strong><span>${selectedToday?'Ordenadas pelo horário do dispositivo':'Em ordem de horário'}</span></div><div class="route-list">${orderedGroups.slice(1).map((group,i)=>{const x=group[0],t=rondaTiming(x),p=roomProgress(x);return `<article class="route-item ${t.key==='overdue'?'is-overdue':''}"><div class="route-index">${i+2}</div><div class="route-info"><strong>${esc(x.room||'Sala não definida')}</strong><span>${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.period||'')}</span><small>${p.done}/${p.total} sala(s) fiscalizada(s)${p.followUps.length?' • '+p.followUps.length+' retorno(s)':''}</small></div><span class="route-status ${t.className}">${t.label}</span><div style="display:flex;gap:6px"><button class="btn ghost small" data-inspect="${esc(x.id)}">Abrir</button><button class="btn ghost small" data-delete-round="${esc(x.id)}">Excluir</button></div></article>`}).join('')}</div>`:`<div class="card empty"><strong>${rows.length?'Nenhuma outra ronda na fila.':'Nenhuma aula encontrada nesta data.'}</strong><p>${rows.length?'As rondas adiadas ficam disponíveis para reabertura. Os retornos continuam no bloco “Retornos necessários”.':'Selecione outra data ou cadastre uma nova aula.'}</p></div>`}}`+completedHtml;
}
function escala(){
  let rows=[...state.schedule];
  if(state.date) rows=rows.filter(x=>x.date===state.date);
  if(state.search){const q=state.search.toLowerCase();rows=rows.filter(x=>[x.scheduledTeacher,x.room,x.subject,x.period].some(v=>String(v||'').toLowerCase().includes(q)))}
  if(state.status) rows=rows.filter(x=>x.status===state.status);
  return `${pageHead('Escala docente','Consulte a programação original e use os filtros para encontrar rapidamente uma aula.',`<input class="control" type="date" id="scaleDate" value="${state.date}"><input class="control" id="scaleSearch" value="${esc(state.search)}" placeholder="Buscar professor, sala..."><button class="btn primary" data-new-class>+ Nova aula</button>`)}<div class="table-wrap"><table class="data-table"><thead><tr><th>Horário</th><th>Sala</th><th>Período</th><th>Professor escalado</th><th>Disciplina</th><th>Situação</th><th></th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td><strong>${esc(x.start||'')}</strong><br><span class="muted">${esc(x.end||'')}</span></td><td>${esc(x.room||'—')}</td><td>${esc(x.period||'—')}</td><td><strong>${esc(x.scheduledTeacher||'—')}</strong></td><td>${esc((x.subject||'').replace(/\n/g,' • '))}</td><td>${badge(x.status)}</td><td><button class="btn primary small" data-inspect="${esc(x.id)}">Fiscalizar</button></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty"><strong>Nenhum registro encontrado.</strong></div></td></tr>`}</tbody></table></div>`;
}
function historyRows(){
  const merged=[
    ...state.schedule.filter(x=>x.status).map(x=>({date:x.date,scheduledTeacher:x.scheduledTeacher,presentTeacher:x.presentTeacher,plannedRoom:x.room,presentRoom:x.presentRoom,status:x.status,notes:x.notes,createdAt:x.createdAt||x.date+'T00:00:00',source:'Escala',scheduleId:x.id,inspectionId:null,period:x.period,subject:x.subject})),
    ...state.inspections.map(x=>({...x,source:x.source||'Histórico'}))
  ];
  const seen=new Map();
  for(const x of merged){
    const key=[String(x.date||''),canonicalTeacher(x.scheduledTeacher||x.assignedName),String(x.presentTeacher||''),splitRooms(x.presentRoom||x.plannedRoom).map(v=>v.trim().toLowerCase()).sort().join('|'),String(x.status||''),String(x.checkedTime||''),String(x.realTime||''),String(x.notes||'')].join('¦');
    const old=seen.get(key);
    if(!old || String(x.source)==='Histórico') seen.set(key,x);
  }
  return [...seen.values()].filter(x=>!state.historyMonth || String(x.date||'').startsWith(state.historyMonth)).filter(x=>!state.historyStatus || x.status===state.historyStatus).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

function historyRowsForMonth(month){return historyRowsWithoutFilter(month)}
function historyRowsWithoutFilter(month){const merged=[...state.schedule.filter(x=>x.status).map(x=>({date:x.date,scheduledTeacher:x.scheduledTeacher,presentTeacher:x.presentTeacher,plannedRoom:x.room,presentRoom:x.presentRoom,status:x.status,notes:x.notes,createdAt:x.createdAt||x.date+'T00:00:00',scheduleId:x.id})),...state.inspections.map(x=>({...x}))];const seen=new Set();return merged.filter(x=>{const key=[x.date,x.scheduledTeacher||x.assignedName,x.presentTeacher,x.presentRoom||x.plannedRoom,x.status,x.notes].map(v=>String(v||'').trim()).join('|');if(seen.has(key))return false;seen.add(key);return true;}).filter(x=>String(x.date||'').startsWith(month));}
function professores(){
  const analytics=teacherAnalytics();
  return `${pageHead('Professores','Cada docente possui uma ficha automática baseada nas fiscalizações registradas.',`<input class="control" id="teacherSearch" placeholder="Buscar professor...">`)}
  <section class="metrics">${metric('Docentes',analytics.length,'com histórico fiscalizado')}${metric('Regularidade alta',analytics.filter(x=>teacherStatus(x).className==='good').length,'indicador automático')}${metric('Acompanhamento',analytics.filter(x=>['watch','attention'].includes(teacherStatus(x).className)).length,'merecem consulta')}${metric('Registros',state.schedule.filter(x=>x.status).length,'fiscalizações')}</section>
  <div class="list-cards" id="teacherCards">${analytics.length?analytics.map(x=>{const s=teacherStatus(x);return `<button class="teacher-card teacher-card-btn" data-teacher="${esc(x.name)}" data-name="${esc(x.name.toLowerCase())}"><div class="teacher-card-main"><strong>${esc(x.name)}</strong><small>${x.done.length} fiscalizações • ${x.occurrences} ocorrência(s)</small></div><span class="profile-status mini ${s.className}">${s.label}</span><span class="teacher-arrow">→</span></button>`}).join(''):`<div class="empty card">Ainda não há fiscalizações suficientes para montar as fichas.</div>`}</div>`;
}
function salas(){const rooms=unique(state.schedule.map(x=>x.room));return `${pageHead('Salas','Mapa operacional das salas que aparecem na escala docente.') }<div class="room-grid">${rooms.map(r=>{const count=state.schedule.filter(x=>x.room===r).length;return `<article class="room-card"><div class="room-name">${esc(r)}</div><div class="room-subject">${count} registros na base</div><span class="badge other">Bloco K • Medicina</span></article>`}).join('')}</div>`}
function relatorios(){const month=state.date.slice(0,7);const rows=state.schedule.filter(x=>String(x.date||'').startsWith(month));const occurrences=rows.filter(x=>x.status&&x.status!=='Presente');const teachers=unique(occurrences.map(x=>x.scheduledTeacher||x.presentTeacher));const counts=occurrences.reduce((m,x)=>{m[x.status]=(m[x.status]||0)+1;return m},{});return `${pageHead('Relatório mensal','Relatório objetivo: somente ocorrências diferentes de Presente.',`<input class="control" type="month" id="reportMonth" value="${month}"><button class="btn primary" id="generatePdf">Gerar PDF</button><button class="btn ghost" id="exportCsv">Exportar CSV</button>`)}<div class="report-layout"><section class="card panel"><div class="panel-head"><h2>Resumo do mês</h2></div><div class="kpi"><span>Total de ocorrências</span><strong>${occurrences.length}</strong></div><div class="kpi"><span>Professores com ocorrência</span><strong>${teachers.length}</strong></div>${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<div class="kpi"><span>${esc(n)}</span><strong>${v}</strong></div>`).join('')||'<div class="empty">Nenhuma ocorrência no período selecionado.</div>'}</section><section class="card panel"><div class="panel-head"><h2>Prévia das ocorrências</h2><span class="muted">${fmtMonth(month)}</span></div>${occurrences.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Professor</th><th>Turma</th><th>Sala</th><th>Ocorrência</th><th>Observação</th></tr></thead><tbody>${occurrences.slice(0,50).map(x=>`<tr><td>${fmtDate(x.date)}</td><td>${esc(x.scheduledTeacher||x.presentTeacher||'—')}</td><td>${esc(x.period||'—')}</td><td>${esc(x.presentRoom||x.room||'—')}</td><td>${badge(x.status)}</td><td>${esc(x.notes||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhuma ocorrência diferente de Presente foi registrada.</div>'}</section></div>`}
function config(){return `${pageHead('Configurações','Preferências, segurança dos dados e atualização do aplicativo.') }<div class="dashboard-grid"><section class="card panel"><div class="panel-head"><h2>Identificação</h2></div><label class="muted">Responsável<input class="control" style="width:100%;margin-top:6px" id="cfgResponsible" value="${esc(state.settings.responsible||APP_META.responsible)}"></label><br><button class="btn primary" id="saveConfig">Salvar alterações</button></section><section class="card panel"><div class="panel-head"><h2>Dados</h2></div><p class="muted">O aplicativo usa IndexedDB no navegador para manter os registros neste dispositivo.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="backupBtn">Fazer backup</button><label class="btn ghost">Restaurar backup<input type="file" id="restoreFile" accept="application/json" hidden></label></div></section><section class="card panel"><div class="panel-head"><h2>Atualizações</h2><span id="updateStatus" class="muted">Versão atual: V6.6</span></div><p class="muted">Verifique se existe uma nova versão publicada e atualize sem apagar seus registros locais.</p><button class="btn primary" id="checkUpdate">Verificar atualização</button></section></section></div>`}

// Delegação de eventos da tela atual: não é necessário reanexar listeners após cada renderização.
document.addEventListener('change',async e=>{if(e.target.id==='fTargetRoom'){const id=$('#inspectionId')?.value;const x=state.schedule.find(r=>String(r.id)===String(id));if(x){const c=roomProgress(x).checks.find(c=>c.room===e.target.value);if(c){$('#fStatus').value=c.status||'';$('#fTeacher').value=c.presentTeacher||'';$('#fRoom').value=c.presentRoom||c.room||'';$('#fChecked').value=c.checkedTime||'';$('#fStart').value=c.realStart||'';$('#fEnd').value=c.realEnd||'';$('#fNotes').value=c.notes||'';}}return;}if(e.target.id==='rondaDate'||e.target.id==='scaleDate'){state.date=e.target.value;render()}if(e.target.id==='historyMonth'){state.historyMonth=e.target.value;render()}if(e.target.id==='historyStatus'){state.historyStatus=e.target.value;render()}if(e.target.id==='reportMonth'){state.date=e.target.value+'-01';render()}if(e.target.id==='restoreFile'){await restoreBackup(e.target.files?.[0])}});
document.addEventListener('input',e=>{if(e.target.id==='scaleSearch'){state.search=e.target.value;render()}if(e.target.id==='teacherSearch'){$$('#teacherCards .teacher-card').forEach(c=>c.style.display=c.dataset.name.includes(e.target.value.toLowerCase())?'':'none')}});
document.addEventListener('click',async e=>{if(e.target.closest('[data-new-class]')){openNewClass()}if(e.target.id==='exportHistory'){exportHistory()}if(e.target.id==='exportCsv'){exportCSV()}if(e.target.id==='generatePdf'){generateMonthlyPdf()}if(e.target.id==='saveConfig'){await saveConfig()}if(e.target.id==='backupBtn'){await backup()}if(e.target.id==='checkUpdate'){await checkForUpdate()}const edit=e.target.closest('[data-edit-history]');if(edit){await editHistory(edit.dataset.editHistory)}const del=e.target.closest('[data-delete-history]');if(del){await deleteHistory(del.dataset.deleteHistory,del.dataset.deleteHistoryInspection)}const delRound=e.target.closest('[data-delete-round]');if(delRound){await deleteRound(delRound.dataset.deleteRound)}});

async function openInspection(id,mode='normal',roomHint=''){const x=state.schedule.find(r=>String(r.id)===String(id));if(!x)return;const p=roomProgress(x);const eligible=mode==='followup'?p.followUps:p.pending;const options=(roomHint?eligible.filter(c=>c.room===roomHint):eligible);const list=options.length?options:eligible.length?eligible:p.checks;$('#inspectionId').value=x.id;$('#dialogSchedule').innerHTML=`<strong>${esc(x.start||'--:--')} — ${esc(x.end||'--:--')}</strong><small>${esc(x.period||'')}<br>${esc(x.scheduledTeacher||'Professor não informado')}<br>${esc((x.subject||'').replace(/\n/g,' • '))}</small><div class="room-progress-note">${p.done}/${p.total} sala(s) fiscalizada(s)${p.pending.length?` • falta(m): ${p.pending.map(c=>esc(c.room)).join(', ')}`:''}${p.followUps.length?` • retorno(s): ${p.followUps.map(c=>esc(c.room)).join(', ')}`:''}</div>`;$('#fTargetRoom').innerHTML=list.map(c=>`<option value="${esc(c.room)}">${esc(c.room)}${c.followUpPending?' — RETORNO':''}</option>`).join('');$('#fTargetRoom').value=roomHint&&list.some(c=>c.room===roomHint)?roomHint:list[0]?.room||'';$('#fTargetRoom').disabled=list.length<=1;const c=list[0]||emptyRoomCheck(x.room);$('#fStatus').value=c.status||'';$('#fTeacher').value=c.presentTeacher||'';$('#fRoom').value=c.presentRoom||c.room||'';$('#fChecked').value=c.checkedTime||'';$('#fStart').value=c.realStart||'';$('#fEnd').value=c.realEnd||'';$('#fNotes').value=c.notes||'';$('#inspectionDialog').dataset.mode=mode;$('#inspectionDialog').dataset.room=roomHint||c.room||'';$('#inspectionDialog').showModal()}
function closeDialog(){$('#inspectionDialog').close()}
async function saveInspection(e){e.preventDefault();const id=$('#inspectionId').value;const x=state.schedule.find(r=>String(r.id)===String(id));if(!x)return;const dlg=$('#inspectionDialog');const mode=dlg.dataset.mode||'normal';const room=$('#fTargetRoom').value;const p=roomProgress(x);const checks=p.checks.map(c=>({...c}));const idx=checks.findIndex(c=>c.room===room);if(idx<0){toast('Sala não encontrada.','error');return;}const previous=checks[idx];const status=$('#fStatus').value;const nowIso=new Date().toISOString();if(!status){toast('Selecione a situação da sala.','error');return;}const check={...previous,room,done:true,status,presentTeacher:$('#fTeacher').value.trim(),presentRoom:$('#fRoom').value.trim()||room,checkedTime:$('#fChecked').value,realStart:$('#fStart').value,realEnd:$('#fEnd').value,notes:$('#fNotes').value.trim(),followUpPending:status==='Atraso'?true:false,followUpCheckedTime:previous.followUpCheckedTime||'',followUpTeacher:previous.followUpTeacher||'',followUpNotes:previous.followUpNotes||''};if(mode==='followup'){check.followUpPending=false;check.followUpCheckedTime=$('#fChecked').value||deviceTime();check.followUpTeacher=$('#fTeacher').value.trim();check.followUpNotes=$('#fNotes').value.trim();check.initialStatus=previous.initialStatus||previous.status||'Atraso';check.initialCheckedTime=previous.initialCheckedTime||previous.checkedTime||'';check.initialNotes=previous.initialNotes||previous.notes||'';}else if(status==='Atraso'){check.initialStatus='Atraso';check.initialCheckedTime=check.checkedTime;check.initialNotes=check.notes;}checks[idx]=check;const complete=checks.every(c=>c.done);const followUps=checks.filter(c=>c.followUpPending);const summaryStatuses=checks.map(c=>c.status).filter(Boolean);const summary=summaryStatuses.length?(new Set(summaryStatuses).size===1?summaryStatuses[0]:'Fiscalização concluída'):null;const updated={...x,roomChecks:checks,status:complete?summary:null,recordStatus:complete?'Fiscalizado':'Pendente',presentTeacher:complete?checks.map(c=>c.presentTeacher).filter(Boolean).join(' / '):x.presentTeacher||null,presentRoom:complete?checks.map(c=>c.presentRoom||c.room).join(' / '):x.presentRoom||null,checkedTime:complete?checks.map(c=>c.checkedTime).filter(Boolean).join(' / '):x.checkedTime||null,realStart:complete?checks.map(c=>c.realStart).filter(Boolean).join(' / '):x.realStart||null,realEnd:complete?checks.map(c=>c.realEnd).filter(Boolean).join(' / '):x.realEnd||null,notes:complete?checks.map(c=>c.notes).filter(Boolean).join(' | '):x.notes||null,followUpPending:followUps.length>0,updatedAt:nowIso};await db.put('schedule',updated);const oldIns=state.inspections.filter(i=>i.scheduleId===x.id&&String(i.presentRoom||i.plannedRoom||'')===String(room)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];const inspectionRecord={id:oldIns?.id||crypto.randomUUID(),scheduleId:x.id,date:x.date,day:x.day,scheduledTeacher:x.scheduledTeacher,presentTeacher:check.presentTeacher,plannedRoom:room,presentRoom:check.presentRoom||room,plannedTime:`${x.start||''} – ${x.end||''}`,checkedTime:check.checkedTime,realTime:`${check.realStart||''}/${check.realEnd||''}`,status:check.status,notes:check.notes,verifiedBy:state.settings.responsible||APP_META.responsible,createdAt:oldIns?.createdAt||nowIso,updatedAt:nowIso,followUpPending:check.followUpPending,initialStatus:check.initialStatus||'',initialCheckedTime:check.initialCheckedTime||'',followUpCheckedTime:check.followUpCheckedTime||'',followUpTeacher:check.followUpTeacher||'',followUpNotes:check.followUpNotes||''};await db.put('inspections',inspectionRecord);await reload();closeDialog();state.date=x.date;state.view='ronda';render();window.scrollTo({top:0,behavior:'smooth'});if(!complete){const left=checks.filter(c=>!c.done);toast(`Sala ${room} salva. Ainda falta ${left.length} sala(s): ${left.map(c=>c.room).join(', ')}.`);}else if(followUps.length){toast(`Ronda concluída. ${followUps.length} retorno(s) ficaram pendentes para verificar a chegada.`);}else{toast('Ronda concluída. Todas as salas foram fiscalizadas e ela saiu das pendências.');}}
function openNewClass(){
  const dlg=$('#newClassDialog');
  $('#newClassDate').value=state.date||todayISO();
  $('#newClassStart').value=''; $('#newClassEnd').value=''; $('#newClassPeriod').value=''; $('#newClassRoom').value=''; $('#newClassSubject').value=''; $('#newClassNotes').value='';
  const names=unique(state.schedule.flatMap(x=>[x.scheduledTeacher,x.presentTeacher]));
  $('#newClassTeachers').innerHTML=names.map((n,i)=>`<label class="teacher-check"><input type="checkbox" name="newTeacher" value="${esc(n)}"><span>${esc(n)}</span></label>`).join('');
  dlg.showModal();
}
function closeNewClass(){$('#newClassDialog').close()}
async function saveNewClass(e){
  e.preventDefault();
  const date=$('#newClassDate').value, start=$('#newClassStart').value, end=$('#newClassEnd').value, period=$('#newClassPeriod').value.trim(), room=$('#newClassRoom').value.trim(), subject=$('#newClassSubject').value.trim(), notes=$('#newClassNotes').value.trim();
  const teachers=$$('[name="newTeacher"]', $('#newClassTeachers')).filter(x=>x.checked).map(x=>x.value);
  if(!date||!start||!end||!period||!room||!subject||!teachers.length){toast('Preencha data, horário, período, sala, disciplina e pelo menos um professor.','error');return;}
  const baseId=`MANUAL-${Date.now()}`;
  const day=new Date(date+'T00:00:00').toLocaleDateString('pt-BR',{weekday:'long'}).replace(/^./,m=>m.toUpperCase());
  const records=teachers.map((teacher,i)=>({id:`${baseId}-${i+1}`,date,day,period,scheduledTeacher:teacher,presentTeacher:null,room,subject,start,end,checkedTime:null,realStart:null,realEnd:null,rotation:null,status:null,verifiedBy:state.settings.responsible||APP_META.responsible,notes:notes||null,recordStatus:'Pendente',sourceSheet:'Cadastro manual',sourceRow:null,createdManually:true,createdAt:new Date().toISOString()}));
  await db.bulkPut('schedule',records); await reload(); state.date=date; closeNewClass(); navigate('ronda'); toast(`${records.length} registro(s) adicionados à escala.`);
}

async function editHistory(id){const x=state.schedule.find(r=>String(r.id)===String(id));if(!x){toast('Registro de ronda não encontrado.','error');return;}await openInspection(id);}
async function deleteHistory(id,inspectionId){
  const x=state.schedule.find(r=>String(r.id)===String(id));
  if(x){
    if(!confirm(`Excluir o histórico desta ronda em ${fmtDate(x.date)}? A aula continuará na escala como pendente.`))return;
    const matches=state.inspections.filter(i=>String(i.scheduleId)===String(x.id));
    for(const i of matches) if(i.id!=null) await db.remove('inspections',i.id);
    const reset={...x,status:null,presentTeacher:null,presentRoom:null,checkedTime:null,realStart:null,realEnd:null,notes:null,recordStatus:'Pendente',followUpPending:false,roomChecks:normalizeRoomChecks({...x,roomChecks:undefined}),updatedAt:new Date().toISOString()};
    await db.put('schedule',reset);await reload();render();toast('Histórico excluído. A ronda voltou para as pendências.');return;
  }
  if(inspectionId){
    if(!confirm('Excluir este registro do histórico?'))return;
    await db.remove('inspections',Number.isNaN(Number(inspectionId))?inspectionId:Number(inspectionId));
    await reload();render();toast('Registro histórico excluído.');
  }
}

async function saveConfig(){const responsible=$('#cfgResponsible').value.trim();await db.put('settings',{key:'app',institution:state.settings.institution||APP_META.institution,responsible});await reload();toast('Configuração salva.')}
async function backup(){const data=await db.exportDatabase();download(`fiscaliza-docente-backup-${todayISO()}.json`,JSON.stringify(data,null,2),'application/json');toast('Backup exportado.')}
async function restoreBackup(file){if(!file)return;try{const data=JSON.parse(await file.text());if(!confirm('Restaurar este backup substituirá os dados locais atuais. Continuar?'))return;await db.importDatabase(data);await reload();render();toast('Backup restaurado.')}catch(err){toast(err.message||'Backup inválido.','error')}}
function exportHistory(){const rows=historyRows().map(x=>({data:x.date,escalado:x.scheduledTeacher||x.assignedName,presente:x.presentTeacher,situacao:x.status,sala:x.presentRoom||x.plannedRoom,observacoes:x.notes}));download('historico-fiscalizacao.csv','\ufeff'+['data;escalado;presente;situacao;sala;observacoes',...rows.map(r=>Object.values(r).map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';'))].join('\n'),'text/csv;charset=utf-8')}
function fmtMonth(v){return v?new Date(v+'-01T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}):'—'}
function generateMonthlyPdf(){const month=$('#reportMonth')?.value||state.date.slice(0,7);const rows=state.schedule.filter(x=>String(x.date||'').startsWith(month)&&x.status&&x.status!=='Presente').sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.scheduledTeacher||'').localeCompare(String(b.scheduledTeacher||''),'pt-BR'));const groups=new Map();for(const x of rows){const name=x.scheduledTeacher||x.presentTeacher||'Professor não informado';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(x)}const counts={};rows.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);const responsible=state.settings.responsible||APP_META.responsible||'Responsável pela fiscalização';const w=window.open('','_blank');if(!w){toast('O navegador bloqueou a janela do relatório. Permita pop-ups para gerar o PDF.','error');return;}w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Ocorrências — ${fmtMonth(month)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;font-size:11px}header{border-bottom:2px solid #0b2746;padding-bottom:12px;margin-bottom:16px}header img{height:42px;float:right}h1{font-size:19px;color:#0b2746;margin:0 0 4px}h2{font-size:13px;color:#0b2746;margin:18px 0 8px}.sub{color:#64748b;font-size:10px}.summary{display:flex;gap:8px;margin:12px 0}.box{border:1px solid #d9e0e8;border-radius:7px;padding:9px 12px;min-width:125px}.box strong{display:block;font-size:18px;color:#0b2746}.box span{font-size:9px;color:#64748b}.occ{border:1px solid #d9e0e8;border-radius:7px;margin:8px 0;padding:9px 11px;page-break-inside:avoid}.occ-title{font-weight:700;color:#0b2746;margin-bottom:6px}.occ-grid{display:grid;grid-template-columns:90px 1fr 90px 1fr;gap:4px 8px}.label{color:#64748b}.obs{margin-top:6px;padding-top:6px;border-top:1px solid #eef1f4}.footer{margin-top:20px;padding-top:10px;border-top:1px solid #d9e0e8;color:#64748b;font-size:9px}.empty{padding:20px;border:1px solid #d9e0e8;border-radius:7px;color:#64748b}@media print{.no-print{display:none!important}}</style></head><body><header><img src="./unig-logo-transparent.png" onerror="this.style.display='none'"><h1>RELATÓRIO MENSAL DE OCORRÊNCIAS DOCENTES</h1><div class="sub">UNIG — Medicina • Campus Nova Iguaçu</div><div class="sub">Período: ${esc(fmtMonth(month))}</div></header><div class="summary"><div class="box"><strong>${rows.length}</strong><span>Total de ocorrências</span></div><div class="box"><strong>${groups.size}</strong><span>Professores com ocorrência</span></div><div class="box"><strong>${Object.keys(counts).length}</strong><span>Tipos de ocorrência</span></div></div><h2>Ocorrências registradas</h2>${rows.length?rows.map(x=>`<div class="occ"><div class="occ-title">${esc(x.scheduledTeacher||x.presentTeacher||'Professor não informado')}</div><div class="occ-grid"><span class="label">Data</span><span>${fmtDate(x.date)}</span><span class="label">Ocorrência</span><span><strong>${esc(x.status)}</strong></span><span class="label">Turma</span><span>${esc(x.period||'—')}</span><span class="label">Sala</span><span>${esc(x.presentRoom||x.room||'—')}</span><span class="label">Horário</span><span>${esc(x.realStart&&x.realEnd?x.realStart+' – '+x.realEnd:(x.start&&x.end?x.start+' – '+x.end:'—'))}</span><span class="label">Professor presente</span><span>${esc(x.presentTeacher||'—')}</span></div>${x.notes?`<div class="obs"><span class="label">Observação:</span> ${esc(x.notes)}</div>`:''}</div>`).join(''):`<div class="empty">Nenhuma ocorrência diferente de Presente foi registrada no período selecionado.</div>`}<div class="footer">Documento gerado pelo Fiscaliza Docente • Responsável: ${esc(responsible)}<br>Relatório objetivo: registros com situação diferente de Presente.</div><div class="no-print" style="margin-top:18px"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div></body></html>`);w.document.close();setTimeout(()=>w.print(),350)}
async function checkForUpdate(){try{if(!('serviceWorker' in navigator)){toast('Atualização automática não está disponível neste navegador.','error');return;}const reg=await navigator.serviceWorker.getRegistration();if(!reg){toast('Service Worker ainda não está ativo. Reabra o aplicativo e tente novamente.','error');return;}toast('Verificando atualização...');await reg.update();await new Promise(r=>setTimeout(r,500));if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'});toast('Atualização encontrada. Recarregando...');setTimeout(()=>location.reload(),900);return;}toast('Você já está usando a versão mais recente.')}catch(err){console.error(err);toast('Não foi possível verificar a atualização.','error')}}
function exportCSV(){const month=$('#reportMonth')?.value||state.date.slice(0,7);const rows=state.schedule.filter(x=>String(x.date||'').startsWith(month));const head='data;dia;horario;periodo;sala;professor_escalado;professor_presente;disciplina;situacao;observacoes';const body=rows.map(x=>[x.date,x.day,`${x.start||''} - ${x.end||''}`,x.period,x.room,x.scheduledTeacher,x.presentTeacher,x.subject,x.status,x.notes].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\n');download(`relatorio-${month}.csv`,'\ufeff'+head+'\n'+body,'text/csv;charset=utf-8')}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function toast(msg,type='success'){const el=document.createElement('div');el.className='toast '+(type==='error'?'error':'');el.textContent=msg;$('#toastHost').appendChild(el);setTimeout(()=>el.remove(),3200)}
