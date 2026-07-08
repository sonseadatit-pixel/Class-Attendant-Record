import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const studentsTable = document.querySelector('#studentsTable tbody');
const totalStudentsEl = document.getElementById('totalStudents');
const presentCountEl = document.getElementById('presentCount');
const absentCountEl = document.getElementById('absentCount');
const permissionCountEl = document.getElementById('permissionCount');
const attendanceRateEl = document.getElementById('attendanceRate');
const rateLabelEl = document.getElementById('rateLabel');
const weekSelect = document.getElementById('week');
const courseSelect = document.getElementById('course');
const attDateInput = document.getElementById('attDate');
const prevDateBtn = document.getElementById('prevDate');
const nextDateBtn = document.getElementById('nextDate');
const saveAttendanceBtn = document.getElementById('saveAttendance');
const importExcelBtn = document.getElementById('importExcel');
const excelFileInput = document.getElementById('excelFileInput');
let attendanceSubjectField;
const subtitleEl = document.querySelector('.page-subtitle');
const searchInput = document.getElementById('search');
const filterSection = document.getElementById('filterSection');
const statusFilter = document.getElementById('statusFilter');

// modal elements
const addStudentModalEl = document.getElementById('addStudentModal');
let addStudentModal = null;
let editingStudentId = null;

function formatDateLabel(value) {
  if (!value) return 'No date selected';
  const date = new Date(value);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

const todayValue = new Date().toISOString().slice(0,10);
if (attDateInput && !attDateInput.value) attDateInput.value = todayValue;
if (subtitleEl) subtitleEl.textContent = formatDateLabel(attDateInput.value || todayValue);

document.addEventListener('DOMContentLoaded', () => {
  if (window.bootstrap && addStudentModalEl) addStudentModal = new bootstrap.Modal(addStudentModalEl);
});

async function loadStudents() {
  if (typeof attendanceSubjectField === 'undefined') await detectAttendanceSubjectField();
  const search = searchInput?.value?.trim();
  const sectionFilter = filterSection?.value?.trim();
  let query = supabase.from('students').select('*');
  if (search) query = query.or(`full_name.ilike.%${search}%,student_id.ilike.%${search}%`);
  if (sectionFilter) query = query.eq('section', sectionFilter);
  const { data: students, error } = await query.order('full_name');
  if (error) return console.error(error);
  studentsTable.innerHTML = '';
  totalStudentsEl.textContent = students.length;

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const tr = document.createElement('tr');
    tr.dataset.studentId = s.id;
    tr.innerHTML = `
      <td data-label="No.">${i + 1}</td>
      <td data-label="Student ID">${s.student_id}</td>
      <td data-label="Student Name">${s.full_name}</td>
      <td data-label="Gender">${s.gender ? `<span class="gender-badge ${String(s.gender).toLowerCase()}">${s.gender}</span>` : ''}</td>
      <td data-label="Attendance Status">
        <div class="status-group">
          <button type="button" class="status-chip present" data-status="present">Present</button>
          <button type="button" class="status-chip absent" data-status="absent">Absent</button>
          <button type="button" class="status-chip permission" data-status="permission">Permission</button>
        </div>
      </td>
      <td data-label="Remark" class="remark-cell">
           <input type="text" class="form-control remark-input" placeholder="Add note..." />
       </td>
       <td data-label="Action">
         <div class="action-row">
            <button type="button" class="btn btn-sm edit-btn" data-id="${s.id}">Edit</button>
            <button type="button" class="btn btn-sm delete-btn" data-id="${s.id}">Delete</button>
          </div>
       </td>
    `;
    studentsTable.appendChild(tr);
  }

  await loadAttendanceForDate();
  loadTodayCounts();
}

async function loadSections() {
  const { data, error } = await supabase.from('students').select('section');
  if (error) return console.error(error);
  if (!filterSection) return;
  const current = filterSection.value;
  filterSection.innerHTML = '<option value="">All sections</option>';
  const seen = new Set();
  data.forEach(r => {
    if (r.section && !seen.has(r.section)) {
      seen.add(r.section);
      const opt = document.createElement('option'); opt.value = r.section; opt.textContent = r.section; filterSection.appendChild(opt);
    }
  });
  filterSection.value = current;
}

async function loadTodayCounts() {
  const date = attDateInput.value || new Date().toISOString().slice(0, 10);
  const subject = attendanceSubjectField ? courseSelect?.value?.trim() || null : null;
  let query = supabase.from('attendance').select('status').eq('date', date);
  if (subject) query = query.eq(attendanceSubjectField, subject);
  const { data: rows, error } = await query;
  if (error) { console.error(error); return; }
  let p = 0, a = 0, pe = 0;
  if (rows) rows.forEach(r => {
    if (r.status === 'present') p++;
    if (r.status === 'absent') a++;
    if (r.status === 'permission') pe++;
  });
  const total = parseInt(totalStudentsEl.textContent, 10) || 0;
  const rate = total ? Math.round((p / total) * 100) : 0;

  presentCountEl.textContent = p;
  absentCountEl.textContent = a;
  permissionCountEl.textContent = pe;
  attendanceRateEl.textContent = `${rate}%`;
  rateLabelEl.textContent = rate < 80 ? 'Below threshold' : 'Above threshold';
}

studentsTable.addEventListener('click', async (e) => {
  const statusButton = e.target.closest('.status-chip');
  if (statusButton) {
    const row = statusButton.closest('tr');
    const isSelected = statusButton.classList.contains('selected');
    row.querySelectorAll('.status-chip').forEach(btn => btn.classList.remove('selected'));

    if (!isSelected) {
      statusButton.classList.add('selected');
    }

    updateAttendanceSummaryFromDOM();
    return;
  }

  const remarkInput = e.target.closest('.remark-input');
  if (remarkInput) {
    return;
  }

  const deleteButton = e.target.closest('.delete-btn');
  if (deleteButton) {
    const id = deleteButton.dataset.id;
    const confirmed = confirm('Delete this student?');
    if (!confirmed) return;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) return console.error(error);
    loadStudents();
    return;
  }

  const editButton = e.target.closest('.edit-btn');
  if (editButton) {
    const id = editButton.dataset.id;
      const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
    if (error) return console.error(error);
    const studentIdInput = document.getElementById('studentIdInput');
    const fullNameInput = document.getElementById('fullNameInput');
    const genderSelect = document.getElementById('genderSelect');
    if (studentIdInput) studentIdInput.value = data.student_id || '';
    if (fullNameInput) fullNameInput.value = data.full_name || '';
    if (genderSelect) genderSelect.value = data.gender || '';
    editingStudentId = id;
    const title = addStudentModalEl.querySelector('.modal-title');
    const submitBtn = document.querySelector('#addStudentForm button[type="submit"]');
    if (title) title.textContent = 'Edit Student';
    if (submitBtn) submitBtn.textContent = 'Save Changes';
    if (addStudentModal) addStudentModal.show();
    return;
  }
});

async function saveAttendance() {
  const date = attDateInput.value || new Date().toISOString().slice(0, 10);
  const subject = attendanceSubjectField ? courseSelect?.value?.trim() || null : null;
  const attendanceMap = await fetchAttendanceMap(date);
  if (attendanceMap === null) {
    alert('Attendance save failed. Check console.');
    return;
  }

  const rows = Array.from(studentsTable.querySelectorAll('tr'));
  const operations = [];

  for (const tr of rows) {
    const studentId = tr.dataset.studentId;
    if (!studentId) continue;
    const selected = tr.querySelector('.status-chip.selected');
    const status = selected?.dataset.status;
    const remarkInput = tr.querySelector('.remark-input');
    const remark = remarkInput?.value.trim() || null;
    const existing = attendanceMap.get(studentId);

    if (!status) {
      if (existing?.id) {
        operations.push(supabase.from('attendance').delete().eq('id', existing.id));
      }
      continue;
    }

    const payload = { status, remark };
    if (subject) payload[attendanceSubjectField] = subject;

    if (existing?.id) {
      operations.push(supabase.from('attendance').update(payload).eq('id', existing.id));
    } else {
      operations.push(supabase.from('attendance').insert([{ student_id: studentId, date, ...payload }]));
    }
  }

  if (operations.length === 0) {
    alert('No attendance changes to save.');
    return;
  }

  const results = await Promise.all(operations);
  const error = results.find(result => result.error)?.error;
  if (error) {
    console.error('Save error', error);
    alert('Attendance save failed. Check the console.');
    return;
  }

  updateAttendanceSummaryFromDOM();
  alert('Attendance saved successfully.');
}

async function fetchAttendanceMap(date) {
  const subject = attendanceSubjectField ? courseSelect?.value?.trim() || null : null;
  let query = supabase.from('attendance').select('id, student_id, status, remark').eq('date', date);
  if (subject) query = query.eq(attendanceSubjectField, subject);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Fetch attendance error', error);
    return null;
  }
  const map = new Map();
  data?.forEach(row => {
    if (!map.has(row.student_id)) {
      map.set(row.student_id, row);
    }
  });
  return map;
}

function updateAttendanceSummaryFromDOM() {
  const rows = Array.from(studentsTable.querySelectorAll('tr'));
  let p = 0, a = 0, pe = 0;

  rows.forEach(tr => {
    const selected = tr.querySelector('.status-chip.selected');
    if (!selected) return;
    const status = selected.dataset.status;
    if (status === 'present') p++;
    if (status === 'absent') a++;
    if (status === 'permission') pe++;
  });

  const total = rows.length;
  const rate = total ? Math.round((p / total) * 100) : 0;

  presentCountEl.textContent = p;
  absentCountEl.textContent = a;
  permissionCountEl.textContent = pe;
  attendanceRateEl.textContent = `${rate}%`;
  rateLabelEl.textContent = rate < 80 ? 'Below threshold' : 'Above threshold';
}

async function loadAttendanceForDate() {
  const date = attDateInput.value || new Date().toISOString().slice(0, 10);
  const subject = attendanceSubjectField ? courseSelect?.value?.trim() || null : null;
  let query = supabase.from('attendance').select('*').eq('date', date);
  if (subject) query = query.eq(attendanceSubjectField, subject);
  const { data: rows, error } = await query;
  if (error) { console.error(error); return; }

  studentsTable.querySelectorAll('tr').forEach(tr => {
    tr.querySelectorAll('.status-chip').forEach(btn => btn.classList.remove('selected'));
    const input = tr.querySelector('.remark-input');
    if (input) input.value = '';
  });

  if (rows) {
    rows.forEach(record => {
      const tr = studentsTable.querySelector(`tr[data-student-id="${record.student_id}"]`);
      if (!tr) return;
      tr.querySelectorAll('.status-chip').forEach(btn => btn.classList.toggle('selected', btn.dataset.status === record.status));
      const input = tr.querySelector('.remark-input');
      if (input) input.value = record.remark || '';
    });
  }
  applyStatusFilter();
}

function applyStatusFilter() {
  const status = statusFilter?.value || '';
  studentsTable.querySelectorAll('tr').forEach(tr => {
    if (!status) {
      tr.hidden = false;
      return;
    }
    const selected = tr.querySelector('.status-chip.selected');
    if (status === 'blank') {
      tr.hidden = !!selected;
      return;
    }
    tr.hidden = !(selected?.dataset.status === status);
  });
}

function changeDate(delta) {
  const currentDate = new Date(attDateInput.value || todayValue);
  currentDate.setDate(currentDate.getDate() + delta);
  attDateInput.value = currentDate.toISOString().slice(0,10);
  if (subtitleEl) subtitleEl.textContent = formatDateLabel(attDateInput.value);
  loadStudents();
}

if (weekSelect) weekSelect.addEventListener('change', loadStudents);
if (courseSelect) courseSelect.addEventListener('change', loadStudents);
if (attDateInput) attDateInput.addEventListener('change', async () => {
  if (subtitleEl) subtitleEl.textContent = formatDateLabel(attDateInput.value);
  await loadStudents();
});
const attendanceReportBtn = document.getElementById('attendanceReport');

if (importExcelBtn) importExcelBtn.addEventListener('click', () => excelFileInput?.click());
if (excelFileInput) excelFileInput.addEventListener('change', importStudentsFromExcel);
if (saveAttendanceBtn) saveAttendanceBtn.addEventListener('click', saveAttendance);
if (attendanceReportBtn) attendanceReportBtn.addEventListener('click', () => {
  window.location.href = 'student-report.html';
});
  
async function detectAttendanceSubjectField() {
  try {
    const { error } = await supabase.from('attendance').select('subject').limit(1);
    if (!error) {
      attendanceSubjectField = 'subject';
      return;
    }
  } catch (err) {
    console.warn('Subject field detection failed:', err);
  }

  attendanceSubjectField = null;
}

function normalizeKey(key) {
  return key.trim().toLowerCase().replace(/[_\s]+/g, '_');
}

function buildStudentId(fullName, index) {
  const safeName = fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return safeName ? `${safeName}-${String(index + 1).padStart(3, '0')}` : `student-${String(index + 1).padStart(3, '0')}`;
}

async function importStudentsFromExcel(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  try {
    const fileData = await file.arrayBuffer();
    const workbook = XLSX.read(fileData, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      alert('No worksheet found in the Excel file.');
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) {
      alert('The Excel file is empty. Add rows and try again.');
      return;
    }

    const students = rows.map((row, index) => {
      const normalized = {};
      Object.keys(row).forEach(key => normalized[normalizeKey(String(key))] = row[key]);

      const fullName = normalized.full_name || normalized['student_name'] || normalized.name || normalized['student'] || Object.values(row)[0];
      if (!fullName || !String(fullName).trim()) return null;

      const studentId = normalized.student_id || normalized['id'] || buildStudentId(String(fullName), index);
      const gender = normalized.gender || '';

      return {
        student_id: String(studentId).trim(),
        full_name: String(fullName).trim(),
        gender: String(gender).trim() || null,
      };
    }).filter(Boolean);

    if (!students.length) {
      alert('No valid student rows found in your Excel file. Make sure there is a name column.');
      return;
    }

    const { data, error } = await supabase.from('students').insert(students);
    if (error) {
      console.error('Excel import failed', error);
      alert('Import failed. Check the console for details.');
      return;
    }

    alert(`${students.length} students imported successfully.`);
    excelFileInput.value = '';
    loadStudents();
  } catch (error) {
    console.error('Excel import error', error);
    alert('Unable to import Excel. Make sure the file is a valid .xlsx, .xls, or .csv file.');
  }
}

// Add student modal handling
const addStudentButton = document.getElementById('addStudent');
const addStudentForm = document.getElementById('addStudentForm');

function resetAddStudentModal() {
  editingStudentId = null;
  if (!addStudentForm) return;
  addStudentForm.reset();
  const title = addStudentModalEl.querySelector('.modal-title');
  const submitBtn = addStudentForm.querySelector('button[type="submit"]');
  if (title) title.textContent = 'Add Student';
  if (submitBtn) submitBtn.textContent = 'Add Student';
}

if (addStudentButton) {
  addStudentButton.addEventListener('click', () => {
    resetAddStudentModal();
    if (addStudentModal) addStudentModal.show();
  });
}

if (addStudentModalEl) {
  addStudentModalEl.addEventListener('hidden.bs.modal', resetAddStudentModal);
}

document.getElementById('addStudentForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const fd = new FormData(form);
  const payload = {
    student_id: fd.get('student_id'),
    full_name: fd.get('full_name'),
    gender: fd.get('gender') || null
  };
  let data, error;
  if (editingStudentId) {
    ({ data, error } = await supabase.from('students').update(payload).eq('id', editingStudentId));
  } else {
    ({ data, error } = await supabase.from('students').insert([payload]));
  }
  if (error) {
    alert('Add student failed: ' + error.message);
    return;
  }
  form.reset();
  if (addStudentModal) addStudentModal.hide();
  // reset editing state and UI
  editingStudentId = null;
  const title = addStudentModalEl.querySelector('.modal-title');
  const submitBtn = form.querySelector('button[type="submit"]');
  if (title) title.textContent = 'Add Student';
  if (submitBtn) submitBtn.textContent = 'Add Student';
  loadSections();
  loadStudents();
});

// wire search and filter
if (searchInput) {
  let t = null;
  searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadStudents, 250); });
}
if (filterSection) filterSection.addEventListener('change', loadStudents);
if (statusFilter) statusFilter.addEventListener('change', loadStudents);

// initial sections
loadSections();

// initial load
loadStudents();
