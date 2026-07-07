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

// modal elements
const addStudentModalEl = document.getElementById('addStudentModal');
let addStudentModal = null;

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
  const { data: students, error } = await supabase.from('students').select('*').order('full_name');
  if (error) return console.error(error);
  studentsTable.innerHTML = '';
  totalStudentsEl.textContent = students.length;

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const tr = document.createElement('tr');
    tr.dataset.studentId = s.id;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${s.student_id}</td>
      <td>${s.full_name}</td>
      <td>${s.gender || ''}</td>
      <td>
        <div class="status-group">
          <button type="button" class="status-chip present" data-status="present">Present</button>
          <button type="button" class="status-chip absent" data-status="absent">Absent</button>
          <button type="button" class="status-chip permission" data-status="permission">Permission</button>
        </div>
      </td>
      <td class="remark-cell"><input type="text" class="form-control remark-input" placeholder="Add note..." /></td>
      <td class="text-end"><button type="button" class="btn btn-ghost btn-sm delete-btn" data-id="${s.id}">Delete</button></td>
    `;
    studentsTable.appendChild(tr);
  }

  await loadAttendanceForDate();
  loadTodayCounts();
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
});

async function saveAttendance() {
  const date = attDateInput.value || new Date().toISOString().slice(0, 10);
  const subject = attendanceSubjectField ? courseSelect?.value?.trim() || null : null;
  const rows = Array.from(studentsTable.querySelectorAll('tr'));
  const operations = [];

  for (const tr of rows) {
    const studentId = tr.dataset.studentId;
    if (!studentId) continue;
    const selected = tr.querySelector('.status-chip.selected');
    const status = selected?.dataset.status;
    const remarkInput = tr.querySelector('.remark-input');
    const remark = remarkInput?.value.trim() || null;

    let attendanceQuery = supabase
      .from('attendance')
      .select('id')
      .eq('student_id', studentId)
      .eq('date', date);

    if (subject) attendanceQuery = attendanceQuery.eq(attendanceSubjectField, subject);

    const { data: existing, error: fetchError } = await attendanceQuery.maybeSingle();

    if (fetchError) {
      console.error('Fetch attendance error', fetchError);
      alert('Attendance save failed. Check console.');
      return;
    }

    if (!status) {
      if (existing?.id) {
        operations.push(
          supabase.from('attendance').delete().eq('id', existing.id)
        );
      }
      continue;
    }

    if (existing?.id) {
      const payload = { status, remark };
      if (subject) payload[attendanceSubjectField] = subject;
      operations.push(
        supabase.from('attendance').update(payload).eq('id', existing.id)
      );
    } else {
      const payload = { student_id: studentId, date, status, remark };
      if (subject) payload[attendanceSubjectField] = subject;
      operations.push(
        supabase.from('attendance').insert([payload])
      );
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
if (importExcelBtn) importExcelBtn.addEventListener('click', () => excelFileInput?.click());
if (excelFileInput) excelFileInput.addEventListener('change', importStudentsFromExcel);
if (saveAttendanceBtn) saveAttendanceBtn.addEventListener('click', saveAttendance);
  
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
document.getElementById('addStudent').addEventListener('click', () => {
  if (addStudentModal) addStudentModal.show();
});

document.getElementById('addStudentForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const fd = new FormData(form);
  const payload = {
    student_id: fd.get('student_id'),
    full_name: fd.get('full_name'),
    gender: fd.get('gender') || null
  };
  const { data, error } = await supabase.from('students').insert([payload]);
  if (error) {
    alert('Add student failed: ' + error.message);
    return;
  }
  form.reset();
  if (addStudentModal) addStudentModal.hide();
  loadStudents();
});

// initial load
loadStudents();
