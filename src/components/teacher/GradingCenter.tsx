import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Check,
    RefreshCw,
    Sparkles,
    Clock,
    ChevronUp,
    CheckCircle,
    FileText,
    Eye,
    MessageSquare,
    Award,
    Minus,
    Plus,
    Image as ImageIcon,
    Keyboard,
    AlertTriangle,
    ImagePlus,
    Trash2,
    Bell
} from 'lucide-react';
import { getPendingResults, getPublishedResults, approveGrade, saveQuestionFeedback, StudentResult } from '../../lib/teacherDb';


import { gradeImageAnswerWithRubric, generatePersonalizedFeedback, generateImageForQuestion } from '../../lib/teacherAI';
import { cloudinaryService } from '../../lib/cloudinaryService';
import { sendGradeReportNotification, QuestionFeedback } from '../../lib/notificationService';
import MarkdownRenderer from '../common/MarkdownRenderer';
import { supabase } from '../../lib/supabase';

interface GradingCenterProps {
    classId?: number;
}

interface SubmissionQuestion {
    questionId: string;
    questionText: string;
    answer: string;
    marks: number;
    allocatedMarks: number;
    suggestion: string;
    isDrawing: boolean;
    feedbackImageUrl?: string;
}

export default function GradingCenter({ classId }: GradingCenterProps) {
    const { user } = useAuth();
    const [pendingResults, setPendingResults] = useState<StudentResult[]>([]);
    const [publishedResults, setPublishedResults] = useState<StudentResult[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'published'>('pending');
    const [loading, setLoading] = useState(true);
    const [aiGrading, setAiGrading] = useState<Record<string, any>>({});
    const [customFeedback, setCustomFeedback] = useState<Record<string, string>>({});
    const [combiningId, setCombiningId] = useState<string | null>(null);
    const [generatingImageFor, setGeneratingImageFor] = useState<string | null>(null);

    // Question-level grading
    const [submissionDetails, setSubmissionDetails] = useState<Record<string, SubmissionQuestion[]>>({});
    const [viewingSubmission, setViewingSubmission] = useState<string | null>(null);
    // Combined answer sheet preview
    const [combinedSheetPreview, setCombinedSheetPreview] = useState<Record<string, string>>({});


    useEffect(() => {
        loadResults();
    }, [classId, activeTab]);

    const loadResults = async () => {
        setLoading(true);
        const teacherId = user?.id || '';
        
        // Fetch both lists to keep counts accurate
        const [pending, published] = await Promise.all([
            getPendingResults(teacherId, classId),
            getPublishedResults(teacherId, classId)
        ]);
        
        setPendingResults(pending);
        setPublishedResults(published);

        // Load details for the active tab's results
        const activeResults = activeTab === 'pending' ? pending : published;
        for (const result of activeResults) {
            await loadSubmissionDetails(result.id);
        }
        setLoading(false);
    };

    const loadSubmissionDetails = async (resultId: string): Promise<SubmissionQuestion[] | undefined> => {
        try {
            // 1. Fetch from Supabase student_answers table
            const { supabase } = await import('../../lib/supabase');
            const { data: supaAnswers, error } = await supabase
                .from('student_answers')
                .select(`
                    *,
                    assessment_questions (question_text, marks, question_type)
                `)
                .eq('submission_id', resultId)
                .order('question_id');

            if (error) {
                console.error('Error loading answers from Supabase:', error);
                return;
            }

            // Fetch overall submission details from exam_submissions for overlaying saved feedback
            let savedFeedbackArray: any[] = [];
            try {
                const { data: submissionData } = await supabase
                    .from('exam_submissions')
                    .select('question_feedback, feedback')
                    .eq('id', resultId)
                    .single();

                if (submissionData) {
                    savedFeedbackArray = Array.isArray(submissionData.question_feedback) ? submissionData.question_feedback : [];
                    if (submissionData.feedback) {
                        setCustomFeedback(prev => ({ ...prev, [resultId]: submissionData.feedback }));
                    }
                } else {
                    // Check quiz_results fallback
                    const { data: quizData } = await supabase
                        .from('quiz_results')
                        .select('answers, feedback')
                        .eq('id', resultId)
                        .single();
                    if (quizData) {
                        savedFeedbackArray = Array.isArray(quizData.answers) ? quizData.answers : [];
                        if (quizData.feedback) {
                            setCustomFeedback(prev => ({ ...prev, [resultId]: quizData.feedback }));
                        }
                    }
                }
            } catch (err) {
                console.warn('Could not load overall feedback overlay:', err);
            }

            if (supaAnswers && supaAnswers.length > 0) {
                // 2. Check for Cloudinary External Reference
                const firstAnswer = supaAnswers[0]?.student_answer || '';
                if (firstAnswer.startsWith('[CLOUDINARY_URL]:')) {
                    const url = firstAnswer.split('|||')[0].replace('[CLOUDINARY_URL]:', '');
                    console.log('📥 Found External Cloudinary Submission:', url);

                    try {
                        const response = await fetch(url);
                        const fullSubmission = await response.json();

                        if (fullSubmission) {
                            const questions: SubmissionQuestion[] = [];
                            const cloudQuestions = fullSubmission.questions || [];

                            // Filter database student_answers to only those with valid question references
                            const validSupaAnswers = supaAnswers.filter((sa: any) => sa.question_id);

                            if (validSupaAnswers.length > 0) {
                                validSupaAnswers.forEach((sa: any, idx: number) => {
                                    const qId = sa.question_id;
                                    let rawAns = fullSubmission.answers?.[qId];
                                    if (rawAns === undefined || rawAns === null) {
                                        rawAns = sa.student_answer ? sa.student_answer.replace(/\[CLOUDINARY_URL\]:.*?\|\|\|/, '').replace(/\[FIREBASE_URL\]:.*?\|\|\|/, '') : '';
                                    }

                                    let ansStr = '';
                                    if (rawAns !== null && rawAns !== undefined) {
                                        if (typeof rawAns === 'object') {
                                            const str = JSON.stringify(rawAns);
                                            ansStr = (str === '{}' || str === '[]') ? '' : str;
                                        } else {
                                            ansStr = String(rawAns);
                                            if (ansStr === '{}' || ansStr === '[]') ansStr = '';
                                        }
                                    }

                                    const cloudQ = cloudQuestions.find((cq: any) => String(cq.id) === String(qId));
                                    
                                    const savedF = savedFeedbackArray.find((sf: any) => 
                                        String(sf.questionId) === String(qId) || 
                                        sf.questionNumber === (idx + 1)
                                    );

                                    questions.push({
                                        questionId: qId,
                                        questionText: sa.assessment_questions?.question_text || cloudQ?.text || `Question`,
                                        answer: ansStr,
                                        marks: sa.assessment_questions?.marks || cloudQ?.marks || 5,
                                        allocatedMarks: savedF?.marksAwarded ?? sa.marks_awarded ?? 0,
                                        suggestion: savedF?.feedback || sa.ai_feedback || '',
                                        isDrawing: ansStr.includes('[DRAWING]:'),
                                        feedbackImageUrl: savedF?.feedbackImage || sa.feedback_image_url
                                    });
                                });
                            } else if (cloudQuestions.length > 0) {
                                cloudQuestions.forEach((cloudQ: any, index: number) => {
                                    const qId = String(cloudQ.id);
                                    const rawAns = fullSubmission.answers?.[qId] !== undefined ? fullSubmission.answers[qId] : '';
                                    const meta = supaAnswers.find((sa: any) => String(sa.question_id) === qId);

                                    let ansStr = '';
                                    if (rawAns !== null && rawAns !== undefined) {
                                        if (typeof rawAns === 'object') {
                                            const str = JSON.stringify(rawAns);
                                            ansStr = (str === '{}' || str === '[]') ? '' : str;
                                        } else {
                                            ansStr = String(rawAns);
                                            if (ansStr === '{}' || ansStr === '[]') ansStr = '';
                                        }
                                    }

                                    const savedF = savedFeedbackArray.find((sf: any) => 
                                        String(sf.questionId) === qId || 
                                        sf.questionNumber === (index + 1)
                                    );

                                    questions.push({
                                        questionId: qId,
                                        questionText: cloudQ.text || 'Question',
                                        answer: ansStr,
                                        marks: cloudQ.marks || 5,
                                        allocatedMarks: savedF?.marksAwarded ?? meta?.marks_awarded ?? 0,
                                        suggestion: savedF?.feedback || meta?.ai_feedback || '',
                                        isDrawing: ansStr.includes('[DRAWING]:'),
                                        feedbackImageUrl: savedF?.feedbackImage || meta?.feedback_image_url
                                    });
                                });
                            }

                            if (questions.length > 0) {
                                setSubmissionDetails(prev => ({ ...prev, [resultId]: questions }));
                                return questions;
                            }
                        }
                    } catch (cloudinaryError) {
                        console.error('Failed to download from Cloudinary:', cloudinaryError);
                    }
                }

                // 3. Normal Supabase Mapping
                const questions: SubmissionQuestion[] = supaAnswers.map((a: any, index: number) => {
                    let ansStr = a.student_answer ? a.student_answer.replace(/\[CLOUDINARY_URL\]:.*?\|\|\|/, '').replace(/\[FIREBASE_URL\]:.*?\|\|\|/, '') : '';
                    if (ansStr === '{}' || ansStr === '[]') {
                        ansStr = '';
                    }

                    const qId = a.question_id || a.id;
                    const savedF = savedFeedbackArray.find((sf: any) => 
                        String(sf.questionId) === String(qId) || 
                        sf.questionNumber === (index + 1)
                    );

                    return {
                        questionId: qId,
                        questionText: a.assessment_questions?.question_text || 'Question',
                        answer: ansStr,
                        marks: a.assessment_questions?.marks || 5,
                        allocatedMarks: savedF?.marksAwarded ?? a.marks_awarded ?? 0,
                        suggestion: savedF?.feedback || a.ai_feedback || '',
                        isDrawing: ansStr.includes('[DRAWING]:') || false,
                        feedbackImageUrl: savedF?.feedbackImage || a.feedback_image_url
                    };
                });

                setSubmissionDetails(prev => ({ ...prev, [resultId]: questions }));
                return questions;
            }

            // Fallback: Check for Quiz Result JSON answers
            const { data: quizResults, error: quizError } = await supabase
                .from('quiz_results')
                .select('id, answers, total_marks')
                .eq('id', resultId);

            const quizResult = quizResults && quizResults.length > 0 ? quizResults[0] : null;

            if (!quizError && quizResult?.answers) {
                const ansArray = Array.isArray(quizResult.answers) ? quizResult.answers : [];
                const totalMarksVal = quizResult.total_marks || 25;
                const qMarks = ansArray.length > 0 ? (totalMarksVal / ansArray.length) : 5;
                const questions: SubmissionQuestion[] = ansArray.map((q: any, i: number) => ({
                    questionId: `q-${i}`,
                    questionText: q.question || q.questionText || `Question ${i + 1}`,
                    answer: q.student_answer || q.userAnswer || q.answer || q.selectedOption || '',
                    marks: qMarks,
                    allocatedMarks: q.is_correct ? qMarks : 0,
                    suggestion: '',
                    isDrawing: false
                }));

                if (questions.length > 0) {
                    setSubmissionDetails(prev => ({ ...prev, [resultId]: questions }));
                    return questions;
                }
            }

        } catch (error) {
            console.error('Error loading submission details:', error);
        }
    };

    const toggleExpand = (resultId: string) => {
        setViewingSubmission(prev => prev === resultId ? null : resultId);
    };

    /**
     * Compress an image blob using canvas for smaller Cloudinary uploads.
     * Returns a compressed JPEG blob.
     */
    const compressImage = async (blob: Blob, maxWidth: number = 1200, quality: number = 0.7): Promise<Blob> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Scale down if wider than maxWidth
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(blob); return; }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (compressed) => resolve(compressed || blob),
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(blob);
            img.src = URL.createObjectURL(blob);
        });
    };

    /**
     * MAIN: Combine all answer sheets with questions into one image,
     * compress, upload to Cloudinary, then AI grade the combined sheet.
     */
    const handleCombineAndGrade = async (result: StudentResult) => {
        setCombiningId(result.id);
        try {
            const questions = submissionDetails[result.id] || [];

            if (questions.length === 0) {
                alert('No answers found to grade.');
                setCombiningId(null);
                return;
            }

            console.log(`📝 Building combined answer sheet with ${questions.length} questions...`);

            // ── Step 1: Create a combined image with Questions + Answers ──
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context failed');

            // First pass: measure total height needed
            const CANVAS_WIDTH = 900;
            const PADDING = 30;
            const Q_HEADER_HEIGHT = 60;
            const TEXT_LINE_HEIGHT = 24;
            const TEXT_PADDING = 20;

            let totalHeight = PADDING; // top padding

            // Calculate the height for each question
            const questionLayouts: {
                qIndex: number;
                headerY: number;
                answerY: number;
                answerHeight: number;
                isDrawing: boolean;
                textData: string;
                drawingData: string;
                questionText: string;
                marks: number;
            }[] = [];

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const headerY = totalHeight;
                totalHeight += Q_HEADER_HEIGHT;

                let answerHeight = 0;
                let drawingData = '';
                let textData = '';

                // Parse the answer
                const hasDrawing = q.answer.includes('[DRAWING]:');
                if (hasDrawing) {
                    const parts = q.answer.split('|||[TEXT]:');
                    drawingData = parts[0].replace('[DRAWING]:', '');
                    textData = parts.length > 1 ? parts[1] : '';
                } else {
                    textData = q.answer;
                }

                // Drawing height - will be recalculated after loading actual images
                if (drawingData) {
                    answerHeight += 400; // Generous estimate, will be recalculated
                }
                // Text answer height
                if (textData && textData.trim()) {
                    const lines = Math.ceil(textData.length / 70) + textData.split('\n').length;
                    answerHeight += Math.max(50, lines * TEXT_LINE_HEIGHT + TEXT_PADDING * 2);
                }

                if (!drawingData && !textData.trim()) {
                    answerHeight = 50; // "No answer" placeholder
                }

                const answerY = totalHeight;
                totalHeight += answerHeight + PADDING;

                questionLayouts.push({
                    qIndex: i,
                    headerY,
                    answerY,
                    answerHeight,
                    isDrawing: hasDrawing,
                    textData,
                    drawingData,
                    questionText: q.questionText,
                    marks: q.marks
                });
            }

            totalHeight += PADDING; // bottom padding

            // Set canvas size — use generous height to prevent ANY clipping during drawing
            // The final canvas will be trimmed to actual content height
            canvas.width = CANVAS_WIDTH;
            canvas.height = Math.max(totalHeight * 2, 5000); // Very generous to prevent clipping

            // Fill white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Title header
            ctx.fillStyle = '#1e40af';
            ctx.fillRect(0, 0, CANVAS_WIDTH, 50);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(`📝 ${result.quiz_title || 'Exam'} — ${result.student_name || 'Student'}`, PADDING, 25);
            // NOTE: Do NOT reset totalHeight here — we'll use the dynamically calculated currentY
            // totalHeight is now only used as a minimum estimate

            // ── Step 2: Draw each question + answer ──
            // Load all drawing images first
            const drawingImages: Record<number, HTMLImageElement> = {};
            await Promise.all(questionLayouts.map(async (layout) => {
                if (layout.drawingData) {
                    try {
                        const img = await new Promise<HTMLImageElement>((resolve) => {
                            const i = new Image();
                            i.crossOrigin = 'Anonymous';
                            i.onload = () => resolve(i);
                            i.onerror = () => resolve(new Image());
                            i.src = layout.drawingData;
                        });
                        if (img.width > 0) drawingImages[layout.qIndex] = img;
                    } catch { /* skip failed images */ }
                }
            }));

            // Now recalculate with actual image heights and draw
            let currentY = 50; // After title

            for (const layout of questionLayouts) {
                // ── Question Header ──
                ctx.fillStyle = '#f0f4ff';
                ctx.fillRect(0, currentY, CANVAS_WIDTH, Q_HEADER_HEIGHT);
                // Border
                ctx.strokeStyle = '#bfdbfe';
                ctx.lineWidth = 1;
                ctx.strokeRect(0, currentY, CANVAS_WIDTH, Q_HEADER_HEIGHT);

                ctx.fillStyle = '#1e40af';
                ctx.font = 'bold 14px Arial, sans-serif';
                ctx.textBaseline = 'top';
                ctx.fillText(`Q${layout.qIndex + 1}. (${layout.marks} marks)`, PADDING, currentY + 10);

                ctx.fillStyle = '#1f2937';
                ctx.font = '13px Arial, sans-serif';
                // Wrap question text
                const qText = layout.questionText || 'Question';
                const maxTextWidth = CANVAS_WIDTH - PADDING * 2;
                const words = qText.split(' ');
                let line = '';
                let lineY = currentY + 32;
                for (const word of words) {
                    const testLine = line + word + ' ';
                    if (ctx.measureText(testLine).width > maxTextWidth && line.length > 0) {
                        ctx.fillText(line.trim(), PADDING, lineY);
                        lineY += 16;
                        line = word + ' ';
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line.trim(), PADDING, lineY);

                currentY += Q_HEADER_HEIGHT;

                // ── Student's Answer ──
                // Label
                ctx.fillStyle = '#6b7280';
                ctx.font = 'italic 11px Arial, sans-serif';
                ctx.fillText(layout.isDrawing ? '✏️ Handwritten Answer:' : '⌨️ Typed Answer:', PADDING, currentY + 8);
                currentY += 22;

                // Drawing answer
                if (drawingImages[layout.qIndex]) {
                    const img = drawingImages[layout.qIndex];
                    const imgWidth = Math.min(CANVAS_WIDTH - PADDING * 2, img.width);
                    const imgHeight = (img.height / img.width) * imgWidth;
                    const drawHeight = imgHeight; // Don't clip — draw full image height to prevent cropping

                    ctx.drawImage(img, PADDING, currentY, imgWidth, drawHeight);
                    currentY += drawHeight + 10;
                }

                // Typed answer text
                if (layout.textData && layout.textData.trim()) {
                    ctx.fillStyle = '#f9fafb';
                    const textBlockHeight = Math.max(40, Math.ceil(layout.textData.length / 70) * TEXT_LINE_HEIGHT + TEXT_PADDING);
                    ctx.fillRect(PADDING, currentY, CANVAS_WIDTH - PADDING * 2, textBlockHeight);
                    ctx.strokeStyle = '#e5e7eb';
                    ctx.strokeRect(PADDING, currentY, CANVAS_WIDTH - PADDING * 2, textBlockHeight);

                    ctx.fillStyle = '#374151';
                    ctx.font = '13px Arial, sans-serif';

                    // Word wrap the answer text
                    const ansWords = layout.textData.split(/\s+/);
                    let ansLine = '';
                    let ansY = currentY + 14;
                    for (const word of ansWords) {
                        const testLine = ansLine + word + ' ';
                        if (ctx.measureText(testLine).width > maxTextWidth - TEXT_PADDING * 2 && ansLine.length > 0) {
                            ctx.fillText(ansLine.trim(), PADDING + TEXT_PADDING, ansY);
                            ansY += TEXT_LINE_HEIGHT;
                            ansLine = word + ' ';
                        } else {
                            ansLine = testLine;
                        }
                    }
                    ctx.fillText(ansLine.trim(), PADDING + TEXT_PADDING, ansY);

                    currentY += textBlockHeight + 10;
                }

                // No answer placeholder
                if (!drawingImages[layout.qIndex] && (!layout.textData || !layout.textData.trim())) {
                    ctx.fillStyle = '#fef3c7';
                    ctx.fillRect(PADDING, currentY, CANVAS_WIDTH - PADDING * 2, 30);
                    ctx.fillStyle = '#92400e';
                    ctx.font = 'italic 12px Arial, sans-serif';
                    ctx.fillText('⚠️ No answer provided', PADDING + 10, currentY + 18);
                    currentY += 40;
                }

                // Divider
                ctx.strokeStyle = '#d1d5db';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PADDING, currentY + 5);
                ctx.lineTo(CANVAS_WIDTH - PADDING, currentY + 5);
                ctx.stroke();
                currentY += 15;
            }

            // Resize canvas to ACTUAL content height (currentY may exceed original totalHeight)
            const actualHeight = currentY + PADDING + 30; // Extra 30px safety margin
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = CANVAS_WIDTH;
            finalCanvas.height = actualHeight;
            const finalCtx = finalCanvas.getContext('2d');
            if (finalCtx) {
                // If actualHeight > canvas.height, we need to redraw on a bigger canvas
                if (actualHeight > canvas.height) {
                    // Canvas was too small — need to redraw everything
                    const bigCanvas = document.createElement('canvas');
                    bigCanvas.width = CANVAS_WIDTH;
                    bigCanvas.height = actualHeight;
                    const bigCtx = bigCanvas.getContext('2d');
                    if (bigCtx) {
                        // Copy what we drew so far (may be partially clipped but the content up to canvas.height is there)
                        bigCtx.fillStyle = '#ffffff';
                        bigCtx.fillRect(0, 0, CANVAS_WIDTH, actualHeight);
                        bigCtx.drawImage(canvas, 0, 0);
                    }
                    finalCtx.drawImage(bigCanvas, 0, 0);
                } else {
                    finalCtx.drawImage(canvas, 0, 0);
                }
            }

            // ── Step 3: Compress and convert to blob ──
            const rawBlob = await new Promise<Blob | null>(resolve =>
                finalCanvas.toBlob(resolve, 'image/jpeg', 0.85)
            );
            if (!rawBlob) throw new Error('Blob creation failed');

            // Compress the image further
            const compressedBlob = await compressImage(rawBlob, 1200, 0.75);
            console.log(`📦 Image compressed: ${(rawBlob.size / 1024).toFixed(0)}KB → ${(compressedBlob.size / 1024).toFixed(0)}KB`);

            const base64 = finalCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];

            // Store preview for "View Combined Sheet"
            setCombinedSheetPreview(prev => ({
                ...prev,
                [result.id]: finalCanvas.toDataURL('image/jpeg', 0.85)
            }));

            // ── Step 4: Upload compressed image to Cloudinary ──
            console.log('🚀 Uploading combined answer sheet to Cloudinary...');
            const uploadUrl = await cloudinaryService.uploadFile(compressedBlob, 'combined_answers');
            console.log('✅ Upload Success!', uploadUrl);

            // ── Step 5: AI Grade the combined image with PER-QUESTION feedback ──
            console.log('🤖 AI analyzing combined answer sheet with per-question grading...');

            // Build context showing all questions and their marks
            const questionsContext = questions.map((q, i) => {
                const hasText = q.answer && !q.answer.includes('[DRAWING]:') || q.answer.includes('|||[TEXT]:');
                const hasDraw = q.answer.includes('[DRAWING]:');
                return `Q${i + 1} (${q.marks} marks): ${q.questionText} [Answer type: ${hasDraw ? 'Handwritten' : ''}${hasText && hasDraw ? ' + ' : ''}${hasText ? 'Typed text' : ''}]`;
            }).join('\n');

            const rubric = [
                { criteria: "Correctness & Accuracy", weight: 40 },
                { criteria: "Steps / Working Shown", weight: 30 },
                { criteria: "Clarity & Presentation", weight: 30 }
            ];

            const gradeResult = await gradeImageAnswerWithRubric(
                `You're grading "${result.quiz_title}" for a student. Be their helpful buddy, not a scary examiner! 🎓

Look at this COMPLETE answer sheet image carefully. It has QUESTIONS and ANSWERS together.

For EACH question, your feedback MUST follow this EXACT structure using Markdown:
**📸 WHAT I SEE:** Describe exactly what the student wrote/drew in the image (handwriting, typed text, diagrams, doodles — everything!)
**❓ WHAT WAS ASKED:** Explain the question in super simple words
**✏️ WHAT THEY DID:** Explain the student's approach and what they tried to answer
**✅ CORRECT ANSWER:** Give the right answer in 1-2 short, clear sentences
**💬 BUDDY FEEDBACK:** Friendly, encouraging feedback with emojis — like a friend who wants them to win!

Use **bold** for important keywords and bullet points for lists.

QUESTIONS IN THIS EXAM:
${questionsContext}

RULES:
- Look for BOTH typed text AND handwritten content in the image
- Each question has marks shown in the blue header
- Total marks: ${result.total_marks}
- In your breakdown array, include ONE entry per question
- Each breakdown entry: { "criteria": "Q1", "score": marks_awarded, "maxScore": question_total_marks, "feedback": "📸 I see... ❓ This asked... ✏️ You tried... ✅ Answer is... 💬 Great job / Here's a tip..." }
- Use SIMPLE words — no big academic jargon!
- Be concise but helpful
- The overallFeedback should be a warm, 2-3 sentence summary like a supportive friend would say`,
                base64,
                rubric,
                result.total_marks
            );

            // ── Step 6: Map AI per-question feedback back into submissionDetails ──
            // The AI breakdown now has one entry per question (Q1, Q2, etc.)
            if (gradeResult.breakdown && gradeResult.breakdown.length > 0) {
                setSubmissionDetails(prev => {
                    const currentQuestions = prev[result.id] || [];
                    const updatedQuestions = currentQuestions.map((q, idx) => {
                        // Try to match by index or by Q-label in criteria
                        const aiEntry = gradeResult.breakdown[idx] ||
                            gradeResult.breakdown.find((b: any) =>
                                b.criteria?.toLowerCase().includes(`q${idx + 1}`) ||
                                b.criteria?.toLowerCase().includes(`question ${idx + 1}`)
                            );

                        if (aiEntry) {
                            return {
                                ...q,
                                // Only update marks if teacher hasn't manually set them
                                allocatedMarks: q.allocatedMarks > 0 ? q.allocatedMarks : Math.min(q.marks, aiEntry.score || 0),
                                // Always update suggestion with AI feedback
                                suggestion: aiEntry.feedback || q.suggestion || ''
                            };
                        }
                        return q;
                    });
                    return { ...prev, [result.id]: updatedQuestions };
                });
                console.log(`✅ AI per-question feedback mapped to ${gradeResult.breakdown.length} questions`);
            }

            // ── Step 7: Update AI grading state ──
            setAiGrading(prev => ({
                ...prev,
                [result.id]: {
                    ...gradeResult,
                    combinedUrl: uploadUrl,
                    // Store per-question breakdown for display
                    questionBreakdown: questions.map((q, idx) => {
                        const aiEntry = gradeResult.breakdown?.[idx];
                        return {
                            questionNumber: idx + 1,
                            questionText: q.questionText,
                            marksAwarded: aiEntry?.score ?? q.allocatedMarks,
                            totalMarks: q.marks,
                            feedback: aiEntry?.feedback || ''
                        };
                    })
                }
            }));

            let studentAdaptiveQuizzes: any[] = [];
            try {
                const { data: recData } = await supabase
                    .from('student_adaptive_quizzes')
                    .select('*')
                    .eq('student_id', result.student_id);
                studentAdaptiveQuizzes = recData || [];
            } catch (err) {
                console.error('Failed to load student adaptive quizzes for feedback generation:', err);
            }

            // Auto-fill personalized feedback using per-question results and adaptive quiz history
            const feedback = await generatePersonalizedFeedback(
                result.student_name,
                questions.map((q, i) => {
                    const aiEntry = gradeResult.breakdown?.[i];
                    const awarded = aiEntry?.score ?? q.allocatedMarks;
                    return {
                        question: q.questionText,
                        correct: awarded >= q.marks * 0.5,
                        answer: q.answer.replace(/\[DRAWING\]:.*?(\|\|\||$)/, '[Drawing]')
                    };
                }),
                studentAdaptiveQuizzes
            );

            setCustomFeedback(prev => ({
                ...prev,
                [result.id]: feedback
            }));

        } catch (error) {
            console.error('Error combining and grading:', error);
            alert('Failed to combine and grade. See console for details.');
        } finally {
            setCombiningId(null);
        }
    };


    const handleApproveGrade = async (resultId: string, grade: string) => {
        const feedback = customFeedback[resultId] || '';
        const fullFeedback = feedback;

        const result = pendingResults.find(r => r.id === resultId);
        const questions = submissionDetails[resultId] || [];
        
        // Build question feedback — include AI suggestion OR a default message
        const aiBreakdown = aiGrading[resultId]?.breakdown || [];

        const questionFeedback: QuestionFeedback[] = questions.map((q, index) => {
            // 1. Try teacher/saved suggestion
            let suggestion = q.suggestion;

            // 2. If empty, try to find matching AI feedback from current session
            if (!suggestion || !suggestion.trim()) {
                const aiEntry = aiBreakdown[index] || aiBreakdown.find((b: any) =>
                    b.criteria?.toLowerCase().includes(`q${index + 1}`) ||
                    b.criteria?.toLowerCase().includes(`question ${index + 1}`)
                );
                if (aiEntry) suggestion = aiEntry.feedback;
            }

            // 3. Last resort: Default message based on score
            const qFeedback = (suggestion && suggestion.trim())
                ? suggestion.trim()
                : (q.allocatedMarks >= q.marks
                    ? 'Excellent work on this question!'
                    : q.allocatedMarks >= q.marks * 0.5
                        ? 'Good attempt. Review the key concepts for improvement.'
                        : 'This question needs more attention. Please revisit the topic.');

            return {
                questionNumber: index + 1,
                questionText: q.questionText || `Question ${index + 1}`,
                marksAwarded: q.allocatedMarks,
                totalMarks: q.marks,
                feedback: qFeedback,
                feedbackImage: q.feedbackImageUrl || ''
            };
        });

        const totalScore = questions.length > 0
            ? questions.reduce((sum, q) => sum + q.allocatedMarks, 0)
            : (aiGrading[resultId]?.score ?? result?.score ?? 0);

        const success = await approveGrade(resultId, grade, totalScore, fullFeedback, questionFeedback);

        if (success) {
            if (result) {
                // SAVE PER-QUESTION FEEDBACK TO SUPABASE AND FIREBASE
                // This ensures feedback persists in 'student_answers' for the Published tab 
                // and gets sent to the student correctly.
                for (const q of questions) {
                    await saveQuestionFeedback(
                        resultId,
                        q.questionId,
                        q.suggestion || '',
                        q.feedbackImageUrl,
                        q.allocatedMarks
                    );
                }

                // Get answer sheet URL if available
                const answerSheetUrl = aiGrading[resultId]?.combinedUrl || combinedSheetPreview[resultId] || null;

                // SAVE TO FIREBASE (Detailed Per-Student Feedback)
                try {
                    const { firestoreService } = await import('../../lib/firebaseService');
                    await firestoreService.saveStudentFeedback(result.student_id, {
                        examId: result.assessment_id || result.id || '',
                        examTitle: result.quiz_title || '',
                        score: totalScore ?? 0,
                        totalMarks: result.total_marks ?? 0,
                        grade: grade || '',
                        teacherFeedback: fullFeedback || '',
                        questionBreakdown: questionFeedback || [],
                        answerSheetUrl: answerSheetUrl || '',
                        type: 'exam_feedback'
                    });
                    console.log(`🔥 Detailed feedback saved to Firebase for ${result.student_name}`);
                } catch (fbError) {
                    console.error('Failed to save to Firebase:', fbError);
                }


                // Send notification to student
                try {
                    // Detect weak concepts: Scored < 60% of marks for any question
                    const weakConcepts = questionFeedback
                        .filter((q: any) => (q.marksAwarded / q.totalMarks) < 0.6)
                        .map((q: any) => q.questionText);

                    sendGradeReportNotification(
                        result.student_id,
                        result.student_name,
                        result.quiz_title,
                        totalScore,
                        result.total_marks,
                        grade,
                        fullFeedback,
                        questionFeedback,
                        answerSheetUrl || undefined,
                        weakConcepts, // Pass weak concepts so they show in the notification message
                        result.subject_code
                    );
                    console.log(`✅ Notification sent to student ${result.student_name} for ${result.quiz_title}`);
                    console.log(`📋 Question feedback included: ${questionFeedback.length} questions`);

                    if (weakConcepts.length > 0) {
                        const { createAdaptiveQuizRecommendation } = await import('../../lib/adaptiveQuizService');
                        await createAdaptiveQuizRecommendation(
                            result.student_id,
                            result.assessment_id || result.id || '',
                            result.quiz_title || 'Exam',
                            result.subject_code || 'MATH',
                            weakConcepts
                        );
                        console.log(`🎯 Adaptive practice quiz generated for student ${result.student_name} on weak topics:`, weakConcepts);
                    }
                } catch (notifError) {
                    console.error('Failed to send notification or generate adaptive recommendation:', notifError);
                }
            }

            setPendingResults(prev => prev.filter(r => r.id !== resultId));
            setAiGrading(prev => {
                const newState = { ...prev };
                delete newState[resultId];
                return newState;
            });
        }
    };

    // Update marks for a specific question
    const updateQuestionMarks = (resultId: string, questionId: string, newMarks: number) => {
        setSubmissionDetails(prev => {
            const questions = prev[resultId] || [];
            return {
                ...prev,
                [resultId]: questions.map(q =>
                    q.questionId === questionId
                        ? { ...q, allocatedMarks: Math.max(0, Math.min(q.marks, newMarks)) }
                        : q
                )
            };
        });
    };

    // Update suggestion for a specific question
    const updateQuestionSuggestion = (resultId: string, questionId: string, suggestion: string) => {
        setSubmissionDetails(prev => {
            const questions = prev[resultId] || [];
            return {
                ...prev,
                [resultId]: questions.map(q =>
                    q.questionId === questionId
                        ? { ...q, suggestion }
                        : q
                )
            };
        });

    };

    const handleGenerateFeedbackImage = async (resultId: string, questionId: string, prompt: string) => {
        if (!prompt || !prompt.trim()) return;
        setGeneratingImageFor(questionId);
        try {
            const imageUrl = await generateImageForQuestion(prompt);
            if (imageUrl) {
                setSubmissionDetails(prev => {
                    const questions = prev[resultId] || [];
                    return {
                        ...prev,
                        [resultId]: questions.map(q =>
                            q.questionId === questionId
                                ? { ...q, feedbackImageUrl: imageUrl }
                                : q
                        )
                    };
                });
            }
        } catch (e) {
            console.error('Error generating feedback image:', e);
        } finally {
            setGeneratingImageFor(null);
        }
    };

    const clearFeedbackImage = (resultId: string, questionId: string) => {
        setSubmissionDetails(prev => {
            const questions = prev[resultId] || [];
            return {
                ...prev,
                [resultId]: questions.map(q =>
                    q.questionId === questionId
                        ? { ...q, feedbackImageUrl: undefined }
                        : q
                )
            };
        });
    };

    // Calculate total allocated marks
    const getTotalAllocatedMarks = (resultId: string) => {
        const questions = submissionDetails[resultId] || [];
        return questions.reduce((sum, q) => sum + q.allocatedMarks, 0);
    };

    const calculateGrade = (score: number, total: number): string => {
        const percentage = (score / total) * 100;
        if (percentage >= 90) return 'A+';
        if (percentage >= 80) return 'A';
        if (percentage >= 70) return 'B+';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C';
        if (percentage >= 40) return 'D';
        return 'F';
    };

    const getGradeColor = (grade: string): string => {
        if (grade.startsWith('A')) return 'bg-green-100 text-green-800';
        if (grade.startsWith('B')) return 'bg-blue-100 text-blue-800';
        if (grade.startsWith('C')) return 'bg-yellow-100 text-yellow-800';
        if (grade.startsWith('D')) return 'bg-orange-100 text-orange-800';
        return 'bg-red-100 text-red-800';
    };

    // Render student answer (text or drawing or both) - REDESIGNED
    const renderAnswer = (answer: string) => {
        if (!answer) return (
            <div className="p-6 bg-gray-50 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                <div className="bg-white p-3 rounded-full mb-3 shadow-sm">
                    <Minus className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">No answer provided by student</p>
            </div>
        );

        const hasDrawing = answer.includes('[DRAWING]:');
        const parts = answer.split('|||[TEXT]:');

        let drawingData = '';
        let textData = '';

        if (hasDrawing) {
            if (parts.length > 1) {
                drawingData = parts[0].replace('[DRAWING]:', '');
                textData = parts[1];
            } else {
                drawingData = answer.replace('[DRAWING]:', '');
            }
        } else {
            textData = answer;
        }

        return (
            <div className="space-y-6 mt-4">
                {drawingData && (
                    <div className="relative group">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 ring-4 ring-blue-50">
                                <ImageIcon className="w-4 h-4" />
                            </span>
                            <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Handwritten Submission</span>
                        </div>
                        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white transition-transform duration-300 group-hover:scale-[1.01] group-hover:shadow-lg">
                            <img
                                src={drawingData}
                                alt="Student's handwritten answer"
                                className="w-full h-auto object-contain bg-gray-50/50"
                            />
                        </div>
                    </div>
                )}

                {textData && textData.trim() && (
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 ring-4 ring-purple-50">
                                <Keyboard className="w-4 h-4" />
                            </span>
                            <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Typed Answer</span>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-400 to-indigo-500" />
                            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed font-serif text-lg">{textData}</p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 space-y-8 font-sans text-slate-900">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                            <Award className="w-6 h-6" />
                        </div>
                        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
                            Grading Center
                        </h2>
                    </div>
                    <p className="text-slate-500 font-medium pl-14">
                        {activeTab === 'pending' ? (
                            <>
                                <strong className="text-blue-600">{pendingResults.length}</strong> submissions waiting for your review
                            </>
                        ) : (
                            <>
                                <strong className="text-blue-600">{publishedResults.length}</strong> published answer sheets
                            </>
                        )}
                    </p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Pending Review ({pendingResults.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('published')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'published' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Published ({publishedResults.length})
                    </button>
                </div>
                <button
                    onClick={loadResults}
                    className="group flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-95"
                >
                    <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                    <span>Refresh List</span>
                </button>
            </div>

            {/* AI Assistant Banner */}
            <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl p-8 shadow-xl shadow-indigo-200 text-white">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-purple-500/20 rounded-full blur-2xl"></div>

                <div className="relative z-10 flex items-start gap-6">
                    <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/10">
                        <Sparkles className="w-8 h-8 text-yellow-300" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold mb-2 text-white">AI Grading Assistant Active</h3>
                        <p className="text-indigo-100 max-w-2xl leading-relaxed">
                            Your AI copilot is ready to analyze answers. Use the <strong className="text-white border-b border-white/30">Combine & AI Grade</strong> feature to process entire answer sheets instantly with detailed feedback generation.
                        </p>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                    </div>
                    <p className="text-slate-400 font-medium animate-pulse">Loading submissions...</p>
                </div>
            ) : (activeTab === 'pending' ? pendingResults : publishedResults).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-200 text-center">
                    <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle className="w-12 h-12 text-green-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">All Caught Up!</h3>
                    <p className="text-slate-500 max-w-md mx-auto">
                        {activeTab === 'pending' ? 'Great job! There are no pending submissions to grade right now.' : 'No published grades found yet.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {(activeTab === 'pending' ? pendingResults : publishedResults).map((result) => (
                        <div
                            key={result.id}
                            className={`group bg-white rounded-3xl border transition-all duration-300 overflow-hidden ${viewingSubmission === result.id
                                ? 'border-blue-500 shadow-2xl ring-4 ring-blue-50/50 scale-[1.005]'
                                : 'border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200'
                                }`}
                        >
                            {/* Card Header / Summary Row */}
                            <div
                                className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer"
                                onClick={() => toggleExpand(result.id)}
                            >
                                <div className="flex items-center gap-5">
                                    <div className="relative">
                                        <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                                            {result.student_name?.charAt(0)}
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 bg-white p-1 rounded-full">
                                            <div className={`w-4 h-4 rounded-full border-2 border-white ${getTotalAllocatedMarks(result.id) >= result.total_marks * 0.6 ? 'bg-green-500' : 'bg-amber-500'}`} />
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                            {result.student_name}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-1 text-slate-500 text-sm font-medium">
                                            <FileText className="w-4 h-4" />
                                            <span>{result.quiz_title}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300 mx-1" />
                                            <Clock className="w-4 h-4" />
                                            <span>{new Date(result.submitted_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 pl-4 md:pl-0 border-l md:border-l-0 border-slate-100">
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Score</div>
                                        <div className="flex items-baseline gap-1 justify-end">
                                            <span className={`text-3xl font-black ${getTotalAllocatedMarks(result.id) >= result.total_marks * 0.6 ? 'text-green-600' : 'text-amber-600'}`}>
                                                {getTotalAllocatedMarks(result.id)}
                                            </span>
                                            <span className="text-slate-400 font-bold">/{result.total_marks}</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingSubmission(viewingSubmission === result.id ? null : result.id);
                                            }}
                                            className={`px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 ${viewingSubmission === result.id
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                }`}
                                        >
                                            {viewingSubmission === result.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            {viewingSubmission === result.id ? 'Close View' : (activeTab === 'pending' ? 'Grade Submission' : 'View Feedback')}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* GRADING WORKSPACE (Expanded) */}
                            {viewingSubmission === result.id && submissionDetails[result.id] && (
                                <div className="border-t border-slate-100 bg-slate-50/50 animate-in slide-in-from-top-4 duration-500">
                                    {/* Toolbar */}
                                    <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
                                        <div className="flex items-center gap-2">
                                            {activeTab === 'pending' && <span className="flex w-3 h-3 rounded-full bg-red-500 animate-pulse" />}
                                            <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">{activeTab === 'pending' ? 'Live Grading Mode' : 'Graded View'}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm text-slate-600 font-medium">
                                                Total Score: <span className="text-slate-900 font-bold text-lg ml-1">{getTotalAllocatedMarks(result.id)}</span>
                                                <span className="text-slate-400"> / {result.total_marks}</span>
                                            </div>
                                            <div className={`px-3 py-1 rounded-lg text-sm font-black border ${getGradeColor(calculateGrade(getTotalAllocatedMarks(result.id), result.total_marks))}`}>
                                                Grade: {calculateGrade(getTotalAllocatedMarks(result.id), result.total_marks)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 md:p-8 space-y-8">

                                        {/* AI Grading Results Panel */}
                                        {aiGrading[result.id] && (
                                            <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-purple-100 shadow-xl overflow-hidden mb-8">
                                                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-1"></div>
                                                <div className="p-6">
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                                                            <Sparkles className="w-5 h-5" />
                                                        </div>
                                                        <h5 className="text-lg font-bold text-slate-800">AI Analysis & Suggestions</h5>
                                                        {aiGrading[result.id].confidence < 0.75 && (
                                                            <span className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold uppercase tracking-wide">
                                                                <AlertTriangle className="w-3 h-3" /> Low Confidence
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* AI Question Breakdown Grid */}
                                                    {aiGrading[result.id].questionBreakdown && aiGrading[result.id].questionBreakdown.length > 0 && (
                                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                            {aiGrading[result.id].questionBreakdown.map((qb: any, index: number) => (
                                                                <div key={index} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm hover:border-purple-200 transition-colors">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <span className="text-xs font-bold text-slate-400 uppercase">Q{qb.questionNumber}</span>
                                                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${qb.marksAwarded >= qb.totalMarks * 0.8 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                            {qb.marksAwarded}
                                                                        </span>
                                                                    </div>
                                                                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-purple-500" style={{ width: `${(qb.marksAwarded / qb.totalMarks) * 100}%` }}></div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}


                                        {/* Questions List */}
                                        <div className="space-y-12">
                                            {(!submissionDetails[result.id] || submissionDetails[result.id].length === 0) && (
                                                <div className="p-8 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400">
                                                    No answer data available.
                                                </div>
                                            )}

                                            {submissionDetails[result.id]?.map((question, qIndex) => (
                                                <div key={question.questionId} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden ring-1 ring-slate-100">
                                                    {/* Question Header */}
                                                    <div className="bg-slate-50/80 border-b border-slate-200 p-6 flex items-start gap-4">
                                                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-500 shadow-sm">
                                                            {qIndex + 1}
                                                        </div>
                                                        <div className="flex-1 pt-1">
                                                            <h5 className="text-lg font-medium text-slate-900 leading-snug">{question.questionText}</h5>
                                                        </div>
                                                        <div className="flex-shrink-0 px-4 py-1.5 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-600 shadow-sm">
                                                            {question.marks} Marks
                                                        </div>
                                                    </div>

                                                    {/* Answer & Grading Split */}
                                                    <div className="flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-slate-100">
                                                        {/* LEFT: Student Answer */}
                                                        <div className="flex-1 p-6 md:p-8 bg-white">
                                                            <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Student Response</h6>
                                                            {renderAnswer(question.answer)}
                                                        </div>

                                                        {/* RIGHT: Grading Controls */}
                                                        <div className="w-full xl:w-[450px] bg-slate-50/30 p-6 md:p-8 flex flex-col gap-6">
                                                            {/* Score Control */}
                                                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                                                                    <Award className="w-4 h-4 text-orange-500" />
                                                                    Award Marks
                                                                </label>

                                                                <div className="flex items-center justify-between gap-4">
                                                                    <button
                                                                        onClick={() => updateQuestionMarks(result.id, question.questionId, question.allocatedMarks - 0.5)}
                                                                        disabled={activeTab !== 'pending'}
                                                                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                                                    >
                                                                        <Minus className="w-5 h-5" />
                                                                    </button>

                                                                    <div className="flex-1 text-center">
                                                                        <input
                                                                            type="number"
                                                                            value={question.allocatedMarks}
                                                                            onChange={(e) => updateQuestionMarks(result.id, question.questionId, parseFloat(e.target.value) || 0)}
                                                                            disabled={activeTab !== 'pending'}
                                                                            className="w-20 text-center text-3xl font-black text-slate-800 bg-transparent outline-none p-0 disabled:opacity-70"
                                                                            step="0.5"
                                                                            min="0"
                                                                            max={question.marks}
                                                                        />
                                                                        <div className="text-xs font-bold text-slate-400">OUT OF {question.marks}</div>
                                                                    </div>

                                                                    <button
                                                                        onClick={() => updateQuestionMarks(result.id, question.questionId, question.allocatedMarks + 0.5)}
                                                                        disabled={activeTab !== 'pending'}
                                                                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-green-50 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                                                    >
                                                                        <Plus className="w-5 h-5" />
                                                                    </button>
                                                                </div>

                                                                {/* Quick Presets */}
                                                                {activeTab === 'pending' && (
                                                                    <div className="grid grid-cols-3 gap-2 mt-4">
                                                                        <button onClick={() => updateQuestionMarks(result.id, question.questionId, 0)} className="py-1.5 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg">Zero</button>
                                                                        <button onClick={() => updateQuestionMarks(result.id, question.questionId, question.marks * 0.5)} className="py-1.5 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg">Half</button>
                                                                        <button onClick={() => updateQuestionMarks(result.id, question.questionId, question.marks)} className="py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">Full</button>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Feedback Control */}
                                                            <div className="flex-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
                                                                    <MessageSquare className="w-4 h-4 text-purple-500" />
                                                                    {activeTab === 'pending' ? 'Feedback' : 'Dispatched Feedback'}
                                                                </label>
                                                                {activeTab === 'pending' ? (
                                                                    <textarea
                                                                        value={question.suggestion}
                                                                        onChange={(e) => updateQuestionSuggestion(result.id, question.questionId, e.target.value)}
                                                                        placeholder="Write constructive feedback here..."
                                                                        className="flex-1 w-full min-h-[120px] bg-slate-50 border-0 rounded-xl p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all resize-vertical"
                                                                    />
                                                                ) : (
                                                                    <div className="flex-1 w-full bg-slate-50/80 border border-slate-100 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                                                                        <MarkdownRenderer content={question.suggestion || '*No feedback provided*'} />
                                                                    </div>
                                                                )}

                                                                {/* Compact Notification Status / Delivery Badge */}
                                                                {activeTab === 'pending' ? (
                                                                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-indigo-600 font-semibold bg-indigo-50/40 p-2.5 rounded-lg border border-indigo-100/30">
                                                                        <Bell className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                                                                        <span>Student will receive {question.allocatedMarks} / {question.marks} Marks & this feedback.</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-emerald-600 font-semibold bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-100/30">
                                                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                                        <span>Dispatched with {question.allocatedMarks} / {question.marks} Marks.</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Generated Feedback Image Area */}
                                                            <div className="mt-3">
                                                                {/* 1. Processing State */}
                                                                {generatingImageFor === question.questionId && (
                                                                    <div className="w-full h-48 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden relative">
                                                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                                                            <div className="relative">
                                                                                <div className="w-12 h-12 rounded-full border-4 border-purple-100 border-t-purple-500 animate-spin"></div>
                                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                                    <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-center">
                                                                                <p className="text-sm font-bold text-slate-700">Visualizing Concept...</p>
                                                                                <p className="text-xs text-slate-400">AI is creating a diagram</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 2. Result State */}
                                                                {!generatingImageFor && question.feedbackImageUrl && (
                                                                    <div className="relative group animate-in fade-in zoom-in-95 duration-500">
                                                                        <div className="overflow-hidden rounded-xl border-2 border-slate-100 shadow-md bg-white">
                                                                            <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex items-center justify-between">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <div className="p-1 bg-purple-100 rounded text-purple-600">
                                                                                        <ImageIcon className="w-3 h-3" />
                                                                                    </div>
                                                                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Visual Aid</span>
                                                                                </div>
                                                                            </div>
                                                                            <img
                                                                                src={question.feedbackImageUrl}
                                                                                alt="Feedback Visual"
                                                                                className="w-full h-auto max-h-64 object-contain bg-grid-slate-50"
                                                                            />
                                                                        </div>

                                                                        <button
                                                                            onClick={() => clearFeedbackImage(result.id, question.questionId)}
                                                                            className="absolute top-12 right-2 p-2 bg-white/90 backdrop-blur text-red-500 rounded-lg shadow-sm border border-red-100 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:scale-105"
                                                                            title="Remove Image"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {/* 3. Empty/Idle State Button */}
                                                                {activeTab === 'pending' && !question.feedbackImageUrl && !generatingImageFor && (
                                                                    <div className="mt-2 flex justify-end">
                                                                        <button
                                                                            onClick={() => handleGenerateFeedbackImage(result.id, question.questionId, question.suggestion || `Diagram for ${question.questionText}`)}
                                                                            disabled={!question.suggestion}
                                                                            className="group/btn relative overflow-hidden text-xs font-bold text-slate-600 hover:text-purple-700 flex items-center gap-2 bg-white border border-slate-200 hover:border-purple-200 pl-3 pr-4 py-2 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        >
                                                                            <div className="absolute inset-0 bg-gradient-to-r from-purple-50 to-indigo-50 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                                                                            <div className="relative flex items-center gap-2">
                                                                                <div className="p-1 bg-slate-100 group-hover/btn:bg-white rounded-lg transition-colors">
                                                                                    <ImagePlus className="w-3 h-3 text-slate-500 group-hover/btn:text-purple-500" />
                                                                                </div>
                                                                                <span>Generate Visual Aid</span>
                                                                            </div>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Bottom Action Bar */}
                                        {activeTab === 'pending' && (
                                            <div className="mt-12 sticky bottom-4 z-20">
                                                <div className="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl shadow-slate-400/50 flex flex-col md:flex-row items-center justify-between gap-6 pl-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-3 bg-white/10 rounded-2xl">
                                                            <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${result.student_name}`} alt="" className="w-8 h-8 rounded-lg" />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm text-slate-400 font-medium">Finishing Grading for</div>
                                                            <div className="text-lg font-bold">{result.student_name}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                                        {/* Combine & Grade Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCombineAndGrade(result);
                                                            }}
                                                            disabled={combiningId === result.id}
                                                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all disabled:opacity-50"
                                                        >
                                                            {combiningId === result.id ? (
                                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                            ) : (
                                                                <Sparkles className="w-5 h-5 text-yellow-300" />
                                                            )}
                                                            <span>{combiningId === result.id ? 'Processing...' : 'Auto-Grade with AI'}</span>
                                                        </button>

                                                        {/* Approve Button */}
                                                        <button
                                                            onClick={() => handleApproveGrade(
                                                                result.id,
                                                                calculateGrade(getTotalAllocatedMarks(result.id), result.total_marks)
                                                            )}
                                                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold shadow-lg shadow-green-900/20 transition-all transform active:scale-95"
                                                        >
                                                            <Check className="w-5 h-5" />
                                                            <span>Publish Grade</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}


                                        {/* Overall Comments Section (Optional if needed) */}
                                        <div className="mt-8 bg-white p-6 rounded-3xl border border-slate-200">
                                            <label className="text-sm font-bold text-slate-700 mb-3 block">Overall Final Comments</label>
                                            {activeTab === 'pending' ? (
                                                <textarea
                                                    value={customFeedback[result.id] || ''}
                                                    onChange={(e) => setCustomFeedback(prev => ({ ...prev, [result.id]: e.target.value }))}
                                                    className="w-full bg-slate-50 rounded-xl p-4 border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none"
                                                    rows={3}
                                                    placeholder="Add a final personal note to the student..."
                                                />
                                            ) : (
                                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 italic">
                                                    {result.feedback || customFeedback[result.id] || 'No additional comments provided.'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Notification Dispatched / Delivery Notice */}
                                        {activeTab === 'pending' ? (
                                            <div className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex items-start gap-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm">
                                                    <Bell className="w-5 h-5" />
                                                </div>
                                                <div className="space-y-1">
                                                    <h6 className="text-sm font-bold text-indigo-900">Automated Notification System</h6>
                                                    <p className="text-xs text-indigo-700/80 leading-relaxed">
                                                        Publishing this grade report will automatically dispatch a detailed dashboard notification to <strong>{result.student_name}</strong> containing their overall score ({getTotalAllocatedMarks(result.id)}/{result.total_marks}), grade ({calculateGrade(getTotalAllocatedMarks(result.id), result.total_marks)}), overall comments, and the full question-by-question feedback breakdown.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-6 p-6 rounded-3xl bg-emerald-50/60 border border-emerald-100/80 space-y-4 shadow-sm animate-in fade-in duration-300">
                                                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                                                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                                                    <span>Student Notification Dispatched Successfully</span>
                                                </div>
                                                <p className="text-sm text-slate-600 leading-relaxed">
                                                    A comprehensive grade report has been delivered to <strong>{result.student_name}</strong>'s dashboard. Here is a summary of what was published:
                                                </p>
                                                <div className="bg-white rounded-2xl p-5 border border-emerald-100/50 shadow-sm space-y-3">
                                                    <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 text-sm">
                                                        <span className="font-bold text-slate-500">Assessment Title</span>
                                                        <span className="font-semibold text-slate-900">{result.quiz_title}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 text-sm">
                                                        <span className="font-bold text-slate-500">Final Grade</span>
                                                        <span className="font-black text-emerald-600 text-base">{getTotalAllocatedMarks(result.id)} / {result.total_marks} ({result.grade || calculateGrade(getTotalAllocatedMarks(result.id), result.total_marks)})</span>
                                                    </div>
                                                    <div className="space-y-2 pt-2">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Question-wise Breakdown:</span>
                                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                                            {(submissionDetails[result.id] || []).map((q, idx) => (
                                                                <div key={q.questionId || idx} className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-start justify-between gap-4">
                                                                    <div className="flex-1">
                                                                        <span className="font-bold text-slate-700 block mb-0.5">Q{idx + 1}: {q.questionText}</span>
                                                                        <span className="text-slate-600 italic">"{q.suggestion || 'No question-level feedback provided.'}"</span>
                                                                    </div>
                                                                    <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200/50 whitespace-nowrap">{q.allocatedMarks} / {q.marks} M</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )
            }
        </div >
    );
}
