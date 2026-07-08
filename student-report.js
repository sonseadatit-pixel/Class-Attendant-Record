import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const reportTableBody = document.querySelector('#studentReportTable tbody');
const reportSearch = document.getElementById('reportSearch');
const backToMain = document.getElementById('backToMain');

async function loadStudentReport() {
  const search = reportSearch?.value?.trim();
  let studentQuery = supabase.from('students').select('*').order('full_name');
  if (search) studentQuery = studentQuery.or(`full_name.ilike.%${search}%,student_id.ilike.%${search}%`);
  const { data: students, error: studentError } = await studentQuery;
  if (studentError) return console.error(studentError);

  const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance').select('student_id, status, date').order('date', { ascending: false });
  if (attendanceError) return console.error(attendanceError);

  const attendanceMap = new Map();
  attendanceRows?.forEach(row => {
    if (!row?.student_id) return;
    const entry = attendanceMap.get(row.student_id) || { present: 0, absent: 0, permission: 0, dates: new Set() };
    if (row.status === 'present') entry.present += 1;
    if (row.status === 'absent') entry.absent += 1;
    if (row.status === 'permission') entry.permission += 1;
    if (row.date) entry.dates.add(row.date);
    attendanceMap.set(row.student_id, entry);
  });

  reportTableBody.innerHTML = '';

  students.forEach((student, index) => {
    const record = attendanceMap.get(student.id) || { present: 0, absent: 0, permission: 0, dates: new Set() };
    const dates = Array.from(record.dates).sort((a,b) => new Date(b) - new Date(a));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${student.student_id}</td>
      <td>${student.full_name}</td>
      <td>${record.present}</td>
      <td>${record.absent}</td>
      <td>${record.permission}</td>
      <td>${dates.join(', ')}</td>
    `;
    reportTableBody.appendChild(tr);
  });
}

if (reportSearch) {
  reportSearch.addEventListener('input', () => {
    clearTimeout(reportSearch._timeout);
    reportSearch._timeout = setTimeout(loadStudentReport, 250);
  });
}

if (backToMain) {
  backToMain.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

loadStudentReport();
