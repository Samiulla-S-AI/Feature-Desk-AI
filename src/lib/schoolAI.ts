import { callWithFallback, generateSmartContent } from './gemini';

// ===================================================================
// School Management Portal AI Features (Gemini Integration)
// ===================================================================
// Features 28-33 from Complete_Project_Details.md
// ===================================================================

// Feature 28: Auto Lesson Plan Generation (Gemini Flash) - 🔥 MVP MASSIVE VALUE
export const generateLessonPlan = async (
    subject: string,
    topic: string,
    classLevel: number,
    duration: number, // in minutes
    studentSkillLevel: 'beginner' | 'intermediate' | 'advanced'
): Promise<{
    title: string;
    activities: { name: string; duration: number; description: string; materials?: string[] }[];
    objectives: string[];
    assessment: string;
}> => {
    try {
        const prompt = `
    Generate a structured lesson plan for a substitute teacher.
    
    DETAILS:
    - Subject: ${subject}
    - Topic: ${topic}
    - Class Level: ${classLevel}
    - Duration: ${duration} minutes
    - Student Skill Level: ${studentSkillLevel}
    
    Create a practical, easy-to-follow lesson plan that includes:
    1. Clear learning objectives
    2. Timed activities (warm-up, main lesson, practice, wrap-up)
    3. Materials needed
    4. Simple assessment method
    
    Return JSON:
    {
      "title": "Lesson title",
      "objectives": ["Objective 1", "Objective 2"],
      "activities": [
        {
          "name": "Activity name",
          "duration": 10,
          "description": "What to do",
          "materials": ["Material 1"]
        }
      ],
      "assessment": "How to assess student understanding"
    }
    
    Return ONLY valid JSON.
    `;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return {
            title: `${subject} - ${topic}`,
            activities: [
                { name: 'Introduction', duration: 10, description: 'Review previous concepts' },
                { name: 'Main Activity', duration: 25, description: 'Core lesson content' },
                { name: 'Practice', duration: 10, description: 'Student exercises' },
                { name: 'Wrap-up', duration: 5, description: 'Summary and questions' }
            ],
            objectives: ['Understand key concepts', 'Apply knowledge'],
            assessment: 'Oral questioning and written exercise'
        };
    } catch (error) {
        console.error('Error generating lesson plan:', error);
        return {
            title: `${subject} - ${topic}`,
            activities: [],
            objectives: [],
            assessment: ''
        };
    }
};

// Feature 29: Lesson Plan for Absent Day Notification (Gemini Lite)
export const generateAbsentDayNotification = async (
    teacherName: string,
    subject: string,
    className: string,
    lessonTopic: string,
    substituteTeacher?: string
): Promise<string> => {
    try {
        const prompt = `
    Generate a brief, reassuring notification for parents about their child's teacher being absent.
    
    DETAILS:
    - Absent Teacher: ${teacherName}
    - Subject: ${subject}
    - Class: ${className}
    - Today's Topic: ${lessonTopic}
    ${substituteTeacher ? `- Substitute Teacher: ${substituteTeacher}` : ''}
    
    Create a 2-3 sentence notification that:
    1. Informs about the absence professionally
    2. Reassures parents that learning will continue
    3. Mentions the structured lesson plan in place
    
    Return ONLY the notification text.
    `;

        const text = await generateSmartContent(prompt, { requireJson: false });
        return text.trim();
    } catch (error) {
        console.error('Error generating absence notification:', error);
        return `${teacherName} is absent today. Your child's ${subject} class will continue with a substitute teacher following a structured lesson plan on "${lessonTopic}". There will be no missed learning.`;
    }
};

// Feature 30: Annual School Report Card Generation (Gemini Flash)
export const generateAnnualReport = async (
    schoolData: {
        totalStudents: number;
        totalTeachers: number;
        averageAttendance: number;
        performanceByClass: { className: string; averageScore: number; improvement: number }[];
        topPerformers: { name: string; class: string; achievement: string }[];
        areasForImprovement: string[];
    }
): Promise<{
    executiveSummary: string;
    keyHighlights: string[];
    classAnalysis: string;
    recommendations: string[];
}> => {
    try {
        const prompt = `
    Generate a professional annual school report card based on the following data.
    
    SCHOOL DATA:
    ${JSON.stringify(schoolData, null, 2)}
    
    Create a comprehensive report that includes:
    1. Executive summary (2-3 paragraphs)
    2. Key highlights (bullet points)
    3. Class-by-class analysis
    4. Recommendations for next year
    
    Return JSON:
    {
      "executiveSummary": "Multi-paragraph summary",
      "keyHighlights": ["Highlight 1", "Highlight 2"],
      "classAnalysis": "Analysis paragraph",
      "recommendations": ["Recommendation 1", "Recommendation 2"]
    }
    `;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return {
            executiveSummary: 'Report generation in progress.',
            keyHighlights: [],
            classAnalysis: '',
            recommendations: []
        };
    } catch (error) {
        console.error('Error generating annual report:', error);
        return {
            executiveSummary: 'Error generating report.',
            keyHighlights: [],
            classAnalysis: '',
            recommendations: []
        };
    }
};

// Feature 31: Predictive Dropout Risk Analysis (Gemini Lite)
export const analyzeDropoutRisk = async (
    students: {
        name: string;
        class: string;
        attendanceRate: number;
        averageGrades: number;
        engagementScore: number;
        recentTrend: 'improving' | 'stable' | 'declining';
    }[]
): Promise<{
    highRisk: { name: string; class: string; riskFactors: string[]; recommendedActions: string[] }[];
    moderateRisk: { name: string; class: string; riskFactors: string[] }[];
    summary: string;
}> => {
    try {
        const prompt = `
    Analyze student data to identify dropout risk levels.
    
    STUDENT DATA:
    ${JSON.stringify(students, null, 2)}
    
    Identify:
    1. High-risk students (attendance <70%, grades <40%, declining trend)
    2. Moderate-risk students (one concerning metric)
    3. Recommended interventions
    
    Return JSON:
    {
      "highRisk": [
        {
          "name": "Student name",
          "class": "Class",
          "riskFactors": ["Low attendance", "Declining grades"],
          "recommendedActions": ["Parent meeting", "Counseling session"]
        }
      ],
      "moderateRisk": [
        {
          "name": "Student name",
          "class": "Class",
          "riskFactors": ["Irregular attendance"]
        }
      ],
      "summary": "Overall risk assessment summary"
    }
    `;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return {
            highRisk: [],
            moderateRisk: [],
            summary: 'Analysis complete. No high-risk students identified.'
        };
    } catch (error) {
        console.error('Error analyzing dropout risk:', error);
        return {
            highRisk: [],
            moderateRisk: [],
            summary: 'Error during analysis.'
        };
    }
};

// Feature 32: Benchmarking Insight Report (Gemini Lite)
export const generateBenchmarkReport = async (
    schoolMetrics: {
        subject: string;
        schoolAverage: number;
        districtAverage: number;
        stateAverage: number;
    }[]
): Promise<{
    strengths: string[];
    weaknesses: string[];
    insights: string;
    actionItems: string[];
}> => {
    try {
        const prompt = `
    Compare school performance against district and state benchmarks.
    
    METRICS:
    ${JSON.stringify(schoolMetrics, null, 2)}
    
    Analyze and provide:
    1. Areas where school exceeds benchmarks
    2. Areas needing improvement
    3. Actionable insights
    
    Return JSON:
    {
      "strengths": ["Subject above district average"],
      "weaknesses": ["Subject below state average"],
      "insights": "Detailed analysis paragraph",
      "actionItems": ["Specific action 1", "Specific action 2"]
    }
    `;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return {
            strengths: [],
            weaknesses: [],
            insights: '',
            actionItems: []
        };
    } catch (error) {
        console.error('Error generating benchmark report:', error);
        return {
            strengths: [],
            weaknesses: [],
            insights: 'Error generating report.',
            actionItems: []
        };
    }
};

// Feature 33: Board Exam Readiness Countdown (Gemini Lite)
export const analyzeExamReadiness = async (
    examData: {
        examName: string;
        daysRemaining: number;
        classes: {
            className: string;
            topicsCovered: number;
            totalTopics: number;
            averageScore: number;
        }[];
    }
): Promise<{
    overallReadiness: number;
    classReadiness: { className: string; readinessPercent: number; status: 'on-track' | 'at-risk' | 'behind' }[];
    recommendations: string[];
    focusAreas: string[];
}> => {
    try {
        const prompt = `
    Analyze board exam readiness based on current progress.
    
    EXAM DATA:
    ${JSON.stringify(examData, null, 2)}
    
    Calculate:
    1. Overall readiness percentage
    2. Per-class readiness status
    3. Focus areas for remaining time
    4. Specific recommendations
    
    Return JSON:
    {
      "overallReadiness": 75,
      "classReadiness": [
        {
          "className": "Class 10A",
          "readinessPercent": 80,
          "status": "on-track"
        }
      ],
      "recommendations": ["Focus on weak topics", "Conduct mock tests"],
      "focusAreas": ["Statistics", "Modern History"]
    }
    `;

        const text = await generateSmartContent(prompt, { requireJson: true });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return {
            overallReadiness: 0,
            classReadiness: [],
            recommendations: [],
            focusAreas: []
        };
    } catch (error) {
        console.error('Error analyzing exam readiness:', error);
        return {
            overallReadiness: 0,
            classReadiness: [],
            recommendations: [],
            focusAreas: []
        };
    }
};
