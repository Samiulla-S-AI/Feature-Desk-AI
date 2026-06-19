import { supabase } from './supabase';
import { sendNotification, getSubjectName } from './notificationService';


export interface AdaptiveQuizRecommendation {
    id: string;
    student_id: string;
    exam_id: string;
    exam_title: string;
    subject_code: string;
    weak_concepts: string[];
    status: 'pending' | 'completed';
    score?: number;
    total_marks?: number;
    completed_at?: string;
    created_at: string;
}

const LOCAL_KEY = 'fd_student_adaptive_quizzes';

/**
 * Get cached recommendations from localStorage
 */
const getLocalRecommendations = (studentId: string): AdaptiveQuizRecommendation[] => {
    try {
        const stored = localStorage.getItem(LOCAL_KEY);
        if (!stored) return [];
        const all: AdaptiveQuizRecommendation[] = JSON.parse(stored);
        return all.filter(r => r.student_id === studentId);
    } catch {
        return [];
    }
};

/**
 * Save cached recommendations to localStorage
 */
const saveLocalRecommendations = (recommendations: AdaptiveQuizRecommendation[]): void => {
    try {
        const currentLocal = localStorage.getItem(LOCAL_KEY);
        const all: AdaptiveQuizRecommendation[] = currentLocal ? JSON.parse(currentLocal) : [];
        
        // Merge: overwrite existing by id or insert new
        const recMap = new Map<string, AdaptiveQuizRecommendation>();
        all.forEach(r => recMap.set(r.id, r));
        recommendations.forEach(r => recMap.set(r.id, r));
        
        localStorage.setItem(LOCAL_KEY, JSON.stringify(Array.from(recMap.values())));
    } catch (e) {
        console.error('Failed to cache recommendations to localStorage:', e);
    }
};

/**
 * Creates a new adaptive reinforcement practice quiz recommendation.
 * Also sends a notification to the student.
 */
export const createAdaptiveQuizRecommendation = async (
    studentId: string,
    examId: string,
    examTitle: string,
    subjectCode: string,
    weakConcepts: string[]
): Promise<AdaptiveQuizRecommendation> => {
    const newRecommendation: AdaptiveQuizRecommendation = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        student_id: studentId,
        exam_id: examId,
        exam_title: examTitle,
        subject_code: subjectCode,
        weak_concepts: weakConcepts,
        status: 'pending',
        created_at: new Date().toISOString()
    };

    // Cache locally
    saveLocalRecommendations([newRecommendation]);

    // Save to Supabase (non-blocking / error handled)
    try {
        const { error } = await supabase.from('student_adaptive_quizzes').upsert({
            id: newRecommendation.id,
            student_id: newRecommendation.student_id,
            exam_id: newRecommendation.exam_id,
            exam_title: newRecommendation.exam_title,
            subject_code: newRecommendation.subject_code,
            weak_concepts: newRecommendation.weak_concepts,
            status: newRecommendation.status,
            created_at: newRecommendation.created_at
        }, {
            onConflict: 'id',
            ignoreDuplicates: true
        });

        if (error) {
            // Silent fallback to local storage
        } else {
            console.log('✅ Adaptive quiz recommendation saved to Supabase');
        }
    } catch (e) {
        // Silent fallback to local storage
    }

    // Send a notification to the student
    try {
        const subName = getSubjectName(subjectCode);
        const subjectPrefix = subName ? `[${subName}] ` : '';
        sendNotification({
            student_id: studentId,
            title: `🎯 ${subjectPrefix}Reinforce Weak Concepts: ${examTitle}`,
            message: `For ${subName || 'your active class'}, we detected some weak areas in "${examTitle}". Open the Quiz App to take a custom practice quiz on: ${weakConcepts.join(', ')}.`,
            type: 'reminder',
            read: false,
            urgent: false,
            metadata: {
                assessment_id: examId,
                assessment_title: examTitle
            }
        });
    } catch (notifErr) {
        console.error('Failed to send notification for adaptive recommendation:', notifErr);
    }

    return newRecommendation;
};

/**
 * Retrieve all recommendations for a student (pending and completed)
 */
export const getAdaptiveQuizRecommendations = async (
    studentId: string
): Promise<AdaptiveQuizRecommendation[]> => {
    try {
        const { data, error } = await supabase
            .from('student_adaptive_quizzes')
            .select('*')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false });

        if (error) {
            return getLocalRecommendations(studentId);
        }

        if (data) {
            // Sync local storage with fetched data
            saveLocalRecommendations(data as AdaptiveQuizRecommendation[]);
            return data as AdaptiveQuizRecommendation[];
        }
    } catch (e) {
        // Silent fallback to local storage
    }

    return getLocalRecommendations(studentId);
};

/**
 * Mark a recommendation as completed
 */
export const completeAdaptiveQuizRecommendation = async (
    recommendationId: string,
    score: number,
    totalMarks: number
): Promise<boolean> => {
    const completedAt = new Date().toISOString();

    // Update locally
    try {
        const stored = localStorage.getItem(LOCAL_KEY);
        if (stored) {
            const all: AdaptiveQuizRecommendation[] = JSON.parse(stored);
            const updated = all.map(r =>
                r.id === recommendationId
                    ? { ...r, status: 'completed' as const, score, total_marks: totalMarks, completed_at: completedAt }
                    : r
            );
            localStorage.setItem(LOCAL_KEY, JSON.stringify(updated));
        }
    } catch (e) {
        console.error('Failed to update localStorage on recommendation completion:', e);
    }

    // Update in Supabase
    try {
        const { error } = await supabase
            .from('student_adaptive_quizzes')
            .update({
                status: 'completed',
                score,
                total_marks: totalMarks,
                completed_at: completedAt
            })
            .eq('id', recommendationId);

        if (error) {
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
};
