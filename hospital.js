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
let prescriptions = [];
let invoices = [];
let medicines = [];
let editingInvoiceItems = [];
let currentUser = null;
let currentUserRole = null;
let authMode = 'signin';

// Reports state
let reportData = {
  month: null,
  patients: 0,
  appts: 0,
  revenue: 0,
  rx: 0,
  topDoctors: [],
  topMeds: [],
  monthlyRevenue: []
};

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
  const pageEl = document.getElementById('page-' + page);
  const navEl = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  
  // Auto-load reports when navigating to it
  if (page === 'reports') {
    const input = document.getElementById('reportMonth');
    if (input && !input.value) {
      const now = new Date();
      input.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    loadReports();
  }
  
  // Auto-load pharmacy when navigating to it
  if (page === 'pharmacy') {
    loadMedicines();
  }
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
    
    loadAll();
  } else {
    currentUserRole = null;
    label.textContent = 'Sign In';
    emailEl.textContent = '—';
    roleEl.textContent = '—';
    if (welcome) welcome.textContent = 'Karibu MediCare Hospital';
    
    patients = [];
    doctors = [];
    appts = [];
    prescriptions = [];
    invoices = [];
    medicines = [];
    editingInvoiceItems = [];
    renderPatients();
    renderDoctors();
    renderAppts();
    renderRecent();
    renderPrescriptions();
    renderInvoices();
    renderBillingStats();
    renderMedicines();
    renderPharmacyStats();
    
    ['sPatients', 'sDoctors', 'sAppts', 'sPending'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    
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

    const { data: rxd } = await db.from('prescriptions').select('*').order('prescribed_at', { ascending: false });
    prescriptions = rxd || [];
    renderPrescriptions();

    const { data: invd } = await db.from('invoices').select('*').order('created_at', { ascending: false });
    invoices = invd || [];
    renderInvoices();
    renderBillingStats();

    // Load medicines
    const { data: meds } = await db.from('medicines').select('*').order('name');
    medicines = meds || [];
    renderMedicines();
    renderPharmacyStats();

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
// RENDER PRESCRIPTIONS
// ============================================
function renderPrescriptions() {
  const tb = document.getElementById('tPrescriptions');
  if (!tb) return;

  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }

  const q = (document.getElementById('searchRx').value || '').toLowerCase().trim();
  const list = prescriptions.filter(rx => {
    if (!q) return true;
    const pt = patients.find(p => p.id === rx.patient_id);
    const ptName = pt ? pt.full_name.toLowerCase() : '';
    const medName = (rx.medicine_name || '').toLowerCase();
    return ptName.includes(q) || medName.includes(q);
  });

  document.getElementById('resultCountRx').textContent = `${list.length} of ${prescriptions.length} prescriptions`;

  if (list.length === 0) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">No prescriptions found</td></tr>';
    return;
  }

  tb.innerHTML = list.map(rx => {
    const pt = patients.find(p => p.id === rx.patient_id);
    const dr = doctors.find(d => d.id === rx.doctor_id);
    return `
      <tr>
        <td><strong>${esc(pt ? pt.full_name : '—')}</strong></td>
        <td>${esc(dr ? dr.full_name : '—')}</td>
        <td><strong style="color:#0284c7;">${esc(rx.medicine_name)}</strong></td>
        <td>${esc(rx.dosage || '—')}</td>
        <td>${esc(rx.frequency || '—')}</td>
        <td>${esc(rx.duration || '—')}</td>
        <td>${fmtDate(rx.prescribed_at || rx.created_at)}</td>
        <td>
          <button class="btn-icon" onclick="delPrescription(${rx.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================
// RENDER BILLING - STATS
// ============================================
function renderBillingStats() {
  const sRev = document.getElementById('sTotalRevenue');
  if (!sRev) return;
  
  const totalRevenue = invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  
  const pending = invoices.filter(i => i.status === 'pending').length;
  const paid = invoices.filter(i => i.status === 'paid').length;
  const total = invoices.length;
  
  sRev.textContent = totalRevenue.toLocaleString();
  document.getElementById('sPendingInvoices').textContent = pending;
  document.getElementById('sPaidInvoices').textContent = paid;
  document.getElementById('sTotalInvoices').textContent = total;
}

// ============================================
// RENDER BILLING - INVOICES
// ============================================
function renderInvoices() {
  const tb = document.getElementById('tInvoices');
  if (!tb) return;
  
  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="7" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }
  
  const q = (document.getElementById('searchInv').value || '').toLowerCase().trim();
  const fStatus = document.getElementById('filterInvStatus').value;
  const fPayment = document.getElementById('filterInvPayment').value;
  
  const list = invoices.filter(inv => {
    if (q) {
      const num = (inv.invoice_number || '').toLowerCase();
      const pt = patients.find(p => p.id === inv.patient_id);
      const ptName = pt ? pt.full_name.toLowerCase() : '';
      if (!num.includes(q) && !ptName.includes(q)) return false;
    }
    if (fStatus && inv.status !== fStatus) return false;
    if (fPayment && inv.payment_method !== fPayment) return false;
    return true;
  });
  
  document.getElementById('resultCountInv').textContent = `${list.length} of ${invoices.length} invoices`;
  
  if (list.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" class="empty">No invoices found</td></tr>';
    return;
  }
  
  tb.innerHTML = list.map(inv => {
    const pt = patients.find(p => p.id === inv.patient_id);
    const paymentIcons = { cash: '💵', mpesa: '📱', insurance: '🏥', card: '💳' };
    
    return `
      <tr>
        <td><strong style="color:#0284c7;">${esc(inv.invoice_number || '—')}</strong></td>
        <td><strong>${esc(pt ? pt.full_name : '—')}</strong></td>
        <td>${fmtDate(inv.created_at)}</td>
        <td><strong>${parseFloat(inv.total || 0).toLocaleString()} TZS</strong></td>
        <td>${paymentIcons[inv.payment_method] || ''} ${esc(inv.payment_method)}</td>
        <td><span class="badge b-${inv.status}">${inv.status}</span></td>
        <td>
          <button class="btn-icon" onclick="viewInvoice(${inv.id})" title="View"><i class="fas fa-eye"></i></button>
          <button class="btn-icon" onclick="editInvoice(${inv.id})" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="btn-icon" onclick="delInvoice(${inv.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function clearInvFilters() {
  document.getElementById('searchInv').value = '';
  document.getElementById('filterInvStatus').value = '';
  document.getElementById('filterInvPayment').value = '';
  renderInvoices();
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
// PRESCRIPTION CRUD
// ============================================
async function openPrescription() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  document.getElementById('fPrescription').reset();
  document.getElementById('rx_id').value = '';
  
  const ps = document.getElementById('rx_patient');
  const ds = document.getElementById('rx_doctor');
  
  ps.innerHTML = '<option value="">— Select patient —</option>' + 
    patients.map(p => `<option value="${p.id}">${padId(p.id)} - ${esc(p.full_name)}</option>`).join('');
  
  ds.innerHTML = '<option value="">— Select doctor —</option>' + 
    doctors.map(d => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('');
  
  document.getElementById('mPrescriptionTitle').textContent = 'New Prescription';
  openM('mPrescription');
}

async function savePrescription() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  const data = {
    patient_id: parseInt(document.getElementById('rx_patient').value),
    doctor_id: parseInt(document.getElementById('rx_doctor').value),
    medicine_name: document.getElementById('rx_medicine').value.trim(),
    dosage: document.getElementById('rx_dosage').value.trim(),
    frequency: document.getElementById('rx_frequency').value.trim() || null,
    duration: document.getElementById('rx_duration').value.trim() || null,
    instructions: document.getElementById('rx_instructions').value.trim() || null
  };
  
  if (!data.patient_id || !data.doctor_id || !data.medicine_name || !data.dosage) {
    toast('Jaza sehemu zote zinazohitajika', 'error');
    return;
  }
  
  try {
    const { error } = await db.from('prescriptions').insert([data]);
    if (error) throw error;
    toast('✅ Prescription imeongezwa');
    closeM('mPrescription');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delPrescription(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (!confirm('Delete this prescription?')) return;
  const { error } = await db.from('prescriptions').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Prescription deleted');
  loadAll();
}

// ============================================
// INVOICE CRUD
// ============================================
async function openInvoice() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  document.getElementById('fInvoice').reset();
  document.getElementById('inv_id').value = '';
  
  const ps = document.getElementById('inv_patient');
  ps.innerHTML = '<option value="">— Select patient —</option>' + 
    patients.map(p => `<option value="${p.id}">${padId(p.id)} - ${esc(p.full_name)}</option>`).join('');
  
  editingInvoiceItems = [];
  addInvoiceItem();
  
  document.getElementById('mInvoiceTitle').textContent = 'New Invoice';
  openM('mInvoice');
}

function addInvoiceItem() {
  editingInvoiceItems.push({
    description: '',
    quantity: 1,
    unit_price: 0
  });
  renderInvoiceItems();
}

function removeInvoiceItem(index) {
  editingInvoiceItems.splice(index, 1);
  if (editingInvoiceItems.length === 0) addInvoiceItem();
  renderInvoiceItems();
}

function renderInvoiceItems() {
  const container = document.getElementById('invoiceItems');
  if (!container) return;
  
  container.innerHTML = editingInvoiceItems.map((item, i) => `
    <div style="background:var(--gray-50); padding:0.85rem; border-radius:10px; margin-bottom:0.6rem; display:grid; grid-template-columns:2fr 0.6fr 1fr 1fr auto; gap:0.6rem; align-items:end;">
      <div class="fg" style="gap:0.3rem;">
        <label style="font-size:0.7rem;">Description</label>
        <input type="text" value="${esc(item.description)}" oninput="updateInvoiceItem(${i}, 'description', this.value)" placeholder="e.g., Consultation" style="padding:0.5rem 0.7rem;">
      </div>
      <div class="fg" style="gap:0.3rem;">
        <label style="font-size:0.7rem;">Qty</label>
        <input type="number" value="${item.quantity}" min="1" oninput="updateInvoiceItem(${i}, 'quantity', this.value)" style="padding:0.5rem 0.7rem;">
      </div>
      <div class="fg" style="gap:0.3rem;">
        <label style="font-size:0.7rem;">Unit Price</label>
        <input type="number" value="${item.unit_price}" min="0" oninput="updateInvoiceItem(${i}, 'unit_price', this.value)" style="padding:0.5rem 0.7rem;">
      </div>
      <div class="fg" style="gap:0.3rem;">
        <label style="font-size:0.7rem;">Amount</label>
        <input type="text" value="${(item.quantity * item.unit_price).toLocaleString()}" readonly style="padding:0.5rem 0.7rem; background:white;">
      </div>
      <button type="button" class="btn-icon" onclick="removeInvoiceItem(${i})" title="Remove" style="margin-bottom:2px;">
        <i class="fas fa-trash" style="color:var(--danger);"></i>
      </button>
    </div>
  `).join('');
  
  calculateInvoiceTotal();
}

function updateInvoiceItem(index, field, value) {
  if (!editingInvoiceItems[index]) return;
  if (field === 'description') {
    editingInvoiceItems[index][field] = value;
  } else {
    editingInvoiceItems[index][field] = parseFloat(value) || 0;
  }
  if (field !== 'description') renderInvoiceItems();
}

function calculateInvoiceTotal() {
  const subtotal = editingInvoiceItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const taxPercent = parseFloat(document.getElementById('inv_tax_percent').value) || 0;
  const discount = parseFloat(document.getElementById('inv_discount').value) || 0;
  const tax = subtotal * (taxPercent / 100);
  const total = subtotal + tax - discount;
  
  document.getElementById('inv_subtotal').value = subtotal;
  document.getElementById('inv_total_display').value = total.toLocaleString() + ' TZS';
}

async function saveInvoice() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  const patient_id = parseInt(document.getElementById('inv_patient').value);
  if (!patient_id) { toast('Chagua mgonjwa', 'error'); return; }
  
  const validItems = editingInvoiceItems.filter(i => i.description.trim() && i.quantity > 0);
  if (validItems.length === 0) { toast('Ongeza items angalau moja', 'error'); return; }
  
  const subtotal = validItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const taxPercent = parseFloat(document.getElementById('inv_tax_percent').value) || 0;
  const discount = parseFloat(document.getElementById('inv_discount').value) || 0;
  const tax = subtotal * (taxPercent / 100);
  const total = subtotal + tax - discount;
  
  const invoiceNumber = 'INV-' + Date.now().toString().slice(-8);
  
  const invoiceData = {
    invoice_number: invoiceNumber,
    patient_id: patient_id,
    subtotal: subtotal,
    tax: tax,
    discount: discount,
    total: total,
    payment_method: document.getElementById('inv_payment').value,
    status: document.getElementById('inv_status').value,
    notes: document.getElementById('inv_notes').value.trim() || null
  };
  
  try {
    const { data: inserted, error: invErr } = await db
      .from('invoices')
      .insert([invoiceData])
      .select();
    if (invErr) throw invErr;
    
    const invoiceId = inserted[0].id;
    
    const items = validItems.map(i => ({
      invoice_id: invoiceId,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      amount: i.quantity * i.unit_price
    }));
    
    const { error: itemsErr } = await db.from('invoice_items').insert(items);
    if (itemsErr) throw itemsErr;
    
    toast('✅ Invoice ' + invoiceNumber + ' imeundwa');
    closeM('mInvoice');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function viewInvoice(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  const inv = invoices.find(x => x.id === id);
  if (!inv) return;
  
  const pt = patients.find(p => p.id === inv.patient_id);
  
  const { data: items } = await db
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', id);
  
  const paymentIcons = { cash: '💵 Cash', mpesa: '📱 M-Pesa', insurance: '🏥 Insurance', card: '💳 Card' };
  
  document.getElementById('mViewInvoiceTitle').textContent = 'Invoice ' + (inv.invoice_number || '');
  document.getElementById('viewInvoiceContent').innerHTML = `
    <div style="text-align:center; padding-bottom:1rem; border-bottom:2px solid var(--gray-200); margin-bottom:1.5rem;">
      <h2 style="font-size:1.3rem; color:var(--primary);">🏥 MediCare Hospital</h2>
      <p style="color:var(--gray-500); font-size:0.85rem;">Dar es Salaam, Tanzania</p>
    </div>
    
    <div class="detail-row"><strong>Invoice #</strong><span><strong>${esc(inv.invoice_number)}</strong></span></div>
    <div class="detail-row"><strong>Date</strong><span>${fmtDate(inv.created_at)}</span></div>
    <div class="detail-row"><strong>Patient</strong><span>${esc(pt ? pt.full_name : '—')}</span></div>
    <div class="detail-row"><strong>Phone</strong><span>${esc(pt ? pt.phone : '—')}</span></div>
    <div class="detail-row"><strong>Payment</strong><span>${paymentIcons[inv.payment_method] || inv.payment_method}</span></div>
    <div class="detail-row"><strong>Status</strong><span><span class="badge b-${inv.status}">${inv.status}</span></span></div>
    
    <h4 style="margin:1.5rem 0 0.75rem;">Items</h4>
    <table style="font-size:0.85rem;">
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr>
      </thead>
      <tbody>
        ${(items || []).map(i => `
          <tr>
            <td>${esc(i.description)}</td>
            <td>${i.quantity}</td>
            <td>${parseFloat(i.unit_price).toLocaleString()}</td>
            <td><strong>${parseFloat(i.amount).toLocaleString()}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div style="margin-top:1.5rem; padding:1rem; background:var(--gray-50); border-radius:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
        <span>Subtotal:</span><span>${parseFloat(inv.subtotal).toLocaleString()} TZS</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
        <span>Tax:</span><span>${parseFloat(inv.tax).toLocaleString()} TZS</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
        <span>Discount:</span><span>-${parseFloat(inv.discount).toLocaleString()} TZS</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-weight:800; font-size:1.1rem; padding-top:0.6rem; border-top:2px solid var(--gray-200); color:var(--primary);">
        <span>TOTAL:</span><span>${parseFloat(inv.total).toLocaleString()} TZS</span>
      </div>
    </div>
    
    ${inv.notes ? `<p style="margin-top:1rem; color:var(--gray-500); font-size:0.85rem;"><strong>Notes:</strong> ${esc(inv.notes)}</p>` : ''}
  `;
  
  openM('mViewInvoice');
}

// ============================================
// EDIT INVOICE
// ============================================
function editInvoice(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  const inv = invoices.find(x => x.id === id);
  if (!inv) return;
  
  const pt = patients.find(p => p.id === inv.patient_id);
  
  document.getElementById('edit_inv_id').value = inv.id;
  document.getElementById('edit_inv_number').value = inv.invoice_number || '';
  document.getElementById('edit_inv_patient').value = pt ? pt.full_name : '—';
  document.getElementById('edit_inv_total').value = parseFloat(inv.total).toLocaleString() + ' TZS';
  document.getElementById('edit_inv_payment').value = inv.payment_method || 'cash';
  document.getElementById('edit_inv_status').value = inv.status || 'pending';
  document.getElementById('edit_inv_notes').value = inv.notes || '';
  
  document.getElementById('mEditInvoiceTitle').textContent = 'Edit Invoice ' + (inv.invoice_number || '');
  openM('mEditInvoice');
}

async function updateInvoice() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  const id = document.getElementById('edit_inv_id').value;
  if (!id) return;
  
  const data = {
    payment_method: document.getElementById('edit_inv_payment').value,
    status: document.getElementById('edit_inv_status').value,
    notes: document.getElementById('edit_inv_notes').value.trim() || null
  };
  
  try {
    const { error } = await db.from('invoices').update(data).eq('id', id);
    if (error) throw error;
    toast('✅ Invoice ime-update');
    closeM('mEditInvoice');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delInvoice(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (!confirm('Delete this invoice?')) return;
  const { error } = await db.from('invoices').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Invoice deleted');
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
// REPORTS
// ============================================
function getSelectedMonth() {
  const input = document.getElementById('reportMonth');
  if (input && input.value) return input.value;
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthName(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

async function loadReports() {
  if (!currentUser) {
    ['rPatients', 'rAppts', 'rRevenue', 'rRx'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }
  
  const ym = getSelectedMonth();
  reportData.month = ym;
  const { start, end } = monthRange(ym);
  
  const input = document.getElementById('reportMonth');
  if (input && !input.value) input.value = ym;
  
  ['tTopDoctors', 'tTopMeds', 'tMonthlyRevenue'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<tr><td colspan="5" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  });
  
  try {
    const [pRes, aRes, rxRes, invRes] = await Promise.all([
      db.from('patients').select('*', { count: 'exact', head: true })
        .gte('created_at', start).lt('created_at', end),
      db.from('appointments').select('*', { count: 'exact', head: true })
        .gte('appointment_date', start).lt('appointment_date', end),
      db.from('prescriptions').select('*', { count: 'exact', head: true })
        .gte('prescribed_at', start).lt('prescribed_at', end),
      db.from('invoices').select('total, status')
        .gte('created_at', start).lt('created_at', end)
    ]);
    
    reportData.patients = pRes.count || 0;
    reportData.appts = aRes.count || 0;
    reportData.rx = rxRes.count || 0;
    reportData.revenue = (invRes.data || [])
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    
    document.getElementById('rPatients').textContent = reportData.patients;
    document.getElementById('rAppts').textContent = reportData.appts;
    document.getElementById('rRx').textContent = reportData.rx;
    document.getElementById('rRevenue').textContent = reportData.revenue.toLocaleString();
    
    await Promise.all([
      loadTopDoctors(start, end),
      loadTopMedicines(start, end),
      loadMonthlyRevenue()
    ]);
    
  } catch (err) {
    console.error('Reports error:', err);
    toast('Error loading reports: ' + err.message, 'error');
  }
}

async function loadTopDoctors(start, end) {
  const tb = document.getElementById('tTopDoctors');
  if (!tb) return;
  
  const { data: monthAppts } = await db.from('appointments')
    .select('doctor_id, status')
    .gte('appointment_date', start).lt('appointment_date', end);
  
  if (!monthAppts || monthAppts.length === 0) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">Hakuna miadi mwezi huu</td></tr>';
    reportData.topDoctors = [];
    return;
  }
  
  const counts = {};
  monthAppts.forEach(a => {
    if (!counts[a.doctor_id]) counts[a.doctor_id] = { total: 0, completed: 0 };
    counts[a.doctor_id].total++;
    if (a.status === 'completed') counts[a.doctor_id].completed++;
  });
  
  const docIds = Object.keys(counts).map(Number);
  const { data: docs } = await db.from('doctors').select('*').in('id', docIds);
  
  const doctorList = (docs || []).map(d => {
    const c = counts[d.id] || { total: 0, completed: 0 };
    const revenue = (parseFloat(d.consultation_fee) || 0) * c.completed;
    return {
      name: d.full_name,
      specialization: d.specialization || '—',
      appts: c.total,
      revenue: revenue
    };
  }).sort((a, b) => b.revenue - a.revenue || b.appts - a.appts).slice(0, 10);
  
  reportData.topDoctors = doctorList;
  
  if (doctorList.length === 0) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">Hakuna data</td></tr>';
    return;
  }
  
  tb.innerHTML = doctorList.map((d, i) => {
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${i + 1}</span></td>
        <td>
          <div class="user-cell">
            <div class="avatar">${initials(d.name)}</div>
            <div><div class="name">${esc(d.name)}</div></div>
          </div>
        </td>
        <td>${esc(d.specialization)}</td>
        <td><strong>${d.appts}</strong></td>
        <td><strong style="color:var(--success);">${d.revenue.toLocaleString()} TZS</strong></td>
      </tr>
    `;
  }).join('');
}

async function loadTopMedicines(start, end) {
  const tb = document.getElementById('tTopMeds');
  if (!tb) return;
  
  const { data: monthRx } = await db.from('prescriptions')
    .select('medicine_name, patient_id')
    .gte('prescribed_at', start).lt('prescribed_at', end);
  
  if (!monthRx || monthRx.length === 0) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Hakuna prescriptions mwezi huu</td></tr>';
    reportData.topMeds = [];
    return;
  }
  
  const meds = {};
  monthRx.forEach(rx => {
    const name = (rx.medicine_name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!meds[key]) meds[key] = { name: name, count: 0, patients: new Set() };
    meds[key].count++;
    if (rx.patient_id) meds[key].patients.add(rx.patient_id);
  });
  
  const medList = Object.values(meds)
    .map(m => ({ name: m.name, count: m.count, patients: m.patients.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  reportData.topMeds = medList;
  
  if (medList.length === 0) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Hakuna data</td></tr>';
    return;
  }
  
  tb.innerHTML = medList.map((m, i) => {
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${i + 1}</span></td>
        <td><strong>${esc(m.name)}</strong></td>
        <td><span class="badge b-confirmed">${m.count}×</span></td>
        <td>${m.patients} wagonjwa</td>
      </tr>
    `;
  }).join('');
}

async function loadMonthlyRevenue() {
  const tb = document.getElementById('tMonthlyRevenue');
  if (!tb) return;
  
  const now = new Date();
  const monthsBack = 12;
  const startDate = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  
  const { data: allInv } = await db.from('invoices')
    .select('total, status, created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });
  
  const monthly = {};
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    monthly[key] = { count: 0, paid: 0, revenue: 0 };
  }
  
  (allInv || []).forEach(inv => {
    if (!inv.created_at) return;
    const d = new Date(inv.created_at);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthly[key]) return;
    monthly[key].count++;
    if (inv.status === 'paid') {
      monthly[key].paid++;
      monthly[key].revenue += parseFloat(inv.total) || 0;
    }
  });
  
  const list = Object.keys(monthly).sort().reverse().map(k => ({
    ym: k,
    label: monthName(k),
    ...monthly[k]
  }));
  
  reportData.monthlyRevenue = list;
  
  const maxRev = Math.max(...list.map(m => m.revenue), 1);
  
  if (list.length === 0) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Hakuna data</td></tr>';
    return;
  }
  
  tb.innerHTML = list.map(m => {
    const pct = (m.revenue / maxRev) * 100;
    return `
      <tr>
        <td><strong>${m.label}</strong></td>
        <td>${m.count}</td>
        <td>${m.paid}</td>
        <td>
          <strong style="color:var(--success);">${m.revenue.toLocaleString()} TZS</strong>
          <div class="revenue-bar"><div class="revenue-bar-fill" style="width:${pct}%"></div></div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================
// EXPORT REPORT CSV
// ============================================
function exportReportCSV() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  
  const ym = reportData.month || getSelectedMonth();
  const monthLabel = monthName(ym);
  
  let csv = '';
  
  csv += 'RIPOTI YA MWEZI: ' + monthLabel + '\n\n';
  csv += 'MUHTASARI\n';
  csv += 'Kipimo,Thamani\n';
  csv += 'Wagonjwa Wapya,' + reportData.patients + '\n';
  csv += 'Miadi,' + reportData.appts + '\n';
  csv += 'Prescriptions,' + reportData.rx + '\n';
  csv += 'Mapato (TZS),' + reportData.revenue + '\n';
  csv += '\n';
  
  csv += 'MADAKTARI BORA\n';
  csv += '#,Daktari,Specialization,Miadi,Mapato (TZS)\n';
  reportData.topDoctors.forEach((d, i) => {
    csv += `${i + 1},"${d.name}","${d.specialization}",${d.appts},${d.revenue}\n`;
  });
  csv += '\n';
  
  csv += 'DAWA ZINAZOTUMIKA\n';
  csv += '#,Dawa,Idadi,Wagonjwa\n';
  reportData.topMeds.forEach((m, i) => {
    csv += `${i + 1},"${m.name}",${m.count},${m.patients}\n`;
  });
  csv += '\n';
  
  csv += 'MAPATO KWA MWEZI\n';
  csv += 'Mwezi,Invoices,Zilizolipwa,Mapato (TZS)\n';
  reportData.monthlyRevenue.forEach(m => {
    csv += `"${m.label}",${m.count},${m.paid},${m.revenue}\n`;
  });
  
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'report_' + ym + '.csv';
  link.click();
  toast('✅ Report ime-export');
}

// ============================================
// PHARMACY
// ============================================
async function loadMedicines() {
  if (!currentUser) return;
  const { data, error } = await db
    .from('medicines')
    .select('*')
    .order('name');
  if (error) {
    console.error('Load medicines error:', error);
    return;
  }
  medicines = data || [];
  renderMedicines();
  renderPharmacyStats();
}

function renderPharmacyStats() {
  const el = document.getElementById('phTotal');
  if (!el) return;
  
  const total = medicines.length;
  const lowStock = medicines.filter(m => (m.stock_quantity || 0) > 0 && (m.stock_quantity || 0) <= (m.reorder_level || 10)).length;
  const outStock = medicines.filter(m => (m.stock_quantity || 0) === 0).length;
  
  const today = new Date();
  const in90 = new Date();
  in90.setDate(today.getDate() + 90);
  
  const expiring = medicines.filter(m => {
    if (!m.expiry_date) return false;
    const exp = new Date(m.expiry_date);
    return exp <= in90;
  }).length;
  
  const totalValue = medicines.reduce((s, m) => s + ((m.stock_quantity || 0) * (m.cost_price || 0)), 0);
  
  document.getElementById('phTotal').textContent = total;
  document.getElementById('phLowStock').textContent = lowStock + outStock;
  document.getElementById('phExpiring').textContent = expiring;
  document.getElementById('phValue').textContent = totalValue.toLocaleString();
}

function getExpiryStatus(expiry) {
  if (!expiry) return { status: 'ok', label: '—', class: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  exp.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  
  if (daysLeft < 0) return { status: 'expired', label: 'Expired', class: 'b-expired', days: daysLeft };
  if (daysLeft <= 90) return { status: 'soon', label: `${daysLeft}d left`, class: 'b-expiring', days: daysLeft };
  return { status: 'ok', label: fmtDate(expiry), class: 'b-completed', days: daysLeft };
}

function getStockStatus(med) {
  const qty = med.stock_quantity || 0;
  const reorder = med.reorder_level || 10;
  if (qty === 0) return { status: 'out', label: 'Out of Stock', class: 'b-out-stock' };
  if (qty <= reorder) return { status: 'low', label: 'Low Stock', class: 'b-low-stock' };
  return { status: 'ok', label: 'In Stock', class: 'b-completed' };
}

function renderMedicines() {
  const tb = document.getElementById('tMedicines');
  if (!tb) return;
  
  if (!currentUser) {
    tb.innerHTML = '<tr><td colspan="9" class="empty">Tafadhali ingia kwanza</td></tr>';
    return;
  }
  
  const q = (document.getElementById('searchMed').value || '').toLowerCase().trim();
  const fCat = document.getElementById('filterMedCat').value;
  const fStock = document.getElementById('filterMedStock').value;
  const fExpiry = document.getElementById('filterMedExpiry').value;
  
  const list = medicines.filter(m => {
    if (q) {
      const name = (m.name || '').toLowerCase();
      const generic = (m.generic_name || '').toLowerCase();
      const cat = (m.category || '').toLowerCase();
      if (!name.includes(q) && !generic.includes(q) && !cat.includes(q)) return false;
    }
    if (fCat && m.category !== fCat) return false;
    
    const stockSt = getStockStatus(m);
    if (fStock === 'low' && stockSt.status !== 'low') return false;
    if (fStock === 'out' && stockSt.status !== 'out') return false;
    if (fStock === 'ok' && stockSt.status !== 'ok') return false;
    
    const expSt = getExpiryStatus(m.expiry_date);
    if (fExpiry === 'expired' && expSt.status !== 'expired') return false;
    if (fExpiry === 'soon' && expSt.status !== 'soon') return false;
    if (fExpiry === 'ok' && expSt.status !== 'ok') return false;
    
    return true;
  });
  
  document.getElementById('resultCountMed').textContent = `${list.length} of ${medicines.length} medicines`;
  
  if (list.length === 0) {
    tb.innerHTML = '<tr><td colspan="9" class="empty">Hakuna dawa zilizopatikana</td></tr>';
    return;
  }
  
  tb.innerHTML = list.map(m => {
    const stockSt = getStockStatus(m);
    const expSt = getExpiryStatus(m.expiry_date);
    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="avatar" style="background:#e0f2fe; color:#0369a1;"><i class="fas fa-pills"></i></div>
            <div>
              <div class="name">${esc(m.name)}</div>
              <div class="email">${esc(m.generic_name || m.manufacturer || '')}</div>
            </div>
          </div>
        </td>
        <td>${esc(m.category || '—')}</td>
        <td><strong>${m.stock_quantity || 0}</strong></td>
        <td>${esc(m.unit || '—')}</td>
        <td>${(m.cost_price || 0).toLocaleString()} TZS</td>
        <td><strong>${(m.selling_price || 0).toLocaleString()} TZS</strong></td>
        <td><span class="badge ${expSt.class}">${expSt.label}</span></td>
        <td><span class="badge ${stockSt.class}">${stockSt.label}</span></td>
        <td>
          <button class="btn-icon" onclick="viewMedicine(${m.id})" title="View"><i class="fas fa-eye"></i></button>
          <button class="btn-icon" onclick="openStockIn(${m.id})" title="Stock In" style="color:var(--success);"><i class="fas fa-arrow-down"></i></button>
          <button class="btn-icon" onclick="openStockOut(${m.id})" title="Stock Out" style="color:var(--warning);"><i class="fas fa-arrow-up"></i></button>
          <button class="btn-icon" onclick="editMedicine(${m.id})" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="btn-icon" onclick="delMedicine(${m.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function clearMedFilters() {
  document.getElementById('searchMed').value = '';
  document.getElementById('filterMedCat').value = '';
  document.getElementById('filterMedStock').value = '';
  document.getElementById('filterMedExpiry').value = '';
  renderMedicines();
}

// ---- MEDICINE CRUD ----
function openMedicine() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  document.getElementById('fMedicine').reset();
  document.getElementById('med_id').value = '';
  document.getElementById('med_stock').value = 0;
  document.getElementById('med_reorder').value = 10;
  document.getElementById('med_cost').value = 0;
  document.getElementById('med_price').value = 0;
  document.getElementById('mMedicineTitle').textContent = 'Add Medicine';
  openM('mMedicine');
}

function editMedicine(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  document.getElementById('med_id').value = m.id;
  document.getElementById('med_name').value = m.name || '';
  document.getElementById('med_generic').value = m.generic_name || '';
  document.getElementById('med_category').value = m.category || '';
  document.getElementById('med_unit').value = m.unit || 'tablet';
  document.getElementById('med_manufacturer').value = m.manufacturer || '';
  document.getElementById('med_batch').value = m.batch_number || '';
  document.getElementById('med_stock').value = m.stock_quantity || 0;
  document.getElementById('med_reorder').value = m.reorder_level || 10;
  document.getElementById('med_cost').value = m.cost_price || 0;
  document.getElementById('med_price').value = m.selling_price || 0;
  document.getElementById('med_expiry').value = m.expiry_date || '';
  document.getElementById('med_desc').value = m.description || '';
  document.getElementById('mMedicineTitle').textContent = 'Edit Medicine';
  openM('mMedicine');
}

async function saveMedicine() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const id = document.getElementById('med_id').value;
  
  const data = {
    name: document.getElementById('med_name').value.trim(),
    generic_name: document.getElementById('med_generic').value.trim() || null,
    category: document.getElementById('med_category').value || null,
    unit: document.getElementById('med_unit').value,
    manufacturer: document.getElementById('med_manufacturer').value.trim() || null,
    batch_number: document.getElementById('med_batch').value.trim() || null,
    stock_quantity: parseInt(document.getElementById('med_stock').value) || 0,
    reorder_level: parseInt(document.getElementById('med_reorder').value) || 10,
    cost_price: parseFloat(document.getElementById('med_cost').value) || 0,
    selling_price: parseFloat(document.getElementById('med_price').value) || 0,
    expiry_date: document.getElementById('med_expiry').value || null,
    description: document.getElementById('med_desc').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  
  if (!data.name) {
    toast('Jaza jina la dawa', 'error');
    return;
  }
  
  try {
    if (id) {
      const { error } = await db.from('medicines').update(data).eq('id', id);
      if (error) throw error;
      toast('✅ Dawa ime-update');
    } else {
      const { error } = await db.from('medicines').insert([data]);
      if (error) throw error;
      toast('✅ Dawa imeongezwa');
    }
    closeM('mMedicine');
    loadMedicines();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delMedicine(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (!confirm('Futa dawa hii?')) return;
  const { error } = await db.from('medicines').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Dawa imefutwa');
  loadMedicines();
}

async function viewMedicine(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  
  const { data: movements } = await db
    .from('stock_movements')
    .select('*')
    .eq('medicine_id', id)
    .order('created_at', { ascending: false })
    .limit(10);
  
  const stockSt = getStockStatus(m);
  const expSt = getExpiryStatus(m.expiry_date);
  
  document.getElementById('mViewMedicineTitle').textContent = m.name;
  document.getElementById('viewMedicineContent').innerHTML = `
    <div class="detail-row"><strong>Name</strong><span>${esc(m.name)}</span></div>
    <div class="detail-row"><strong>Generic Name</strong><span>${esc(m.generic_name || '—')}</span></div>
    <div class="detail-row"><strong>Category</strong><span>${esc(m.category || '—')}</span></div>
    <div class="detail-row"><strong>Manufacturer</strong><span>${esc(m.manufacturer || '—')}</span></div>
    <div class="detail-row"><strong>Batch #</strong><span>${esc(m.batch_number || '—')}</span></div>
    <div class="detail-row"><strong>Stock</strong><span><strong>${m.stock_quantity || 0} ${esc(m.unit || '')}</strong> <span class="badge ${stockSt.class}">${stockSt.label}</span></span></div>
    <div class="detail-row"><strong>Reorder Level</strong><span>${m.reorder_level || 10}</span></div>
    <div class="detail-row"><strong>Cost Price</strong><span>${(m.cost_price || 0).toLocaleString()} TZS</span></div>
    <div class="detail-row"><strong>Selling Price</strong><span><strong style="color:var(--primary);">${(m.selling_price || 0).toLocaleString()} TZS</strong></span></div>
    <div class="detail-row"><strong>Expiry Date</strong><span><span class="badge ${expSt.class}">${expSt.label}</span></span></div>
    <div class="detail-row"><strong>Description</strong><span>${esc(m.description || '—')}</span></div>
    
    <h4 style="margin:1.5rem 0 0.75rem;">📊 Historia ya Stock (10 za mwisho)</h4>
    ${(movements || []).length === 0 ? '<p style="color:var(--gray-500); font-size:0.85rem;">Hakuna historia bado.</p>' : `
      <table style="font-size:0.85rem;">
        <thead>
          <tr><th>Tarehe</th><th>Aina</th><th>Idadi</th><th>Sababu</th></tr>
        </thead>
        <tbody>
          ${movements.map(mv => `
            <tr>
              <td>${fmt(mv.created_at)}</td>
              <td><span class="badge ${mv.movement_type === 'in' ? 'b-completed' : 'b-pending'}">${mv.movement_type === 'in' ? '📥 IN' : '📤 OUT'}</span></td>
              <td><strong>${mv.quantity}</strong></td>
              <td>${esc(mv.reason || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}
  `;
  openM('mViewMedicine');
}

// ---- STOCK IN ----
function openStockIn(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  document.getElementById('fStockIn').reset();
  document.getElementById('si_med_id').value = m.id;
  document.getElementById('si_med_name').value = m.name;
  document.getElementById('si_current').value = (m.stock_quantity || 0) + ' ' + (m.unit || '');
  document.getElementById('si_qty').value = 1;
  openM('mStockIn');
}

async function saveStockIn() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const medId = parseInt(document.getElementById('si_med_id').value);
  const qty = parseInt(document.getElementById('si_qty').value);
  const reason = document.getElementById('si_reason').value.trim();
  const notes = document.getElementById('si_notes').value.trim();
  
  if (!medId || !qty || qty <= 0) {
    toast('Weka idadi sahihi', 'error');
    return;
  }
  if (!reason) {
    toast('Jaza sababu', 'error');
    return;
  }
  
  const m = medicines.find(x => x.id === medId);
  if (!m) return;
  
  try {
    const newQty = (m.stock_quantity || 0) + qty;
    const { error: updErr } = await db
      .from('medicines')
      .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', medId);
    if (updErr) throw updErr;
    
    const { error: mvErr } = await db.from('stock_movements').insert([{
      medicine_id: medId,
      movement_type: 'in',
      quantity: qty,
      reason: reason,
      notes: notes || null,
      created_by: currentUser.id
    }]);
    if (mvErr) throw mvErr;
    
    toast(`✅ Stock imeongezwa: +${qty} ${m.unit || ''}`);
    closeM('mStockIn');
    loadMedicines();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---- STOCK OUT ----
function openStockOut(id) {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  document.getElementById('fStockOut').reset();
  document.getElementById('so_med_id').value = m.id;
  document.getElementById('so_med_name').value = m.name;
  document.getElementById('so_current').value = (m.stock_quantity || 0) + ' ' + (m.unit || '');
  document.getElementById('so_qty').value = 1;
  openM('mStockOut');
}

async function saveStockOut() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  const medId = parseInt(document.getElementById('so_med_id').value);
  const qty = parseInt(document.getElementById('so_qty').value);
  const reason = document.getElementById('so_reason').value.trim();
  const notes = document.getElementById('so_notes').value.trim();
  
  if (!medId || !qty || qty <= 0) {
    toast('Weka idadi sahihi', 'error');
    return;
  }
  if (!reason) {
    toast('Jaza sababu', 'error');
    return;
  }
  
  const m = medicines.find(x => x.id === medId);
  if (!m) return;
  
  if (qty > (m.stock_quantity || 0)) {
    toast(`Stock haitoshi! Iliyopo: ${m.stock_quantity || 0}`, 'error');
    return;
  }
  
  try {
    const newQty = (m.stock_quantity || 0) - qty;
    const { error: updErr } = await db
      .from('medicines')
      .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', medId);
    if (updErr) throw updErr;
    
    const { error: mvErr } = await db.from('stock_movements').insert([{
      medicine_id: medId,
      movement_type: 'out',
      quantity: qty,
      reason: reason,
      notes: notes || null,
      created_by: currentUser.id
    }]);
    if (mvErr) throw mvErr;
    
    toast(`✅ Stock imetolewa: -${qty} ${m.unit || ''}`);
    closeM('mStockOut');
    loadMedicines();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---- EXPORT MEDICINES CSV ----
function exportMedicinesCSV() {
  if (!currentUser) { toast('Tafadhali ingia kwanza', 'error'); return; }
  if (medicines.length === 0) {
    toast('Hakuna dawa za ku-export', 'error');
    return;
  }
  const headers = ['Name', 'Generic', 'Category', 'Unit', 'Stock', 'Reorder Level', 'Cost Price', 'Selling Price', 'Expiry', 'Manufacturer', 'Batch', 'Status'];
  const rows = medicines.map(m => {
    const stockSt = getStockStatus(m);
    const expSt = getExpiryStatus(m.expiry_date);
    return [
      m.name || '',
      m.generic_name || '',
      m.category || '',
      m.unit || '',
      m.stock_quantity || 0,
      m.reorder_level || 0,
      m.cost_price || 0,
      m.selling_price || 0,
      m.expiry_date || '',
      m.manufacturer || '',
      m.batch_number || '',
      `${stockSt.label} / ${expSt.label}`
    ];
  });
  const csv = [headers, ...rows]
    .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'medicines_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  toast('✅ Medicines CSV exported');
}

// ============================================
// INIT
// ============================================
initAuth();
