import { supabase } from './supabase';
import { sendNotification, getSubjectName } from './notificationService';
import { generateReinforcementQuizFromMistakes, MistakeCorrectionItem } from './gemini';

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

export interface StudentCorrectionSummary {
    hasCorrections: boolean;
    totalMistakes: number;
    weakConcepts: string[];
    sourceExams: string[];
    corrections: MistakeCorrectionItem[];
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
        return all.filter(r => r.student_id === studentId || studentId === 'guest' || r.student_id === 'guest');
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

/**
 * 🎯 CORE FEEDBACK EXTRACTOR:
 * Fetches all evaluated mistake corrections and teacher/AI feedback for a student.
 */
export const fetchStudentCorrectionFeedback = async (
    studentId: string,
    subjectCode?: string
): Promise<StudentCorrectionSummary> => {
    const corrections: MistakeCorrectionItem[] = [];
    const weakConceptsSet = new Set<string>();
    const sourceExamsSet = new Set<string>();

    try {
        // 1. Fetch from student_adaptive_quizzes recommendations
        const recs = await getAdaptiveQuizRecommendations(studentId);
        const filteredRecs = subjectCode && subjectCode !== 'ALL'
            ? recs.filter(r => r.subject_code === subjectCode)
            : recs;

        filteredRecs.forEach(r => {
            if (r.exam_title) sourceExamsSet.add(r.exam_title);
            if (Array.isArray(r.weak_concepts)) {
                r.weak_concepts.forEach(wc => {
                    weakConceptsSet.add(wc);
                    corrections.push({
                        concept: wc,
                        questionText: `Evaluated problem from "${r.exam_title}"`,
                        studentAnswer: `Misconception identified in ${wc}`,
                        correctAnswer: `Accurate rule & application for ${wc}`,
                        feedback: `Reinforcement recommended by teacher evaluation on ${r.exam_title}.`,
                        sourceExam: r.exam_title
                    });
                });
            }
        });

        // 2. Fetch from exam_submissions with evaluation details
        try {
            const { data: submissions } = await supabase
                .from('exam_submissions')
                .select('*')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (submissions && submissions.length > 0) {
                submissions.forEach(sub => {
                    const title = sub.assessment_title || sub.title || 'Exam Evaluation';
                    sourceExamsSet.add(title);

                    // Check if gradingReport or aiAnalysis exists in answer_sheet_url / submission data
                    if (sub.answer_sheet_url) {
                        try {
                            const parsed = typeof sub.answer_sheet_url === 'string' && sub.answer_sheet_url.startsWith('{')
                                ? JSON.parse(sub.answer_sheet_url)
                                : sub.answer_sheet_url;

                            if (parsed.aiAnalysis) {
                                // Extract weak concepts or feedback lines
                                const analysisText = typeof parsed.aiAnalysis === 'string'
                                    ? parsed.aiAnalysis
                                    : JSON.stringify(parsed.aiAnalysis);

                                corrections.push({
                                    concept: `${sub.subject_code || 'Subject'} Exam Feedback`,
                                    questionText: `Mistakes evaluated in ${title}`,
                                    studentAnswer: 'Previous incorrect reasoning',
                                    correctAnswer: 'Standard correct methodology',
                                    feedback: analysisText.substring(0, 300),
                                    sourceExam: title
                                });
                            }
                        } catch { /* ignore parse error */ }
                    }
                });
            }
        } catch (subErr) {
            console.warn('Could not fetch exam submissions for feedback:', subErr);
        }

        // 3. Fetch from recent quiz_results
        try {
            const { data: quizResults } = await supabase
                .from('quiz_results')
                .select('*')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (quizResults && quizResults.length > 0) {
                quizResults.forEach(qr => {
                    if (qr.score < qr.total_marks && qr.detailed_logs) {
                        const logs = typeof qr.detailed_logs === 'string' ? JSON.parse(qr.detailed_logs) : qr.detailed_logs;
                        if (logs.answers) {
                            Object.entries(logs.answers).forEach(([qId, ansData]: [string, any]) => {
                                if (ansData && ansData.isCorrect === false) {
                                    corrections.push({
                                        concept: ansData.concept || qr.quiz_title || 'Quiz Concept',
                                        questionText: ansData.question || `Question ${qId}`,
                                        studentAnswer: ansData.studentAnswer || 'Incorrect Answer',
                                        correctAnswer: ansData.correctAnswer || 'Correct Solution',
                                        feedback: ansData.explanation || 'Review the correct principle.',
                                        sourceExam: qr.quiz_title
                                    });
                                }
                            });
                        }
                    }
                });
            }
        } catch { /* ignore */ }

    } catch (e) {
        console.error('Error fetching student correction feedback:', e);
    }

    const weakConcepts = Array.from(weakConceptsSet);
    const sourceExams = Array.from(sourceExamsSet);

    return {
        hasCorrections: corrections.length > 0,
        totalMistakes: corrections.length,
        weakConcepts,
        sourceExams,
        corrections
    };
};

/**
 * 🎯 GENERATE ADAPTIVE REINFORCEMENT QUIZ ONLY FROM CORRECTED ANSWER FEEDBACK:
 */
export const generateAdaptiveQuizFromFeedback = async (
    studentId: string,
    subjectCode: string = 'MATH',
    targetConcept?: string,
    difficulty: string = 'medium'
): Promise<{
    quiz: any;
    feedbackSummary: StudentCorrectionSummary;
    fromRealFeedback: boolean;
}> => {
    const feedbackSummary = await fetchStudentCorrectionFeedback(studentId, subjectCode);
    const subjectDisplayName = getSubjectName(subjectCode) || subjectCode;

    // Filter corrections to target concept if specified
    const targetCorrections = targetConcept
        ? feedbackSummary.corrections.filter(c => c.concept?.toLowerCase().includes(targetConcept.toLowerCase()))
        : feedbackSummary.corrections;

    if (targetCorrections.length > 0) {
        // Generate AI quiz strictly based on student corrections and feedback
        const quiz = await generateReinforcementQuizFromMistakes(
            subjectDisplayName,
            difficulty,
            targetCorrections,
            targetConcept ? [targetConcept] : feedbackSummary.weakConcepts
        );

        return {
            quiz,
            feedbackSummary,
            fromRealFeedback: true
        };
    }

    // If no specific corrections exist for this student yet:
    // Generate a foundational mastery challenge based on general curriculum topics
    const quiz = await generateReinforcementQuizFromMistakes(
        subjectDisplayName,
        difficulty,
        [{
            concept: `${subjectDisplayName} Fundamentals`,
            questionText: `Core principles of ${subjectDisplayName}`,
            correctAnswer: 'Foundational standard rule',
            feedback: 'Mastering the core principles ensures continued excellence!',
            sourceExam: 'Curriculum Diagnostic'
        }],
        [`${subjectDisplayName} Core Mastery`]
    );

    return {
        quiz,
        feedbackSummary,
        fromRealFeedback: false
    };
};
