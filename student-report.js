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
    const entry = attendanceMap.get(row.student_id) || { present: 0, absent: 0, permission: 0, dateCounts: new Map() };
    if (row.status === 'present') entry.present += 1;
    if (row.status === 'absent') entry.absent += 1;
    if (row.status === 'permission') entry.permission += 1;

    if (row.date) {
      const iso = new Date(row.date).toISOString();
      const d = new Date(row.date);
      const formatted = `${String(d.getDate()).padStart(2, '0')}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(-2)}`;
      const dc = entry.dateCounts.get(iso) || { iso, formatted, present: 0, absent: 0, permission: 0 };
      if (row.status === 'present') dc.present += 1;
      if (row.status === 'absent') dc.absent += 1;
      if (row.status === 'permission') dc.permission += 1;
      entry.dateCounts.set(iso, dc);
    }

    attendanceMap.set(row.student_id, entry);
  });

  reportTableBody.innerHTML = '';

  students.forEach((student, index) => {
    const record = attendanceMap.get(student.id) || { present: 0, absent: 0, permission: 0, dateCounts: new Map() };
    const dateEntries = Array.from(record.dateCounts.values()).sort((a, b) => new Date(b.iso) - new Date(a.iso));
    const tr = document.createElement('tr');
    // build structured HTML for recorded dates
    const dateHtml = dateEntries.length ? (`<div class="date-list">${dateEntries.map(e => `
        <div class="date-entry">
          <span class="date-label">${e.formatted}</span>
          <span class="badge-small present">P ${e.present}</span>
          <span class="badge-small absent">A ${e.absent}</span>
          <span class="badge-small pm">PM ${e.permission}</span>
        </div>
      `).join('')}</div>
      <div class="record-totals">(Total P=${record.present}, A=${record.absent}, PM=${record.permission})</div>
    `) : '';

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${student.student_id}</td>
      <td>${student.full_name}</td>
      <td class="recorded-dates">${dateHtml}</td>
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
