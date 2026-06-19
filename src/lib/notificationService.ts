import { supabase } from './supabase';

// ===================================================================
// Notification Service
// Manages student notifications for grade reports, exam results, etc.
// Uses Supabase 'student_notifications' table with localStorage fallback.
// ===================================================================

export interface StudentNotification {
    id: string;
    student_id: string;
    title: string;
    message: string;
    type: 'grade_report' | 'exam_result' | 'assignment' | 'announcement' | 'reminder' | 'warning';
    read: boolean;
    urgent: boolean;
    metadata?: {
        assessment_id?: string;
        assessment_title?: string;
        score?: number;
        total_marks?: number;
        grade?: string;
        feedback?: string;
        question_feedback?: QuestionFeedback[];
        answer_sheet_url?: string;
    };
    created_at: string;
}

export interface QuestionFeedback {
    questionNumber: number;
    questionText: string;
    marksAwarded: number;
    totalMarks: number;
    feedback: string;
    feedbackImage?: string; // Generated image for feedback (e.g. AI diagram)
}

// ===================================================================
// LOCAL STORAGE NOTIFICATION STORE
// ===================================================================
const NOTIFICATIONS_KEY = 'fd_student_notifications';
const SUBMITTED_EXAMS_KEY = 'fd_submitted_exams';

/**
 * Get all notifications for a student from localStorage
 */
export const getStudentNotifications = (studentId: string): StudentNotification[] => {
    try {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        if (!stored) return [];
        const all: StudentNotification[] = JSON.parse(stored);
        return all
            .filter(n => n.student_id === studentId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch {
        return [];
    }
};

/**
 * Fetch all notifications for a student from Supabase (Async)
 * Used for cross-device sync
 */
export const fetchStudentNotifications = async (studentId: string): Promise<StudentNotification[]> => {
    try {
        const { data, error } = await supabase
            .from('student_notifications')
            .select('*')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching notifications:', error);
            const local = getStudentNotifications(studentId);
            return local;
        }

        // Update local cache to keep it in sync
        // Note: This replaces local cache with server state, which is correct for sync
        if (data) {
            const currentLocal = localStorage.getItem(NOTIFICATIONS_KEY);
            let allLocal: StudentNotification[] = currentLocal ? JSON.parse(currentLocal) : [];

            // Merge strategy: Keep local notifications that are NOT in server (if any local-only exist)
            // But for now, just appending or replacing might be simpler.
            // Simplest: just use server data for this session view, and maybe update local storage if we want offline support.
            // user requested "notification detail view", so let's ensure we return the data.
            return data as StudentNotification[];
        }
        return [];
    } catch (e) {
        console.error('Failed to fetch notifications:', e);
        return getStudentNotifications(studentId); // Fallback to local
    }
};

/**
 * Get unread notification count for a student
 */
export const getUnreadNotificationCount = (studentId: string): number => {
    const notifications = getStudentNotifications(studentId);
    return notifications.filter(n => !n.read).length;
};

/**
 * Send a notification to a student
 */
export const sendNotification = (notification: Omit<StudentNotification, 'id' | 'created_at'>): StudentNotification => {
    const newNotification: StudentNotification = {
        ...notification,
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString()
    };

    try {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        const all: StudentNotification[] = stored ? JSON.parse(stored) : [];
        all.push(newNotification);
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
    } catch (e) {
        console.error('Failed to save notification:', e);
    }

    // Also try saving to Supabase (non-blocking)
    // Uses upsert to avoid 409 Conflict errors on duplicate inserts
    try {
        supabase.from('student_notifications').upsert({
            id: newNotification.id,          // Use our generated ID as the PK
            student_id: notification.student_id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            read: false,
            urgent: notification.urgent || false,
            metadata: notification.metadata || {},
            created_at: newNotification.created_at
        }, {
            onConflict: 'id',               // If same ID exists, skip (ignore duplicate)
            ignoreDuplicates: true
        }).then(({ error }) => {
            if (error) {
                // 409 = conflict (duplicate), safe to ignore
                if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('conflict')) {
                    console.log('ℹ️ Notification already exists in Supabase (duplicate skipped)');
                } else {
                    console.warn('Supabase notification save skipped (table may not exist yet):', error.message);
                    console.info('👉 Run database/fix_student_notifications.sql in Supabase SQL Editor to create the table.');
                }
            } else {
                console.log('✅ Notification saved to Supabase student_notifications');
            }
        });
    } catch { /* ignore Supabase errors — localStorage is the primary store */ }

    return newNotification;
};

/**
 * Mark a notification as read
 */
export const markNotificationAsRead = (notificationId: string): void => {
    try {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        if (!stored) return;
        const all: StudentNotification[] = JSON.parse(stored);
        const updated = all.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
        );
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }

    // Also update Supabase (fire and forget)
    supabase.from('student_notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .then(({ error }) => {
            if (error) console.error('Failed to mark as read in Supabase:', error);
        });
};

/**
 * Mark all notifications as read for a student
 */
export const markAllNotificationsAsRead = (studentId: string): void => {
    try {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        if (!stored) return;
        const all: StudentNotification[] = JSON.parse(stored);
        const updated = all.map(n =>
            n.student_id === studentId ? { ...n, read: true } : n
        );
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }

    // Also update Supabase (fire and forget)
    supabase.from('student_notifications')
        .update({ read: true })
        .eq('student_id', studentId)
        .then(({ error }) => {
            if (error) console.error('Failed to mark all as read in Supabase:', error);
        });
};

/**
 * Dismiss/delete a notification
 */
export const dismissNotification = (notificationId: string): void => {
    try {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        if (!stored) return;
        const all: StudentNotification[] = JSON.parse(stored);
        const filtered = all.filter(n => n.id !== notificationId);
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(filtered));
    } catch { /* ignore */ }

    // Also update Supabase (fire and forget)
    supabase.from('student_notifications')
        .delete()
        .eq('id', notificationId)
        .then(({ error }) => {
            if (error) console.error('Failed to dismiss in Supabase:', error);
        });
};

export const getSubjectName = (subjectCode?: string): string => {
    if (!subjectCode) return '';
    const code = subjectCode.toUpperCase();
    if (code === 'MATH') return 'Mathematics';
    if (code === 'SCI') return 'Science';
    if (code === 'ENG') return 'English';
    if (code === 'HIST') return 'History';
    if (code === 'PHY') return 'Physics';
    return subjectCode;
};

/**
 * Send a full grade report notification to a student
 * This is called by the GradingCenter when teacher approves & publishes grades
 */
export const sendGradeReportNotification = (
    studentId: string,
    _studentName: string,
    assessmentTitle: string,
    score: number,
    totalMarks: number,
    grade: string,
    feedback: string,
    questionFeedback: QuestionFeedback[],
    answerSheetUrl?: string,
    weakConcepts?: string[],
    subjectCode?: string
): StudentNotification => {
    // Build detailed message with question-wise breakdown
    const percentage = Math.round((score / totalMarks) * 100);
    const subName = getSubjectName(subjectCode);
    const subjectPrefix = subName ? `${subName}: ` : '';
    const subjectTitlePrefix = subName ? `Grade Published [${subName}]: ` : 'Grade Published: ';

    let message = `📊 Grade Report for ${subjectPrefix}"${assessmentTitle}"\n\n`;
    message += `📋 Overall Score: ${score}/${totalMarks} (${percentage}%) — Grade: ${grade}\n\n`;

    if (weakConcepts && weakConcepts.length > 0) {
        message += `🎯 Adaptive Reinforcement Recommended:\n`;
        message += `Based on your results for ${subName || 'this subject'}, you need to attend a Reinforcement Quiz on the following topics:\n`;
        weakConcepts.forEach(wc => {
            message += `  • ${wc}\n`;
        });
        message += `Please open the Quiz App and navigate to the "Adaptive Reinforce" or "Standard Practice" tab to complete these tests.\n\n`;
        message += `${'─'.repeat(40)}\n\n`;
    }

    if (questionFeedback.length > 0) {
        message += `📝 Question-wise Breakdown:\n`;
        message += `${'─'.repeat(40)}\n`;
        questionFeedback.forEach(qf => {
            message += `\nQ${qf.questionNumber}: ${qf.questionText}\n`;
            message += `   Marks: ${qf.marksAwarded}/${qf.totalMarks}\n`;
            if (qf.feedback) {
                message += `   Feedback: ${qf.feedback}\n`;
            }
        });
        message += `\n${'─'.repeat(40)}\n`;
    }

    if (feedback) {
        message += `\n💬 Teacher's Feedback:\n${feedback}\n`;
    }

    message += `\n📅 Published on: ${new Date().toLocaleString()}`;

    return sendNotification({
        student_id: studentId,
        title: `📊 ${subjectTitlePrefix}${assessmentTitle} — ${grade} (${score}/${totalMarks})`,
        message,
        type: 'grade_report',
        read: false,
        urgent: percentage < 45, // Mark urgent if failing/low score
        metadata: {
            assessment_title: assessmentTitle,
            score,
            total_marks: totalMarks,
            grade,
            feedback,
            question_feedback: questionFeedback,
            answer_sheet_url: answerSheetUrl
        }
    });
};

// ===================================================================
// SUBMITTED EXAMS TRACKING (for re-entry prevention)
// ===================================================================

/**
 * Mark an exam as submitted (prevents re-entry)
 */
export const markExamAsSubmitted = (studentId: string, examId: string): void => {
    try {
        const stored = localStorage.getItem(SUBMITTED_EXAMS_KEY);
        const all: Record<string, string[]> = stored ? JSON.parse(stored) : {};
        if (!all[studentId]) all[studentId] = [];
        if (!all[studentId].includes(examId)) {
            all[studentId].push(examId);
        }
        localStorage.setItem(SUBMITTED_EXAMS_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
};

/**
 * Check if an exam has been submitted by a student
 */
export const isExamSubmitted = (studentId: string, examId: string): boolean => {
    try {
        const stored = localStorage.getItem(SUBMITTED_EXAMS_KEY);
        if (!stored) return false;
        const all: Record<string, string[]> = JSON.parse(stored);
        return all[studentId]?.includes(examId) || false;
    } catch {
        return false;
    }
};

/**
 * Get all submitted exam IDs for a student
 */
export const getSubmittedExamIds = (studentId: string): string[] => {
    try {
        const stored = localStorage.getItem(SUBMITTED_EXAMS_KEY);
        if (!stored) return [];
        const all: Record<string, string[]> = JSON.parse(stored);
        return all[studentId] || [];
    } catch {
        return [];
    }
};
