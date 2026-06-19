import { useState, useEffect } from 'react';
import {
    BookOpen,
    Brain,
    Clock,
    ArrowRight,
    AlertCircle,
    Loader,
    Sparkles,
    FileText
} from 'lucide-react';
import { hasUploadedMaterials, getRandomQuizQuestions } from '../../lib/questionDb';

interface AssessmentLauncherProps {
    assessmentType: 'quiz' | 'test' | 'exam';
    subject: string;
    classId: number;
    title?: string;
    duration?: number;
    questionCount?: number;
    onStartWithContent: (questions: any[]) => void;
    onStartWithAI: () => void;
    onCancel: () => void;
}

export default function AssessmentLauncher({
    assessmentType,
    subject,
    classId,
    title,
    duration = 30,
    questionCount = 5,
    onStartWithContent,
    onStartWithAI,
    onCancel
}: AssessmentLauncherProps) {
    const [loading, setLoading] = useState(true);
    const [hasContent, setHasContent] = useState(false);
    const [questionCount_, setQuestionCount_] = useState(0);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Subject display name
    const getSubjectDisplayName = (code?: string): string => {
        if (!code) return '';
        const upper = code.toUpperCase();
        if (upper === 'MATH') return 'Mathematics';
        if (upper === 'SCI' || upper === 'SCIENCE') return 'Science';
        if (upper === 'ENG' || upper === 'ENGLISH') return 'English';
        if (upper === 'HIST' || upper === 'GEO' || upper === 'SOCIAL') return 'Social Studies';
        if (upper === 'COMP' || upper === 'COMPUTER') return 'Computer Science';
        if (upper === 'HINDI') return 'Hindi';
        if (upper === 'TAMIL') return 'Tamil';
        if (upper === 'PHY') return 'Physics';
        return code;
    };

    const subjectName = getSubjectDisplayName(subject);

    // Assessment type display
    const assessmentName = assessmentType === 'quiz' ? 'Quiz' :
        assessmentType === 'test' ? 'Unit Test' : 'Examination';

    useEffect(() => {
        checkContentAvailability();
    }, [classId, subject]);

    const checkContentAvailability = async () => {
        setLoading(true);
        setError(null);

        try {
            // Check if teacher has uploaded materials
            const hasMaterials = await hasUploadedMaterials(classId, subject);
            setHasContent(hasMaterials);

            if (hasMaterials) {
                // Get count of available questions
                const { questions, available } = await getRandomQuizQuestions(
                    classId,
                    subject,
                    100, // Get max to count
                    'mixed'
                );
                setQuestionCount_(available ? questions.length : 0);
            }
        } catch (err) {
            console.error('Error checking content:', err);
            setError('Failed to check content availability');
        } finally {
            setLoading(false);
        }
    };

    const handleStartWithTeacherContent = async () => {
        setLoading(true);
        try {
            const { questions, available } = await getRandomQuizQuestions(
                classId,
                subject,
                questionCount,
                'mixed'
            );

            if (available && questions.length > 0) {
                onStartWithContent(questions);
            } else {
                setError('No questions available. Please try generating with AI.');
            }
        } catch (err) {
            setError('Failed to load questions');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateWithAI = async () => {
        setGeneratingAI(true);
        setError(null);

        try {
            // Generate questions with AI on-the-fly
            onStartWithAI();
        } catch (err) {
            setError('Failed to generate questions with AI');
            setGeneratingAI(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 mx-auto mb-4">
                        <Loader className="w-16 h-16 text-blue-500 animate-spin" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800">
                        Checking Content Availability...
                    </h2>
                    <p className="text-gray-500 mt-2">
                        Please wait while we check for available questions
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <BookOpen className="w-6 h-6" />
                        {title || `${subjectName} ${assessmentName}`}
                    </h2>
                    <p className="text-blue-100 mt-1">
                        Class {classId} • {duration} minutes • {questionCount} questions
                    </p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}

                    {hasContent && questionCount_ > 0 ? (
                        // Teacher has uploaded content - show direct start option
                        <div className="space-y-4">
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-green-800">
                                            Teacher Content Available! ✅
                                        </h3>
                                        <p className="text-sm text-green-700 mt-1">
                                            Your teacher has uploaded study materials with{' '}
                                            <strong>{questionCount_}</strong> questions ready.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleStartWithTeacherContent}
                                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg"
                            >
                                <ArrowRight className="w-5 h-5" />
                                Start {assessmentName} Now
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-gray-500">or</span>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateWithAI}
                                disabled={generatingAI}
                                className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:from-purple-600 hover:to-indigo-700 transition-all"
                            >
                                {generatingAI ? (
                                    <>
                                        <Loader className="w-5 h-5 animate-spin" />
                                        Generating with AI...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        Generate Fresh AI Questions
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        // No teacher content - ask to generate with AI
                        <div className="space-y-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <AlertCircle className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-amber-800">
                                            No Teacher Content Yet
                                        </h3>
                                        <p className="text-sm text-amber-700 mt-1">
                                            Your teacher hasn't uploaded materials for {subjectName} yet.
                                            You can wait, or generate practice questions with AI.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateWithAI}
                                disabled={generatingAI}
                                className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:from-purple-600 hover:to-indigo-700 transition-all shadow-lg"
                            >
                                {generatingAI ? (
                                    <>
                                        <Loader className="w-5 h-5 animate-spin" />
                                        Generating with AI...
                                    </>
                                ) : (
                                    <>
                                        <Brain className="w-6 h-6" />
                                        Generate {assessmentName} with AI
                                    </>
                                )}
                            </button>

                            <p className="text-center text-xs text-gray-500">
                                AI-generated questions are for practice.
                                Official assessments use teacher-provided content.
                            </p>

                            <div className="bg-blue-50 rounded-xl p-4">
                                <h4 className="font-medium text-blue-800 mb-2">💡 What happens next?</h4>
                                <ul className="text-sm text-blue-700 space-y-1">
                                    <li>• AI will generate {questionCount} questions for {subjectName}</li>
                                    <li>• Questions are based on standard curriculum</li>
                                    <li>• You'll get immediate feedback on your answers</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {duration} min
                    </div>
                </div>
            </div>
        </div>
    );
}
