import { callWithFallback, generateSmartContent } from './gemini';
import {
    saveTeachingMaterial,
    saveGeneratedQuestions,
    saveLearningMethod,
    GeneratedQuestion
} from './questionDb';
import { extractTextFromBase64PDF } from './pdfProcessor';

// ===================================================================
// Content-Based AI Question & Learning Generation
// ===================================================================
// This service generates questions and learning methods ONLY from
// teacher-uploaded materials (notes, books, PDFs).
// NO hardcoded/mock data - everything is Gemini-generated!
// ===================================================================

/**
 * Process uploaded teaching content and generate questions
 * This is the main function called when a teacher uploads material
 */
export const processAndGenerateContent = async (
    teacherId: string,
    contentData: {
        classId: number;
        subject: string;
        title: string;
        type: 'pdf' | 'notes' | 'book';
        textContent: string;
        fileUrl?: string;
    },
    generateConfig: {
        mcqCount: number;
        shortAnswerCount: number;
        longAnswerCount: number;
    }
): Promise<{
    success: boolean;
    materialId?: string;
    questionsGenerated?: number;
    learningMethodGenerated?: boolean;
    error?: string;
}> => {
    try {
        console.log(`🚀 Processing content: ${contentData.title} for Class ${contentData.classId} ${contentData.subject}`);

        // Step 1: Save the teaching material
        const { success: savedMaterial, materialId } = await saveTeachingMaterial(teacherId, {
            classId: contentData.classId,
            subject: contentData.subject,
            title: contentData.title,
            type: contentData.type,
            content: contentData.textContent,
            fileUrl: contentData.fileUrl
        });

        if (!savedMaterial || !materialId) {
            return { success: false, error: 'Failed to save teaching material' };
        }

        // Step 2: Generate questions from the content using Gemini
        const questions = await generateQuestionsFromContent(
            contentData.textContent,
            {
                subject: contentData.subject,
                title: contentData.title,
                mcqCount: generateConfig.mcqCount,
                shortAnswerCount: generateConfig.shortAnswerCount,
                longAnswerCount: generateConfig.longAnswerCount
            }
        );

        if (questions.length > 0) {
            // Step 3: Save generated questions to database
            const questionsWithMeta = questions.map(q => ({
                ...q,
                sourceContentId: materialId,
                sourceContentTitle: contentData.title,
                createdAt: new Date()
            }));

            await saveGeneratedQuestions(teacherId, {
                classId: contentData.classId,
                subject: contentData.subject,
                lessonTitle: contentData.title,
                sourceContentId: materialId,
                questions: questionsWithMeta
            });
        }

        // Step 4: Generate learning method from the content
        const learningMethod = await generateLearningMethodFromContent(
            contentData.textContent,
            contentData.title,
            contentData.subject
        );

        if (learningMethod) {
            await saveLearningMethod(teacherId, {
                classId: contentData.classId,
                subject: contentData.subject,
                lessonTitle: contentData.title,
                sourceContentId: materialId,
                ...learningMethod
            });
        }

        console.log(`✅ Content processed: ${questions.length} questions, learning method: ${!!learningMethod}`);

        return {
            success: true,
            materialId,
            questionsGenerated: questions.length,
            learningMethodGenerated: !!learningMethod
        };
    } catch (error) {
        console.error('Error processing content:', error);
        return { success: false, error: String(error) };
    }
};

/**
 * Generate questions from content text using Gemini
 */
export const generateQuestionsFromContent = async (
    content: string,
    config: {
        subject: string;
        title: string;
        mcqCount: number;
        shortAnswerCount: number;
        longAnswerCount: number;
    }
): Promise<GeneratedQuestion[]> => {
    try {
        const prompt = `
You are an expert educational content creator. Analyze the following lesson/book content and generate assessment questions.

CONTENT FROM: ${config.title}
SUBJECT: ${config.subject}

CONTENT:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

REQUIREMENTS:
- Generate exactly ${config.mcqCount} Multiple Choice Questions (1 mark each)
- Generate exactly ${config.shortAnswerCount} Short Answer Questions (2 marks each)
- Generate exactly ${config.longAnswerCount} Long Answer Questions (5 marks each)

IMPORTANT:
- Questions MUST be based on the provided content only
- Cover different topics/concepts from the content
- Vary difficulty levels (easy, medium, hard)
- Include clear explanations for each answer

FORMAT (Return ONLY valid JSON, no other text):
{
  "questions": [
    {
      "id": "q_1",
      "type": "mcq",
      "question": "Question text based on content",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Why this is correct based on the lesson",
      "difficulty": "easy",
      "bloomsLevel": "remember",
      "marks": 1,
      "topic": "Topic from content"
    },
    {
      "id": "q_2",
      "type": "short_answer",
      "question": "Question text",
      "expectedAnswer": "Model answer",
      "rubric": ["Point 1 (1 mark)", "Point 2 (1 mark)"],
      "explanation": "What makes a good answer",
      "difficulty": "medium",
      "bloomsLevel": "understand",
      "marks": 2,
      "topic": "Topic from content"
    },
    {
      "id": "q_3",
      "type": "long_answer",
      "question": "Question text",
      "expectedAnswer": "Detailed model answer",
      "rubric": ["Introduction (1)", "Main points (2)", "Examples (1)", "Conclusion (1)"],
      "explanation": "Grading criteria",
      "difficulty": "hard",
      "bloomsLevel": "analyze",
      "marks": 5,
      "topic": "Topic from content"
    }
  ]
}
`;

        const text = await generateSmartContent(prompt, { requireJson: true });

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.questions.map((q: any) => ({
                ...q,
                id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
            }));
        }

        console.warn('Could not parse questions from Gemini response');
        return [];
    } catch (error) {
        console.error('Error generating questions:', error);
        return [];
    }
};

/**
 * Generate learning method/study guide from content
 */
export const generateLearningMethodFromContent = async (
    content: string,
    title: string,
    subject: string
): Promise<{
    summary: string;
    keyPoints: string[];
    studyTips: string[];
    practiceExercises: string[];
    estimatedDuration: string;
} | null> => {
    try {
        const prompt = `
You are an expert educational curriculum designer. Create a comprehensive learning guide based on the following content.

LESSON: ${title}
SUBJECT: ${subject}

CONTENT:
${content.substring(0, 6000)} ${content.length > 6000 ? '...[truncated]' : ''}

Create a student-friendly learning guide that includes:
1. A clear summary (2-3 paragraphs)
2. Key points to remember (bullet points)
3. Study tips specific to this content
4. Practice exercises students can do
5. Estimated study time

FORMAT (Return ONLY valid JSON):
{
  "summary": "Clear, engaging summary of the lesson...",
  "keyPoints": [
    "Key point 1",
    "Key point 2",
    "Key point 3",
    "Key point 4",
    "Key point 5"
  ],
  "studyTips": [
    "Tip 1 for studying this topic",
    "Tip 2 for better understanding",
    "Tip 3 for retention"
  ],
  "practiceExercises": [
    "Exercise 1: Description",
    "Exercise 2: Description",
    "Exercise 3: Description"
  ],
  "estimatedDuration": "30-45 minutes"
}
`;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return null;
    } catch (error) {
        console.error('Error generating learning method:', error);
        return null;
    }
};

/**
 * Generate adaptive quiz from existing question bank
 * This function is called by the Quiz App
 */
export const generateAdaptiveQuizFromContent = async (
    classId: number,
    subject: string,
    studentPerformance?: {
        weakTopics?: string[];
        lastScore?: number;
    }
): Promise<{
    success: boolean;
    quiz?: {
        title: string;
        questions: GeneratedQuestion[];
        totalMarks: number;
        timeLimit: number;
    };
    message: string;
}> => {
    try {
        // Import dynamically to avoid circular dependency
        const { getRandomQuizQuestions } = await import('./questionDb');

        // Determine difficulty based on student performance
        let difficulty: 'easy' | 'medium' | 'hard' | 'mixed' = 'mixed';
        if (studentPerformance?.lastScore !== undefined) {
            if (studentPerformance.lastScore < 40) difficulty = 'easy';
            else if (studentPerformance.lastScore > 80) difficulty = 'hard';
            else difficulty = 'medium';
        }

        const { questions, available, message } = await getRandomQuizQuestions(
            classId,
            subject,
            5,
            difficulty
        );

        if (!available || questions.length === 0) {
            return { success: false, message };
        }

        // Calculate total marks and time
        const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
        const timeLimit = questions.length * 60; // 1 minute per question average

        return {
            success: true,
            quiz: {
                title: `${subject} Adaptive Quiz - Class ${classId}`,
                questions,
                totalMarks,
                timeLimit
            },
            message: `Quiz generated with ${questions.length} questions from your class materials.`
        };
    } catch (error) {
        console.error('Error generating adaptive quiz:', error);
        return {
            success: false,
            message: 'Failed to generate quiz. Please try again.'
        };
    }
};

/**
 * Extract text content from PDF using PDF.js (proper PDF parsing)
 * For base64 encoded PDFs, converts and processes properly
 */
export const extractTextFromPDF = async (
    pdfBase64: string
): Promise<{ text: string; success: boolean }> => {
    try {
        // Use the dedicated PDF processor for proper text extraction
        const result = await extractTextFromBase64PDF(pdfBase64);

        if (result.success) {
            console.log(`✅ Extracted ${result.text.length} characters from ${result.pageCount} PDF pages`);
            return { text: result.text, success: true };
        }

        // Fallback: Try Gemini Vision for scanned/image-based PDFs
        console.log('📸 Text extraction limited, trying Gemini Vision...');
        const prompt = `
Extract all the text content from this PDF document.
Maintain the structure and formatting as much as possible.
Include headings, paragraphs, bullet points, and any important text.
Return ONLY the extracted text, no additional commentary.
`;

        const text = await generateSmartContent([
                prompt,
                {
                    inlineData: {
                        data: pdfBase64,
                        mimeType: 'application/pdf'
                    }
                }
            ], { requireJson: false });
        return { text, success: true };
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return { text: '', success: false };
    }
};

/**
 * Analyze student answer using content-based grading
 */
export const gradeAnswerAgainstContent = async (
    question: GeneratedQuestion,
    studentAnswer: string
): Promise<{
    score: number;
    maxScore: number;
    feedback: string;
    isCorrect: boolean;
}> => {
    try {
        if (question.type === 'mcq') {
            // MCQ is auto-graded
            const isCorrect = parseInt(studentAnswer) === question.correct;
            return {
                score: isCorrect ? question.marks : 0,
                maxScore: question.marks,
                feedback: isCorrect
                    ? `Correct! ${question.explanation || ''}`
                    : `Incorrect. The correct answer was option ${(question.correct || 0) + 1}. ${question.explanation || ''}`,
                isCorrect
            };
        }

        // For short/long answers, use Gemini for grading
        const prompt = `
Grade this student answer for the following question.

QUESTION: ${question.question}
EXPECTED ANSWER/KEY POINTS: ${question.expectedAnswer}
RUBRIC: ${question.rubric?.join(', ') || 'No specific rubric'}
MAXIMUM MARKS: ${question.marks}

STUDENT ANSWER: ${studentAnswer}

Grade the answer and provide:
1. Score out of ${question.marks}
2. Whether each rubric point was covered
3. Constructive feedback

Return JSON:
{
  "score": number,
  "isCorrect": boolean,
  "feedback": "Detailed feedback for the student"
}
`;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const grading = JSON.parse(jsonMatch[0]);
            return {
                score: grading.score,
                maxScore: question.marks,
                feedback: grading.feedback,
                isCorrect: grading.score >= question.marks * 0.7 // 70% threshold
            };
        }

        return {
            score: 0,
            maxScore: question.marks,
            feedback: 'Unable to auto-grade. Please wait for teacher review.',
            isCorrect: false
        };
    } catch (error) {
        console.error('Error grading answer:', error);
        return {
            score: 0,
            maxScore: question.marks,
            feedback: 'Grading error occurred.',
            isCorrect: false
        };
    }
};
