-- ============================================================
-- ADAPTIVE QUIZ RECOMMENDATIONS SCHEMA
-- Run this script in the Supabase SQL Editor to create the table
-- and enable RLS policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_adaptive_quizzes (
  id text PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  exam_id text,
  exam_title text NOT NULL,
  subject_code varchar(50) NOT NULL,
  weak_concepts text[] DEFAULT '{}',
  status varchar(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  score numeric,
  total_marks numeric,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE student_adaptive_quizzes ENABLE ROW LEVEL SECURITY;

-- Create Policies (allow all operations for demo/classroom environment)
CREATE POLICY "Allow all operations for students" 
  ON student_adaptive_quizzes 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);
