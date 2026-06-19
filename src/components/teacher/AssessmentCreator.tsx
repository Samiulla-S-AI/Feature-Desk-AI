import { useState, useRef } from 'react';
import {
    FileText,
    Image,
    Sparkles,
    Check,
    X,
    Edit,
    Loader,
    PlusCircle,
    Save,
    Trash2,
    RefreshCw,
    Send,
    ArrowRight,
    Calendar,
    Clock,
    GraduationCap,
    BookOpen,
    Award,
    FileQuestion
} from 'lucide-react';
import { generateQuestionsFromPDF, extractQuestionsFromImage, classifyQuestionDifficulty, generateImageForQuestion, analyzeImageNecessity } from '../../lib/teacherAI';
import { chatWithPDF, fileToBase64, generateQuestionsFromPDFDirect } from '../../lib/pdfProcessor';
import { createAssessment, updateAssessment } from '../../lib/teacherDb';
import { useAuth } from '../../contexts/AuthContext';
import MarkdownRenderer from '../common/MarkdownRenderer';

interface Question {
    id: number;
    type: 'mcq' | 'short_answer' | 'long_answer';
    question: string;
    options?: string[];
    correct?: number;
    expectedAnswer?: string;
    rubric?: string[];
    explanation?: string;
    difficulty: 'easy' | 'medium' | 'hard';
    marks: number;
    status: 'pending' | 'accepted' | 'rejected' | 'edited';
    needsImage?: boolean; // AI confidence > 80%
    imagePrompt?: string;
    imageUrl?: string;
}

interface AssessmentCreatorProps {
    subjectCode: string;
    classId: number;
    availableSubjects?: string[];
    assessmentToEdit?: any;
    onClose: () => void;
}

export default function AssessmentCreator({ subjectCode, classId, availableSubjects, assessmentToEdit, onClose }: AssessmentCreatorProps) {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Selected subject state
    const [selectedSubject, setSelectedSubject] = useState(assessmentToEdit?.subject_code || subjectCode);

    const [step, setStep] = useState<'upload' | 'chat' | 'configure' | 'review' | 'examType' | 'schedule'>(
        assessmentToEdit ? 'review' : 'upload'
    );
    const [loading, setLoading] = useState(false);
    const [uploadedContent, setUploadedContent] = useState<string>('');
    const [questions, setQuestions] = useState<Question[]>(() => {
        if (assessmentToEdit?.questions) {
            return assessmentToEdit.questions.map((q: any) => ({
                ...q,
                status: q.status || 'accepted'
            }));
        }
        return [];
    });
    const [assessmentTitle, setAssessmentTitle] = useState(assessmentToEdit?.title || '');
    const [timeLimit, setTimeLimit] = useState(() => {
        if (assessmentToEdit?.time_limit) {
            return Math.floor(assessmentToEdit.time_limit / 60);
        }
        return 30;
    });
    const [scheduledDate, setScheduledDate] = useState(() => {
        if (assessmentToEdit?.scheduled_at) {
            try {
                return new Date(assessmentToEdit.scheduled_at).toISOString().slice(0, 16);
            } catch (e) {
                return '';
            }
        }
        return '';
    });
    const [editingQuestion, setEditingQuestion] = useState<number | null>(null);

    // Chat state
    const [chatMessage, setChatMessage] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
    const [isChatting, setIsChatting] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [pdfBase64, setPdfBase64] = useState<string>(''); // Store PDF as base64 for native Gemini support

    // Config for question generation
    const [config, setConfig] = useState({
        mcqCount: 5,
        twoMarkCount: 3,
        fiveMarkCount: 2,
        difficulty: 'mixed' as 'easy' | 'medium' | 'hard' | 'mixed'
    });

    // Exam type configuration
    const [examType, setExamType] = useState<'annual' | 'mid_term' | 'unit_test' | 'weekly' | 'practice' | 'quiz'>(
        assessmentToEdit?.exam_type || 'unit_test'
    );
    const [examConfig, setExamConfig] = useState({
        passingMarks: assessmentToEdit?.passing_marks ?? 40,
        negativeMarking: assessmentToEdit?.negative_marking || false,
        shuffleQuestions: assessmentToEdit?.shuffle_questions !== false,
        showResults: assessmentToEdit?.show_results !== false,
        allowReview: assessmentToEdit?.allow_review !== false,
        instructions: assessmentToEdit?.instructions || '',
        examPassword: assessmentToEdit?.exam_password || '' // 4-digit password for formal exams
    });

    const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);

        try {
            // Check if it's a PDF file
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                // Convert PDF to base64 for native Gemini support
                const base64 = await fileToBase64(file);
                setPdfBase64(base64);
                setUploadedContent(`PDF: ${file.name}`);
                console.log(`✅ PDF loaded: ${file.name} (${Math.round(base64.length / 1024)}KB)`);
                setStep('chat');
            } else {
                // For text files, read directly
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const content = event.target?.result as string;
                    setUploadedContent(content);
                    setStep('chat');
                };
                reader.readAsText(file);
            }
        } catch (error) {
            console.error('Error processing file:', error);
            alert('Error processing file. Please try again.');
        }

        setLoading(false);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = (event.target?.result as string).split(',')[1];

            try {
                const result = await extractQuestionsFromImage(base64);
                if (result.success) {
                    setUploadedContent(result.extractedText);
                    const classifiedQuestions = await classifyQuestionDifficulty(result.questions);
                    setQuestions(classifiedQuestions.map((q, i) => ({
                        ...q,
                        id: i + 1,
                        status: 'pending' as const
                    })));
                    setStep('review');
                }
            } catch (error) {
                console.error('Error processing image:', error);
                alert('Failed to extract questions from image');
            }

            setLoading(false);
        };

        reader.readAsDataURL(file);
    };

    const handleSendMessage = async () => {
        if (!chatMessage.trim()) return;

        const userMsg = chatMessage;
        setChatMessage('');
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsChatting(true);

        try {
            // Use native PDF chat if we have a PDF, otherwise use text-based chat
            if (pdfBase64) {
                const result = await chatWithPDF(pdfBase64, userMsg, chatHistory);
                setChatHistory(prev => [...prev, { role: 'model', content: result.text }]);

                // If questions were generated in the chat, offer to add them
                if (result.questions && result.questions.length > 0) {
                    const classifiedQuestions = await classifyQuestionDifficulty(result.questions);
                    const newQuestions = classifiedQuestions.map((q, i) => ({
                        ...q,
                        id: questions.length + i + 1,
                        status: 'pending' as const
                    }));

                    if (window.confirm(`AI generated ${newQuestions.length} questions. Do you want to add them to your assessment?`)) {
                        setQuestions(prev => [...prev, ...newQuestions]);
                        setStep('review');
                    }
                }
            } else {
                // Fallback for text content
                setChatHistory(prev => [...prev, { role: 'model', content: "Please upload a PDF to chat with it." }]);
            }
        } catch (error) {
            console.error('Chat error:', error);
            setChatHistory(prev => [...prev, { role: 'model', content: "I'm sorry, I encountered an error. Please try again." }]);
        }

        setIsChatting(false);
    };

    // Scroll to bottom of chat
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Effect to scroll on new messages
    if (step === 'chat') {
        setTimeout(scrollToBottom, 100);
    }

    const generateQuestions = async () => {
        if (!pdfBase64 && !uploadedContent.trim()) {
            alert('Please upload content first');
            return;
        }

        setLoading(true);

        try {
            // Use native PDF question generation if we have a PDF
            if (pdfBase64) {
                const result = await generateQuestionsFromPDFDirect(pdfBase64, {
                    subject: subjectCode,
                    mcqCount: config.mcqCount,
                    shortAnswerCount: config.twoMarkCount,
                    longAnswerCount: config.fiveMarkCount,
                    difficulty: config.difficulty
                });

                if (result.success && result.questions) {
                    const classifiedQuestions = await classifyQuestionDifficulty(result.questions);
                    setQuestions(classifiedQuestions.map((q, i) => ({
                        ...q,
                        id: i + 1,
                        status: 'pending' as const
                    })));
                    setStep('review');
                } else {
                    alert('Failed to generate questions. Please try again.');
                }
            } else {
                // Fallback for text content
                const result = await generateQuestionsFromPDF(uploadedContent, {
                    subject: subjectCode,
                    ...config
                });

                if (result.success) {
                    const classifiedQuestions = await classifyQuestionDifficulty(result.questions);
                    setQuestions(classifiedQuestions.map((q, i) => ({
                        ...q,
                        id: i + 1,
                        status: 'pending' as const
                    })));
                    setStep('review');
                } else {
                    alert('Failed to generate questions. Please try again.');
                }
            }
        } catch (error) {
            console.error('Error generating questions:', error);
            alert('Error generating questions');
        }

        setLoading(false);
    };

    const handleQuestionAction = (questionId: number, action: 'accept' | 'reject') => {
        setQuestions(prev =>
            prev.map(q =>
                q.id === questionId ? { ...q, status: action === 'accept' ? 'accepted' : 'rejected' } : q
            )
        );
    };

    const handleQuestionEdit = (questionId: number, field: string, value: any) => {
        setQuestions(prev =>
            prev.map(q =>
                q.id === questionId ? { ...q, [field]: value, status: 'edited' as const } : q
            )
        );
    };

    const addManualQuestion = () => {
        const newId = Math.max(...questions.map(q => q.id), 0) + 1;
        setQuestions(prev => [
            ...prev,
            {
                id: newId,
                type: 'mcq',
                question: '',
                options: ['', '', '', ''],
                correct: 0,
                difficulty: 'medium',
                marks: 1,
                status: 'pending'
            }
        ]);
        setEditingQuestion(newId);
    };

    const deleteQuestion = (questionId: number) => {
        setQuestions(prev => prev.filter(q => q.id !== questionId));
    };

    const regenerateQuestion = async (_questionId: number) => {
        // In production, regenerate specific question
        alert('Regenerating question...');
    };

    const saveAssessment = async () => {
        const acceptedQuestions = questions.filter(q => q.status !== 'rejected');

        if (acceptedQuestions.length === 0) {
            alert('Please accept at least one question');
            return;
        }

        if (!assessmentTitle.trim()) {
            alert('Please enter an assessment title');
            return;
        }

        setLoading(true);

        const totalMarks = acceptedQuestions.reduce((sum, q) => sum + q.marks, 0);

        // Validate password for formal exams
        if ((examType === 'annual' || examType === 'mid_term') && examConfig.examPassword.length !== 4) {
            setLoading(false);
            alert('Please enter a 4-digit password for formal exams');
            return;
        }

        const assessmentData = {
            title: assessmentTitle,
            subject_code: selectedSubject,
            class_id: classId,
            questions: acceptedQuestions.map(q => ({
                id: q.id,
                question: q.question,
                options: q.options || [],
                correct: q.correct ?? 0,
                explanation: q.explanation || '',
                difficulty: q.difficulty,
                marks: q.marks,
                type: q.type,
                status: q.status
            })),
            total_marks: totalMarks,
            time_limit: timeLimit * 60, // Convert to seconds
            scheduled_at: scheduledDate || undefined,
            is_active: assessmentToEdit ? assessmentToEdit.is_active : !scheduledDate, // Keep active status if editing
            created_by: assessmentToEdit ? assessmentToEdit.created_by : (user?.id || ''),
            exam_type: examType,
            passing_marks: examConfig.passingMarks,
            negative_marking: examConfig.negativeMarking,
            shuffle_questions: examConfig.shuffleQuestions,
            instructions: examConfig.instructions || undefined,
            exam_password: (examType === 'annual' || examType === 'mid_term') ? examConfig.examPassword : undefined
        };

        let result;
        if (assessmentToEdit) {
            result = await updateAssessment(assessmentToEdit.id, assessmentData);
        } else {
            result = await createAssessment(assessmentData);
        }

        setLoading(false);

        if (result.success) {
            alert(assessmentToEdit ? 'Assessment updated successfully!' : 'Assessment created successfully!');
            onClose();
        } else {
            alert(assessmentToEdit ? 'Failed to update assessment' : 'Failed to create assessment');
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'easy': return 'bg-green-100 text-green-800';
            case 'medium': return 'bg-yellow-100 text-yellow-800';
            case 'hard': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleCheckNecessity = async (questionId: number) => {
        const question = questions.find(q => q.id === questionId);
        if (!question) return;

        // Optimistic update or global loading? Let's use a toast in a real app, but here just alert/log
        console.log('Checking necessity for Q', questionId);

        const result = await analyzeImageNecessity(question.question);

        setQuestions(prev => prev.map(q =>
            q.id === questionId ? {
                ...q,
                needsImage: result.needed,
                imagePrompt: result.prompt || (result.needed ? `Diagram for: ${question.question}` : undefined),
                status: 'edited'
            } : q
        ));

        if (result.needed) {
            // Optional: Auto-generate if needed? No, user wants manual choice.
            console.log('Image needed for Q', questionId);
        } else {
            console.log('Image not needed for Q', questionId);
        }
    };

    const handleGenerateImage = async (questionId: number) => {
        const question = questions.find(q => q.id === questionId);
        if (!question) return;

        const prompt = question.imagePrompt || `Educational illustration for: ${question.question}`;

        // Show temporary loading indicator on the question? We don't have local state for it per question, 
        // so we'll just set the global loading for now or optimistically assume it works fast with the mock.
        // For better UX, we could add a `isGeneratingImage` field to the question temporarily.

        const imageUrl = await generateImageForQuestion(prompt);

        if (imageUrl) {
            setQuestions(prev => prev.map(q =>
                q.id === questionId ? {
                    ...q,
                    imageUrl: imageUrl,
                    status: 'edited'
                } : q
            ));
        } else {
            alert('Failed to generate image. Please try again.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{assessmentToEdit ? 'Edit Assessment' : 'Create Assessment'}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            {availableSubjects && availableSubjects.length > 1 ? (
                                <select
                                    value={selectedSubject}
                                    onChange={(e) => setSelectedSubject(e.target.value)}
                                    className="text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500"
                                >
                                    {availableSubjects.map(subject => (
                                        <option key={subject} value={subject}>{subject}</option>
                                    ))}
                                </select>
                            ) : (
                                <span className="text-gray-600">{selectedSubject}</span>
                            )}
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-600">Class {classId}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="px-6 py-4 bg-gray-50 border-b">
                    <div className="flex items-center justify-between">
                        {['upload', 'chat', 'configure', 'review', 'schedule'].map((s, i) => (
                            <div key={s} className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s ? 'bg-blue-600 text-white' :
                                    ['upload', 'chat', 'configure', 'review', 'schedule'].indexOf(step) > i
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-200 text-gray-600'
                                    }`}>
                                    {['upload', 'chat', 'configure', 'review', 'schedule'].indexOf(step) > i ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        i + 1
                                    )}
                                </div>
                                {i < 4 && (
                                    <div className={`w-8 md:w-16 h-1 mx-1 md:mx-2 rounded ${['upload', 'chat', 'configure', 'review', 'schedule'].indexOf(step) > i
                                        ? 'bg-green-500'
                                        : 'bg-gray-200'
                                        }`} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-600">
                        <span>Upload</span>
                        <span>Analyze</span>
                        <span>Configure</span>
                        <span>Review</span>
                        <span>Schedule</span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <Loader className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                            <p className="text-gray-600">Processing with AI...</p>
                            <p className="text-xs text-gray-400 mt-2">This may take a few seconds</p>
                        </div>
                    ) : (
                        <>
                            {/* Step 1: Upload */}
                            {step === 'upload' && (
                                <div className="space-y-6">
                                    <div className="text-center mb-8">
                                        <Sparkles className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold text-gray-900">AI-Powered Question Generation</h3>
                                        <p className="text-gray-600">Upload your lesson content and let AI generate questions for you</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* PDF Upload */}
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                                        >
                                            <FileText className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                                            <h4 className="font-semibold text-gray-900 mb-2">Upload PDF/Text</h4>
                                            <p className="text-sm text-gray-500">Lesson notes, textbook chapters, or any content</p>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".pdf,.txt,.md"
                                                onChange={handlePDFUpload}
                                                className="hidden"
                                            />
                                        </div>

                                        {/* Image Upload */}
                                        <div
                                            onClick={() => imageInputRef.current?.click()}
                                            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all"
                                        >
                                            <Image className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                                            <h4 className="font-semibold text-gray-900 mb-2">Import from Image</h4>
                                            <p className="text-sm text-gray-500">Photo of handwritten questions or printed papers</p>
                                            <input
                                                ref={imageInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>

                                    {/* Manual Entry Option */}
                                    <div className="text-center mt-6">
                                        <p className="text-sm text-gray-500 mb-2">Or create questions manually</p>
                                        <button
                                            onClick={() => {
                                                setStep('review');
                                                addManualQuestion();
                                            }}
                                            className="text-blue-600 hover:text-blue-700 font-medium"
                                        >
                                            Start from scratch →
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Chat & Analyze */}
                            {step === 'chat' && (
                                <div className="flex flex-col h-full">
                                    <div className="flex-1 bg-gray-50 rounded-xl p-4 mb-4 overflow-y-auto max-h-[400px] border border-gray-200">
                                        <div className="space-y-4">
                                            {/* System Welcome Message */}
                                            <div className="flex justify-start">
                                                <div className="bg-white border border-gray-200 rounded-lg p-3 max-w-[80%] shadow-sm">
                                                    <p className="text-sm text-gray-800">
                                                        I've analyzed your document. You can ask me to explain concepts, summarize content, or generate specific questions.
                                                        <br /><br />
                                                        Click <b>"Next"</b> when you're ready to configure the assessment.
                                                    </p>
                                                </div>
                                            </div>

                                            {chatHistory.map((msg, idx) => (
                                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`rounded-lg p-3 max-w-[80%] shadow-sm ${msg.role === 'user'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white border border-gray-200 text-gray-800'
                                                        }`}>
                                                        {msg.role === 'user' ? (
                                                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                        ) : (
                                                            <MarkdownRenderer content={msg.content} className="text-sm" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            <div ref={chatEndRef} />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={chatMessage}
                                            onChange={(e) => setChatMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                            placeholder="Ask about the document or request specific questions..."
                                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            disabled={isChatting}
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={isChatting || !chatMessage.trim()}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                        >
                                            {isChatting ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                        </button>
                                    </div>

                                    <div className="mt-4 flex justify-end">
                                        <button
                                            onClick={() => setStep('configure')}
                                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                                        >
                                            <span>Configure Assessment</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Configure */}
                            {step === 'configure' && (
                                <div className="space-y-6 max-w-md mx-auto">
                                    <div className="text-center mb-8">
                                        <h3 className="text-lg font-semibold text-gray-900">Configure Question Types</h3>
                                        <p className="text-gray-600">Specify how many questions of each type to generate</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                MCQ Questions (1 mark each)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="20"
                                                value={config.mcqCount}
                                                onChange={(e) => setConfig(prev => ({ ...prev, mcqCount: parseInt(e.target.value) }))}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Short Answer Questions (2 marks each)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="10"
                                                value={config.twoMarkCount}
                                                onChange={(e) => setConfig(prev => ({ ...prev, twoMarkCount: parseInt(e.target.value) }))}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Long Answer Questions (5 marks each)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="5"
                                                value={config.fiveMarkCount}
                                                onChange={(e) => setConfig(prev => ({ ...prev, fiveMarkCount: parseInt(e.target.value) }))}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Difficulty Level
                                            </label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {(['easy', 'medium', 'hard', 'mixed'] as const).map((level) => (
                                                    <button
                                                        key={level}
                                                        type="button"
                                                        onClick={() => setConfig(prev => ({ ...prev, difficulty: level }))}
                                                        className={`py-2 px-3 text-sm font-medium rounded-xl border capitalize transition-all ${
                                                            config.difficulty === level
                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-blue-50 p-4 rounded-xl">
                                            <p className="text-sm text-blue-800">
                                                <strong>Total:</strong> {config.mcqCount + config.twoMarkCount + config.fiveMarkCount} questions
                                                <br />
                                                <strong>Total Marks:</strong> {config.mcqCount * 1 + config.twoMarkCount * 2 + config.fiveMarkCount * 5}
                                            </p>
                                        </div>

                                        <div className="pt-4 border-t">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Answer Key / Key Points (Optional)
                                            </label>
                                            <p className="text-xs text-gray-500 mb-2">Provide correct answers or key concepts to guide the AI</p>
                                            <textarea
                                                rows={3}
                                                placeholder="e.g. Q1: 42, Key concept for essay: Thermodynamics..."
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                onChange={(e) => setUploadedContent(prev => prev + "\n\nANSWER KEY CONTEXT:\n" + e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Rubric / Mark Distribution Rules
                                            </label>
                                            <p className="text-xs text-gray-500 mb-2">Instructions for AI grading (e.g. "Give 1 mark for formula, 1 for result")</p>
                                            <textarea
                                                rows={3}
                                                placeholder="e.g. For 5 mark questions: 2 marks for diagram, 2 for explanation, 1 for example"
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                onChange={(e) => setUploadedContent(prev => prev + "\n\nRUBRIC CONTEXT:\n" + e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={generateQuestions}
                                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center space-x-2"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                        <span>Generate Questions with AI</span>
                                    </button>
                                </div>
                            )}

                            {/* Step 3: Review Questions */}
                            {step === 'review' && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">Review Questions</h3>
                                            <p className="text-gray-600">
                                                {questions.filter(q => q.status === 'accepted' || q.status === 'edited').length} accepted,
                                                {' '}{questions.filter(q => q.status === 'pending').length} pending,
                                                {' '}{questions.filter(q => q.status === 'rejected').length} rejected
                                            </p>
                                        </div>
                                        <button
                                            onClick={addManualQuestion}
                                            className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                        >
                                            <PlusCircle className="w-4 h-4" />
                                            <span>Add Question</span>
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {questions.map((question, index) => (
                                            <div
                                                key={question.id}
                                                className={`border rounded-xl p-4 ${question.status === 'accepted' || question.status === 'edited'
                                                    ? 'border-green-300 bg-green-50'
                                                    : question.status === 'rejected'
                                                        ? 'border-red-300 bg-red-50 opacity-50'
                                                        : 'border-gray-200'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                                                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${getDifficultyColor(question.difficulty)}`}>
                                                            {question.difficulty}
                                                        </span>
                                                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                                            {question.marks} mark{question.marks > 1 ? 's' : ''}
                                                        </span>
                                                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded capitalize">
                                                            {question.type.replace('_', ' ')}
                                                        </span>
                                                        {question.needsImage && (
                                                            <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded flex items-center gap-1">
                                                                <Image className="w-3 h-3" />
                                                                Needs Image
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center space-x-1">
                                                        <button
                                                            onClick={() => setEditingQuestion(editingQuestion === question.id ? null : question.id)}
                                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => regenerateQuestion(question.id)}
                                                            className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                                        >
                                                            <RefreshCw className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteQuestion(question.id)}
                                                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {editingQuestion === question.id ? (
                                                    <div className="space-y-3">
                                                        <textarea
                                                            value={question.question}
                                                            onChange={(e) => handleQuestionEdit(question.id, 'question', e.target.value)}
                                                            rows={2}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        {question.type === 'mcq' && question.options && (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {question.options.map((opt, optIndex) => (
                                                                    <input
                                                                        key={optIndex}
                                                                        type="text"
                                                                        value={opt}
                                                                        onChange={(e) => {
                                                                            const newOptions = [...question.options!];
                                                                            newOptions[optIndex] = e.target.value;
                                                                            handleQuestionEdit(question.id, 'options', newOptions);
                                                                        }}
                                                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                                                        placeholder={`Option ${optIndex + 1}`}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Image Generation Controls */}
                                                        <div className="pt-3 border-t flex flex-col gap-2 mt-2">
                                                            <div className="flex items-center justify-between">
                                                                <label className="flex items-center space-x-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={question.needsImage || false}
                                                                        onChange={(e) => handleQuestionEdit(question.id, 'needsImage', e.target.checked)}
                                                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                                    />
                                                                    <span className="text-sm font-medium text-gray-700">Needs Visual Aid / Image</span>
                                                                </label>
                                                                <button
                                                                    onClick={() => handleCheckNecessity(question.id)}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                                                                >
                                                                    Check Necessity with AI
                                                                </button>
                                                            </div>

                                                            {question.needsImage && (
                                                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                                                    <label className="block text-xs font-medium text-purple-800 mb-1">Image Prompt (Gemini 2.5 Flash)</label>
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={question.imagePrompt || ''}
                                                                            onChange={(e) => handleQuestionEdit(question.id, 'imagePrompt', e.target.value)}
                                                                            placeholder="Describe the image..."
                                                                            className="flex-1 px-2 py-1 text-sm border border-purple-200 rounded"
                                                                        />
                                                                        <button
                                                                            onClick={() => handleGenerateImage(question.id)}
                                                                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition flex items-center gap-1"
                                                                        >
                                                                            <Sparkles className="w-3 h-3" />
                                                                            Generate
                                                                        </button>
                                                                    </div>
                                                                    {question.imageUrl && (
                                                                        <div className="mt-2 relative group">
                                                                            <img src={question.imageUrl} alt="Generated Question Aid" className="w-full h-40 object-contain bg-white rounded border border-gray-200" />
                                                                            <button
                                                                                onClick={() => handleQuestionEdit(question.id, 'imageUrl', undefined)}
                                                                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                title="Remove Image"
                                                                            >
                                                                                <X className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <p className="text-gray-900 font-medium mb-2">{question.question || 'No question text'}</p>
                                                        {question.type === 'mcq' && question.options && (
                                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                                {question.options.map((opt, optIndex) => (
                                                                    <div
                                                                        key={optIndex}
                                                                        className={`px-3 py-1.5 rounded ${question.correct === optIndex
                                                                            ? 'bg-green-100 text-green-800'
                                                                            : 'bg-gray-100 text-gray-700'
                                                                            }`}
                                                                    >
                                                                        {String.fromCharCode(65 + optIndex)}. {opt}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {question.explanation && (
                                                            <p className="text-sm text-gray-500 mt-2 italic">
                                                                💡 {question.explanation}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {question.status === 'pending' && (
                                                    <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
                                                        <button
                                                            onClick={() => handleQuestionAction(question.id, 'accept')}
                                                            className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                            <span>Accept</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleQuestionAction(question.id, 'reject')}
                                                            className="flex-1 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center justify-center space-x-2"
                                                        >
                                                            <X className="w-4 h-4" />
                                                            <span>Reject</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {questions.length > 0 && (
                                        <button
                                            onClick={() => setStep('examType')}
                                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                                        >
                                            Continue to Exam Type
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Step 4: Exam Type Selection */}
                            {step === 'examType' && (
                                <div className="space-y-6 max-w-2xl mx-auto">
                                    <div className="text-center mb-8">
                                        <h3 className="text-lg font-semibold text-gray-900">Select Exam Type</h3>
                                        <p className="text-gray-600">Choose what type of assessment this will be</p>
                                    </div>

                                    {/* Exam Type Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {[
                                            { id: 'annual', name: 'Annual Exam', icon: GraduationCap, desc: 'End of year examination', color: 'from-purple-500 to-pink-500' },
                                            { id: 'mid_term', name: 'Mid-Term', icon: BookOpen, desc: 'Mid-semester assessment', color: 'from-blue-500 to-cyan-500' },
                                            { id: 'unit_test', name: 'Unit Test', icon: FileQuestion, desc: 'Chapter or unit assessment', color: 'from-orange-500 to-amber-500' },
                                            { id: 'weekly', name: 'Weekly Test', icon: Calendar, desc: 'Weekly progress check', color: 'from-green-500 to-emerald-500' },
                                            { id: 'practice', name: 'Practice Test', icon: Award, desc: 'Practice without grading', color: 'from-gray-500 to-slate-500' },
                                            { id: 'quiz', name: 'Quick Quiz', icon: Clock, desc: 'Short timed quiz', color: 'from-rose-500 to-red-500' }
                                        ].map(type => (
                                            <button
                                                key={type.id}
                                                onClick={() => setExamType(type.id as any)}
                                                className={`p-4 rounded-xl border-2 transition-all text-left ${examType === type.id
                                                    ? 'border-purple-500 bg-purple-50 shadow-lg'
                                                    : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                                                    }`}
                                            >
                                                <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${type.color} flex items-center justify-center mb-3`}>
                                                    <type.icon className="w-5 h-5 text-white" />
                                                </div>
                                                <h4 className="font-semibold text-gray-900">{type.name}</h4>
                                                <p className="text-xs text-gray-500 mt-1">{type.desc}</p>
                                                {examType === type.id && (
                                                    <div className="mt-2 flex items-center text-purple-600">
                                                        <Check className="w-4 h-4 mr-1" />
                                                        <span className="text-xs font-medium">Selected</span>
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Exam Settings */}
                                    <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                                        <h4 className="font-medium text-gray-900">Exam Settings</h4>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Passing Marks (%)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={examConfig.passingMarks}
                                                    onChange={(e) => setExamConfig(prev => ({ ...prev, passingMarks: Number(e.target.value) }))}
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="flex items-center space-x-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={examConfig.negativeMarking}
                                                        onChange={(e) => setExamConfig(prev => ({ ...prev, negativeMarking: e.target.checked }))}
                                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                    <span className="text-sm text-gray-700">Negative Marking</span>
                                                </label>
                                                <label className="flex items-center space-x-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={examConfig.shuffleQuestions}
                                                        onChange={(e) => setExamConfig(prev => ({ ...prev, shuffleQuestions: e.target.checked }))}
                                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                    <span className="text-sm text-gray-700">Shuffle Questions</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Special Instructions (Optional)</label>
                                            <textarea
                                                value={examConfig.instructions}
                                                onChange={(e) => setExamConfig(prev => ({ ...prev, instructions: e.target.value }))}
                                                placeholder="Enter any special instructions for students..."
                                                rows={2}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setStep('schedule')}
                                        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                                    >
                                        Continue to Schedule
                                    </button>
                                </div>
                            )}

                            {/* Step 5: Schedule */}
                            {step === 'schedule' && (
                                <div className="space-y-6 max-w-md mx-auto">
                                    <div className="text-center mb-8">
                                        <h3 className="text-lg font-semibold text-gray-900">Assessment Details</h3>
                                        <p className="text-gray-600">Set title, time limit, and schedule</p>
                                    </div>

                                    {/* Show selected exam type badge */}
                                    <div className="flex justify-center mb-4">
                                        <span className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium capitalize">
                                            {examType.replace('_', ' ')} Examination
                                        </span>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Assessment Title *
                                            </label>
                                            <input
                                                type="text"
                                                value={assessmentTitle}
                                                onChange={(e) => setAssessmentTitle(e.target.value)}
                                                placeholder="e.g., Chapter 3 Quiz - Photosynthesis"
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Time Limit (minutes)
                                            </label>
                                            <input
                                                type="number"
                                                min="5"
                                                max="180"
                                                value={timeLimit}
                                                onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Schedule For (Optional)
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={scheduledDate}
                                                onChange={(e) => setScheduledDate(e.target.value)}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Leave empty to make it available immediately
                                            </p>
                                        </div>

                                        {/* Password field for formal exams */}
                                        {(examType === 'annual' || examType === 'mid_term') && (
                                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                                                <label className="block text-sm font-medium text-purple-800 mb-2">
                                                    🔐 Exam Password (4 digits) *
                                                </label>
                                                <input
                                                    type="text"
                                                    maxLength={4}
                                                    pattern="[0-9]{4}"
                                                    value={examConfig.examPassword}
                                                    onChange={(e) => {
                                                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                                                        setExamConfig(prev => ({ ...prev, examPassword: value }));
                                                    }}
                                                    placeholder="e.g., 1234"
                                                    className="w-full px-4 py-3 border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center text-2xl font-mono tracking-widest"
                                                />
                                                <p className="text-xs text-purple-600 mt-2">
                                                    Students will enter: <strong>{examConfig.examPassword || '____'} + Roll Number</strong>
                                                    <br />
                                                    Example: If password is 1234 and roll number is 7A001, student enters: <strong>12347A001</strong>
                                                </p>
                                            </div>
                                        )}

                                        <div className="bg-blue-50 p-4 rounded-xl">
                                            <p className="text-sm text-blue-800">
                                                <strong>Summary:</strong>
                                                <br />
                                                • {questions.filter(q => q.status !== 'rejected').length} questions
                                                <br />
                                                • {questions.filter(q => q.status !== 'rejected').reduce((sum, q) => sum + q.marks, 0)} total marks
                                                <br />
                                                • {timeLimit} minutes
                                                {(examType === 'annual' || examType === 'mid_term') && examConfig.examPassword && (
                                                    <>
                                                        <br />
                                                        • Password: {examConfig.examPassword} + Roll Number
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={saveAssessment}
                                        disabled={!assessmentTitle.trim()}
                                        className="w-full py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Save className="w-5 h-5" />
                                        <span>{assessmentToEdit ? 'Save Changes' : 'Create Assessment'}</span>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Navigation */}
                <div className="p-4 border-t bg-gray-50 flex justify-between">
                    <button
                        onClick={() => {
                            const steps: ('upload' | 'chat' | 'configure' | 'review' | 'examType' | 'schedule')[] = ['upload', 'chat', 'configure', 'review', 'examType', 'schedule'];
                            const currentIndex = steps.indexOf(step);
                            if (currentIndex > 0) {
                                setStep(steps[currentIndex - 1]);
                            }
                        }}
                        disabled={step === 'upload'}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ← Back
                    </button>
                    <div className="text-sm text-gray-500">
                        Step {['upload', 'chat', 'configure', 'review', 'examType', 'schedule'].indexOf(step) + 1} of 6
                    </div>
                </div>
            </div>
        </div>
    );
}
