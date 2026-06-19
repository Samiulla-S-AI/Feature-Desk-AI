-- =====================================================================
-- FEATURE DESK - ABSOLUTE COMPLETE DATABASE SCHEMA (V3)
-- Synthesized from all codebase files, fix scripts, and SQL schemas.
-- This file resolves all conflicting table structures, mismatches,
-- and includes all missing columns and tables used by the application.
-- =====================================================================

-- 1. ENABLE UUID EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE REFERENCE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS classes (
  id integer PRIMARY KEY,
  class_name text NOT NULL,
  description text,
  section text,
  academic_year text
);

-- Add columns to classes if they don't exist (in case the table already existed)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'section') THEN
        ALTER TABLE classes ADD COLUMN section text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'academic_year') THEN
        ALTER TABLE classes ADD COLUMN academic_year text;
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS subjects (
  code text PRIMARY KEY,
  subject_name text NOT NULL,
  description text,
  icon_emoji text DEFAULT '📚',
  color_theme text DEFAULT '#3B82F6',
  color text DEFAULT '#3B82F6' -- Support both color_theme and color field names
);

-- ============================================================
-- USER TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS school_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  name text NOT NULL,
  role text CHECK (role IN ('principal', 'admin', 'coordinator')),
  school_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  teacher_name text NOT NULL,
  is_class_teacher boolean DEFAULT false,
  assigned_class integer REFERENCES classes(id) ON DELETE SET NULL,
  assigned_subjects text[] DEFAULT '{}',
  profile_image text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_number text UNIQUE NOT NULL,
  student_name text NOT NULL,
  email text,
  password text NOT NULL DEFAULT '123456',
  current_class integer REFERENCES classes(id) ON DELETE SET NULL,
  current_subject text REFERENCES subjects(code) ON DELETE SET NULL,
  profile_image text,
  date_of_birth date,
  gender varchar(10),
  parent_name text,
  parent_phone text,
  parent_email text,
  address text,
  health_details text,
  learning_preferences jsonb DEFAULT '{}'::jsonb,
  points integer DEFAULT 0,
  level integer DEFAULT 1,
  badges text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Mapping tables
CREATE TABLE IF NOT EXISTS class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  subject_code text REFERENCES subjects(code) ON DELETE CASCADE,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  schedule text,
  UNIQUE(class_id, subject_code)
);

CREATE TABLE IF NOT EXISTS student_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  subject_code text REFERENCES subjects(code) ON DELETE CASCADE,
  enrolled_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  UNIQUE(student_id, subject_code)
);

-- ============================================================
-- ASSESSMENTS & EXAMS
-- ============================================================

CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject_code text REFERENCES subjects(code) ON DELETE SET NULL,
  class_id integer REFERENCES classes(id) ON DELETE SET NULL,
  type text CHECK (type IN ('quiz', 'test', 'exam', 'assignment')),
  status text DEFAULT 'draft',
  total_marks integer NOT NULL DEFAULT 100,
  time_limit integer, -- in minutes or seconds depending on mode
  scheduled_at timestamptz,
  due_date timestamptz,
  is_active boolean DEFAULT false,
  created_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  questions jsonb DEFAULT '[]'::jsonb,
  mongo_questions_id text, -- Reference to MongoDB
  description text, -- JSON config object (exam_type, passing_marks, etc.) used in teacherDb.ts
  exam_type text DEFAULT 'unit_test',
  exam_password text,
  passing_marks integer DEFAULT 40,
  negative_marking boolean DEFAULT false,
  shuffle_questions boolean DEFAULT true,
  instructions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid REFERENCES assessments(id) ON DELETE CASCADE,
  question_number integer NOT NULL,
  question_text text NOT NULL,
  question_type text CHECK (question_type IN ('mcq', 'short_answer', 'long_answer', 'true_false')),
  options jsonb DEFAULT '[]'::jsonb,
  correct_answer integer, -- Index for MCQ (0-3)
  correct_text text, -- Expected response for text-based answers
  explanation text,
  marks integer DEFAULT 1,
  difficulty text DEFAULT 'medium',
  topic text,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES assessments(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz DEFAULT now(),
  time_taken integer, -- in seconds
  total_score DECIMAL(5,2) DEFAULT 0,
  max_score integer DEFAULT 0,
  percentage DECIMAL(5,2) DEFAULT 0,
  grade VARCHAR(5),
  status VARCHAR(20) DEFAULT 'submitted', -- submitted, graded, in_progress, reviewed
  proctoring_violations integer DEFAULT 0,
  ip_address VARCHAR(50),
  browser_info text,
  feedback text,
  question_feedback jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, assessment_id)
);

CREATE TABLE IF NOT EXISTS student_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES exam_submissions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES assessment_questions(id) ON DELETE SET NULL, -- Make nullable for fallback cases
  student_answer text,
  is_correct boolean,
  marks_awarded DECIMAL(5,2) DEFAULT 0,
  ai_feedback text,
  feedback_text text,
  feedback_image_url text,
  ai_confidence DECIMAL(3,2),
  time_spent integer,
  answered_at timestamptz DEFAULT now()
);

-- Simplified Quiz Results
CREATE TABLE IF NOT EXISTS quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES assessments(id) ON DELETE SET NULL,
  quiz_title VARCHAR(255),
  score integer NOT NULL DEFAULT 0,
  total_marks integer NOT NULL DEFAULT 10,
  percentage DECIMAL(5,2) DEFAULT 0,
  grade text,
  answers jsonb DEFAULT '[]'::jsonb,
  ai_suggested_grade text,
  teacher_approved boolean DEFAULT false,
  feedback text,
  subject_code text,
  class_id integer,
  mongo_log_id text,
  total_questions integer DEFAULT 0,
  time_taken integer,
  weak_topics jsonb DEFAULT '[]'::jsonb,
  strong_topics jsonb DEFAULT '[]'::jsonb,
  timestamp timestamptz DEFAULT now(),
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Detailed Quiz Responses
CREATE TABLE IF NOT EXISTS quiz_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid REFERENCES quiz_results(id) ON DELETE CASCADE,
  question_id integer NOT NULL,
  question_text text,
  student_answer text,
  correct_answer text,
  is_correct boolean,
  marks_obtained DECIMAL(5,2) DEFAULT 0,
  time_spent integer, -- in seconds
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- SCHOOL MANAGEMENT & ADMIN
-- ============================================================

CREATE TABLE IF NOT EXISTS teacher_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES teachers(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  substitute_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  substitute_name text,
  status text CHECK (status IN ('pending', 'covered', 'uncovered')) DEFAULT 'pending',
  lesson_plan text,
  ai_lesson_plan text,
  notification_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_schedules (
  id text PRIMARY KEY, -- Can be generated e.g. 'day-period' '1-2'
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week integer CHECK (day_of_week BETWEEN 1 AND 7),
  period integer,
  start_time text,
  end_time text,
  subject_code text REFERENCES subjects(code) ON DELETE CASCADE,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  room text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- AI GENERATION & CONTENT
-- ============================================================

CREATE TABLE IF NOT EXISTS teaching_materials_meta (
  id text PRIMARY KEY,
  teacher_id uuid REFERENCES teachers(id) ON DELETE CASCADE,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  subject text REFERENCES subjects(code) ON DELETE CASCADE,
  title text NOT NULL,
  type text CHECK (type IN ('pdf', 'notes', 'book', 'image', 'video')),
  content_text text,
  file_url text,
  has_questions boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_banks (
  id text PRIMARY KEY,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  subject text REFERENCES subjects(code) ON DELETE CASCADE,
  lesson_title text,
  source_content_id text REFERENCES teaching_materials_meta(id) ON DELETE CASCADE,
  questions_data jsonb NOT NULL,
  total_questions integer DEFAULT 0,
  generated_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_methods (
  id text PRIMARY KEY,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  subject text REFERENCES subjects(code) ON DELETE CASCADE,
  lesson_title text,
  source_content_id text REFERENCES teaching_materials_meta(id) ON DELETE CASCADE,
  method_data jsonb NOT NULL,
  created_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- STUDENT ACTIVITIES & NOTES
-- ============================================================

CREATE TABLE IF NOT EXISTS student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  subject_code text REFERENCES subjects(code) ON DELETE SET NULL,
  note_type text DEFAULT 'handwritten',
  tags text[] DEFAULT '{}',
  is_favorite boolean DEFAULT false,
  color varchar(50) DEFAULT '#FFFFFF',
  folder varchar(100) DEFAULT 'General',
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject_code text REFERENCES subjects(code) ON DELETE SET NULL,
  note_type text DEFAULT 'handwritten',
  tags text[] DEFAULT '{}',
  mongo_content_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text CHECK (status IN ('present', 'absent', 'late', 'excused')),
  remarks text,
  marked_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS peer_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES students(id) ON DELETE CASCADE,
  helper_id uuid REFERENCES students(id) ON DELETE SET NULL,
  subject_code text REFERENCES subjects(code) ON DELETE SET NULL,
  topic text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'assigned', 'resolved', 'cancelled', 'accepted', 'completed')),
  urgency text DEFAULT 'normal',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS peer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES peer_help_requests(id) ON DELETE CASCADE,
  requester_id uuid REFERENCES students(id) ON DELETE CASCADE,
  helper_id uuid REFERENCES students(id) ON DELETE CASCADE,
  topic text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  rating integer CHECK (rating BETWEEN 1 AND 5),
  feedback text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS peer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text, -- Supports custom/string formats like 'session_12345'
  sender_id uuid REFERENCES students(id) ON DELETE CASCADE,
  content text NOT NULL,
  message_type text DEFAULT 'text',
  sent_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  interaction_type text CHECK (interaction_type IN ('quiz_attempt', 'note_created', 'peer_help', 'login', 'lesson_view')),
  related_id text,
  subject_code text REFERENCES subjects(code) ON DELETE SET NULL,
  details jsonb DEFAULT '{}'::jsonb,
  duration integer, -- in seconds
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- NOTIFICATIONS, GAMIFICATION, MONITORING
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('student', 'teacher', 'parent', 'all_students', 'all_teachers', 'all_parents', 'class', 'all')),
  recipient_id uuid, -- Single recipient support (teacherDb.ts)
  recipient_ids uuid[] DEFAULT '{}', -- Array recipient support (supabase.ts)
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info' CHECK (type IN ('info', 'alert', 'assignment', 'exam', 'intervention', 'reminder')), -- used in teacherDb.ts
  notification_type text DEFAULT 'info', -- used in supabase.ts
  priority text DEFAULT 'normal', -- normal, low, high, urgent
  is_read boolean DEFAULT false,
  read_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_notifications (
  id text PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  title varchar(500) NOT NULL,
  message text NOT NULL,
  type varchar(50) DEFAULT 'grade_report',
  read boolean DEFAULT false,
  urgent boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  subject_code text REFERENCES subjects(code) ON DELETE CASCADE,
  average_score numeric,
  top_performers uuid[],
  struggling_students uuid[],
  common_mistakes jsonb DEFAULT '{}'::jsonb,
  readiness_percentage integer,
  snapshot_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  subject_code text REFERENCES subjects(code) ON DELETE CASCADE,
  total_points integer DEFAULT 0,
  quiz_points integer DEFAULT 0,
  attendance_points integer DEFAULT 0,
  participation_points integer DEFAULT 0,
  peer_help_points integer DEFAULT 0,
  streak_days integer DEFAULT 0,
  current_rank integer,
  previous_rank integer,
  trend text CHECK (trend IN ('up', 'down', 'stable')),
  badges jsonb DEFAULT '[]'::jsonb,
  level integer DEFAULT 1,
  experience_points integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_code)
);

CREATE TABLE IF NOT EXISTS proctoring_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES exam_submissions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  event_type varchar(50) NOT NULL, -- tab_switch, fullscreen_exit, copy_attempt, etc.
  event_data jsonb DEFAULT '{}'::jsonb,
  severity varchar(10) DEFAULT 'warning', -- info, warning, critical
  screenshot_url text,
  timestamp timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS self_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  topic text NOT NULL,
  subject text NOT NULL,
  understanding_level integer CHECK (understanding_level BETWEEN 1 AND 5),
  confidence_level text CHECK (confidence_level IN ('low', 'medium', 'high')),
  needs_help boolean DEFAULT false,
  specific_difficulties text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES teachers(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject_code text REFERENCES subjects(code) ON DELETE SET NULL,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  content_type text CHECK (content_type IN ('pdf', 'image', 'notes', 'video')),
  file_url text,
  mongo_content_id text,
  description text,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  description text,
  subject_code varchar(20) REFERENCES subjects(code) ON DELETE SET NULL,
  class_id integer REFERENCES classes(id) ON DELETE CASCADE,
  material_type varchar(50),
  file_url text,
  tags text[] DEFAULT '{}',
  ai_summary text,
  key_topics text[] DEFAULT '{}',
  uploaded_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  views_count integer DEFAULT 0,
  downloads_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES FOR ENHANCED PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_students_class ON students(current_class);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_number);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student ON exam_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_assessment ON exam_submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_submission ON student_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_student ON quiz_results(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_assessment ON quiz_results(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessments_class ON assessments(class_id);
CREATE INDEX IF NOT EXISTS idx_assessments_subject ON assessments(subject_code);
CREATE INDEX IF NOT EXISTS idx_notifications_class ON notifications(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON student_attendance(student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_interactions_student ON student_interactions(student_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_class ON leaderboard(class_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON leaderboard(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_teaching_materials_class_subj ON teaching_materials_meta(class_id, subject);

-- ============================================================
-- SCHEMA UPGRADES FOR EXISTING TABLES
-- ============================================================
-- In case tables already existed, this block dynamically adds 
-- missing columns and updates types/constraints.

DO $$
BEGIN
    -- 1. subjects table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subjects' AND column_name = 'color_theme') THEN
        ALTER TABLE subjects ADD COLUMN color_theme text DEFAULT '#3B82F6';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subjects' AND column_name = 'color') THEN
        ALTER TABLE subjects ADD COLUMN color text DEFAULT '#3B82F6';
    END IF;

    -- 2. teachers table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'assigned_subjects') THEN
        ALTER TABLE teachers ADD COLUMN assigned_subjects text[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'profile_image') THEN
        ALTER TABLE teachers ADD COLUMN profile_image text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'phone') THEN
        ALTER TABLE teachers ADD COLUMN phone text;
    END IF;

    -- 3. students table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'email') THEN
        ALTER TABLE students ADD COLUMN email text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'profile_image') THEN
        ALTER TABLE students ADD COLUMN profile_image text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'date_of_birth') THEN
        ALTER TABLE students ADD COLUMN date_of_birth date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'gender') THEN
        ALTER TABLE students ADD COLUMN gender varchar(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'parent_name') THEN
        ALTER TABLE students ADD COLUMN parent_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'parent_phone') THEN
        ALTER TABLE students ADD COLUMN parent_phone text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'parent_email') THEN
        ALTER TABLE students ADD COLUMN parent_email text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'address') THEN
        ALTER TABLE students ADD COLUMN address text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'health_details') THEN
        ALTER TABLE students ADD COLUMN health_details text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'learning_preferences') THEN
        ALTER TABLE students ADD COLUMN learning_preferences jsonb DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'points') THEN
        ALTER TABLE students ADD COLUMN points integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'level') THEN
        ALTER TABLE students ADD COLUMN level integer DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'badges') THEN
        ALTER TABLE students ADD COLUMN badges text[] DEFAULT '{}';
    END IF;

    -- 4. assessments table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'description') THEN
        ALTER TABLE assessments ADD COLUMN description text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'exam_type') THEN
        ALTER TABLE assessments ADD COLUMN exam_type text DEFAULT 'unit_test';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'exam_password') THEN
        ALTER TABLE assessments ADD COLUMN exam_password text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'passing_marks') THEN
        ALTER TABLE assessments ADD COLUMN passing_marks integer DEFAULT 40;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'negative_marking') THEN
        ALTER TABLE assessments ADD COLUMN negative_marking boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'shuffle_questions') THEN
        ALTER TABLE assessments ADD COLUMN shuffle_questions boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assessments' AND column_name = 'instructions') THEN
        ALTER TABLE assessments ADD COLUMN instructions text;
    END IF;

    -- 5. peer_help_requests table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'peer_help_requests' AND column_name = 'requester_id') THEN
        -- If requester_id doesn't exist but student_id does, we rename it or add requester_id
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'peer_help_requests' AND column_name = 'student_id') THEN
            ALTER TABLE peer_help_requests RENAME COLUMN student_id TO requester_id;
        ELSE
            ALTER TABLE peer_help_requests ADD COLUMN requester_id uuid REFERENCES students(id) ON DELETE CASCADE;
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'peer_help_requests' AND column_name = 'urgency') THEN
        ALTER TABLE peer_help_requests ADD COLUMN urgency text DEFAULT 'normal';
    END IF;

    -- 6. student_notes table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_notes' AND column_name = 'is_favorite') THEN
        ALTER TABLE student_notes ADD COLUMN is_favorite boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_notes' AND column_name = 'color') THEN
        ALTER TABLE student_notes ADD COLUMN color varchar(50) DEFAULT '#FFFFFF';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_notes' AND column_name = 'folder') THEN
        ALTER TABLE student_notes ADD COLUMN folder varchar(100) DEFAULT 'General';
    END IF;

    -- 7. student_attendance table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_attendance' AND column_name = 'attendance_date') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_attendance' AND column_name = 'date') THEN
            -- Recreate UNIQUE constraint
            ALTER TABLE student_attendance DROP CONSTRAINT IF EXISTS student_attendance_student_id_date_key;
            ALTER TABLE student_attendance RENAME COLUMN date TO attendance_date;
            ALTER TABLE student_attendance ADD CONSTRAINT student_attendance_student_id_attendance_date_key UNIQUE (student_id, attendance_date);
        ELSE
            ALTER TABLE student_attendance ADD COLUMN attendance_date date NOT NULL DEFAULT CURRENT_DATE;
            ALTER TABLE student_attendance ADD CONSTRAINT student_attendance_student_id_attendance_date_key UNIQUE (student_id, attendance_date);
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_attendance' AND column_name = 'remarks') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_attendance' AND column_name = 'notes') THEN
            ALTER TABLE student_attendance RENAME COLUMN notes TO remarks;
        ELSE
            ALTER TABLE student_attendance ADD COLUMN remarks text;
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_attendance' AND column_name = 'marked_by') THEN
        ALTER TABLE student_attendance ADD COLUMN marked_by uuid REFERENCES teachers(id) ON DELETE SET NULL;
    END IF;

    -- 8. notifications table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'recipient_ids') THEN
        ALTER TABLE notifications ADD COLUMN recipient_ids uuid[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'recipient_id') THEN
        ALTER TABLE notifications ADD COLUMN recipient_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
        ALTER TABLE notifications ADD COLUMN notification_type text DEFAULT 'info';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'priority') THEN
        ALTER TABLE notifications ADD COLUMN priority text DEFAULT 'normal';
    END IF;

    -- 9. leaderboard table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'subject_code') THEN
        ALTER TABLE leaderboard ADD COLUMN subject_code text REFERENCES subjects(code) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'quiz_points') THEN
        ALTER TABLE leaderboard ADD COLUMN quiz_points integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'attendance_points') THEN
        ALTER TABLE leaderboard ADD COLUMN attendance_points integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'participation_points') THEN
        ALTER TABLE leaderboard ADD COLUMN participation_points integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'peer_help_points') THEN
        ALTER TABLE leaderboard ADD COLUMN peer_help_points integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'streak_days') THEN
        ALTER TABLE leaderboard ADD COLUMN streak_days integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'experience_points') THEN
        ALTER TABLE leaderboard ADD COLUMN experience_points integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'level') THEN
        ALTER TABLE leaderboard ADD COLUMN level integer DEFAULT 1;
    END IF;

    -- 10. quiz_results table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_results' AND column_name = 'submitted_at') THEN
        ALTER TABLE quiz_results ADD COLUMN submitted_at timestamptz DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_results' AND column_name = 'timestamp') THEN
        ALTER TABLE quiz_results ADD COLUMN timestamp timestamptz DEFAULT now();
    END IF;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES (Demo Mode)
-- ============================================================
-- Enables RLS and configures full access for developer simplicity.

DO $$ 
DECLARE 
    t_name text;
BEGIN
    FOR t_name IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for %I" ON %I;', t_name, t_name);
        EXECUTE format('CREATE POLICY "Allow all for %I" ON %I FOR ALL USING (true);', t_name, t_name);
    END LOOP;
END $$;

-- ============================================================
-- SEED DATA (Base entities and Demo Teacher/Class)
-- ============================================================

-- Insert Academic Classes
INSERT INTO classes (id, class_name, section, academic_year) VALUES
    (1, 'Class 1', 'A', '2025-26'), (2, 'Class 2', 'A', '2025-26'),
    (3, 'Class 3', 'A', '2025-26'), (4, 'Class 4', 'A', '2025-26'),
    (5, 'Class 5', 'A', '2025-26'), (6, 'Class 6', 'A', '2025-26'),
    (7, 'Class 7', 'A', '2025-26'), (8, 'Class 8', 'A', '2025-26'),
    (9, 'Class 9', 'A', '2025-26'), (10, 'Class 10', 'A', '2025-26'),
    (11, 'Class 11', 'A', '2025-26'), (12, 'Class 12', 'A', '2025-26')
ON CONFLICT (id) DO NOTHING;

-- Insert Core School Subjects
INSERT INTO subjects (code, subject_name, description, icon_emoji, color) VALUES
    ('MATH', 'Mathematics', 'Numbers, algebra, geometry, and problem-solving', '🔢', '#3B82F6'),
    ('SCIENCE', 'Science', 'Physics, Chemistry, Biology fundamentals', '🔬', '#10B981'),
    ('ENGLISH', 'English', 'Language, grammar, literature', '📖', '#8B5CF6'),
    ('HINDI', 'Hindi', 'हिंदी भाषा और साहित्य', '📝', '#F59E0B'),
    ('TAMIL', 'Tamil', 'தமிழ் மொழி மற்றும் இலக்கியம்', '🪷', '#DC2626'),
    ('SOCIAL', 'Social Studies', 'History, Geography, Civics', '🌍', '#EF4444'),
    ('COMPUTER', 'Computer Science', 'Programming, digital literacy', '💻', '#06B6D4')
ON CONFLICT (code) DO NOTHING;

-- Insert Demo Teacher (assigned to Class 7)
INSERT INTO teachers (id, email, password, teacher_name, is_class_teacher, assigned_class, assigned_subjects) VALUES
    ('00000000-0000-0000-0000-000000000001', 'teacher@demo.com', 'teacher123', 'Mrs. Priya Sharma', true, 7, ARRAY['MATH', 'SCIENCE', 'ENGLISH', 'HINDI', 'TAMIL', 'SOCIAL', 'COMPUTER'])
ON CONFLICT (id) DO NOTHING;

-- Insert Demo Class 7 Students
INSERT INTO students (id, roll_number, student_name, email, password, current_class, gender, date_of_birth, parent_name, parent_phone) VALUES
('10000000-0000-0000-0000-000000000001', '7A001', 'Aarav Sharma', 'aarav.sharma@student.edu', '123456', 7, 'Male', '2013-03-15', 'Rajesh Sharma', '9876543001'),
('10000000-0000-0000-0000-000000000002', '7A002', 'Aanya Patel', 'aanya.patel@student.edu', '123456', 7, 'Female', '2013-05-22', 'Vikram Patel', '9876543002'),
('10000000-0000-0000-0000-000000000003', '7A003', 'Advait Gupta', 'advait.gupta@student.edu', '123456', 7, 'Male', '2013-01-10', 'Suresh Gupta', '9876543003'),
('10000000-0000-0000-0000-000000000004', '7A004', 'Aisha Khan', 'aisha.khan@student.edu', '123456', 7, 'Female', '2013-07-18', 'Imran Khan', '9876543004'),
('10000000-0000-0000-0000-000000000005', '7A005', 'Akshay Reddy', 'akshay.reddy@student.edu', '123456', 7, 'Male', '2013-02-28', 'Venkat Reddy', '9876543005'),
('10000000-0000-0000-0000-000000000006', '7A006', 'Ananya Singh', 'ananya.singh@student.edu', '123456', 7, 'Female', '2013-09-05', 'Rohit Singh', '9876543006'),
('10000000-0000-0000-0000-000000000007', '7A007', 'Arjun Verma', 'arjun.verma@student.edu', '123456', 7, 'Male', '2013-04-12', 'Amit Verma', '9876543007'),
('10000000-0000-0000-0000-000000000008', '7A008', 'Avni Joshi', 'avni.joshi@student.edu', '123456', 7, 'Female', '2013-11-25', 'Prakash Joshi', '9876543008'),
('10000000-0000-0000-0000-000000000009', '7A009', 'Dev Agarwal', 'dev.agarwal@student.edu', '123456', 7, 'Male', '2013-06-08', 'Sanjay Agarwal', '9876543009'),
('10000000-0000-0000-0000-000000000010', '7A010', 'Diya Nair', 'diya.nair@student.edu', '123456', 7, 'Female', '2013-08-30', 'Krishnan Nair', '9876543010')
ON CONFLICT (roll_number) DO NOTHING;

-- Enroll all Class 7 students into all core subjects
INSERT INTO student_subjects (student_id, subject_code)
SELECT s.id, sub.code FROM students s CROSS JOIN subjects sub WHERE s.current_class = 7
ON CONFLICT (student_id, subject_code) DO NOTHING;

-- Create a mock active assessment (JSON stored in description matching teacherDb format)
INSERT INTO assessments (
  id, 
  title, 
  subject_code, 
  class_id, 
  exam_type, 
  total_marks, 
  time_limit, 
  is_active, 
  created_by, 
  scheduled_at, 
  questions,
  description
) VALUES (
  '20000000-0000-0000-0000-000000000001', 
  'Chapter 1: Integers - Unit Test', 
  'MATH', 
  7, 
  'unit_test', 
  50, 
  2700, 
  true, 
  '00000000-0000-0000-0000-000000000001', 
  '2026-01-15 10:00:00+05:30', 
  '[{"id": 1, "question": "What is -7 + 12?", "options": ["5", "-5", "19", "-19"], "correct": 0, "marks": 2}]',
  '{"exam_type":"unit_test","passing_marks":20,"negative_marking":false,"shuffle_questions":true,"instructions":"Answer all questions.","questions":[{"id":1,"question":"What is -7 + 12?","options":["5","-5","19","-19"],"correct":0,"marks":2}]}'
) ON CONFLICT (id) DO NOTHING;

-- Generate quiz results for the mock assessment
INSERT INTO quiz_results (student_id, assessment_id, score, total_marks, grade, time_taken, teacher_approved, submitted_at, quiz_title)
SELECT 
  s.id, 
  '20000000-0000-0000-0000-000000000001'::uuid, 
  floor(random() * 15 + 35)::int, 
  50, 
  'A', 
  floor(random() * 600 + 1800)::int, 
  true, 
  '2026-01-15 11:30:00+05:30',
  'Chapter 1: Integers - Unit Test'
FROM students s WHERE s.current_class = 7
ON CONFLICT (id) DO NOTHING;

-- Populate points on Leaderboard for the subjects
INSERT INTO leaderboard (student_id, class_id, subject_code, total_points)
SELECT s.id, 7, sub.code, floor(random() * 800 + 200)::int
FROM students s CROSS JOIN subjects sub WHERE s.current_class = 7
ON CONFLICT (student_id, subject_code) DO NOTHING;
