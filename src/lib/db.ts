import { supabase } from './supabase';
import { cloudinaryService } from './cloudinaryService';

// Database Helper Functions
// Supabase: Structured data (Users, Grades, Schedules, Answers)
// Cloudinary: Media files (Images, PDFs, Answer Sheet images)

// 1. Save Quiz Result
// Result/Marks -> Supabase (PostgreSQL)
// Detailed Answers -> Supabase JSONB column
export const saveQuizResultHybrid = async (
    userId: string,
    quizData: any,
    score: number,
    detailedLogs: any,
    subjectCode?: string,
    classId?: number
) => {
    try {
        // Save structured data to Supabase
        const { error } = await supabase
            .from('quiz_results')
            .insert([
                {
                    student_id: userId,
                    quiz_title: quizData.title,
                    score: score,
                    total_marks: quizData.totalMarks,
                    answers: detailedLogs.structuredAnswers || detailedLogs.answers || {},
                    timestamp: new Date().toISOString(),
                    subject_code: subjectCode || null,
                    class_id: classId || null,
                    total_questions: quizData.questions?.length || 0
                }
            ]);

        if (error) throw error;
        console.log('✅ Quiz Score saved to Supabase');

        return { success: true };
    } catch (error) {
        console.error('Save Quiz Failed:', error);
        return { success: false, error };
    }
};

// 2. Save Exam Data
// Final Grade -> Supabase
// Answer Sheet Images -> Cloudinary
export const saveExamSubmissionHybrid = async (
    userId: string,
    examId: string,
    grade: any,
    answerSheetData: any,
    questions: any[] = []
) => {
    let submissionId: string | null = null;
    let existingSubmissionId: string | null = null;

    try {
        // 0. Enforce "One Attempt" Policy: Remove previous submissions
        // First find the existing submission ID to clean up dependent records
        const { data: existingSub } = await supabase
            .from('exam_submissions')
            .select('id')
            .eq('student_id', userId)
            .eq('assessment_id', examId)
            .maybeSingle();

        if (existingSub) {
            existingSubmissionId = existingSub.id;
            console.log('🗑️ Found previous submission, cleaning up:', existingSubmissionId);

            // DELETE dependent answers first (to avoid FK constraint failures)
            const { error: ansDelError } = await supabase
                .from('student_answers')
                .delete()
                .eq('submission_id', existingSubmissionId);

            if (ansDelError) console.warn('Warning deleting old answers:', ansDelError);

            // NOW delete the submission
            const { error: subDelError } = await supabase
                .from('exam_submissions')
                .delete()
                .eq('id', existingSubmissionId);

            if (subDelError) console.warn('Warning deleting old submission:', subDelError);
            else console.log('✅ Previous attempts cleared (Single Attempt Policy enforced).');
        }

        // 1. Save Grade/Metadata to Supabase (exam_submissions)
        const { data, error } = await supabase.from('exam_submissions').insert({
            student_id: userId,
            assessment_id: examId,
            total_score: grade.score,
            grade: grade.letter,
            status: 'submitted',
            submitted_at: new Date().toISOString()
        }).select().single();

        if (error) {
            console.error('Supabase Submission Error:', error);
            return { success: false, error };
        }

        submissionId = data.id;
        console.log('✅ Exam Metadata saved to Supabase, submissionId:', submissionId);

        // 2. Upload FULL submission (answers + drawings) to Cloudinary
        // This ensures ALL answers are saved regardless of question ID format
        let cloudinaryUrl = '';
        try {
            console.log('📤 Uploading full submission to Cloudinary...');

            // Build the complete submission payload with all answers
            const fullSubmission = {
                student_id: userId,
                submission_id: submissionId,
                exam_id: examId,
                answers: answerSheetData.answers || {},
                images: answerSheetData.images || {},
                strokes: answerSheetData.strokes || {},
                aiAnalysis: answerSheetData.aiAnalysis || '',
                questions: questions.map(q => ({
                    id: String(q.id),
                    text: q.text || q.question || '',
                    type: q.type,
                    marks: q.marks,
                    options: q.options || null,
                    correct: q.correct ?? q.correctAnswer ?? null
                })),
                timestamp: new Date().toISOString()
            };

            cloudinaryUrl = await cloudinaryService.uploadJson(
                fullSubmission,
                `exam_submissions/${examId}`
            );
            console.log('✅ Full submission uploaded to Cloudinary:', cloudinaryUrl);
        } catch (uploadError) {
            console.error('❌ Cloudinary Upload Failed:', uploadError);
            // Continue — we'll still try to save answers directly
        }

        // 3. Save answers to student_answers in Supabase
        if (questions && questions.length > 0) {
            // Check if question IDs are UUIDs (from assessment_questions table)
            // or numeric/string IDs (from description JSON fallback)
            const isUuidFormat = (id: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
            const hasUuidQuestions = questions.some(q => isUuidFormat(q.id));

            if (hasUuidQuestions) {
                // CASE A: Questions have real UUID IDs → save individual answers normally
                console.log('📝 Saving individual answers (UUID question IDs)...');
                const answersPayload = questions.map((q, index) => {
                    if (!isUuidFormat(q.id)) return null;

                    // Safely extract the answer — guard against null/undefined to avoid "null" string
                    const rawAnswer = answerSheetData.answers[q.id];
                    let studentAnswer = '';
                    if (rawAnswer !== null && rawAnswer !== undefined && rawAnswer !== '') {
                        studentAnswer = typeof rawAnswer === 'object'
                            ? JSON.stringify(rawAnswer)
                            : String(rawAnswer);
                    }

                    // Append Cloudinary URL to the first answer so Teacher Dashboard can find it
                    if (index === 0 && cloudinaryUrl) {
                        studentAnswer = `[CLOUDINARY_URL]:${cloudinaryUrl}|||${studentAnswer}`;
                    }

                    return {
                        submission_id: submissionId,
                        question_id: q.id,
                        student_answer: studentAnswer,
                        is_correct: false,
                        marks_awarded: 0,
                        answered_at: new Date().toISOString()
                    };
                }).filter(Boolean);

                if (answersPayload.length > 0) {
                    const { error: answerError } = await supabase
                        .from('student_answers')
                        .insert(answersPayload);

                    if (answerError) {
                        console.error('❌ Supabase Answer Save Failed:', answerError);
                    } else {
                        console.log('✅ Answers saved to Supabase (UUID mode)');
                    }
                }
            } else {
                // CASE B: Questions have numeric IDs (from description JSON)  
                // These IDs are NOT valid UUIDs, so we can't reference assessment_questions table
                // Instead, we try to look up real assessment_questions UUIDs for this assessment
                console.log('📝 Questions have non-UUID IDs — looking up real question UUIDs...');

                try {
                    const { data: realQuestions, error: qError } = await supabase
                        .from('assessment_questions')
                        .select('id, question_number, question_text')
                        .eq('assessment_id', examId)
                        .order('question_number');

                    if (!qError && realQuestions && realQuestions.length > 0) {
                        // Map answers by matching question_number (1-indexed) to question position
                        console.log(`✅ Found ${realQuestions.length} real questions in assessment_questions table`);

                        const answersPayload = realQuestions.map((realQ, index) => {
                            // Try to find the matching answer by question number or position
                            const questionKey = questions[index]?.id ?? String(index + 1);
                            const answerKeys = [
                                String(questionKey),
                                String(realQ.question_number),
                                String(index),
                                String(index + 1)
                            ];

                            let studentAnswer = '';
                            for (const key of answerKeys) {
                                const rawVal = answerSheetData.answers[key];
                                if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                                    studentAnswer = typeof rawVal === 'object'
                                        ? JSON.stringify(rawVal)
                                        : String(rawVal);
                                    break;
                                }
                            }

                            // Append Cloudinary URL to the first answer
                            if (index === 0 && cloudinaryUrl) {
                                studentAnswer = `[CLOUDINARY_URL]:${cloudinaryUrl}|||${studentAnswer}`;
                            }

                            return {
                                submission_id: submissionId,
                                question_id: realQ.id, // Real UUID from assessment_questions
                                student_answer: studentAnswer,
                                is_correct: false,
                                marks_awarded: 0,
                                answered_at: new Date().toISOString()
                            };
                        });

                        const { error: answerError } = await supabase
                            .from('student_answers')
                            .insert(answersPayload);

                        if (answerError) {
                            console.error('❌ Supabase Answer Save Failed (mapped):', answerError);
                        } else {
                            console.log('✅ Answers saved to Supabase (mapped UUID mode)');
                        }
                    } else {
                        // No real questions found in assessment_questions table
                        // Save a single reference row pointing to Cloudinary
                        console.warn('⚠️ No assessment_questions found — saving Cloudinary reference only');

                        if (cloudinaryUrl) {
                            // Create a reference answer so the grading center can find it
                            const { error: refError } = await supabase
                                .from('student_answers')
                                .insert({
                                    submission_id: submissionId,
                                    question_id: null, // No real question ID available
                                    student_answer: `[CLOUDINARY_URL]:${cloudinaryUrl}`,
                                    is_correct: false,
                                    marks_awarded: 0,
                                    answered_at: new Date().toISOString()
                                });

                            if (refError) {
                                console.error('❌ Cloudinary reference save failed:', refError);
                            } else {
                                console.log('✅ Cloudinary reference saved to student_answers');
                            }
                        }
                    }
                } catch (lookupError) {
                    console.error('❌ Question lookup failed:', lookupError);
                }
            }
        }

        return { success: true, submissionId };

    } catch (e) {
        console.error('❌ Save Exam Error (Critical):', e);
        return { success: false, error: e };
    }
};

/**
 * Saves canvas data (strokes, shapes) to Supabase student_notes table directly.
 */
export const saveCanvasNoteHybrid = async (studentId: string, subject: string, noteData: any) => {
    try {
        const { data, error } = await supabase.from('student_notes').insert({
            student_id: studentId,
            title: noteData.title || 'Untitled Note',
            subject_code: subject,
            note_type: 'handwritten',
            tags: noteData.tags || [],
            content: JSON.stringify(noteData) // Store full JSON payload in content column
        }).select().single();

        if (error) {
            console.error('❌ Failed to save note to Supabase student_notes:', error);
            throw error;
        }

        console.log('✅ Canvas Note saved to Supabase directly');
        // Return a dummy url just to satisfy the interface, though we don't use it anymore
        return { success: true, url: 'supabase://student_notes/' + data.id, id: data.id };

    } catch (error) {
        console.error('❌ Save Canvas Note Error:', error);
        return { success: false, error };
    }
};

/**
 * Updates an existing canvas note in Supabase student_notes table.
 */
export const updateCanvasNoteHybrid = async (studentId: string, _subject: string, noteId: string, noteData: any) => {
    try {
        const { error } = await supabase.from('student_notes')
            .update({
                content: JSON.stringify(noteData),
                updated_at: new Date().toISOString()
            })
            .eq('id', noteId)
            .eq('student_id', studentId);

        if (error) {
            console.error('❌ Failed to update note in Supabase:', error);
            throw error;
        }

        console.log('✅ Canvas Note updated in Supabase directly');
        return { success: true, url: 'supabase://student_notes/' + noteId };

    } catch (error) {
        console.error('❌ Update Canvas Note Error:', error);
        return { success: false, error };
    }
};

/**
 * Fetches all canvas notes for a student directly from student_notes table.
 */
export const fetchCanvasNotesHybrid = async (studentId: string) => {
    try {
        const { data: notesList, error } = await supabase
            .from('student_notes')
            .select('*')
            .eq('student_id', studentId)
            .eq('note_type', 'handwritten')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        
        if (!notesList || notesList.length === 0) return [];

        const parsedNotes = notesList.map((dbNote) => {
            if (!dbNote.content) return null;
            try {
                const noteData = JSON.parse(dbNote.content);
                return {
                    ...noteData,
                    id: dbNote.id,
                    remoteUrl: 'supabase://student_notes/' + dbNote.id,
                    createdAt: dbNote.created_at,
                    updatedAt: dbNote.updated_at
                };
            } catch (err) {
                console.error(`❌ Failed to parse content for note ${dbNote.id}:`, err);
                return null;
            }
        });

        return parsedNotes.filter(Boolean);
    } catch (error) {
        console.error('❌ Fetch Canvas Notes Error:', error);
        return [];
    }
};

// Export cloudinaryService for direct use if needed
export { cloudinaryService };
