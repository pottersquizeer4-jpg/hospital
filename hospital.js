// ============================================
// SUPABASE INIT
// ============================================
const SUPABASE_URL = 'https://ypayivoloaccybdagpti.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M1nxV_SvjG9Wp_R2NDZNog_xGoW1C2A';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('🏥 MediCare Hospital started');

let patients = [];
let doctors = [];
let appts = [];
let currentUser = null;
let currentUserRole = null;
let authMode = 'signin';

// ============================================
// HELPERS
// ============================================
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function esc(s) {
  return s ? String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) : '';
}

function fmt(d) {
  return d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—';
}

function padId(id) {
  return '#' + String(id).padStart(4, '0');
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

// ============================================
// NAVIGATION
// ============================================
document.querySelectorAll('.nav-btn').forEach(b => {
  b.onclick = () => go(b.dataset.page);
});

function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add('active');
}

function openM(id) { document.getElementById(id).classList.add('show'); }
function closeM(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal-bg').forEach(m => {
  m.onclick = e => { if (e.target === m) m.classList.remove('show'); };
});

// ============================================
// AUTHENTICATION
// ============================================
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  currentUser = session ? session.user : null;
  await updateUserUI();

  db.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session ? session.user : null;
    await updateUserUI();
  });
}

async function updateUserUI() {
  const label = document.getElementById('userLabel');
  const emailEl = document.getElementById('userMenuEmail');
  const roleEl = document.getElementById('userMenuRole');
  const welcome = document.getElementById('welcomeMsg');

  if (currentUser) {
    // Pata jina na role
    const { data } = await db.from('user_profiles')
      .select('full_name, role')
      .eq('id', currentUser.id)
      .single();
    
    currentUserRole = data ? data.role : null;
    const fullName = data ? data.full_name : currentUser.email.split('@')[0];
    
    label.textContent = fullName;
    emailEl.textContent = currentUser.email;
    roleEl.textContent = (currentUserRole || 'user').toUpperCase();
    if (welcome) welcome.textContent = 'Karibu, ' + fullName + ' (' + (currentUserRole || 'user') + ')';
    
    // Pakia data
    loadAll();
  } else {
    currentUserRole = null;
    label.textContent = 'Sign In';
    emailEl.textContent = '—';
    roleEl.textContent = '—';
    if (welcome) welcome.textContent = 'Karibu MediCare Hospital';
    
    // Futa data
    patients = [];
    doctors = [];
    appts = [];
    renderPatients();
    renderDoctors();
    renderAppts();
    renderRecent();
    
    // Reset stats
    ['sPatients', 'sDoctors', 'sAppts', 'sPending'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    
    // Fungua Auth modal
    setTimeout(() => openAuth(), 300);
  }
}

function handleUserClick() {
  if (currentUser) {
    document.getElementById('userMenu').classList.toggle('show');
  } else {
    openAuth();
  }
}

function openAuth() {
  document.getElementById('mAuth').classList.add('show');
  switchAuthTab('signin');
}

function switchAuthTab(mode) {
  authMode = mode;
  const isSignIn = mode === 'signin';
  
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');
  
  tabSignIn.classList.toggle('active', isSignIn);
  tabSignUp.classList.toggle('active', !isSignIn);
  
  document.getElementById('signupNameField').style.display = isSignIn ? 'none' : 'block';
  document.getElementById('signupRoleField').style.display = isSignIn ? 'none' : 'block';
  document.getElementById('authTitle').textContent = isSignIn ? 'Sign In' : 'Create Account';
  document.getElementById('authSubmitBtn').innerHTML = isSignIn 
    ? '<i class="fas fa-sign-in-alt"></i> Sign In' 
    : '<i class="fas fa-user-plus"></i> Create Account';
}

async function submitAuth() {
  const email = document.getElementById('a_email').value.trim();
  const password = document.getElementById('a_password').value;
  const name = document.getElementById('a_name').value.trim();
  const role = document.getElementById('a_role').value;

  if (!email || !password) { toast('Jaza email na password', 'error'); return; }
  if (password.length < 6) { toast('Password iwe angalau 6 characters', 'error'); return; }
  if (authMode === 'signup' && !name) { toast('Jaza jina lako', 'error'); return; }

  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inafanya kazi...';

  try {
    if (authMode === 'signup') {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        await db.from('user_profiles').insert([{
          id: data.user.id,
          full_name: name,
          role: role
        }]);
      }
      toast('✅ Account imeundwa! Karibu!');
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast('✅ Karibu tena!');
    }
    closeM('mAuth');
    document.getElementById('a_name').value = '';
    document.getElementById('a_email').value = '';
    document.getElementById('a_password').value = '';
  } catch (err) {
    let msg = err.message;
    if (msg.includes('Invalid login')) msg = 'Email au password si sahihi';
    if (msg.includes('already registered')) msg = 'Email tayari imesajiliwa';
    toast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = authMode === 'signin' 
      ? '<i class="fas fa-sign-in-alt"></i> Sign In' 
      : '<i class="fas fa-user-plus"></i> Create Account';
  }
}

async function signOut() {
  if (!confirm('Sign out?')) return;
  await db.auth.signOut();
  document.getElementById('userMenu').classList.remove('show');
  toast('Umetoka');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  const btn = document.getElementById('userBtn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('show');
  }
});

// ============================================
// LOAD ALL DATA
// ============================================
async function loadAll() {
  if (!currentUser) return;
  
  console.log('📊 Loading data...');
  try {
    const [p, d, a, pend] = await Promise.all([
      db.from('patients').select('*', { count: 'exact', head: true }),
      db.from('doctors').select('*', { count: 'exact', head: true }),
      db.from('appointments').select('*', { count: 'exact', head: true }),
      db.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    document.getElementById('sPatients').textContent = p.count ?? 0;
    document.getElementById('sDoctors').textContent = d.count ?? 0;
    document.getElementById('sAppts').textContent = a.count ?? 0;
    document.getElementById('sPending').textContent = pend.count ?? 0;

    const { data: pd } = await db.from('patients').select('*').order('created_at', { ascending: false });
    patients = pd || [];
    renderPatients();

    const { data: dd } = await db.from('doctors').select('*').order('full_name');
    doctors = dd || [];
    renderDoctors();

    const { data: ad } = await db.from('appointments').select('*').order('appointment_date', { ascending: false });
    appts = ad || [];
    renderAppts();
    renderRecent();

    console.log('✅ Data loaded');
  } catch (err) {
    console.error('Load error:', err);
    toast('Error loading data: ' + err.message, 'error');
  }
}

// ============================================
// RENDER PATIENTS
// ============================================
function renderPatients() {
  const tb = document.getElementById('tPatients');
  if (!tb) return;
  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }

  const q = (document.getElementById('searchP').value || '').toLowerCase().trim();
  const fGender = document.getElementById('filterGender').value;
  const fBlood = document.getElementById('filterBlood').value;

  const list = patients.filter(p => {
    if (q) {
      const idStr = padId(p.id).toLowerCase();
      const idNum = String(p.id);
      const name = (p.full_name || '').toLowerCase();
      const email = (p.email || '').toLowerCase();
      if (!idStr.includes(q) && !idNum.includes(q) && !name.includes(q) && !email.includes(q)) return false;
    }
    if (fGender && p.gender !== fGender) return false;
    if (fBlood && p.blood_group !== fBlood) return false;
    return true;
  });

  document.getElementById('resultCountP').textContent = `${list.length} of ${patients.length} patients`;

  if (list.length === 0) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">No patients found</td></tr>';
    return;
  }

  tb.innerHTML = list.map(p => `
    <tr>
      <td><strong style="color:#0284c7;">${padId(p.id)}</strong></td>
      <td>
        <div class="user-cell">
          <div class="avatar">${initials(p.full_name)}</div>
          <div>
            <div class="name">${esc(p.full_name)}</div>
            <div class="email">${esc(p.email || '')}</div>
          </div>
        </div>
      </td>
      <td>${esc(p.email || '—')}</td>
      <td>${esc(p.phone || '—')}</td>
      <td>${esc(p.gender || '—')}</td>
      <td>${esc(p.blood_group || '—')}</td>
      <td>${fmtDate(p.registered_at || p.created_at)}</td>
      <td>
        <button class="btn-icon" onclick="viewPatient(${p.id})" title="View"><i class="fas fa-eye"></i></button>
        <button class="btn-icon" onclick="editPatient(${p.id})" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="btn-icon" onclick="delPatient(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function clearFilters() {
  document.getElementById('searchP').value = '';
  document.getElementById('filterGender').value = '';
  document.getElementById('filterBlood').value = '';
  renderPatients();
}

// ============================================
// RENDER DOCTORS
// ============================================
function renderDoctors() {
  const tb = document.getElementById('tDoctors');
  if (!tb) return;
  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }
  if (doctors.length === 0) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">No doctors found</td></tr>';
    return;
  }
  tb.innerHTML = doctors.map(d => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="avatar">${initials(d.full_name)}</div>
          <div>
            <div class="name">${esc(d.full_name)}</div>
            <div class="email">${esc(d.email || '')}</div>
          </div>
        </div>
      </td>
      <td>${esc(d.specialization || '—')}</td>
      <td>${esc(d.license_number || '—')}</td>
      <td>${d.years_experience || 0} yrs</td>
      <td>${(d.consultation_fee || 0).toLocaleString()} TZS</td>
      <td>
        <button class="btn-icon" onclick="editDoctor(${d.id})" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="btn-icon" onclick="delDoctor(${d.id})" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

// ============================================
// RENDER APPOINTMENTS
// ============================================
function renderAppts() {
  const tb = document.getElementById('tAppts');
  if (!tb) return;
  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }
  if (appts.length === 0) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">No appointments found</td></tr>';
    return;
  }
  tb.innerHTML = appts.map(a => {
    const pt = patients.find(p => p.id === a.patient_id);
    const dr = doctors.find(d => d.id === a.doctor_id);
    return `
      <tr>
        <td><strong>${esc(pt ? pt.full_name : '—')}</strong></td>
        <td>${esc(dr ? dr.full_name : '—')}</td>
        <td>${fmt(a.appointment_date)}</td>
        <td>${esc(a.reason || '—')}</td>
        <td><span class="badge b-${a.status}">${a.status}</span></td>
        <td>
          <button class="btn-icon" onclick="delAppt(${a.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecent() {
  const tb = document.getElementById('tRecent');
  if (!tb) return;
  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }
  const recent = appts.slice(0, 5);
  if (recent.length === 0) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">No appointments yet</td></tr>';
    return;
  }
  tb.innerHTML = recent.map(a => {
    const pt = patients.find(p => p.id === a.patient_id);
    const dr = doctors.find(d => d.id === a.doctor_id);
    return `
      <tr>
        <td><strong>${esc(pt ? pt.full_name : '—')}</strong></td>
        <td>${esc(dr ? dr.full_name : '—')}</td>
        <td>${fmt(a.appointment_date)}</td>
        <td><span class="badge b-${a.status}">${a.status}</span></td>
      </tr>
    `;
  }).join('');
}

// ============================================
// PATIENT CRUD
// ============================================
function openPatient() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  document.getElementById('fPatient').reset();
  document.getElementById('p_id').value = '';
  document.getElementById('p_display_id').value = 'Auto-generated on save';
  document.getElementById('mPatientTitle').textContent = 'Add Patient';
  openM('mPatient');
}

function editPatient(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const p = patients.find(x => x.id === id);
  if (!p) return;
  document.getElementById('p_id').value = p.id;
  document.getElementById('p_display_id').value = padId(p.id);
  document.getElementById('p_name').value = p.full_name || '';
  document.getElementById('p_email').value = p.email || '';
  document.getElementById('p_phone').value = p.phone || '';
  document.getElementById('p_dob').value = p.dob || '';
  document.getElementById('p_gender').value = p.gender || '';
  document.getElementById('p_blood').value = p.blood_group || '';
  document.getElementById('p_address').value = p.address || '';
  document.getElementById('p_allergies').value = p.allergies || '';
  document.getElementById('p_notes').value = p.notes || '';
  document.getElementById('mPatientTitle').textContent = 'Edit Patient ' + padId(p.id);
  openM('mPatient');
}

async function savePatient() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const id = document.getElementById('p_id').value;
  const data = {
    full_name: document.getElementById('p_name').value.trim(),
    email: document.getElementById('p_email').value.trim(),
    phone: document.getElementById('p_phone').value.trim(),
    dob: document.getElementById('p_dob').value,
    gender: document.getElementById('p_gender').value || null,
    blood_group: document.getElementById('p_blood').value || null,
    address: document.getElementById('p_address').value.trim() || null,
    allergies: document.getElementById('p_allergies').value.trim() || null,
    notes: document.getElementById('p_notes').value.trim() || null
  };
  if (!data.full_name || !data.email || !data.phone || !data.dob) {
    toast('Fill all required fields', 'error');
    return;
  }
  try {
    if (id) {
      const { error } = await db.from('patients').update(data).eq('id', id);
      if (error) throw error;
      toast('Patient ' + padId(id) + ' updated');
    } else {
      const { data: inserted, error } = await db.from('patients').insert([data]).select();
      if (error) throw error;
      const newId = inserted && inserted[0] ? inserted[0].id : '?';
      toast('Patient ' + padId(newId) + ' added');
    }
    closeM('mPatient');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delPatient(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (!confirm('Delete this patient?')) return;
  const { error } = await db.from('patients').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Patient deleted');
  loadAll();
}

function viewPatient(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const p = patients.find(x => x.id === id);
  if (!p) return;
  document.getElementById('mViewPatientTitle').textContent = 'Patient ' + padId(p.id);
  document.getElementById('viewPatientContent').innerHTML = `
    <div class="detail-row"><strong>Patient ID</strong><span style="color:#0284c7; font-weight:700;">${padId(p.id)}</span></div>
    <div class="detail-row"><strong>Full Name</strong><span>${esc(p.full_name)}</span></div>
    <div class="detail-row"><strong>Email</strong><span>${esc(p.email || '—')}</span></div>
    <div class="detail-row"><strong>Phone</strong><span>${esc(p.phone || '—')}</span></div>
    <div class="detail-row"><strong>Date of Birth</strong><span>${fmtDate(p.dob)}</span></div>
    <div class="detail-row"><strong>Gender</strong><span>${esc(p.gender || '—')}</span></div>
    <div class="detail-row"><strong>Blood Group</strong><span>${esc(p.blood_group || '—')}</span></div>
    <div class="detail-row"><strong>Address</strong><span>${esc(p.address || '—')}</span></div>
    <div class="detail-row"><strong>Allergies</strong><span>${esc(p.allergies || '—')}</span></div>
    <div class="detail-row"><strong>Notes</strong><span>${esc(p.notes || '—')}</span></div>
    <div class="detail-row"><strong>Registered</strong><span>${fmtDate(p.registered_at || p.created_at)}</span></div>
  `;
  openM('mViewPatient');
}

// ============================================
// DOCTOR CRUD
// ============================================
function openDoctor() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  document.getElementById('fDoctor').reset();
  document.getElementById('d_id').value = '';
  document.getElementById('mDoctorTitle').textContent = 'Add Doctor';
  openM('mDoctor');
}

function editDoctor(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const d = doctors.find(x => x.id === id);
  if (!d) return;
  document.getElementById('d_id').value = d.id;
  document.getElementById('d_name').value = d.full_name || '';
  document.getElementById('d_email').value = d.email || '';
  document.getElementById('d_phone').value = d.phone || '';
  document.getElementById('d_spec').value = d.specialization || '';
  document.getElementById('d_lic').value = d.license_number || '';
  document.getElementById('d_exp').value = d.years_experience || 0;
  document.getElementById('d_fee').value = d.consultation_fee || 0;
  document.getElementById('mDoctorTitle').textContent = 'Edit Doctor';
  openM('mDoctor');
}

async function saveDoctor() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const id = document.getElementById('d_id').value;
  const data = {
    full_name: document.getElementById('d_name').value.trim(),
    email: document.getElementById('d_email').value.trim(),
    phone: document.getElementById('d_phone').value.trim(),
    specialization: document.getElementById('d_spec').value.trim(),
    license_number: document.getElementById('d_lic').value.trim(),
    years_experience: parseInt(document.getElementById('d_exp').value) || 0,
    consultation_fee: parseFloat(document.getElementById('d_fee').value) || 0
  };
  if (!data.full_name || !data.email || !data.phone || !data.specialization || !data.license_number) {
    toast('Fill all required fields', 'error');
    return;
  }
  try {
    const { error } = id
      ? await db.from('doctors').update(data).eq('id', id)
      : await db.from('doctors').insert([data]);
    if (error) throw error;
    toast(id ? 'Doctor updated' : 'Doctor added');
    closeM('mDoctor');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delDoctor(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (!confirm('Delete this doctor?')) return;
  const { error } = await db.from('doctors').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Doctor deleted');
  loadAll();
}

// ============================================
// APPOINTMENT CRUD
// ============================================
async function openAppt() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  document.getElementById('fAppt').reset();
  const ps = document.getElementById('a_patient');
  const ds = document.getElementById('a_doctor');
  ps.innerHTML = '<option value="">— Select patient —</option>' + patients.map(p => `<option value="${p.id}">${padId(p.id)} - ${esc(p.full_name)}</option>`).join('');
  ds.innerHTML = '<option value="">— Select doctor —</option>' + doctors.map(d => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('');
  const dt = new Date(Date.now() + 3600000);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  document.getElementById('a_date').value = dt.toISOString().slice(0, 16);
  openM('mAppt');
}

async function saveAppt() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const data = {
    patient_id: parseInt(document.getElementById('a_patient').value),
    doctor_id: parseInt(document.getElementById('a_doctor').value),
    appointment_date: document.getElementById('a_date').value,
    reason: document.getElementById('a_reason').value.trim(),
    status: document.getElementById('a_status').value
  };
  if (!data.patient_id || !data.doctor_id || !data.appointment_date || !data.reason) {
    toast('Fill all required fields', 'error');
    return;
  }
  try {
    const { error } = await db.from('appointments').insert([data]);
    if (error) throw error;
    toast('Appointment scheduled');
    closeM('mAppt');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delAppt(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (!confirm('Delete this appointment?')) return;
  const { error } = await db.from('appointments').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Appointment deleted');
  loadAll();
}

// ============================================
// EXPORT CSV
// ============================================
function exportPatientsCSV() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (patients.length === 0) {
    toast('No patients to export', 'error');
    return;
  }
  const headers = ['ID', 'Full Name', 'Email', 'Phone', 'DOB', 'Gender', 'Blood Group', 'Address', 'Allergies', 'Notes', 'Registered'];
  const rows = patients.map(p => [
    padId(p.id),
    p.full_name || '',
    p.email || '',
    p.phone || '',
    p.dob || '',
    p.gender || '',
    p.blood_group || '',
    p.address || '',
    p.allergies || '',
    p.notes || '',
    fmtDate(p.registered_at || p.created_at)
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'patients_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  toast('CSV exported successfully');
}

// ============================================
// INIT
// ============================================
initAuth();
