import { supabase } from './supabase';

// ===================================================================
// Teacher Portal Database Functions
// ===================================================================
// Supabase: Structured data (Users, Grades, Schedules)
// Cloudinary: Media files (Images, PDFs, Documents)
// ===================================================================

// Types
export interface StudentProfile {
    id: string;
    roll_number: string;
    student_name: string;
    current_class: number;
    current_subject: string;
    profile_image?: string;
    parent_phone?: string;
    health_details?: string;
    created_at: string;
}

export interface QuizQuestion {
    id: number;
    question: string;
    options: string[];
    correct?: number;
    explanation?: string;
    difficulty: 'easy' | 'medium' | 'hard';
    marks: number;
    type?: 'mcq' | 'short_answer' | 'long_answer';
    status?: 'pending' | 'accepted' | 'rejected' | 'edited';
    needsImage?: boolean; // AI confidence > 80% that image is needed
    imagePrompt?: string; // Prompt for image generation
    imageUrl?: string; // Generated image URL
}

export interface Assessment {
    id: string;
    title: string;
    subject_code: string;
    class_id: number;
    questions: QuizQuestion[];
    total_marks: number;
    time_limit?: number;
    scheduled_at?: string;
    is_active: boolean;
    created_by: string;
    created_at: string;
    description?: string; // Contains JSON config with exam_type, password, etc.
    exam_type: 'annual' | 'mid_term' | 'unit_test' | 'weekly' | 'practice' | 'quiz';
    passing_marks?: number;
    negative_marking?: boolean;
    shuffle_questions?: boolean;
    instructions?: string;
    exam_password?: string; // 4-digit password for formal exams
    submitted?: boolean; // Status for student view
    score?: number; // Score if submitted
    grade?: string; // Grade if submitted
}

export interface StudentResult {
    id: string;
    student_id: string;
    assessment_id?: string;
    student_name: string;
    roll_number: string;
    quiz_title: string;
    score: number;
    total_marks: number;
    grade: string;
    ai_suggested_grade?: string;
    teacher_approved: boolean;
    feedback?: string;
    submitted_at: string;
    subject_code?: string;
}

export interface AnalyticsData {
    totalStudents: number;
    averageScore: number;
    topPerformers: StudentResult[];
    strugglingStudents: StudentResult[];
    subjectWiseData: { subject: string; average: number; students: number }[];
    weeklyProgress: { week: string; average: number }[];
}

export interface Notification {
    id: string;
    recipient_type: 'student' | 'class';
    recipient_ids: string[];
    title: string;
    message: string;
    type: 'info' | 'alert' | 'assignment' | 'exam';
    created_at: string;
}

// ===================================================================
// 1. STUDENT MANAGEMENT FUNCTIONS (Supabase)
// ===================================================================

// Get all students for a class (Class Teacher)
export const getStudentsByClass = async (classId: number): Promise<StudentProfile[]> => {
    try {
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('current_class', classId)
            .order('roll_number');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching students:', error);
        return [];
    }
};

// Get students by subject (Subject Teacher)
export const getStudentsBySubject = async (subjectCode: string, classId?: number): Promise<StudentProfile[]> => {
    try {
        let query = supabase.from('students').select('*').eq('current_subject', subjectCode);
        if (classId) query = query.eq('current_class', classId);

        const { data, error } = await query.order('roll_number');
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching students by subject:', error);
        return [];
    }
};

// Reset student password (Class Teacher only)
export const resetStudentPassword = async (studentId: string, newPassword: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('students')
            .update({ password: newPassword })
            .eq('id', studentId);

        if (error) throw error;
        console.log('✅ Student password reset successfully');
        return true;
    } catch (error) {
        console.error('Error resetting password:', error);
        return false;
    }
};

// ===================================================================
// 2. ASSESSMENT MANAGEMENT (Hybrid: Supabase + Config Fallback)
// ===================================================================

// Create a new assessment
export const createAssessment = async (assessment: Omit<Assessment, 'id' | 'created_at'>): Promise<{ success: boolean; id?: string }> => {
    try {
        // 1. Build Supabase insert object with only existing columns
        // The additional fields will be stored in the description field as JSON
        const fullConfig = {
            exam_type: assessment.exam_type || 'unit_test',
            passing_marks: assessment.passing_marks,
            negative_marking: assessment.negative_marking,
            shuffle_questions: assessment.shuffle_questions,
            instructions: assessment.instructions,
            exam_password: assessment.exam_password, // 4-digit password for formal exams
            questions: assessment.questions // Important: Store questions here as primary/fallback source
        };

        // Store exam config in description field as JSON
        const descriptionWithConfig = JSON.stringify(fullConfig);

        // 2. Save metadata to Supabase
        const { data, error } = await supabase
            .from('assessments')
            .insert({
                title: assessment.title,
                subject_code: assessment.subject_code,
                class_id: assessment.class_id,
                total_marks: assessment.total_marks,
                time_limit: assessment.time_limit,
                scheduled_at: assessment.scheduled_at,
                is_active: assessment.is_active,
                created_by: assessment.created_by,
                description: descriptionWithConfig // Store exam config here
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Failed to create assessment in Supabase:', error);
            throw error;
        }

        console.log('✅ Assessment created in Supabase (ID):', data.id);
        return { success: true, id: data.id };
    } catch (error) {
        console.error('❌ Error creating assessment:', error);
        return { success: false };
    }
};

// Get assessments by teacher (or all for demo mode)
export const getTeacherAssessments = async (teacherId: string): Promise<any[]> => {
    try {
        // For demo mode, fetch all assessments for the teacher's classes
        // Also include assessments without a specific teacher ID
        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .or(`created_by.eq.${teacherId},created_by.is.null`)
            .order('created_at', { ascending: false });

        if (error) {
            // If the OR query fails, try simpler query
            console.warn('Complex query failed, trying simple fetch');
            const { data: allData, error: allError } = await supabase
                .from('assessments')
                .select('*')
                .order('created_at', { ascending: false });

            if (allError) throw allError;
            return allData || [];
        }

        return data || [];
    } catch (error) {
        console.error('Error fetching assessments:', error);
        // Fallback: try to fetch ALL assessments
        try {
            const { data } = await supabase
                .from('assessments')
                .select('*')
                .order('created_at', { ascending: false });
            return data || [];
        } catch {
            return [];
        }
    }
};

// Helper function to parse exam config from description
const parseExamConfig = (description: string | null): { exam_type: string;[key: string]: any } => {
    try {
        if (description) {
            return JSON.parse(description);
        }
    } catch (e) {
        // Description is plain text, not JSON
    }
    return { exam_type: 'unit_test' }; // Default to unit_test
};

// Get exams for students (annual, mid_term - requires password)
export const getStudentExams = async (classId: number, subjectCode?: string, studentId?: string): Promise<Assessment[]> => {
    try {
        let query = supabase
            .from('assessments')
            .select('*')
            .eq('class_id', classId)
            .eq('is_active', true)
            .order('scheduled_at', { ascending: true });

        if (subjectCode) {
            query = query.eq('subject_code', subjectCode);
        }

        const { data, error } = await query;
        if (error) throw error;

        // If studentId is provided, fetch their submissions to check status
        const submittedExamIds = new Set<string>();
        const examScores = new Map<string, { score: number, grade: string }>();

        if (studentId) {
            const { data: submissions } = await supabase
                .from('exam_submissions')
                .select('assessment_id, total_score, grade')
                .eq('student_id', studentId);

            if (submissions) {
                submissions.forEach(sub => {
                    submittedExamIds.add(sub.assessment_id);
                    if (sub.total_score !== undefined) {
                        examScores.set(sub.assessment_id, {
                            score: sub.total_score,
                            grade: sub.grade
                        });
                    }
                });
            }
        }

        // Filter client-side for exam types (annual, mid_term)
        const exams = (data || []).filter(assessment => {
            const config = parseExamConfig(assessment.description);
            return ['annual', 'mid_term'].includes(config.exam_type);
        }).map(assessment => {
            const config = parseExamConfig(assessment.description);
            const isSubmitted = submittedExamIds.has(assessment.id);
            const scoreData = examScores.get(assessment.id);

            return {
                ...assessment,
                ...config,
                submitted: isSubmitted,
                score: scoreData?.score,
                grade: scoreData?.grade
            };
        });

        return exams;
    } catch (error) {
        console.error('Error fetching student exams:', error);
        return [];
    }
};

// Get tests for students (unit_test, weekly, practice, quiz - no password required)
export const getStudentTests = async (classId: number, subjectCode?: string): Promise<Assessment[]> => {
    try {
        let query = supabase
            .from('assessments')
            .select('*')
            .eq('class_id', classId)
            .eq('is_active', true)
            .order('scheduled_at', { ascending: true });

        if (subjectCode) {
            query = query.eq('subject_code', subjectCode);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Filter client-side for test types (unit_test, weekly, practice, quiz)
        const tests = (data || []).filter(assessment => {
            const config = parseExamConfig(assessment.description);
            return ['unit_test', 'weekly', 'practice', 'quiz'].includes(config.exam_type);
        }).map(assessment => {
            const config = parseExamConfig(assessment.description);
            return { ...assessment, ...config };
        });

        return tests;
    } catch (error) {
        console.error('Error fetching student tests:', error);
        return [];
    }
};

// Get assessment questions (Supabase Config Fallback)
export const getAssessmentQuestions = async (assessmentId: string): Promise<QuizQuestion[]> => {
    try {
        const { data, error } = await supabase
            .from('assessments')
            .select('description')
            .eq('id', assessmentId)
            .single();

        if (error) throw error;

        if (data?.description) {
            try {
                const config = JSON.parse(data.description);
                if (config.questions?.length > 0) {
                    console.log('✅ Questions loaded from Supabase Config');
                    return config.questions;
                }
            } catch (parseError) {
                console.warn('Could not parse description as JSON:', parseError);
            }
        }
    } catch (supabaseError) {
        console.error('Error fetching from Supabase:', supabaseError);
    }

    console.warn('⚠️ No questions found for assessment:', assessmentId);
    return [];
};

// Generate exam password for students (4 digit + roll number)
export const generateExamPassword = (rollNumber: string): string => {
    // Generate a 4-digit random number based on assessment ID and current date
    const date = new Date();
    const seed = date.getFullYear() * 1000 + date.getMonth() * 100 + date.getDate();
    const fourDigit = String(seed % 10000).padStart(4, '0');
    return `${fourDigit}${rollNumber}`;
};

// ===================================================================
// 3. GRADING & RESULTS (Hybrid)
// ===================================================================

// Get all results for grading (Pending approval)
export const getPendingResults = async (_teacherId: string, classId?: number): Promise<StudentResult[]> => {
    try {
        const results: StudentResult[] = [];

        // 1. Fetch pending exam submissions (status = 'submitted')
        const { data: submissions, error: subError } = await supabase
            .from('exam_submissions')
            .select(`
                *,
                assessments (title, subject_code, class_id, total_marks)
            `)
            .eq('status', 'submitted')
            .order('submitted_at', { ascending: false });

        if (!subError && submissions && submissions.length > 0) {
            let filtered = submissions;
            if (classId) {
                filtered = submissions.filter((s: any) => s.assessments?.class_id === classId);
            }

            for (const sub of filtered) {
                const { data: student } = await supabase
                    .from('students')
                    .select('student_name, roll_number')
                    .eq('id', sub.student_id)
                    .single();

                results.push({
                    id: sub.id,
                    student_id: sub.student_id,
                    assessment_id: sub.assessment_id,
                    student_name: student?.student_name || 'Unknown Student',
                    roll_number: student?.roll_number || 'N/A',
                    quiz_title: sub.assessments?.title || 'Assessment',
                    score: sub.total_score || 0,
                    total_marks: sub.max_score || sub.assessments?.total_marks || 100,
                    grade: sub.grade || '',
                    teacher_approved: sub.status === 'graded',
                    feedback: '',
                    submitted_at: sub.submitted_at || sub.created_at,
                    subject_code: sub.assessments?.subject_code
                });
            }
        }

        // 2. Fetch pending quiz results (grade is null)
        const { data: quizData, error: quizError } = await supabase
            .from('quiz_results')
            .select('*')
            .is('grade', null)
            .order('created_at', { ascending: false });

        if (!quizError && quizData && quizData.length > 0) {
            let filteredQuiz = quizData;
            if (classId) {
                filteredQuiz = quizData.filter((r: any) => r.class_id === classId);
            }

            for (const r of filteredQuiz) {
                const { data: student } = await supabase
                    .from('students')
                    .select('student_name, roll_number')
                    .eq('id', r.student_id)
                    .single();

                results.push({
                    id: r.id,
                    student_id: r.student_id,
                    assessment_id: r.assessment_id || undefined,
                    student_name: student?.student_name || 'Student',
                    roll_number: student?.roll_number || 'N/A',
                    quiz_title: r.quiz_title || 'Quiz',
                    score: r.score || 0,
                    total_marks: r.total_marks || r.total_questions || 10,
                    grade: r.grade || '',
                    teacher_approved: false,
                    feedback: '',
                    submitted_at: r.timestamp || r.created_at || r.submitted_at || new Date().toISOString(),
                    subject_code: r.subject_code || 'MATH'
                });
            }
        }

        // 3. Deduplicate: Keep only the latest submission per student per exam/quiz title
        const uniqueResults = new Map<string, StudentResult>();

        results.forEach(res => {
            const key = `${res.student_id}-${res.quiz_title}`;
            const existing = uniqueResults.get(key);

            if (!existing || new Date(res.submitted_at) > new Date(existing.submitted_at)) {
                uniqueResults.set(key, res);
            }
        });

        return Array.from(uniqueResults.values());
    } catch (error) {
        console.error('Error fetching pending results:', error);
        return [];
    }
};

// Get all published (graded) results
export const getPublishedResults = async (_teacherId: string, classId?: number): Promise<StudentResult[]> => {
    try {
        // 1. Get from exam_submissions (status = 'graded')
        const { data: submissions, error: subError } = await supabase
            .from('exam_submissions')
            .select(`
                *,
                assessments (title, subject_code, class_id, total_marks)
            `)
            .eq('status', 'graded')
            .order('submitted_at', { ascending: false });

        const results: StudentResult[] = [];

        if (!subError && submissions && submissions.length > 0) {
            // Filter by class if needed
            let filtered = submissions;
            if (classId) {
                filtered = submissions.filter((s: any) => s.assessments?.class_id === classId);
            }

            for (const sub of filtered) {
                const { data: student } = await supabase
                    .from('students')
                    .select('student_name, roll_number')
                    .eq('id', sub.student_id)
                    .single();

                results.push({
                    id: sub.id,
                    student_id: sub.student_id,
                    assessment_id: sub.assessment_id,
                    student_name: student?.student_name || 'Unknown Student',
                    roll_number: student?.roll_number || 'N/A',
                    quiz_title: sub.assessments?.title || 'Assessment',
                    score: sub.total_score || 0,
                    total_marks: sub.max_score || sub.assessments?.total_marks || 100,
                    grade: sub.grade || '',
                    teacher_approved: true,
                    feedback: sub.feedback || '', // We might want to fetch feedback if stored
                    submitted_at: sub.submitted_at || sub.created_at,
                    subject_code: sub.assessments?.subject_code
                });
            }
        }

        // 2. Get from quiz_results (where grade is set)
        const { data: quizData, error: quizError } = await supabase
            .from('quiz_results')
            .select('*')
            .not('grade', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!quizError && quizData && quizData.length > 0) {
            let filteredQuiz = quizData;
            if (classId && quizData[0]?.class_id !== undefined) {
                filteredQuiz = quizData.filter((r: any) => r.class_id === classId);
            }

            for (const r of filteredQuiz) {
                const { data: student } = await supabase
                    .from('students')
                    .select('student_name, roll_number')
                    .eq('id', r.student_id)
                    .single();

                results.push({
                    id: r.id,
                    student_id: r.student_id,
                    assessment_id: r.assessment_id,
                    student_name: student?.student_name || 'Student',
                    roll_number: student?.roll_number || 'N/A',
                    quiz_title: r.quiz_title || 'Quiz',
                    score: r.score || 0,
                    total_marks: r.total_questions || 10,
                    grade: r.grade || '',
                    teacher_approved: true,
                    feedback: r.feedback || '',
                    submitted_at: r.created_at || r.timestamp || new Date().toISOString(),
                    subject_code: r.subject_code || 'MATH'
                });
            }
        }

        // Deduplicate
        const uniqueResults = new Map<string, StudentResult>();
        results.forEach(res => {
            const key = `${res.student_id}-${res.quiz_title}`;
            // If duplicate, maybe keep the one with higher score or latest?
            // Usually latest is better.
            const existing = uniqueResults.get(key);
            if (!existing || new Date(res.submitted_at) > new Date(existing.submitted_at)) {
                uniqueResults.set(key, res);
            }
        });

        return Array.from(uniqueResults.values());
    } catch (error) {
        console.error('Error fetching published results:', error);
        return [];
    }
};

// Approve AI-suggested grade
export const approveGrade = async (
    resultId: string, 
    finalGrade: string, 
    score: number, 
    feedback?: string,
    questionFeedback?: any[]
): Promise<boolean> => {
    try {
        // Try updating exam_submissions first (preferred)
        const updateData: any = {
            grade: finalGrade,
            status: 'graded',
            total_score: score
        };

        if (feedback) {
            updateData.feedback = feedback;
        }

        if (questionFeedback) {
            updateData.question_feedback = questionFeedback;
        }

        const { error: subError, count } = await supabase
            .from('exam_submissions')
            .update(updateData)
            .eq('id', resultId)
            .select();

        if (!subError && count && count > 0) {
            console.log('✅ Exam submission graded successfully');
            return true;
        }

        // Fallback: Update quiz_results
        const { error: quizError } = await supabase
            .from('quiz_results')
            .update({
                grade: finalGrade,
                score: score,
                feedback: feedback || '',
                answers: questionFeedback || []
            })
            .eq('id', resultId);

        if (quizError) throw quizError;
        return true;
    } catch (error) {
        console.error('Error approving grade:', error);
        return false;
    }
};

// Save detailed feedback for a specific question answer
export const saveQuestionFeedback = async (
    submissionId: string,
    questionAnswerId: string, // ID from student_answers table
    feedback: string,
    imageUrl?: string,
    marksAwarded?: number
): Promise<boolean> => {
    // Validate that questionAnswerId is a valid UUID format before querying Supabase
    // If it is a string like "1", "2" or non-UUID, skip database update to prevent Postgres 22P02 type errors.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionAnswerId);
    if (!isUuid) {
        console.warn(`ℹ️ Skipping student_answers row update: "${questionAnswerId}" is not a valid UUID.`);
        return false;
    }

    try {
        const updateData: any = {
            ai_feedback: feedback // Mapping to ai_feedback column as per existing schema usage
        };

        if (imageUrl) {
            updateData.feedback_image_url = imageUrl;
        }

        if (marksAwarded !== undefined) {
            updateData.marks_awarded = marksAwarded;
        }

        const { error } = await supabase
            .from('student_answers')
            .update(updateData)
            // We use the ID directly if known, or search by submission + question
            .eq('id', questionAnswerId);

        if (error) {
            // Try matching by submission_id if questionAnswerId is actually a questionId
            // This is a robust fallback because frontend might pass questionId
            const { error: fallbackError } = await supabase
                .from('student_answers')
                .update(updateData)
                .eq('submission_id', submissionId)
                .eq('question_id', questionAnswerId);

            if (fallbackError) throw fallbackError;
        }

        return true;
    } catch (error) {
        console.error('Error saving question feedback:', error);
        return false;
    }
};



// ===================================================================
// 4. ANALYTICS (Hybrid: Supabase Aggregations + Firebase JSON Storage)
// ===================================================================

// Get class analytics overview
export const getClassAnalytics = async (classId: number): Promise<AnalyticsData | null> => {
    try {
        // Get total students
        const { count: totalStudents } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('current_class', classId);

        // Get recent results for average
        const { data: results } = await supabase
            .from('quiz_results')
            .select('score, total_marks, students!inner(current_class)')
            .eq('students.current_class', classId);

        const scores = (results || []).map(r => (r.score / r.total_marks) * 100);
        const averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        // Get top performers
        const { data: topPerformers } = await supabase
            .from('quiz_results')
            .select(`*, students!inner (student_name, roll_number, current_class)`)
            .eq('students.current_class', classId)
            .order('score', { ascending: false })
            .limit(5);

        // Get struggling students (below 50%)
        const { data: strugglingStudents } = await supabase
            .from('quiz_results')
            .select(`*, students!inner (student_name, roll_number, current_class)`)
            .eq('students.current_class', classId)
            .lt('score', 50)
            .order('score', { ascending: true })
            .limit(5);

        return {
            totalStudents: totalStudents || 0,
            averageScore,
            topPerformers: (topPerformers || []).map((r: any) => ({
                ...r,
                student_name: r.students?.student_name,
                roll_number: r.students?.roll_number
            })),
            strugglingStudents: (strugglingStudents || []).map((r: any) => ({
                ...r,
                student_name: r.students?.student_name,
                roll_number: r.students?.roll_number
            })),
            subjectWiseData: [],
            weeklyProgress: []
        };
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return null;
    }
};

// Store detailed analytics as JSON (uploaded to Cloudinary)
export const saveDetailedAnalytics = async (classId: number, analysisData: any): Promise<void> => {
    try {
        // Save analytics summary to Supabase class_analytics table
        const { error } = await supabase.from('class_analytics').insert({
            class_id: classId,
            average_score: analysisData.averageScore || 0,
            common_mistakes: analysisData.commonMistakes || {},
            readiness_percentage: analysisData.readinessPercentage || 0,
            snapshot_date: new Date().toISOString().split('T')[0]
        });
        if (error) throw error;
        console.log('✅ Detailed analytics saved to Supabase');
    } catch (e) {
        console.error('Failed to save analytics:', e);
    }
};

// ===================================================================
// 5. NOTIFICATIONS (Supabase Realtime)
// ===================================================================

// Send notification to students
export const sendNotification = async (notification: Omit<Notification, 'id' | 'created_at'>): Promise<boolean> => {
    try {
        const notifications = notification.recipient_ids.map(recipientId => ({
            recipient_type: notification.recipient_type === 'class' ? 'student' : notification.recipient_type,
            recipient_id: recipientId,
            title: notification.title,
            message: notification.message,
            type: notification.type
        }));

        const { error } = await supabase.from('notifications').insert(notifications);
        if (error) throw error;

        console.log(`✅ Notifications sent to ${notifications.length} students`);
        return true;
    } catch (error) {
        console.error('Error sending notification:', error);
        return false;
    }
};

// Get all students in a class for bulk notification
export const getClassStudentIds = async (classId: number): Promise<string[]> => {
    const { data } = await supabase
        .from('students')
        .select('id')
        .eq('current_class', classId);

    return (data || []).map(s => s.id);
};

// ===================================================================
// 6. CONTENT MANAGEMENT (Firebase Storage for PDF + Index)
// ===================================================================

// Save uploaded content metadata associated with a teacher
export const saveUploadedContent = async (teacherId: string, contentData: {
    title: string;
    subject: string;
    classId: number;
    type: 'pdf' | 'image' | 'notes';
    fileUrl: string;
    extractedText?: string;
}): Promise<{ success: boolean; id?: string }> => {
    try {
        // Save metadata to Supabase, file already uploaded to Cloudinary
        const { data, error } = await supabase.from('teacher_content').insert({
            teacher_id: teacherId,
            title: contentData.title,
            subject_code: contentData.subject,
            class_id: contentData.classId,
            content_type: contentData.type,
            file_url: contentData.fileUrl,
            description: contentData.extractedText || ''
        }).select('id').single();

        if (error) throw error;

        return { success: true, id: data?.id };
    } catch (e) {
        console.error(e);
        return { success: false };
    }

};

// Get all content by teacher
export const getTeacherContent = async (teacherId: string): Promise<any[]> => {
    // Fetch from Supabase
    const { data, error } = await supabase
        .from('teacher_content')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching teacher content:', error);
        return [];
    }

    // Map to expected format
    return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        subject: item.subject_code,
        type: item.content_type,
        fileUrl: item.file_url,
        uploaded_at: item.created_at
    }));
};

// ===================================================================
// 7. INTERVENTION ALERTS
// ===================================================================

// Check for students needing intervention (failed 2+ quizzes)
export const getStudentsNeedingIntervention = async (classId: number): Promise<StudentProfile[]> => {
    try {
        const { data } = await supabase
            .from('quiz_results')
            .select(`
        student_id,
        score,
        total_marks,
        students!inner (id, student_name, roll_number, current_class)
      `)
            .eq('students.current_class', classId)
            .order('submitted_at', { ascending: false });

        // Group by student and count failures
        const studentFailures: Record<string, { count: number; student: any }> = {};

        (data || []).forEach((result: any) => {
            const passPercentage = (result.score / result.total_marks) * 100;
            if (passPercentage < 40) {
                const studentId = result.student_id;
                if (!studentFailures[studentId]) {
                    studentFailures[studentId] = { count: 0, student: result.students };
                }
                studentFailures[studentId].count++;
            }
        });

        // Return students with 2+ failures
        return Object.values(studentFailures)
            .filter(sf => sf.count >= 2)
            .map(sf => sf.student);
    } catch (error) {
        console.error('Error checking intervention needs:', error);
        return [];
    }
};

// Update an existing assessment
export const updateAssessment = async (id: string, assessment: Partial<Assessment>): Promise<{ success: boolean }> => {
    try {
        const updateData: any = {};
        
        if (assessment.title !== undefined) updateData.title = assessment.title;
        if (assessment.subject_code !== undefined) updateData.subject_code = assessment.subject_code;
        if (assessment.class_id !== undefined) updateData.class_id = assessment.class_id;
        if (assessment.total_marks !== undefined) updateData.total_marks = assessment.total_marks;
        if (assessment.time_limit !== undefined) updateData.time_limit = assessment.time_limit;
        if (assessment.scheduled_at !== undefined) updateData.scheduled_at = assessment.scheduled_at;
        if (assessment.is_active !== undefined) updateData.is_active = assessment.is_active;

        // Retrieve current configuration first to merge
        const { data: currentData, error: fetchError } = await supabase
            .from('assessments')
            .select('description')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        let currentConfig: any = {};
        if (currentData?.description) {
            try {
                currentConfig = JSON.parse(currentData.description);
            } catch (e) {
                // description is plain text
            }
        }

        const newConfig = {
            ...currentConfig,
            exam_type: assessment.exam_type !== undefined ? assessment.exam_type : currentConfig.exam_type,
            passing_marks: assessment.passing_marks !== undefined ? assessment.passing_marks : currentConfig.passing_marks,
            negative_marking: assessment.negative_marking !== undefined ? assessment.negative_marking : currentConfig.negative_marking,
            shuffle_questions: assessment.shuffle_questions !== undefined ? assessment.shuffle_questions : currentConfig.shuffle_questions,
            instructions: assessment.instructions !== undefined ? assessment.instructions : currentConfig.instructions,
            exam_password: assessment.exam_password !== undefined ? assessment.exam_password : currentConfig.exam_password,
            questions: assessment.questions !== undefined ? assessment.questions : currentConfig.questions
        };

        updateData.description = JSON.stringify(newConfig);

        const { error } = await supabase
            .from('assessments')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        console.log('✅ Assessment updated in Supabase (ID):', id);
        return { success: true };
    } catch (error) {
        console.error('❌ Error updating assessment:', error);
        return { success: false };
    }
};

// Get all uploaded content for a specific class and subject
export const getStudentContent = async (classId: number, subjectCode: string): Promise<any[]> => {
    try {
        const { data, error } = await supabase
            .from('teacher_content')
            .select('*')
            .eq('class_id', classId)
            .eq('subject_code', subjectCode);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching student content:', error);
        return [];
    }
};
