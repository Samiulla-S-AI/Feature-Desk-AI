import { callWithFallback } from './gemini';

// ===================================================================
// Teacher Portal AI Features (Gemini Integration)
// ===================================================================
// Features 14-27 from Complete_Project_Details.md
// ===================================================================

// Feature 14: Intelligent Question Generation from PDFs (Gemini Flash)
export const generateQuestionsFromPDF = async (
    pdfContent: string,
    config: {
        subject: string;
        mcqCount: number;
        twoMarkCount: number;
        fiveMarkCount: number;
        difficulty?: string;
    }
): Promise<{
    questions: any[];
    success: boolean;
}> => {
    try {
        const difficulty = config.difficulty || 'mixed';
        const prompt = `
    You are an expert educational content creator. Analyze the following lesson content and generate assessment questions.
    
    CONTENT:
    ${pdfContent}
    
    REQUIREMENTS:
    - Subject: ${config.subject}
    - Generate ${config.mcqCount} MCQ questions (1 mark each)
    - Generate ${config.twoMarkCount} short answer questions (2 marks each)
    - Generate ${config.fiveMarkCount} long answer questions (5 marks each)
    ${difficulty !== 'mixed' ? `- Generate all questions at a "${difficulty}" difficulty level. Ensure question complexity, target reasoning, and vocabulary match the "${difficulty}" level.` : '- Generate a balanced mix of easy, medium, and hard questions.'}
    
    FORMAT (JSON):
    {
      "questions": [
        {
          "id": 1,
          "type": "mcq",
          "question": "Question text",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correct": 0,
          "explanation": "Why this is correct",
          "difficulty": "easy|medium|hard",
          "marks": 1,
          "bloomsLevel": "remember|understand|apply|analyze"
        },
        {
          "id": 2,
          "type": "short_answer",
          "question": "Question text",
          "expectedAnswer": "Model answer",
          "rubric": ["Point 1 (1 mark)", "Point 2 (1 mark)"],
          "difficulty": "medium",
          "marks": 2
        },
        {
          "id": 3,
          "type": "long_answer",
          "question": "Question text",
          "expectedAnswer": "Detailed model answer",
          "rubric": ["Introduction (1 mark)", "Main points (2 marks)", "Examples (1 mark)", "Conclusion (1 mark)"],
          "difficulty": "hard",
          "marks": 5
        }
      ]
    }
    
    IMPORTANT: For each question, analyze if a visual aid/diagram is CRITICAL for understanding (necessity > 80%).
    If YES (necessity > 80%): set "needsImage": true and provide a detailed "imagePrompt" in the question object.
    
    Example addition to question object:
    "needsImage": true,
    "imagePrompt": "A detailed diagram showing the internal structure of a plant cell with labels for nucleus, mitochondria, and cell wall."
    
    Return ONLY valid JSON, no other text.
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { questions: parsed.questions, success: true };
        }

        return { questions: [], success: false };
    } catch (error) {
        console.error('Error generating questions:', error);
        return { questions: [], success: false };
    }
};

// Feature 15: Multi-Format Question Import (Image to Text)
export const extractQuestionsFromImage = async (imageBase64: string): Promise<{
    extractedText: string;
    questions: any[];
    success: boolean;
}> => {
    try {
        const prompt = `
    Analyze this handwritten or printed question paper image.
    Extract all questions and format them for digital use.
    
    Return JSON format:
    {
      "extractedText": "Full text from image",
      "questions": [
        {
          "id": 1,
          "type": "mcq|short_answer|long_answer",
          "question": "Question text",
          "marks": 1,
          "options": ["A", "B", "C", "D"] // only for MCQ
        }
      ]
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType: 'image/png'
                    }
                }
            ]);
            const response = await result.response;
            return response.text();
        });
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { ...parsed, success: true };
        }

        return { extractedText: '', questions: [], success: false };
    } catch (error) {
        console.error('Error extracting questions:', error);
        return { extractedText: '', questions: [], success: false };
    }
};

// Feature 16: Question Difficulty Classification (Gemini Lite)
export const classifyQuestionDifficulty = async (questions: any[]): Promise<any[]> => {
    try {
        const prompt = `
    Classify each question's difficulty based on Bloom's Taxonomy.
    
    QUESTIONS:
    ${JSON.stringify(questions, null, 2)}
    
    For each question, add:
    - difficulty: "easy" (remember/understand), "medium" (apply/analyze), "hard" (evaluate/create)
    - bloomsLevel: "remember|understand|apply|analyze|evaluate|create"
    - cognitiveLoad: 1-5 rating
    
    Return the same array with these fields added. Return ONLY valid JSON array.
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return questions;
    } catch (error) {
        console.error('Error classifying questions:', error);
        return questions;
    }
};

// Feature 17: Question Effectiveness Analysis (Gemini Lite)
export const analyzeQuestionEffectiveness = async (
    questions: any[],
    studentResponses: { questionId: number; correctPercentage: number; avgTime: number }[]
): Promise<{
    analysis: string;
    recommendations: string[];
    problematicQuestions: any[];
}> => {
    try {
        const prompt = `
    Analyze question effectiveness based on student performance data.
    
    QUESTIONS:
    ${JSON.stringify(questions, null, 2)}
    
    STUDENT RESPONSE DATA:
    ${JSON.stringify(studentResponses, null, 2)}
    
    Identify:
    1. Questions that were too easy (>90% correct)
    2. Questions that were too hard (<30% correct)
    3. Potentially confusing questions (high time + low accuracy)
    4. Recommendations for improvement
    
    Return JSON:
    {
      "analysis": "Overall summary",
      "recommendations": ["Recommendation 1", "Recommendation 2"],
      "problematicQuestions": [
        {
          "questionId": 1,
          "issue": "Too easy/hard/confusing",
          "suggestion": "How to fix"
        }
      ]
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return { analysis: '', recommendations: [], problematicQuestions: [] };
    } catch (error) {
        console.error('Error analyzing questions:', error);
        return { analysis: '', recommendations: [], problematicQuestions: [] };
    }
};

// Feature 18: Rubric-Based AI Grading (Gemini Flash) - MVP CRITICAL
export const gradeAnswerWithRubric = async (
    question: string,
    studentAnswer: string,
    rubric: { criteria: string; weight: number }[],
    maxMarks: number
): Promise<{
    score: number;
    breakdown: { criteria: string; score: number; feedback: string }[];
    overallFeedback: string;
    confidence: number;
    confidenceFactors: string[];
}> => {
    try {
        const prompt = `
    Grade this student answer using the provided rubric. Also assess your confidence in this grade.
    
    QUESTION: ${question}
    
    STUDENT ANSWER: ${studentAnswer}
    
    RUBRIC:
    ${rubric.map(r => `- ${r.criteria}: ${r.weight}%`).join('\n')}
    
    MAXIMUM MARKS: ${maxMarks}
    
    Evaluate each criterion and provide:
    1. Score for each criterion (proportional to weight)
    2. Specific feedback for each criterion
    3. Total score
    4. Overall feedback
    5. Your CONFIDENCE level (0.0 to 1.0) in this grade based on:
       - Answer clarity and completeness
       - Alignment with rubric criteria
       - Presence of ambiguous content
       - Answer length and depth
    6. List factors that affected your confidence
    
    Return JSON:
    {
      "score": 8,
      "breakdown": [
        {
          "criteria": "Concept Understanding",
          "score": 3,
          "maxScore": 4,
          "feedback": "Good grasp of core concept but missed..."
        }
      ],
      "overallFeedback": "Strong answer with...",
      "confidence": 0.85,
      "confidenceFactors": ["Clear explanation provided", "Answer covers all key points"]
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                score: parsed.score || 0,
                breakdown: parsed.breakdown || [],
                overallFeedback: parsed.overallFeedback || 'Unable to grade automatically',
                confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
                confidenceFactors: parsed.confidenceFactors || ['AI confidence could not be determined']
            };
        }

        return {
            score: 0,
            breakdown: [],
            overallFeedback: 'Unable to grade automatically',
            confidence: 0.3,
            confidenceFactors: ['Could not parse grading response']
        };
    } catch (error) {
        console.error('Error grading answer:', error);
        return {
            score: 0,
            breakdown: [],
            overallFeedback: 'Error during grading',
            confidence: 0,
            confidenceFactors: ['Grading error occurred']
        };
    }
};

// Feature 18.5: Visual Answer Sheet Grading (Gemini Flash)
export const gradeImageAnswerWithRubric = async (
    question: string,
    imageBase64: string,
    rubric: { criteria: string; weight: number }[],
    maxMarks: number
): Promise<{
    score: number;
    breakdown: { criteria: string; score: number; feedback: string }[];
    overallFeedback: string;
    confidence: number;
    confidenceFactors: string[];
}> => {
    try {
        console.log('🤖 AI Grading Image. Input Length:', imageBase64.length);
        const prompt = `
    You are a super-friendly, encouraging teacher who talks like a helpful buddy — NOT a strict examiner.
    You grade FAIRLY but explain things in simple, fun, easy-to-understand words. No fancy jargon!

    FIRST: Look at this student's answer sheet image very carefully.
    
    QUESTION CONTEXT: ${question}
    
    RUBRIC:
    ${rubric.map(r => `- ${r.criteria}: ${r.weight}%`).join('\n')}
    
    MAXIMUM MARKS: ${maxMarks}
    
    For EACH question in the image, your feedback MUST follow this EXACT structure using Markdown:

    **📸 WHAT I SEE:** Describe exactly what the student wrote/drew in the image (handwriting, typed text, diagrams, doodles — everything!)
    **❓ WHAT WAS ASKED:** Explain the question in super simple words
    **✏️ WHAT THEY DID:** Explain the student's approach and what they tried to answer
    **✅ CORRECT ANSWER:** Give the right answer in 1-2 short, clear sentences
    **💬 BUDDY FEEDBACK:** Friendly, encouraging feedback with emojis — like a friend who wants them to win!
    
    KEEP IT SIMPLE: Use everyday words a 12-year-old would understand.
    NO COMPLEX WORDS. Be concise. Be kind. Be helpful.
    Use **bold** for important keywords, and bullet points if you are listing more than one thing.
    
    Return JSON:
    {
      "score": 0,
      "breakdown": [
        {
          "criteria": "Q1",
          "score": 3,
          "maxScore": 5,
          "feedback": "📸 I can see you wrote... ❓ This question asked about... ✏️ You tried to explain... ✅ The short answer is: ... 💬 Nice effort! ..."
        }
      ],
      "overallFeedback": "A friendly, encouraging 2-3 line overall summary of how the student did",
      "confidence": 0.8,
      "confidenceFactors": []
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType: 'image/jpeg'
                    }
                }
            ]);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                score: parsed.score || 0,
                breakdown: parsed.breakdown || [],
                overallFeedback: parsed.overallFeedback || 'Unable to grade automatically',
                confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
                confidenceFactors: parsed.confidenceFactors || ['AI confidence could not be determined']
            };
        }

        return {
            score: 0,
            breakdown: [],
            overallFeedback: 'Unable to grade automatically',
            confidence: 0.3,
            confidenceFactors: ['Could not parse grading response']
        };
    } catch (error) {
        console.error('Error grading image answer:', error);
        return {
            score: 0,
            breakdown: [],
            overallFeedback: 'Error during grading',
            confidence: 0,
            confidenceFactors: ['Grading error occurred']
        };
    }
};

// Feature 19: Partial Credit Automation (Gemini Flash)
export const calculatePartialCredit = async (
    question: string,
    studentAnswer: string,
    expectedSteps: string[],
    maxMarks: number
): Promise<{
    totalScore: number;
    stepScores: { step: string; achieved: boolean; partialCredit: number; error?: string }[];
}> => {
    try {
        const prompt = `
    Analyze this student's work and award partial credit for correct steps.
    
    QUESTION: ${question}
    STUDENT ANSWER: ${studentAnswer}
    EXPECTED STEPS: ${expectedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
    MAXIMUM MARKS: ${maxMarks}
    
    For each step, determine:
    - Was it completed correctly?
    - If not, what error was made?
    - How much partial credit (0 to proportional max)?
    
    Return JSON:
    {
      "totalScore": 7,
      "stepScores": [
        {
          "step": "Step description",
          "achieved": true,
          "partialCredit": 2,
          "maxCredit": 2
        },
        {
          "step": "Step description",
          "achieved": false,
          "partialCredit": 1,
          "maxCredit": 2,
          "error": "Arithmetic error at..."
        }
      ]
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return { totalScore: 0, stepScores: [] };
    } catch (error) {
        console.error('Error calculating partial credit:', error);
        return { totalScore: 0, stepScores: [] };
    }
};

// Feature 22: Mistake Pattern Detection (Gemini Lite) - HUGE TEACHER VALUE
export const detectMistakePatterns = async (
    classResults: { questionId: number; question: string; wrongAnswers: string[]; correctAnswer: string }[]
): Promise<{
    patterns: { pattern: string; affectedPercentage: number; recommendation: string }[];
    teachingSlide: string;
}> => {
    try {
        const prompt = `
    Analyze class-wide quiz results to identify common mistake patterns.
    
    RESULTS DATA:
    ${JSON.stringify(classResults, null, 2)}
    
    Identify:
    1. Common misconceptions (e.g., "60% confused velocity with speed")
    2. Systematic errors
    3. Knowledge gaps
    
    Generate a brief teaching slide to address the top misconception.
    
    Return JSON:
    {
      "patterns": [
        {
          "pattern": "Description of the misconception",
          "affectedPercentage": 60,
          "recommendation": "How to address this in class"
        }
      ],
      "teachingSlide": "## [Title]\n\n### Common Mistake\n...\n\n### Correct Understanding\n...\n\n### Remember\n..."
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return { patterns: [], teachingSlide: '' };
    } catch (error) {
        console.error('Error detecting patterns:', error);
        return { patterns: [], teachingSlide: '' };
    }
};

// Feature 23: Student Readiness Forecast (Gemini Lite)
export const forecastClassReadiness = async (
    classPerformanceData: { topic: string; averageScore: number; quizzesTaken: number }[],
    upcomingTest: string
): Promise<{
    readinessPercentage: number;
    readyTopics: string[];
    needsWorkTopics: string[];
    recommendation: string;
}> => {
    try {
        const prompt = `
    Forecast class readiness for an upcoming test.
    
    CLASS PERFORMANCE:
    ${JSON.stringify(classPerformanceData, null, 2)}
    
    UPCOMING TEST: ${upcomingTest}
    
    Analyze and return:
    {
      "readinessPercentage": 65,
      "readyTopics": ["Topic 1", "Topic 2"],
      "needsWorkTopics": ["Topic 3", "Topic 4"],
      "recommendation": "The class is 65% ready. Recommend 2 more practice quizzes focusing on..."
    }
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return {
            readinessPercentage: 0,
            readyTopics: [],
            needsWorkTopics: [],
            recommendation: ''
        };
    } catch (error) {
        console.error('Error forecasting readiness:', error);
        return {
            readinessPercentage: 0,
            readyTopics: [],
            needsWorkTopics: [],
            recommendation: ''
        };
    }
};

// Feature 25: Personalized Feedback Generation (Gemini Lite)
export const generatePersonalizedFeedback = async (
    studentName: string,
    quizPerformance: { question: string; correct: boolean; answer: string }[],
    adaptiveQuizzes?: any[]
): Promise<string> => {
    try {
        const correctCount = quizPerformance.filter(p => p.correct).length;
        const totalCount = quizPerformance.length;
        const percentage = Math.round((correctCount / totalCount) * 100);

        let adaptiveSection = '';
        if (adaptiveQuizzes && adaptiveQuizzes.length > 0) {
            adaptiveSection = `\nSTUDENT'S ADAPTIVE REINFORCEMENT QUIZ RECOMMENDATIONS HISTORY:\n`;
            adaptiveQuizzes.forEach((aq, idx) => {
                const weakConceptsStr = Array.isArray(aq.weak_concepts) ? aq.weak_concepts.join(', ') : '';
                adaptiveSection += `- Recommendation ${idx + 1}: Title "${aq.exam_title}" (Subject Code: ${aq.subject_code || 'ALL'}) for weak concepts: [${weakConceptsStr}]. Status: ${aq.status}`;
                if (aq.status === 'completed') {
                    adaptiveSection += ` (Completed with Score: ${aq.score}/${aq.total_marks || 10})`;
                }
                adaptiveSection += '\n';
            });
        }

        const prompt = `
    You are ${studentName}'s cool, supportive study buddy — NOT a teacher or examiner.
    Talk like a friend who genuinely cares about their learning journey.
    
    STUDENT: ${studentName}
    SCORE: ${correctCount}/${totalCount} (${percentage}%)
    
    PERFORMANCE DETAILS:
    ${quizPerformance.map((p, i) => `Q${i + 1}: ${p.correct ? '✅ Got it!' : '❌ Missed'} — Topic: ${p.question.substring(0, 80)}`).join('\n')}
    ${adaptiveSection}
    
    Write a personalized feedback message that includes ALL of these sections:

    🎯 CONCEPTS YOU'RE EXPLORING:
    - List 2-3 specific topics/concepts from the questions (what they're actually trying to learn)
    - Frame it positively: "You're diving into [topic]!" or "You're exploring [concept]!"

    🌟 WHAT WENT AWESOME:
    - Celebrate specific things they got right
    - Be genuinely happy for them, like a friend would
    - Use fun language: "You crushed it on..." or "High-five for nailing..."

    💪 LEVEL-UP TIPS:
    - For questions they missed, give super simple hints (not full answers)
    - Make it feel like a game: "Next time, try thinking of it like..."
    - Keep it light and encouraging, NOT preachy
    - IF the student has an adaptive reinforcement quiz history listed above:
       - Acknowledge their effort on completed reinforcement quizzes (e.g. "I'm so proud of you for completing the reinforcement quiz on [Topic]!")
       - Gently prompt them to attempt any pending/uncompleted ones to level up their scores (e.g. "Make sure to check out the practice reinforcement quiz on [Topic] next!")

    🚀 MOTIVATION:
    - End with a short, genuine, friend-like pep talk (2-3 lines max)
    - NO cliché motivational quotes
    - Talk like a real friend: "Hey, you're getting better every time!" or "Seriously, this stuff is hard and you're doing great!"
    - If they scored low: "This is just one round — you've got so many more chances to nail it!"
    - If they scored high: "You're on fire! Keep this energy going!"

    RULES:
    - Use simple everyday English — NO complex or academic words
    - Use emojis naturally (not too many)
    - Keep the TOTAL response under 200 words
    - Sound like a real human friend, not a robot or a strict teacher
    - Don't be preachy or lecture-y
    - Make it fun to read!
    
    Return ONLY the feedback text (with the section headers), no JSON.
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });
        return text.trim();
    } catch (error) {
        console.error('Error generating feedback:', error);
        return `Hey ${studentName}! 🌟 Great effort on this one! Every question you try makes you stronger. Keep going — you've got this! 💪`;
    }
};

// Feature 26: Parent Progress Report Generation (Gemini Lite)
export const generateParentReport = async (
    studentName: string,
    weeklyData: {
        subject: string;
        currentScore: number;
        previousScore: number;
        strengths: string[];
        areasForFocus: string[];
    }
): Promise<string> => {
    try {
        const prompt = `
    Generate a brief, professional progress report email for parents.
    
    STUDENT: ${studentName}
    WEEKLY DATA:
    - Subject: ${weeklyData.subject}
    - Current Score: ${weeklyData.currentScore}%
    - Previous Score: ${weeklyData.previousScore}%
    - Strengths: ${weeklyData.strengths.join(', ')}
    - Focus Areas: ${weeklyData.areasForFocus.join(', ')}
    
    Create a warm, informative 3-4 sentence email that:
    1. Highlights progress (or encourages if scores dropped)
    2. Mentions specific strengths
    3. Suggests focus areas
    4. Ends with encouragement
    
    Return ONLY the email body text.
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });
        return text.trim();
    } catch (error) {
        console.error('Error generating parent report:', error);
        return `${studentName} is making progress in their studies. Please continue to encourage their learning at home.`;
    }
};

// Feature 27: Intervention Alert Messaging (Gemini Lite)
export const generateInterventionMessage = async (
    studentName: string,
    subject: string,
    recentPerformance: number[]
): Promise<string> => {
    try {
        const prompt = `
    Generate a compassionate intervention message for a struggling student.
    
    STUDENT: ${studentName}
    SUBJECT: ${subject}
    RECENT SCORES: ${recentPerformance.join('%, ')}%
    
    The student has been struggling. Create a supportive message that:
    1. Acknowledges it's been a tough week
    2. Offers to help (meeting after class)
    3. Reassures them this is fixable
    4. Keeps a positive, encouraging tone
    
    Return ONLY the message text (2-3 sentences).
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });
        return text.trim();
    } catch (error) {
        console.error('Error generating intervention message:', error);
        return `Hi ${studentName}, I noticed you've had some challenges in ${subject} recently. Let's meet after class tomorrow to review together - you've got this!`;
    }
};

// Feature 24: Learning Velocity Narrative (Gemini Lite)
export const generateLearningVelocityNarrative = async (
    students: { name: string; scores: number[]; trend: 'improving' | 'plateauing' | 'declining' }[]
): Promise<string> => {
    try {
        const prompt = `
    Generate a brief class learning velocity report for teachers.
    
    STUDENT DATA:
    ${JSON.stringify(students, null, 2)}
    
    Create 3-4 sentences that:
    1. Highlight fast learners with % improvement
    2. Identify plateauing students who need attention
    3. Flag declining students for intervention
    
    Use specific names and numbers. Return ONLY the narrative text.
    `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });
        return text.trim();
    } catch (error) {
        console.error('Error generating velocity narrative:', error);
        return 'Unable to generate learning velocity report.';
    }
};

// Feature 28: Interactive Document Chat (Gemini Flash)
export const chatWithDocument = async (
    documentContent: string,
    history: { role: 'user' | 'model'; parts: string }[],
    message: string
): Promise<{ text: string; questions?: any[] }> => {
    try {
        const text = await callWithFallback(async (model) => {
            const chat = model.startChat({
                history: [
                    {
                        role: 'user',
                        parts: [{ text: `You are an AI teaching assistant. Analyze the following document content:\n\n${documentContent.substring(0, 30000)}` }]
                    },
                    {
                        role: 'model',
                        parts: [{ text: "I have analyzed the document. How can I help you? I can generate questions, summarize content, or answer questions about it." }]
                    },
                    // @ts-ignore - map to compatible format
                    ...history.map(h => ({
                        role: h.role,
                        parts: [{ text: h.parts }] // Ensure parts is array
                    }))
                ]
            });

            const prompt = `${message}
            
            If the user asks to generate questions, return them in this JSON format embedded within your response:
            \`\`\`json
            {
              "questions": [
                {
                  "id": 1,
                  "type": "mcq|short_answer|long_answer",
                  "question": "...",
                  "options": ["..."],
                  "correct": 0,
                  "explanation": "...",
                  "difficulty": "easy|medium|hard",
                  "marks": 1
                }
              ]
            }
            \`\`\`
            `;

            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            return response.text();
        });

        // Try to extract questions if present
        let questions = undefined;
        const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.questions && Array.isArray(parsed.questions)) {
                    questions = parsed.questions;
                }
            } catch (e) {
                console.error('Failed to parse questions from chat:', e);
            }
        }

        return { text, questions };
    } catch (error) {
        console.error('Error in document chat:', error);
        return { text: "I'm having trouble processing that request right now.", questions: undefined };
    }
};

// Feature 29: Image Generation for Questions (Gemini Flash + Imagen/Flux)
export const generateImageForQuestion = async (prompt?: string): Promise<string> => {
    try {
        console.log('Generating image for prompt:', prompt);

        // 1. Refine the image prompt using the standard text model
        const refinedPrompt = await callWithFallback(async (model) => {
            const result = await model.generateContent(`
                Create a short, detailed visual description for an educational image based on this concept: "${prompt}".
                Focus on the visual elements. Return ONLY the description, max 10 words.
             `);
            const response = await result.response;
            return response.text().trim();
        }, 'gemini-2.5-flash');

        console.log('Refined prompt:', refinedPrompt);

        // 2. Return a reliable educational placeholder image (Blueprint Style)
        // Since standard Gemini models don't generate images and the Image/Pro models have 0 free quota,
        // we use the refined AI text prompt to generate a high-quality dynamic visualization.
        const encodedText = encodeURIComponent(refinedPrompt.substring(0, 60));
        return `https://placehold.co/600x400/1e40af/ffffff?text=${encodedText}&font=roboto`;

    } catch (error) {
        console.error('Error generating image:', error);
        // Ultimate Fallback
        return `https://placehold.co/600x400/1e40af/ffffff?text=${encodeURIComponent((prompt || 'Educational Image').substring(0, 30))}&font=roboto`;
    }
};

// Feature 30: Standalone Image Necessity Check (Gemini Flash)
export const analyzeImageNecessity = async (question: string): Promise<{ needed: boolean; confidence: number; prompt: string }> => {
    try {
        const promptText = `
        Analyze this question and determine if an image/diagram is ESSENTIAL for understanding/solving it.
        
        QUESTION: ${question}
        
        Determine:
        1. Is an image needed? (Yes/No)
        2. Necessity score (0-100)
        3. Detailed image prompt if needed
        
        Return JSON:
        {
            "needed": true,
            "confidence": 85,
            "prompt": "Diagram of..."
        }
        `;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent(promptText);
            const response = await result.response;
            return response.text();
        });

        // Parse JSON from response
        let jsonResponse = text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonResponse = jsonMatch[0];
        }

        const parsed = JSON.parse(jsonResponse);

        return {
            needed: (parsed.needed === true || String(parsed.needed).toLowerCase() === 'yes') && (parsed.confidence > 80),
            confidence: parsed.confidence || 0,
            prompt: parsed.prompt || ''
        };

    } catch (error) {
        console.error('Error analyzing image necessity:', error);
        return { needed: false, confidence: 0, prompt: '' };
    }
};
