import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// ===================================================================
// GEMINI API KEY FALLBACK SYSTEM
// Tries multiple API keys if one fails (rate limiting, quota exceeded, etc.)
// ===================================================================

// List of available API keys (loaded from environment variables)
// Configure VITE_GEMINI_API_KEY_1 through VITE_GEMINI_API_KEY_12 in .env / Netlify
const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY,
  import.meta.env.VITE_GEMINI_API_KEY_1,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
  import.meta.env.VITE_GEMINI_API_KEY_4,
  import.meta.env.VITE_GEMINI_API_KEY_5,
  import.meta.env.VITE_GEMINI_API_KEY_6,
  import.meta.env.VITE_GEMINI_API_KEY_7,
  import.meta.env.VITE_GEMINI_API_KEY_8,
  import.meta.env.VITE_GEMINI_API_KEY_9,
  import.meta.env.VITE_GEMINI_API_KEY_10,
  import.meta.env.VITE_GEMINI_API_KEY_11,
  import.meta.env.VITE_GEMINI_API_KEY_12,
].filter(Boolean) as string[]; // Filter out undefined/empty keys

// Track current working key index
let currentKeyIndex = 0;

// Get the current API key
const getCurrentApiKey = (): string => API_KEYS[currentKeyIndex] || API_KEYS[0];

// Rotate to next API key
const rotateToNextKey = (): boolean => {
  if (currentKeyIndex < API_KEYS.length - 1) {
    currentKeyIndex++;
    console.log(`🔄 Rotating to API key #${currentKeyIndex + 1}`);
    return true;
  }
  console.warn('⚠️ All API keys exhausted');
  return false;
};

// Create GenAI instance with current key
const createGenAI = (): GoogleGenerativeAI => new GoogleGenerativeAI(getCurrentApiKey());

// Get model with fallback support
const getModelWithFallback = (modelName: string): GenerativeModel => {
  return createGenAI().getGenerativeModel({ model: modelName });
};

// Wrapper function to handle API calls with automatic key rotation
export const callWithFallback = async <T>(
  apiCall: (model: GenerativeModel) => Promise<T>,
  modelName: string = 'gemini-2.5-flash'
): Promise<T> => {
  let lastError: Error | null = null;
  const startKeyIndex = currentKeyIndex;

  // Try all available keys starting from current
  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    try {
      const model = getModelWithFallback(modelName);
      const result = await apiCall(model);
      return result;
    } catch (error: any) {
      lastError = error;
      console.warn(`❌ API key #${currentKeyIndex + 1} failed:`, error.message || error);

      // Check if it's a rate limit or quota error
      if (error.message?.includes('429') ||
        error.message?.includes('quota') ||
        error.message?.includes('rate') ||
        error.message?.includes('Resource has been exhausted')) {

        if (!rotateToNextKey()) {
          // Reset to start if we've tried all keys
          currentKeyIndex = 0;
          break;
        }
      } else {
        // For other errors, still try next key
        if (!rotateToNextKey()) {
          currentKeyIndex = startKeyIndex; // Reset to original
          break;
        }
      }
    }
  }

  throw lastError || new Error('All API keys failed');
};

// Initialize Gemini AI with first working key
let genAI = createGenAI();

// Gemini models - use gemini-2.5-flash for reliability
export const gemini25Flash = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
export const gemini25FlashLite = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
export const gemini20Flash = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Refresh models with current key (call after rotation)
export const refreshModels = () => {
  genAI = createGenAI();
  return {
    gemini25Flash: genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }),
    gemini25FlashLite: genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }),
    gemini20Flash: genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  };
};

/**
 * ============================================================
 * CHATBOT OUTPUT FORMATTING GUIDELINES
 * ============================================================
 * Apply these formatting techniques to all AI chatbot responses
 * for better readability and user experience.
 */
export const CHATBOT_FORMATTING_PROMPT = `
## Response Formatting Guidelines

Format your responses using these techniques for optimal readability:

### 1. Markdown & Math Formatting
- Use **bold** for key terms and important concepts
- Use *italics* for subtle emphasis or definitions
- **Math**: Use LaTeX format $x^2$ for inline math and $$x^2$$ for block equations.
- Use \`inline code\` for code snippets, commands, or technical terms
- Use code blocks with language specification for longer code:
\`\`\`language
code here
\`\`\`

### 2. Structural Organization
- Use headers (##, ###) to organize longer responses
- Break content into short, digestible paragraphs
- Use bullet points (-) or numbered lists (1.) for steps or items
- Add blank lines between sections for visual breathing room

### 3. Visual Hierarchy
- Use emoji sparingly for visual anchors:
  • ✅ for correct/positive points
  • ⚠️ for warnings or cautions
  • 💡 for tips or insights
  • 📝 for notes
  • 🔑 for key points
- Use tables for comparing options when appropriate

### 4. Conversational Flow
- Start with a brief acknowledgment of the question
- Use transition phrases between sections
- End with a clear conclusion or suggested next step
- Keep a friendly, encouraging tone

### 5. Code Examples (when applicable)
- Always specify the programming language
- Include comments explaining key parts
- Show expected output when helpful

Example formatted response:
---
💡 **Great question!** Let me explain...

## Key Concept
The main idea is that **[concept]** works by...

### Steps to Follow:
1. **First step** - explanation
2. **Second step** - explanation
3. **Third step** - explanation

\`\`\`java
// Example code
public class Example {
    public static void main(String[] args) {
        System.out.println("Hello!");
    }
}
\`\`\`

📝 **Note:** Remember that...

✅ **Summary:** The key takeaway is...
---

Apply these formatting techniques appropriately based on the context and complexity of the response.
`;

// Convert canvas to base64 image
export const canvasToBase64 = (canvas: HTMLCanvasElement): string => {
  return canvas.toDataURL('image/png');
};

// Convert handwriting to text using Gemini 2.5 Flash
export const convertHandwritingToText = async (imageData: string): Promise<string> => {
  try {
    const base64Data = imageData.split(',')[1];

    const prompt = `
    Please analyze this handwritten text image and convert it to digital text. 
    Focus on accuracy and maintain the original structure and formatting.
    If there are mathematical equations, preserve them properly.
    Return only the converted text without any additional commentary.
    `;

    const text = await callWithFallback(async (model) => {
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: 'image/png'
          }
        }
      ]);
      const response = await result.response;
      return response.text();
    });
    return text;
  } catch (error) {
    console.error('Error converting handwriting:', error);
    throw new Error('Failed to convert handwriting to text');
  }
};

// Generate adaptive quiz using Gemini 2.0 Flash
export const generateAdaptiveQuiz = async (
  subject: string,
  difficulty: string,
  topics: string[],
  content?: string,
  weakConcepts?: string[]
): Promise<any> => {
  try {
    const contentInstruction = content
      ? `
    CRITICAL CONSTRAINT: You MUST generate the questions STRICTLY and ONLY from the following source text. Do NOT use any general external knowledge for question generation. If there is insufficient information in the text to cover all topics, prioritize the content available in the text.
    
    SOURCE TEXT:
    """
    ${content}
    """
    `
      : '';

    const weakConceptsInstruction = weakConcepts && weakConcepts.length > 0
      ? `
    CRITICAL OBJECTIVE: This is a REINFORCEMENT quiz. The student previously made mistakes on the following concepts/questions. You MUST generate questions that specifically focus on teaching, testing, and reinforcing these weak areas:
    ${weakConcepts.map((wc, i) => `${i + 1}. ${wc}`).join('\n')}
    `
      : '';

    const prompt = `
    Generate an adaptive quiz for ${subject} with ${difficulty} difficulty level.
    Topics to cover: ${topics.join(', ')}
    ${weakConceptsInstruction}
    ${contentInstruction}
    
    Create 5 multiple choice questions with:
    - Clear, educational questions appropriate for school students
    - 4 options each (A, B, C, D format)
    - Correct answer as index (0 for A, 1 for B, 2 for C, 3 for D)
    - Brief explanation for why the answer is correct
    - Estimated time per question in seconds
    - Explicit difficulty rating matching the target difficulty level ("${difficulty}")
    
    IMPORTANT: Return ONLY valid JSON, no markdown code blocks or extra text.
    
    Use this exact JSON structure:
    {
      "title": "${subject} Quiz",
      "questions": [
        {
          "id": 1,
          "question": "Question text here",
          "options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"],
          "correct": 0,
          "explanation": "Explanation of why this is correct",
          "difficulty": "${difficulty}",
          "timeEstimate": 60
        }
      ],
      "totalMarks": 25,
      "timeLimit": 300
    }
    `;

    let text = await callWithFallback(async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }, 'gemini-2.5-flash');

    // Remove markdown code blocks if present
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    const quiz = JSON.parse(text);

    // Validate required fields
    if (!quiz.questions || quiz.questions.length === 0) {
      throw new Error('Invalid quiz structure');
    }

    return quiz;
  } catch (error) {
    console.error('Error generating quiz:', error);

    // Return a fallback quiz so the user can still practice
    return {
      title: `${subject} Practice Quiz`,
      questions: [
        {
          id: 1,
          question: `What is a key concept in ${subject}?`,
          options: ["A) Option A - Correct Answer", "B) Option B", "C) Option C", "D) Option D"],
          correct: 0,
          explanation: `This is an auto-generated practice question for ${subject}.`,
          timeEstimate: 60
        },
        {
          id: 2,
          question: `Which of the following is true about ${subject}?`,
          options: ["A) Statement A - Correct", "B) Statement B is incorrect", "C) Statement C is incorrect", "D) Statement D is incorrect"],
          correct: 0,
          explanation: `Understanding fundamentals of ${subject} is important.`,
          timeEstimate: 60
        },
        {
          id: 3,
          question: `In ${subject}, what is the relationship between basic concepts?`,
          options: ["A) Correct relationship", "B) Incorrect option", "C) Another incorrect option", "D) Wrong answer"],
          correct: 0,
          explanation: `This tests your understanding of relationships in ${subject}.`,
          timeEstimate: 60
        },
        {
          id: 4,
          question: `Apply your knowledge of ${subject}: Which statement is accurate?`,
          options: ["A) Accurate statement - Correct", "B) Inaccurate statement", "C) Partially correct but wrong", "D) Completely incorrect"],
          correct: 0,
          explanation: `Application of ${subject} concepts is key to learning.`,
          timeEstimate: 60
        },
        {
          id: 5,
          question: `What is the most important principle in ${subject}?`,
          options: ["A) The key principle - Correct", "B) A secondary concept", "C) An unrelated idea", "D) A common misconception"],
          correct: 0,
          explanation: `Core principles form the foundation of ${subject}.`,
          timeEstimate: 60
        }
      ],
      totalMarks: 25,
      timeLimit: 300
    };
  }
};

export const analyzeStudentPerformance = async (studentData: any): Promise<any> => {
  try {
    const prompt = `
    Analyze this student's performance data and provide insights:
    ${JSON.stringify(studentData)}
    
    Provide analysis in JSON format:
    {
      "strengths": ["List of strong areas"],
      "weaknesses": ["List of areas needing improvement"],
      "recommendations": ["Specific study recommendations"],
      "nextSteps": ["Suggested next learning steps"],
      "motivationalMessage": "Encouraging message for the student"
    }
    `;

    const text = await callWithFallback(async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }, 'gemini-2.5-flash');
    return JSON.parse(text);
  } catch (error) {
    console.error('Error analyzing performance:', error);
    throw new Error('Failed to analyze student performance');
  }
};

// ===================================================================
// Student Portal AI Features (Gemini Integration)
// Features from Student_Portal_Features.md
// ===================================================================

// Feature 3: Socratic Hint System (Gemini Flash) - MVP CORE FEATURE
// Provides 3 escalating hints without giving away the answer
export const generateSocraticHints = async (
  question: string,
  correctAnswer: string,
  studentWrongAnswer: string,
  subject: string
): Promise<{
  level1: string; // Conceptual nudge
  level2: string; // Formula/method hint
  level3: string; // Step-by-step guidance
}> => {
  try {
    const prompt = `
    You are a Socratic tutor. A student answered incorrectly. Generate 3 ESCALATING hints.
    DO NOT give the answer directly. Guide them to discover it themselves.
    
    QUESTION: ${question}
    CORRECT ANSWER: ${correctAnswer}
    STUDENT'S WRONG ANSWER: ${studentWrongAnswer}
    SUBJECT: ${subject}
    
    Generate hints that progressively reveal more:
    - Level 1: A gentle conceptual nudge (e.g., "Think about what happens when...")
    - Level 2: A formula or method hint (e.g., "Which law relates X and Y?")
    - Level 3: Step-by-step guidance without the final answer (e.g., "First, calculate... then...")
    
    Return JSON:
    {
      "level1": "Conceptual hint here",
      "level2": "Formula/method hint here",
      "level3": "Step-by-step guidance here"
    }
    `;

    let text = await callWithFallback(async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }, 'gemini-2.5-flash');
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      level1: "Think carefully about the core concept involved in this question.",
      level2: "Consider which formula or method applies to this type of problem.",
      level3: "Break the problem into smaller steps. What's the first thing you need to find?"
    };
  } catch (error) {
    console.error('Error generating Socratic hints:', error);
    return {
      level1: "Think carefully about the core concept involved in this question.",
      level2: "Consider which formula or method applies to this type of problem.",
      level3: "Break the problem into smaller steps. What's the first thing you need to find?"
    };
  }
};

// Feature 4: Concept Explanation on Demand (Gemini Flash)
export const generateConceptExplanation = async (
  question: string,
  correctAnswer: string,
  studentWrongAnswer: string,
  subject: string
): Promise<string> => {
  try {
    const prompt = `
    Explain this concept to a student who answered incorrectly.
    
    QUESTION: ${question}
    CORRECT ANSWER: ${correctAnswer}
    STUDENT'S ANSWER: ${studentWrongAnswer}
    SUBJECT: ${subject}
    
    Generate a personalized 2-3 paragraph explanation that:
    1. Acknowledges their specific mistake
    2. Explains the concept clearly
    3. Shows why the correct answer is right
    
    Be encouraging but educational. Return ONLY the explanation text.
    `;

    const text = await callWithFallback(async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }, 'gemini-2.5-flash');
    return text.trim();
  } catch (error) {
    console.error('Error generating explanation:', error);
    return 'This concept requires understanding the fundamental principles. Review the lesson material and try again.';
  }
};

// Feature 5: Adaptive Reinforcement Quiz Generator (Gemini Flash)
export const generateReinforcementQuiz = async (
  weakTopics: string[],
  subject: string,
  difficulty: string
): Promise<any> => {
  try {
    const prompt = `
    Generate 3-5 reinforcement questions targeting these weak areas.
    
    WEAK TOPICS: ${weakTopics.join(', ')}
    SUBJECT: ${subject}
    DIFFICULTY: ${difficulty}
    
    Create questions that:
    1. Directly address the weak concepts
    2. Start slightly easier, then progress
    3. Include clear explanations
    
    Return JSON:
    {
      "title": "Reinforcement Quiz",
      "questions": [
        {
          "id": 1,
          "question": "Question text",
          "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
          "correct": 0,
          "explanation": "Why this is correct",
          "difficulty": "${difficulty}",
          "targetedConcept": "The weak topic this targets"
        }
      ],
      "totalMarks": 15,
      "timeLimit": 180
    }
    `;

    let text = await callWithFallback(async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }, 'gemini-2.5-flash');
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('Error generating reinforcement quiz:', error);
    return null;
  }
};

// Feature 7: Confidence-Based Learning Insights (Gemini Lite)
export const analyzeConfidencePatterns = async (
  responses: { question: string; correct: boolean; confidenceRating: number }[]
): Promise<{
  insights: string[];
  overconfidentTopics: string[];
  underconfidentTopics: string[];
}> => {
  try {
    const prompt = `
    Analyze student confidence patterns to detect overconfidence or underconfidence.
    
    RESPONSES:
    ${JSON.stringify(responses, null, 2)}
    
    Identify:
    1. Questions marked "confident" but answered wrong (overconfidence)
    2. Questions marked "not confident" but answered correctly (underconfidence)
    3. Patterns in their self-assessment
    
    Return JSON:
    {
       "insights": ["Insight 1", "Insight 2"],
       "overconfidentTopics": ["Topic where they're overconfident"],
       "underconfidentTopics": ["Topic where they underestimate themselves"]
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
    return { insights: [], overconfidentTopics: [], underconfidentTopics: [] };
  } catch (error) {
    console.error('Error analyzing confidence:', error);
    return { insights: [], overconfidentTopics: [], underconfidentTopics: [] };
  }
};

// Feature 9: Weekly Progress Narrative (Gemini Lite)
export const generateWeeklyNarrative = async (
  studentName: string,
  weeklyData: { subject: string; improvement: number; quizzesCompleted: number }[]
): Promise<string> => {
  try {
    const prompt = `
    Generate an engaging, story-like weekly progress update for a student.
    
    STUDENT: ${studentName}
    WEEKLY DATA:
    ${JSON.stringify(weeklyData, null, 2)}
    
    Create 2-3 engaging sentences that:
    1. Celebrate improvements
    2. Suggest focus areas
    3. End with motivation
    
    Example tone: "Great week! You improved Math by 8%. Focus on: Trigonometry. Keep it up!"
    Return ONLY the narrative text, no JSON.
    `;

    const text = await callWithFallback(async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    });
    return text.trim();
  } catch (error) {
    console.error('Error generating narrative:', error);
    return 'Keep up the great work this week! Every step forward is progress.';
  }
};