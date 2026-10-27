// Executa também quando o site é aberto direto como arquivo local (file://).
(async function startClinicSite() {
const firebaseConfig = window.CLINIC_FIREBASE_CONFIG || {
  apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: ""
};
const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let db = null;
let initializeFirestoreForClinic, doc, updateDoc, serverTimestamp, collection, getDocs, runTransaction;
if (hasFirebase) {
  const [{ initializeApp }, firestore] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
  ]);
  ({ initializeFirestore: initializeFirestoreForClinic, doc, updateDoc, serverTimestamp, collection, getDocs, runTransaction } = firestore);
  const app = initializeApp(firebaseConfig);
  db = initializeFirestoreForClinic(app, { experimentalAutoDetectLongPolling: true });
}

const SEED_DOCTORS = [
  { id: 'dr-pedro-almeida', nome: 'Dr. Pedro Almeida', especialidade: 'Cardiologia', fotoUrl: './assets/medico%201.jpg', inicio: '09:00', fim: '17:00', dias: [1,2,3,4,5], intervalo: 30 },
  { id: 'dra-marina-costa', nome: 'Dra. Marina Costa', especialidade: 'Clínica geral', fotoUrl: './assets/medico%202.jpg', inicio: '08:00', fim: '16:00', dias: [1,2,3,4,5], intervalo: 30 },
  { id: 'dr-rafael-mendes', nome: 'Dr. Rafael Mendes', especialidade: 'Dermatologia', fotoUrl: './assets/medico%203.jpg', inicio: '08:30', fim: '15:30', dias: [1,2,3,4,5,6], intervalo: 30 }
];
const LOCAL_BOOKINGS_KEY = 'clinica-horizonte-consultas-v1';
const localGet = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const localSet = (key, value) => localStorage.setItem(key, JSON.stringify(value));
let doctors = [];
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clinicDate = ymd => new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR');

async function loadDoctors() {
  // Equipe fixa do site. As reservas continuam sendo persistidas no Firestore quando configurado.
  doctors = SEED_DOCTORS.map(doctor => ({ ...doctor, dias: [...doctor.dias] }));
  renderDoctors();
}
function renderDoctors() {
  const container=$('profissionaisContainer');
  container.innerHTML=doctors.map(d=>`<article class="doctor-card"><div class="doctor-photo"><img src="${esc(d.fotoUrl)}" alt="Foto de ${esc(d.nome)}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 320%22%3E%3Crect width=%22400%22 height=%22320%22 fill=%22%23e5f2ef%22/%3E%3Ccircle cx=%22200%22 cy=%22118%22 r=%2260%22 fill=%22%23b8d7d0%22/%3E%3Cpath d=%22M85 320c8-88 53-132 115-132s107 44 115 132%22 fill=%22%23188b80%22/%3E%3Cpath d=%22M162 214l38 44 38-44%22 fill=%22white%22/%3E%3C/svg%3E'"></div><div class="doctor-info"><span class="doctor-specialty">${esc(d.especialidade)}</span><h3>${esc(d.nome)}</h3><p class="doctor-hours"><i class="bx bx-time-five"></i> ${esc(d.inicio)}–${esc(d.fim)} · ${esc(formatDays(d.dias))}</p><a class="btn btn-primary" href="#agendar" data-select-doctor="${esc(d.id)}">Agendar com este médico <i class="bx bx-right-arrow-alt"></i></a></div></article>`).join('');
  const options=doctors.map(d=>`<option value="${esc(d.id)}">${esc(d.nome)} — ${esc(d.especialidade)}</option>`).join('');
  $('doctorSelect').innerHTML='<option value="">Selecione um médico</option>'+options;
  $('adminDoctorFilter').innerHTML='<option value="">Todos os médicos</option>'+options;
  container.querySelectorAll('[data-select-doctor]').forEach(a=>a.addEventListener('click',()=>{ $('doctorSelect').value=a.dataset.selectDoctor; refreshTimeOptions(); }));
}
function formatDays(days) { const names=['dom','seg','ter','qua','qui','sex','sáb']; return (days||[]).map(n=>names[n]).join(', '); }
function slotsFor(doctor,date) {
  if (!date || !doctor) return [];
  const day=new Date(`${date}T12:00:00`).getDay();
  if (!(doctor.dias||[]).includes(day)) return [];
  const [sh,sm]=doctor.inicio.split(':').map(Number), [eh,em]=doctor.fim.split(':').map(Number);
  const start=sh*60+sm, end=eh*60+em, step=Number(doctor.intervalo)||30, out=[];
  const now=new Date();
  for(let t=start;t+step<=end;t+=step) {
    const slot=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
    if(date!==localYMD(now) || t>now.getHours()*60+now.getMinutes()) out.push(slot);
  }
  return out;
}
function localYMD(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
async function listBookings() {
  if (db) {
    try {
      const groups=await Promise.all(doctors.map(async d=>{
        const col=d.colecao || `reservas_${d.id}`;
        const snap=await getDocs(collection(db,col));
        return snap.docs.map(s=>({id:s.id,doctorId:d.id,...s.data(),_collection:col}));
      }));
      return groups.flat();
    } catch(e) { console.error('Falha ao carregar consultas:',e); }
  }
  return localGet(LOCAL_BOOKINGS_KEY,[]);
}
async function dateBookings(doctor,date) {
  const bookings=await listBookings();
  return bookings.filter(b=>b.doctorId===doctor.id && b.data===date && b.status!=='cancelled');
}
let availabilityRequestId = 0;
async function refreshTimeOptions() {
  const requestId = ++availabilityRequestId;
  const doctor=doctors.find(d=>d.id===$('doctorSelect').value), date=$('appointmentDate').value, select=$('appointmentTime');
  const hint=$('availabilityHint');
  if(hint) hint.textContent=doctor?`Atendimento: ${formatDays(doctor.dias)} · ${doctor.inicio} às ${doctor.fim} · consultas de 30 minutos.`:'A agenda varia por médico. Selecione um profissional para ver seus dias e horários.';
  if (!doctor || !date) { select.disabled=true;select.innerHTML='<option value="">Escolha médico e data</option>';return; }
  const today=new Date();today.setHours(0,0,0,0);
  if (new Date(`${date}T00:00:00`)<today) { select.disabled=true;select.innerHTML='<option value="">Escolha uma data futura</option>';return; }
  const slots=slotsFor(doctor,date);
  if (!slots.length) {
    select.disabled=true;
    select.innerHTML='<option value="">Sem atendimento nesta data; escolha outro dia</option>';
    return;
  }
  const paintOptions=(available,selected='')=>{
    select.innerHTML='<option value="">Selecione um horário</option>'+available.map(s=>`<option value="${s}">${s}</option>`).join('');
    select.disabled=!available.length;
    if(available.includes(selected)) select.value=selected;
    else if(!available.length) select.innerHTML='<option value="">Todos os horários já foram reservados</option>';
  };
  // Exibe imediatamente os horários da agenda; a consulta às reservas não bloqueia o seletor.
  paintOptions(slots,select.value);
  try {
    const reserved=await dateBookings(doctor,date);
    if (requestId !== availabilityRequestId) return;
    const selected=select.value;
    const busy=new Set(reserved.map(b=>b.hora));
    paintOptions(slots.filter(s=>!busy.has(s)),selected);
  } catch(error) {
    console.warn('Não foi possível atualizar reservas; mantendo os horários da agenda:',error);
  }
}
$('doctorSelect').addEventListener('change',refreshTimeOptions);
$('appointmentDate').addEventListener('change',refreshTimeOptions);
$('appointmentDate').addEventListener('input',refreshTimeOptions);
const today=new Date();
let firstClinicDay=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
while(firstClinicDay.getDay()===0 || firstClinicDay.getDay()===6) firstClinicDay.setDate(firstClinicDay.getDate()+1);
$('appointmentDate').min=localYMD(today);
$('appointmentDate').value=localYMD(firstClinicDay);
$('bookingForm').addEventListener('submit',async event=>{
  event.preventDefault();const doctor=doctors.find(d=>d.id===$('doctorSelect').value),date=$('appointmentDate').value,time=$('appointmentTime').value,name=$('patientName').value.trim(),phone=$('patientPhone').value.trim();
  const msg=$('bookingMessage');msg.classList.remove('success');msg.textContent='';
  if(!doctor||!slotsFor(doctor,date).includes(time)){msg.textContent='Selecione um horário válido.';return;}
  if(name.length<3 || phone.replace(/\D/g,'').length<10){msg.textContent='Informe seu nome completo e um telefone válido com DDD.';return;}
  const button=$('bookButton');button.disabled=true;button.innerHTML='Registrando pedido…';
  try {
    const col=doctor.colecao||`reservas_${doctor.id}`, key=`${date}_${time.replace(':','')}`;
    const record={data:date,hora:time,doctorId:doctor.id,profissional:doctor.id,profissionalNome:doctor.nome,especialidade:doctor.especialidade,clienteNomeCompleto:name,clienteNome:name,clienteTelefone:phone,status:'pending',createdAt:Date.now()};
    if(db) await runTransaction(db,async tx=>{const ref=doc(db,col,key);const snap=await tx.get(ref);if(snap.exists()&&snap.data()?.status!=='cancelled')throw new Error('SLOT_TAKEN');tx.set(ref,{...record,createdAt:serverTimestamp()});});
    else {const all=localGet(LOCAL_BOOKINGS_KEY,[]);if(all.some(b=>b.id===key&&b.doctorId===doctor.id&&b.status!=='cancelled'))throw new Error('SLOT_TAKEN');const retained=all.filter(b=>!(b.id===key&&b.doctorId===doctor.id));retained.push({...record,id:key,_collection:col});localSet(LOCAL_BOOKINGS_KEY,retained);}
    $('confirmationSummary').textContent=`${doctor.nome} · ${doctor.especialidade} · ${clinicDate(date)} às ${time}.`;
    $('confirmationDialog').showModal();$('bookingForm').reset();$('appointmentTime').disabled=true;$('appointmentTime').innerHTML='<option value="">Escolha uma data</option>';msg.textContent='Pedido registrado com sucesso.';msg.classList.add('success');
  } catch(e) { console.error('Falha ao reservar:',e);msg.textContent=e.message==='SLOT_TAKEN'?'Este horário acabou de ser reservado. Escolha outro.':'Não foi possível registrar seu pedido. Tente novamente.';await refreshTimeOptions(); }
  finally {button.disabled=false;button.innerHTML='Solicitar agendamento <i class="bx bx-right-arrow-alt"></i>';}
});

async function renderAdmin() {
  const list=$('appointmentsList'),date=$('adminDateFilter').value,doctorId=$('adminDoctorFilter').value;
  list.innerHTML='<div class="empty-state">Carregando consultas…</div>';
  let bookings=await listBookings();
  bookings=bookings.filter(b=>(!date||b.data===date)&&(!doctorId||b.doctorId===doctorId)).sort((a,b)=>`${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  if(!bookings.length){list.innerHTML='<div class="empty-state">Nenhuma consulta encontrada para os filtros selecionados.</div>';return;}
  list.innerHTML=bookings.map(b=>{const doctor=doctors.find(d=>d.id===b.doctorId);const status=b.status||'pending';return `<article class="appointment-row"><div><h4>${esc(b.clienteNomeCompleto||`${b.clienteNome||''} ${b.clienteSobrenome||''}`.trim())} <span class="status-pill ${esc(status)}">${status==='confirmed'?'Confirmada':status==='cancelled'?'Cancelada':'Aguardando'}</span></h4><p><i class="bx bx-calendar"></i> ${clinicDate(b.data)} · ${esc(b.hora)} &nbsp; | &nbsp; ${esc(doctor?.nome||b.profissionalNome||'Médico')}</p><p><i class="bx bx-plus-medical"></i> ${esc(doctor?.especialidade||b.especialidade||'Consulta')} &nbsp; · &nbsp; <i class="bx bx-phone"></i> ${esc(b.clienteTelefone||'')}</p></div><div class="appointment-actions"><button data-action="confirmed" data-doctor="${esc(b.doctorId)}" data-id="${esc(b.id)}" data-col="${esc(b._collection||'')}">Confirmar</button><button data-action="cancelled" data-doctor="${esc(b.doctorId)}" data-id="${esc(b.id)}" data-col="${esc(b._collection||'')}">Cancelar</button><button data-action="pending" data-doctor="${esc(b.doctorId)}" data-id="${esc(b.id)}" data-col="${esc(b._collection||'')}">Pendente</button></div></article>`}).join('');
  list.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
    const next=button.dataset.action;
    try {
      if(db) await updateDoc(doc(db,button.dataset.col,button.dataset.id),{status:next,updatedAt:serverTimestamp()});
      else {const all=localGet(LOCAL_BOOKINGS_KEY,[]);const item=all.find(b=>b.id===button.dataset.id&&b.doctorId===button.dataset.doctor);if(item)item.status=next;localSet(LOCAL_BOOKINGS_KEY,all);}
      await renderAdmin();
    } catch(e){console.error('Falha ao atualizar consulta:',e);alert('Não foi possível atualizar a consulta. Verifique as permissões do Firebase.');}
  }));
}
$('adminOpen').addEventListener('click',()=>{$('adminNotice').textContent=hasFirebase?'Dados do Firestore. Configure autenticação e regras de acesso administrativas antes de publicar.':'Modo local demonstrativo: consultas e alterações ficam somente neste navegador. Configure o Firebase para compartilhar dados entre dispositivos.';$('adminDialog').showModal();renderAdmin();});
$('adminRefresh').addEventListener('click',renderAdmin);$('adminDateFilter').addEventListener('change',renderAdmin);$('adminDoctorFilter').addEventListener('change',renderAdmin);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
document.querySelector('.menu-toggle').addEventListener('click',()=>{const nav=document.querySelector('.nav-links');nav.classList.toggle('active');document.querySelector('.menu-toggle i').className=nav.classList.contains('active')?'bx bx-x':'bx bx-menu';});
document.querySelectorAll('.nav-links a').forEach(a=>a.addEventListener('click',()=>document.querySelector('.nav-links').classList.remove('active')));
$('year').textContent=new Date().getFullYear();
loadDoctors();
})();

