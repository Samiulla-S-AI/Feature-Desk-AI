import { callWithFallback, CHATBOT_FORMATTING_PROMPT } from './gemini';

/**
 * PDF Processor using Gemini 2.5 Flash Lite
 * This model natively supports PDF input - no text extraction needed!
 * Simply send the PDF as base64 and chat with it directly.
 */

/**
 * Convert a File to base64 string
 */
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix to get pure base64
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = (error) => reject(error);
    });
};

/**
 * Chat with a PDF document using Gemini 2.5 Flash Lite
 * The model processes the PDF directly - no text extraction needed!
 */
export const chatWithPDF = async (
    pdfBase64: string,
    message: string,
    chatHistory: { role: 'user' | 'model'; content: string }[] = []
): Promise<{ text: string; questions?: any[] }> => {
    try {
        // Build conversation history
        const historyParts = chatHistory.map(h => ({
            role: h.role,
            parts: [{ text: h.content }]
        }));

        // Start chat with PDF context
        const text = await callWithFallback(async (model) => {
            const chat = model.startChat({
                history: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'application/pdf',
                                    data: pdfBase64
                                }
                            },
                            { text: 'I have uploaded a PDF document. Please analyze it and be ready to answer questions about its content.' }
                        ]
                    },
                    {
                        role: 'model',
                        parts: [{ text: 'I have analyzed the PDF document. I can see its contents clearly. How can I help you? I can:\n\n• Answer questions about the content\n• Summarize sections or the entire document\n• Generate quiz questions based on the material\n• Explain concepts in detail\n• Extract key points and topics\n\nWhat would you like me to do?' }]
                    },
                    // @ts-ignore
                    ...historyParts
                ]
            });

            // Send the user's message with question generation instructions and formatting
            const prompt = `${message}

${CHATBOT_FORMATTING_PROMPT}

If the user asks to generate questions, return them in this JSON format embedded within your response:
\`\`\`json
{
  "questions": [
    {
      "id": 1,
      "type": "mcq",
      "question": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Explanation of the correct answer",
      "difficulty": "easy",
      "marks": 1
    }
  ]
}
\`\`\`

For different question types:
- MCQ: Include options array and correct index
- short_answer: Include expectedAnswer field
- long_answer: Include rubric array with grading criteria`;

            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            return response.text();
        });

        // Try to extract questions if present in the response
        let questions = undefined;
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.questions && Array.isArray(parsed.questions)) {
                    questions = parsed.questions;
                }
            } catch (e) {
                console.error('Failed to parse questions from response:', e);
            }
        }

        return { text, questions };
    } catch (error) {
        console.error('Error in PDF chat:', error);
        throw error;
    }
};

/**
 * Analyze a PDF and get a summary
 */
export const analyzePDF = async (
    pdfBase64: string,
    analysisType: 'summary' | 'key_points' | 'topics' | 'questions'
): Promise<{ success: boolean; result?: string; error?: string }> => {
    try {
        const prompts = {
            summary: 'Please provide a comprehensive summary of this PDF document. Include the main ideas, key arguments, and conclusions.',
            key_points: 'Extract and list the key points from this PDF document in bullet point format.',
            topics: 'Identify and list all the main topics and subtopics covered in this PDF document.',
            questions: 'Generate 10 quiz questions based on this PDF document. Include a mix of easy, medium, and hard questions.'
        };

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfBase64
                    }
                },
                prompts[analysisType]
            ]);
            return result.response.text();
        });
        return { success: true, result: text };
    } catch (error) {
        console.error('Error analyzing PDF:', error);
        return { success: false, error: String(error) };
    }
};

/**
 * Generate questions from PDF for assessment
 */
export const generateQuestionsFromPDFDirect = async (
    pdfBase64: string,
    config: {
        subject?: string;
        mcqCount?: number;
        shortAnswerCount?: number;
        longAnswerCount?: number;
        difficulty?: string;
    }
): Promise<{ success: boolean; questions?: any[]; error?: string }> => {
    try {
        const { mcqCount = 5, shortAnswerCount = 3, longAnswerCount = 2, subject = '', difficulty = 'mixed' } = config;

        const prompt = `Based on this PDF document${subject ? ` for ${subject}` : ''}, generate questions for an assessment.

${difficulty !== 'mixed' ? `All generated questions must have a difficulty level of "${difficulty}". Ensure the question complexity, target reasoning, and vocabulary match the "${difficulty}" level.` : 'Generate a balanced mix of easy, medium, and hard questions.'}

Generate exactly:
- ${mcqCount} Multiple Choice Questions (MCQ) - 1 mark each
- ${shortAnswerCount} Short Answer Questions - 2 marks each
- ${longAnswerCount} Long Answer Questions - 5 marks each

Return the questions in this exact JSON format:
\`\`\`json
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
      "marks": 1
    },
    {
      "id": 2,
      "type": "short_answer",
      "question": "Question text",
      "expectedAnswer": "Expected answer",
      "difficulty": "medium",
      "marks": 2
    },
    {
      "id": 3,
      "type": "long_answer",
      "question": "Question text",
      "rubric": ["Point 1", "Point 2", "Point 3"],
      "difficulty": "hard",
      "marks": 5
    }
  ]
}
\`\`\`

IMPORTANT: For each question, analyze if a visual aid/diagram is CRITICAL for understanding (necessity > 80%).
If YES (necessity > 80%): set "needsImage": true and provide a detailed "imagePrompt" in the question object.

Example addition to question object:
"needsImage": true,
"imagePrompt": "A detailed diagram showing the internal structure of a plant cell with labels for nucleus, mitochondria, and cell wall."

Make sure questions are relevant to the document content and vary in difficulty.`;

        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfBase64
                    }
                },
                prompt
            ]);
            return result.response.text();
        });
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.questions && Array.isArray(parsed.questions)) {
                return { success: true, questions: parsed.questions };
            }
        }

        return { success: false, error: 'Failed to parse questions from response' };
    } catch (error) {
        console.error('Error generating questions from PDF:', error);
        return { success: false, error: String(error) };
    }
};

// Legacy function for backward compatibility
export const extractTextFromPDF = async (
    pdfFile: File
): Promise<{ text: string; success: boolean; pageCount: number; error?: string }> => {
    try {
        const base64 = await fileToBase64(pdfFile);

        // Use Gemini to extract text from PDF
        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: base64
                    }
                },
                'Extract and return all the text content from this PDF document. Maintain the structure and formatting. Return only the extracted text.'
            ]);
            return result.response.text();
        });
        return {
            text,
            success: true,
            pageCount: 1 // Gemini doesn't return page count, but we keep for compatibility
        };
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return { text: '', success: false, pageCount: 0, error: String(error) };
    }
};

// Legacy function for backward compatibility
export const extractTextFromBase64PDF = async (
    pdfBase64: string
): Promise<{ text: string; success: boolean; pageCount: number; error?: string }> => {
    try {
        const text = await callWithFallback(async (model) => {
            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfBase64
                    }
                },
                'Extract and return all the text content from this PDF document. Maintain the structure and formatting. Return only the extracted text.'
            ]);
            return result.response.text();
        });
        return {
            text,
            success: true,
            pageCount: 1
        };
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return { text: '', success: false, pageCount: 0, error: String(error) };
    }
};
