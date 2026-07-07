-- Supabase schema for attendance app
create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  student_id text not null unique,
  full_name text not null,
  gender text,
  section text,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','permission')),
  subject text,
  section text,
  remark text,
  created_at timestamptz default now()
);

alter table attendance add column if not exists subject text;

-- sample data
-- insert sample students only when student_id doesn't already exist
INSERT INTO students (student_id, full_name, gender) VALUES
('CS2024001','Ahmad Fauzi bin Ismail','Male'),
('CS2024002','Nurul Aisyah binti Rahman','Female')
ON CONFLICT (student_id) DO NOTHING;

-- insert today's attendance only for students that don't already have an entry for today
INSERT INTO attendance (student_id, date, status, remark)
SELECT s.id, current_date, 'present', null
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM attendance a WHERE a.student_id = s.id AND a.date = current_date
);
