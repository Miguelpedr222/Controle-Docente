import { INITIAL_DATA, APP_META } from './data.js';
import * as db from './database.js';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const todayISO=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const deviceNow=()=>new Date();
const deviceClock=()=>{const d=deviceNow();return {date:todayISO(),time:d.toTimeString().slice(0,5),timestamp:d.getTime()};};
const deviceTime=()=>deviceNow().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const timeToMinutes=v=>{if(!v)return 9999;const m=String(v).match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):9999};
const rondaTiming=x=>{const clock=deviceClock();const date=String(x.date||'');if(date<clock.date)return {key:'overdue',label:'ATRASADA',className:'overdue'};if(date>clock.date)return {key:'future',label:'PRÓXIMA',className:'upcoming'};const now=timeToMinutes(clock.time),start=timeToMinutes(x.start),end=timeToMinutes(x.end||x.start);if(start===9999)return {key:'unknown',label:'SEM HORÁRIO',className:'unknown'};if(now<start)return {key:'future',label:'PRÓXIMA',className:'upcoming'};if(end!==9999&&now<=end)return {key:'overdue',label:'ATRASADA',className:'overdue'};return {key:'overdue',label:'ATRASADA',className:'overdue'};};
const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString('pt-BR'): '—';
const statusClass=s=>{s=(s||'').toLowerCase();if(s.includes('presente'))return'present';if(s.includes('substit'))return'substitute';if(s.includes('atras'))return'late';if(s.includes('falta')||s.includes('ausente')||s.includes('localizado'))return'absent';if(s.includes('just'))return'justified';if(s.includes('unific')||s.includes('cancel')||s.includes('outro'))return'other';return'pending'};
const unique=a=>[...new Set(a.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
const state={view:'dashboard',schedule:[],inspections:[],rounds:[],settings:{},date:todayISO(),search:'',status:'',historyMonth:todayISO().slice(0,7),historyStatus:''};
const titles={dashboard:'Início',ronda:'Rondas',escala:'Escala',historico:'Histórico',professores:'Professores',salas:'Salas',relatorios:'Relatórios',config:'Configurações'};

window.addEventListener('error',e=>console.error('Fiscaliza Docente:',e.error||e.message));

document.addEventListener('DOMContentLoaded',async()=>{
  try{
    bindNavigation();
    await db.seedIfEmpty(INITIAL_DATA);
    await reload();
    // Verificação de segurança: a base empacotada contém 962 registros.
    // Se o navegador estiver usando um banco local vazio/incompleto, o reparo
    // acima adiciona somente os IDs ausentes, sem apagar o que já existe.
    if (state.schedule.length < INITIAL_DATA.schedule.length) {
      await db.seedIfEmpty(INITIAL_DATA);
      await reload();
    }
    render();
  }catch(err){console.error(err);showError(err.message||'Falha ao iniciar o aplicativo.');}
});

function bindNavigation(){
  document.addEventListener('click',e=>{
    const v=e.target.closest('[data-view]');
    if(v){e.preventDefault();navigate(v.dataset.view);return;}
    const inspect=e.target.closest('[data-inspect]');
    if(inspect){e.preventDefault();openInspection(inspect.dataset.inspect);return;}
    const next=e.target.closest('[data-next-ronda]');
    if(next){e.preventDefault();const item=nextRonda();if(item){state.date=item.date;state.view='ronda';render();window.scrollTo({top:0,behavior:'smooth'});}return;}
    const newClass=e.target.closest('[data-new-class]');
    if(newClass){e.preventDefault();openNewClass();return;}
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
function loadRounds(){try{return JSON.parse(localStorage.getItem('fiscaliza-docente-rounds')||'[]')}catch{return []}}
function saveRounds(){localStorage.setItem('fiscaliza-docente-rounds',JSON.stringify(state.rounds))}
function populateTeachers(){$('#teacherList').innerHTML=unique(state.schedule.flatMap(x=>[x.scheduledTeacher,x.presentTeacher])).map(n=>`<option value="${esc(n)}"></option>`).join('')}
function render(){try{$('#todayText').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});const fn={dashboard:dashboard,ronda:ronda,escala:escala,historico:historico,professores:professores,salas:salas,relatorios:relatorios,config:config}[state.view];$('#view').innerHTML=fn();}catch(err){console.error(err);showError('Não foi possível renderizar esta tela.');}}
let liveClockTimer=setInterval(()=>{if(state.view==='ronda'||state.view==='dashboard')render();},30000);
function showError(msg){$('#view').innerHTML=`<div class="card empty"><strong>O aplicativo encontrou um erro.</strong><p>${esc(msg)}</p><button class="btn primary" onclick="location.reload()">Recarregar aplicativo</button></div>`}
function pageHead(title,text,actions=''){return `<div class="page-head"><div><h1>${title}</h1><p>${text}</p></div><div class="toolbar">${actions}</div></div>`}
function badge(s){return `<span class="badge ${statusClass(s)}">${esc(s||'Pendente')}</span>`}
function metric(label,n,sub){return `<article class="metric"><span class="label">${label}</span><strong>${n}</strong><small>${sub}</small></article>`}
function pendingRowsForDate(date){return state.schedule.filter(x=>x.date===date&&!x.status).sort((a,b)=>String(a.start||'99:99').localeCompare(String(b.start||'99:99'))||String(a.room||'').localeCompare(String(b.room||''),'pt-BR')||String(a.scheduledTeacher||'').localeCompare(String(b.scheduledTeacher||''),'pt-BR'));}
function rondaGroups(rows){const map=new Map();for(const x of rows){const key=[x.room,x.start,x.end,x.period,x.subject].map(v=>String(v||'')).join('|');if(!map.has(key))map.set(key,[]);map.get(key).push(x);}return [...map.values()].sort((a,b)=>String(a[0]?.start||'99:99').localeCompare(String(b[0]?.start||'99:99'))||String(a[0]?.room||'').localeCompare(String(b[0]?.room||''),'pt-BR'));}
function nextRonda(){const base=state.date||todayISO();const pending=state.schedule.filter(x=>!x.status&&String(x.date||'')>=base);pending.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start||'99:99').localeCompare(String(b.start||'99:99'))||String(a.room||'').localeCompare(String(b.room||''),'pt-BR'));return pending[0]||null;}
function dashboard(){
  const all=state.schedule, done=all.filter(x=>x.status), present=done.filter(x=>x.status==='Presente'), pending=all.length-done.length, subs=done.filter(x=>(x.status||'').includes('Substit')), abs=done.filter(x=>['Falta','Professor não localizado'].includes(x.status));
  const pct=all.length?Math.round(done.length/all.length*100):0;
  const next=nextRonda();
  const nowText=deviceTime();
  const timing=next?rondaTiming(next):null;
  const today=all.filter(x=>x.date===state.date).slice(0,6);
  const nextLabel=timing?.key==='overdue'?'RONDA ATRASADA':'PRÓXIMA RONDA';
  const nextHint=timing?.key==='overdue'?'O horário desta aula já começou e ela ainda está pendente. Faça esta sala agora.':(String(next?.date||'')===todayISO()?'Próxima aula pendente de hoje.':'Próxima aula pendente na escala.');
  const nextCard=next?`<section class="next-round card panel ${timing.key==='overdue'?'is-overdue':''}"><div class="next-round-label">${nextLabel}</div><div class="device-clock">Horário do dispositivo: <strong>${nowText}</strong></div><div class="next-round-main"><div><span class="muted">${fmtDate(next.date)} • ${esc(next.start||'--:--')} — ${esc(next.end||'--:--')}</span><h2>${esc(next.room||'Sala não definida')}</h2><p>${esc((next.subject||'').replace(/\n/g,' • '))}</p><div class="next-teacher">${esc(nextHint)}<br>Professor escalado: <strong>${esc(next.scheduledTeacher||'Não informado')}</strong></div></div><button class="btn primary" data-next-ronda>Ir para a ronda →</button></div></section>`:`<section class="card panel"><div class="empty"><strong>Nenhuma ronda pendente encontrada.</strong><p>Horário do dispositivo: <strong>${nowText}</strong>. Você pode cadastrar uma nova aula pela Escala.</p></div></section>`;
  return `<section class="hero"><img class="hero-mark" src="./assets/unig-logo-transparent.png" alt=""><div><small>UNIVERSIDADE IGUAÇU • MEDICINA</small><h1>Fiscaliza Docente</h1><p>Uma central simples e rápida para acompanhar sua ronda, registrar ocorrências e manter o histórico da fiscalização docente.</p><div class="hero-actions"><button class="btn light" data-next-ronda>Próxima ronda</button><button class="btn" style="background:rgba(255,255,255,.12);color:#fff" data-new-class>+ Nova aula</button><button class="btn" style="background:rgba(255,255,255,.12);color:#fff" data-go="escala">Abrir escala</button></div></div></section>
  ${nextCard}
  ${pageHead('Visão geral','Acompanhe o andamento da base de fiscalização e entre rapidamente na rotina de rondas.')}
  <section class="metrics">${metric('Registros',all.length,'base carregada')}${metric('Fiscalizados',done.length,`${pct}% concluído`)}${metric('Presentes',present.length,'situação registrada')}${metric('Substituições',subs.length,'ocorrências')}${metric('Pendentes',pending,'aguardando ronda')}</section>
  <div class="dashboard-grid"><section class="card panel"><div class="panel-head"><h2>Ronda selecionada</h2><span class="muted">${fmtDate(state.date)}</span></div><div style="margin-bottom:14px"><div class="muted" style="margin-bottom:7px">Progresso geral</div><div class="progress"><span style="width:${pct}%"></span></div></div>${today.length?today.map(x=>miniRow(x)).join(''):`<div class="empty"><strong>Nenhuma escala cadastrada para ${fmtDate(state.date)}.</strong>Escolha outra data em Escala ou Rondas.</div>`}</section><section class="card panel"><div class="panel-head"><h2>Situações</h2></div>${[['Presente',present.length],['Substituição',subs.length],['Falta',abs.length],['Atraso',done.filter(x=>x.status==='Atraso').length],['Pendente',pending]].map(([n,v])=>`<div class="kpi"><span>${n}</span>${badge(n==='Pendente'?'Pendente':n)}<strong style="margin-left:auto;margin-right:4px">${v}</strong></div>`).join('')}</section></div>`;
}
function miniRow(x){return `<div class="kpi"><div><strong>${esc(x.room||'Sala não definida')}</strong><div class="muted">${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.period||'')}</div></div><div style="display:flex;align-items:center;gap:8px">${badge(x.status)}<button class="btn small primary" data-inspect="${esc(x.id)}">Fiscalizar</button></div></div>`}
function ronda(){
  const rows=state.schedule.filter(x=>x.date===state.date);
  const pending=pendingRowsForDate(state.date);
  const groups=rondaGroups(pending);
  const completed=rows.filter(x=>x.status).length;
  const selectedToday=state.date===todayISO();
  const overdueGroups=groups.filter(g=>rondaTiming(g[0]).key==='overdue');
  const futureGroups=groups.filter(g=>rondaTiming(g[0]).key==='future');
  const orderedGroups=[...overdueGroups,...futureGroups];
  const current=orderedGroups[0]?.[0];
  const currentTiming=current?rondaTiming(current):null;
  const nowText=deviceTime();
  const overdueCount=overdueGroups.length;
  return `${pageHead('Rondas','O aplicativo usa o horário do dispositivo para identificar a próxima aula pendente e destacar automaticamente as rondas atrasadas.',`<span class="device-clock compact">Agora: <strong>${nowText}</strong></span><input class="control" type="date" id="rondaDate" value="${state.date}"><button class="btn ghost" data-new-class>+ Nova aula</button><button class="btn primary" data-next-ronda>Próxima</button>`)}${selectedToday?`<div class="ronda-live card"><div><strong>Horário do dispositivo</strong><span>${nowText}</span></div><div><strong>${overdueCount}</strong><span>ronda(s) atrasada(s)</span></div><div><strong>${orderedGroups.length}</strong><span>pendentes</span></div></div>`:''}<div class="ronda-summary"><div><strong>${pending.length}</strong><span>registros pendentes</span></div><div><strong>${completed}</strong><span>registros atualizados</span></div><div><strong>${rows.length}</strong><span>registros no dia</span></div></div>${current?`<section class="next-focus card ${currentTiming.key==='overdue'?'is-overdue':''}"><div class="next-round-label">${currentTiming.label}</div><div class="next-focus-grid"><div><span class="status-callout ${currentTiming.className}">${currentTiming.key==='overdue'?'⚠ Horário já começou — ronda pendente':'✓ Próxima aula pendente'}</span><span class="muted">${esc(current.start||'--:--')} — ${esc(current.end||'--:--')}</span><h2>${esc(current.room||'Sala não definida')}</h2><p>${esc((current.subject||'').replace(/\n/g,' • '))}</p><div class="teacher-stack">${orderedGroups[0].map(x=>`<span>${esc(x.scheduledTeacher||'Professor não informado')}</span>`).join('')}</div></div><button class="btn primary large" data-inspect="${esc(current.id)}">Verificar sala</button></div></section>`:''}${orderedGroups.length>1?`<div class="section-caption"><strong>${overdueGroups.length>0?'Fila de rondas':'Próximas salas'}</strong><span>${selectedToday?'Ordenadas pelo horário do dispositivo':'Em ordem de horário'}</span></div><div class="route-list">${orderedGroups.slice(1).map((group,i)=>{const x=group[0],t=rondaTiming(x);return `<article class="route-item ${t.key==='overdue'?'is-overdue':''}"><div class="route-index">${i+2}</div><div class="route-info"><strong>${esc(x.room||'Sala não definida')}</strong><span>${esc(x.start||'--:--')} — ${esc(x.end||'--:--')} • ${esc(x.period||'')}</span><small>${group.length} professor(es) escalado(s)</small></div><span class="route-status ${t.className}">${t.label}</span><button class="btn ghost small" data-inspect="${esc(x.id)}">Abrir</button></article>`}).join('')}</div>`:`<div class="card empty"><strong>${rows.length?'Ronda concluída para este dia.':'Nenhuma aula encontrada nesta data.'}</strong><p>${rows.length?'Todas as salas foram atualizadas. Escolha outra data ou cadastre uma nova aula.':'Selecione outra data ou cadastre uma nova aula.'}</p></div>`}`;
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
    ...state.schedule.filter(x=>x.status).map(x=>({date:x.date,scheduledTeacher:x.scheduledTeacher,presentTeacher:x.presentTeacher,plannedRoom:x.room,presentRoom:x.presentRoom,status:x.status,notes:x.notes,createdAt:x.createdAt||x.date+'T00:00:00',source:'Escala'})),
    ...state.inspections.map(x=>({...x,source:x.source||'Histórico'}))
  ];
  const seen=new Set();
  return merged.filter(x=>{
    const key=[x.date,x.scheduledTeacher||x.assignedName,x.presentTeacher,x.presentRoom||x.plannedRoom,x.status,x.notes].map(v=>String(v||'').trim()).join('|');
    if(seen.has(key)) return false;
    seen.add(key); return true;
  }).filter(x=>!state.historyMonth || String(x.date||'').startsWith(state.historyMonth)).filter(x=>!state.historyStatus || x.status===state.historyStatus).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function historico(){const rows=historyRows();const statuses=unique(state.schedule.map(x=>x.status).concat(state.inspections.map(x=>x.status)));return `${pageHead('Histórico','Consulta registros da escala que já foram fiscalizados e as observações históricas importadas.',`<input class="control" type="month" id="historyMonth" value="${state.historyMonth}"><select class="control" id="historyStatus"><option value="">Todas as situações</option>${statuses.map(s=>`<option value="${esc(s)}" ${state.historyStatus===s?'selected':''}>${esc(s)}</option>`).join('')}</select><button class="btn ghost" data-new-class>+ Nova aula</button><button class="btn ghost" id="exportHistory">Exportar CSV</button>`)}<div class="metrics">${metric('Encontrados',rows.length,'no filtro atual')}${metric('Rondas',state.rounds.length,'sessões registradas')}${metric('Outubro',historyRowsForMonth('2026-10').length,'registros fiscalizados/importados')}</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Professor escalado</th><th>Professor presente</th><th>Situação</th><th>Sala</th><th>Observação</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(x.scheduledTeacher||x.assignedName||'—')}</td><td>${esc(x.presentTeacher||'—')}</td><td>${badge(x.status)}</td><td>${esc(x.presentRoom||x.plannedRoom||'—')}</td><td>${esc(x.notes||'—')}</td></tr>`).join(''):`<tr><td colspan="6"><div class="empty"><strong>Nenhum registro encontrado.</strong><p>Altere o mês ou a situação para consultar outra parte da base.</p></div></td></tr>`}</tbody></table></div>`}
function historyRowsForMonth(month){return historyRowsWithoutFilter(month)}
function historyRowsWithoutFilter(month){const merged=[...state.schedule.filter(x=>x.status).map(x=>({date:x.date,scheduledTeacher:x.scheduledTeacher,presentTeacher:x.presentTeacher,plannedRoom:x.room,presentRoom:x.presentRoom,status:x.status,notes:x.notes,createdAt:x.createdAt||x.date+'T00:00:00'})),...state.inspections.map(x=>({...x}))];const seen=new Set();return merged.filter(x=>{const key=[x.date,x.scheduledTeacher||x.assignedName,x.presentTeacher,x.presentRoom||x.plannedRoom,x.status,x.notes].map(v=>String(v||'').trim()).join('|');if(seen.has(key))return false;seen.add(key);return true;}).filter(x=>String(x.date||'').startsWith(month));}
function professores(){const names=unique(state.schedule.flatMap(x=>[x.scheduledTeacher,x.presentTeacher]));return `${pageHead('Professores','Base consolidada dos docentes encontrados na escala e nas fiscalizações.',`<input class="control" id="teacherSearch" placeholder="Buscar professor...">`)}<div class="list-cards" id="teacherCards">${names.map(n=>{const scheduled=state.schedule.filter(x=>x.scheduledTeacher===n).length;const done=state.schedule.filter(x=>x.scheduledTeacher===n&&x.status).length;return `<article class="teacher-card" data-name="${esc(n.toLowerCase())}"><strong>${esc(n)}</strong><small>${scheduled} escalas • ${done} fiscalizações registradas</small></article>`}).join('')}</div>`}
function salas(){const rooms=unique(state.schedule.map(x=>x.room));return `${pageHead('Salas','Mapa operacional das salas que aparecem na escala docente.') }<div class="room-grid">${rooms.map(r=>{const count=state.schedule.filter(x=>x.room===r).length;return `<article class="room-card"><div class="room-name">${esc(r)}</div><div class="room-subject">${count} registros na base</div><span class="badge other">Bloco K • Medicina</span></article>`}).join('')}</div>`}
function relatorios(){const month=state.date.slice(0,7);const rows=state.schedule.filter(x=>String(x.date||'').startsWith(month));const done=rows.filter(x=>x.status);const present=done.filter(x=>x.status==='Presente').length;const pct=done.length?Math.round(present/done.length*100):0;return `${pageHead('Relatórios','Resumo mensal e exportação dos dados registrados.',`<input class="control" type="month" id="reportMonth" value="${month}"><button class="btn primary" id="exportCsv">Exportar CSV</button>`)}<div class="report-layout"><section class="card panel"><span class="muted">PRESENÇA NO MÊS</span><div class="big-number">${pct}%</div><div class="progress"><span style="width:${pct}%"></span></div><p class="muted">${present} presenças em ${done.length} fiscalizações com situação.</p></section><section class="card panel"><div class="panel-head"><h2>Resumo</h2></div>${[['Registros',rows.length],['Fiscalizados',done.length],['Pendentes',rows.length-done.length],['Substituições',done.filter(x=>x.status==='Substituição').length],['Faltas',done.filter(x=>x.status==='Falta').length]].map(([n,v])=>`<div class="kpi"><span>${n}</span><strong>${v}</strong></div>`).join('')}</section></div>`}
function config(){return `${pageHead('Configurações','Preferências e segurança dos dados locais.') }<div class="dashboard-grid"><section class="card panel"><div class="panel-head"><h2>Identificação</h2></div><label class="muted">Responsável<input class="control" style="width:100%;margin-top:6px" id="cfgResponsible" value="${esc(state.settings.responsible||APP_META.responsible)}"></label><br><button class="btn primary" id="saveConfig">Salvar alterações</button></section><section class="card panel"><div class="panel-head"><h2>Dados</h2></div><p class="muted">O aplicativo usa IndexedDB no navegador para manter os registros neste dispositivo.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="backupBtn">Fazer backup</button><label class="btn ghost">Restaurar backup<input type="file" id="restoreFile" accept="application/json" hidden></label></div></section></div>`}

// Delegação de eventos da tela atual: não é necessário reanexar listeners após cada renderização.
document.addEventListener('change',async e=>{if(e.target.id==='rondaDate'||e.target.id==='scaleDate'){state.date=e.target.value;render()}if(e.target.id==='historyMonth'){state.historyMonth=e.target.value;render()}if(e.target.id==='historyStatus'){state.historyStatus=e.target.value;render()}if(e.target.id==='reportMonth'){state.date=e.target.value+'-01';render()}if(e.target.id==='restoreFile'){await restoreBackup(e.target.files?.[0])}});
document.addEventListener('input',e=>{if(e.target.id==='scaleSearch'){state.search=e.target.value;render()}if(e.target.id==='teacherSearch'){$$('#teacherCards .teacher-card').forEach(c=>c.style.display=c.dataset.name.includes(e.target.value.toLowerCase())?'':'none')}});
document.addEventListener('click',async e=>{if(e.target.closest('[data-new-class]')){openNewClass()}if(e.target.id==='exportHistory'){exportHistory()}if(e.target.id==='exportCsv'){exportCSV()}if(e.target.id==='saveConfig'){await saveConfig()}if(e.target.id==='backupBtn'){await backup()}});

async function openInspection(id){const x=state.schedule.find(r=>String(r.id)===String(id));if(!x)return;$('#inspectionId').value=x.id;$('#dialogSchedule').innerHTML=`<strong>${esc(x.room||'Sala não definida')} • ${esc(x.start||'--:--')} — ${esc(x.end||'--:--')}</strong><small>${esc(x.period||'')}<br>${esc(x.scheduledTeacher||'Professor não informado')}<br>${esc((x.subject||'').replace(/\n/g,' • '))}</small>`;$('#fStatus').value=x.status||'';$('#fTeacher').value=x.presentTeacher||'';$('#fRoom').value=x.presentRoom||'';$('#fChecked').value=x.checkedTime||'';$('#fStart').value=x.realStart||'';$('#fEnd').value=x.realEnd||'';$('#fNotes').value=x.notes||'';$('#inspectionDialog').showModal()}
function closeDialog(){$('#inspectionDialog').close()}
async function saveInspection(e){e.preventDefault();const id=$('#inspectionId').value;const x=state.schedule.find(r=>String(r.id)===String(id));if(!x)return;const payload={status:$('#fStatus').value,presentTeacher:$('#fTeacher').value.trim(),presentRoom:$('#fRoom').value.trim(),checkedTime:$('#fChecked').value,realStart:$('#fStart').value,realEnd:$('#fEnd').value,notes:$('#fNotes').value.trim(),verifiedBy:state.settings.responsible||APP_META.responsible};Object.assign(x,payload,{recordStatus:'Fiscalizado',updatedAt:new Date().toISOString()});await db.put('schedule',x);await db.add('inspections',{id:crypto.randomUUID(),date:x.date,day:x.day,scheduledTeacher:x.scheduledTeacher,presentTeacher:payload.presentTeacher,plannedRoom:x.room,presentRoom:payload.presentRoom,plannedTime:`${x.start||''} – ${x.end||''}`,checkedTime:payload.checkedTime,realTime:`${payload.realStart||''}/${payload.realEnd||''}`,status:payload.status,notes:payload.notes,verifiedBy:payload.verifiedBy,createdAt:new Date().toISOString()});await reload();closeDialog();state.date=x.date;state.view='ronda';render();window.scrollTo({top:0,behavior:'smooth'});toast('Fiscalização salva. A sala saiu das pendências e a próxima foi carregada.')}
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

async function saveConfig(){const responsible=$('#cfgResponsible').value.trim();await db.put('settings',{key:'app',institution:state.settings.institution||APP_META.institution,responsible});await reload();toast('Configuração salva.')}
async function backup(){const data=await db.exportDatabase();download(`fiscaliza-docente-backup-${todayISO()}.json`,JSON.stringify(data,null,2),'application/json');toast('Backup exportado.')}
async function restoreBackup(file){if(!file)return;try{const data=JSON.parse(await file.text());if(!confirm('Restaurar este backup substituirá os dados locais atuais. Continuar?'))return;await db.importDatabase(data);await reload();render();toast('Backup restaurado.')}catch(err){toast(err.message||'Backup inválido.','error')}}
function exportHistory(){const rows=historyRows().map(x=>({data:x.date,escalado:x.scheduledTeacher||x.assignedName,presente:x.presentTeacher,situacao:x.status,sala:x.presentRoom||x.plannedRoom,observacoes:x.notes}));download('historico-fiscalizacao.csv','\ufeff'+['data;escalado;presente;situacao;sala;observacoes',...rows.map(r=>Object.values(r).map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';'))].join('\n'),'text/csv;charset=utf-8')}
function exportCSV(){const month=$('#reportMonth')?.value||state.date.slice(0,7);const rows=state.schedule.filter(x=>String(x.date||'').startsWith(month));const head='data;dia;horario;periodo;sala;professor_escalado;professor_presente;disciplina;situacao;observacoes';const body=rows.map(x=>[x.date,x.day,`${x.start||''} - ${x.end||''}`,x.period,x.room,x.scheduledTeacher,x.presentTeacher,x.subject,x.status,x.notes].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\n');download(`relatorio-${month}.csv`,'\ufeff'+head+'\n'+body,'text/csv;charset=utf-8')}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function toast(msg,type='success'){const el=document.createElement('div');el.className='toast '+(type==='error'?'error':'');el.textContent=msg;$('#toastHost').appendChild(el);setTimeout(()=>el.remove(),3200)}
