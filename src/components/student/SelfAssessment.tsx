import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    ArrowLeft,
    Star,
    ThumbsUp,
    ThumbsDown,
    MessageCircle,
    TrendingUp,
    Brain,
    CheckCircle,
    AlertCircle,
    Lightbulb,
    BookOpen,
    Target,
    Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SelfAssessmentEntry {
    id: string;
    student_id: string;
    topic: string;
    subject: string;
    understanding_level: 1 | 2 | 3 | 4 | 5;
    confidence_level: 'low' | 'medium' | 'high';
    needs_help: boolean;
    specific_difficulties?: string;
    created_at: string;
}

interface TopicSuggestion {
    topic: string;
    subject: string;
    reason: string;
}

export default function SelfAssessment() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [currentTopic, setCurrentTopic] = useState('');
    const [currentSubject, setCurrentSubject] = useState((user as any)?.current_subject || 'MATH');
    const [understandingLevel, setUnderstandingLevel] = useState<number>(3);
    const [confidenceLevel, setConfidenceLevel] = useState<'low' | 'medium' | 'high'>('medium');
    const [needsHelp, setNeedsHelp] = useState(false);
    const [difficulties, setDifficulties] = useState('');
    const [recentAssessments, setRecentAssessments] = useState<SelfAssessmentEntry[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<TopicSuggestion[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // Mock topics for each subject
    const topicsBySubject: Record<string, string[]> = {
        MATH: ['Algebra', 'Geometry', 'Trigonometry', 'Calculus', 'Statistics', 'Probability'],
        SCIENCE: ['Physics - Motion', 'Chemistry - Reactions', 'Biology - Cells', 'Physics - Light', 'Chemistry - Acids'],
        ENGLISH: ['Grammar', 'Comprehension', 'Essay Writing', 'Poetry', 'Literature'],
        HINDI: ['व्याकरण', 'निबंध', 'कविता', 'गद्य', 'पत्र लेखन'],
        TAMIL: ['இலக்கணம்', 'கட்டுரை', 'செய்யுள்', 'உரைநடை'],
        SOCIAL: ['History', 'Geography', 'Civics', 'Economics'],
        COMPUTER: ['Scratch Programming', 'Python Basics', 'Algorithms', 'Computer Networks', 'Hardware & Software']
    };

    // Load recent assessments
    useEffect(() => {
        loadRecentAssessments();
        generateAISuggestions();
    }, []);

    const loadRecentAssessments = async () => {
        try {
            const { data, error } = await supabase
                .from('self_assessments')
                .select('*')
                .eq('student_id', (user as any)?.id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (!error && data) {
                setRecentAssessments(data);
            } else {
                // Mock data for demo
                setRecentAssessments([
                    {
                        id: '1',
                        student_id: (user as any)?.id || 'demo',
                        topic: 'Quadratic Equations',
                        subject: 'MATH',
                        understanding_level: 4,
                        confidence_level: 'high',
                        needs_help: false,
                        created_at: new Date(Date.now() - 86400000).toISOString()
                    },
                    {
                        id: '2',
                        student_id: (user as any)?.id || 'demo',
                        topic: 'Newton\'s Laws',
                        subject: 'SCIENCE',
                        understanding_level: 2,
                        confidence_level: 'low',
                        needs_help: true,
                        specific_difficulties: 'Struggling with third law applications',
                        created_at: new Date(Date.now() - 172800000).toISOString()
                    }
                ]);
            }
        } catch (error) {
            console.error('Failed to load assessments:', error);
        }
    };

    const generateAISuggestions = async () => {
        setLoadingSuggestions(true);
        try {
            // In production, this would call AI API
            // For demo, using mock suggestions
            setTimeout(() => {
                setAiSuggestions([
                    {
                        topic: 'Trigonometric Identities',
                        subject: 'MATH',
                        reason: 'Based on your strong performance in Algebra, you might find this interesting'
                    },
                    {
                        topic: 'Wave Motion',
                        subject: 'SCIENCE',
                        reason: 'This builds on your recent study of Newton\'s Laws'
                    }
                ]);
                setLoadingSuggestions(false);
            }, 1000);
        } catch (error) {
            console.error('Failed to generate suggestions:', error);
            setLoadingSuggestions(false);
        }
    };

    const handleSubmit = async () => {
        if (!currentTopic) return;

        setIsSubmitting(true);
        try {
            const assessment: Omit<SelfAssessmentEntry, 'id' | 'created_at'> = {
                student_id: (user as any)?.id || 'demo',
                topic: currentTopic,
                subject: currentSubject,
                understanding_level: understandingLevel as 1 | 2 | 3 | 4 | 5,
                confidence_level: confidenceLevel,
                needs_help: needsHelp,
                specific_difficulties: difficulties || undefined
            };

            const { error } = await supabase
                .from('self_assessments')
                .insert(assessment);

            if (error) throw error;

            // Add to local state
            setRecentAssessments(prev => [{
                ...assessment,
                id: `temp_${Date.now()}`,
                created_at: new Date().toISOString()
            }, ...prev]);

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);

            // Reset form
            setCurrentTopic('');
            setUnderstandingLevel(3);
            setConfidenceLevel('medium');
            setNeedsHelp(false);
            setDifficulties('');

        } catch (error) {
            console.error('Failed to submit assessment:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getUnderstandingLabel = (level: number) => {
        switch (level) {
            case 1: return 'Not Understanding';
            case 2: return 'Struggling';
            case 3: return 'Getting There';
            case 4: return 'Confident';
            case 5: return 'Mastered';
            default: return '';
        }
    };

    const getUnderstandingColor = (level: number) => {
        switch (level) {
            case 1: return 'text-red-500';
            case 2: return 'text-orange-500';
            case 3: return 'text-yellow-500';
            case 4: return 'text-green-500';
            case 5: return 'text-emerald-600';
            default: return 'text-gray-500';
        }
    };

    const getConfidenceIcon = (level: string) => {
        switch (level) {
            case 'low': return <AlertCircle className="w-5 h-5 text-red-500" />;
            case 'medium': return <Target className="w-5 h-5 text-yellow-500" />;
            case 'high': return <CheckCircle className="w-5 h-5 text-green-500" />;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
            {/* Header */}
            <div className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2">
                            <Brain className="w-6 h-6 text-purple-500" />
                            <h1 className="text-xl font-bold text-gray-800">Self Assessment</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <TrendingUp className="w-4 h-4" />
                        <span>Track your learning journey</span>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Form */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* New Assessment Card */}
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                            <h2 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-blue-500" />
                                Rate Your Understanding
                            </h2>

                            {/* Subject Selection */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.keys(topicsBySubject).map(subject => (
                                        <button
                                            key={subject}
                                            onClick={() => {
                                                setCurrentSubject(subject);
                                                setCurrentTopic('');
                                            }}
                                            className={`px-4 py-2 rounded-lg font-medium transition-all ${currentSubject === subject
                                                ? 'bg-blue-500 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {subject}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Topic Selection */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
                                <div className="flex flex-wrap gap-2">
                                    {topicsBySubject[currentSubject]?.map(topic => (
                                        <button
                                            key={topic}
                                            onClick={() => setCurrentTopic(topic)}
                                            className={`px-4 py-2 rounded-lg font-medium transition-all ${currentTopic === topic
                                                ? 'bg-purple-500 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {topic}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-3">
                                    <input
                                        type="text"
                                        placeholder="Or type a custom topic..."
                                        value={currentTopic}
                                        onChange={(e) => setCurrentTopic(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Understanding Level */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    How well do you understand this topic?
                                </label>
                                <div className="flex items-center gap-2 mb-2">
                                    {[1, 2, 3, 4, 5].map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setUnderstandingLevel(level)}
                                            className={`p-3 rounded-lg transition-all ${understandingLevel >= level
                                                ? 'bg-gradient-to-r from-purple-400 to-indigo-500 text-white shadow-md scale-105'
                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                }`}
                                        >
                                            <Star className={`w-6 h-6 ${understandingLevel >= level ? 'fill-current' : ''}`} />
                                        </button>
                                    ))}
                                </div>
                                <p className={`text-center font-medium ${getUnderstandingColor(understandingLevel)}`}>
                                    {getUnderstandingLabel(understandingLevel)}
                                </p>
                            </div>

                            {/* Confidence Level */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    How confident are you about applying this in exams?
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['low', 'medium', 'high'] as const).map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setConfidenceLevel(level)}
                                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${confidenceLevel === level
                                                ? level === 'low'
                                                    ? 'border-red-500 bg-red-50'
                                                    : level === 'medium'
                                                        ? 'border-yellow-500 bg-yellow-50'
                                                        : 'border-green-500 bg-green-50'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            {getConfidenceIcon(level)}
                                            <span className="font-medium capitalize">{level}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Need Help Toggle */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Do you need extra help with this topic?
                                </label>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setNeedsHelp(true)}
                                        className={`flex-1 p-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${needsHelp
                                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            }`}
                                    >
                                        <ThumbsUp className="w-5 h-5" />
                                        <span>Yes, please!</span>
                                    </button>
                                    <button
                                        onClick={() => setNeedsHelp(false)}
                                        className={`flex-1 p-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${!needsHelp
                                            ? 'border-green-500 bg-green-50 text-green-700'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            }`}
                                    >
                                        <ThumbsDown className="w-5 h-5" />
                                        <span>I'm good</span>
                                    </button>
                                </div>
                            </div>

                            {/* Specific Difficulties */}
                            {needsHelp && (
                                <div className="mb-6">
                                    <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                        <MessageCircle className="w-4 h-4" />
                                        What specifically are you struggling with?
                                    </label>
                                    <textarea
                                        value={difficulties}
                                        onChange={(e) => setDifficulties(e.target.value)}
                                        placeholder="Describe your difficulties here... (e.g., 'I understand the formula but can't apply it to word problems')"
                                        rows={3}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none"
                                    />
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={!currentTopic || isSubmitting}
                                className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        Save Self Assessment
                                    </>
                                )}
                            </button>

                            {/* Success Message */}
                            {showSuccess && (
                                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                    <span className="text-green-700">Assessment saved successfully! Your teacher will be notified if you need help.</span>
                                </div>
                            )}
                        </div>

                        {/* Recent Assessments */}
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-green-500" />
                                Recent Self Assessments
                            </h2>

                            <div className="space-y-3">
                                {recentAssessments.map(assessment => (
                                    <div
                                        key={assessment.id}
                                        className="p-4 bg-gray-50 rounded-xl flex items-center justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-gray-800">{assessment.topic}</span>
                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                                    {assessment.subject}
                                                </span>
                                                {assessment.needs_help && (
                                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                                                        Needs Help
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500">
                                                {new Date(assessment.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map(level => (
                                                <Star
                                                    key={level}
                                                    className={`w-4 h-4 ${assessment.understanding_level >= level
                                                        ? 'text-yellow-400 fill-current'
                                                        : 'text-gray-300'
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* AI Suggestions */}
                        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg p-6 text-white">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5" />
                                AI Recommended Topics
                            </h3>

                            {loadingSuggestions ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {aiSuggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            className="bg-white/10 backdrop-blur rounded-xl p-4 cursor-pointer hover:bg-white/20 transition-colors"
                                            onClick={() => {
                                                setCurrentSubject(suggestion.subject);
                                                setCurrentTopic(suggestion.topic);
                                            }}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <Lightbulb className="w-4 h-4" />
                                                <span className="font-medium">{suggestion.topic}</span>
                                            </div>
                                            <p className="text-sm text-white/70">{suggestion.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Stats Card */}
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                            <h3 className="font-semibold text-gray-800 mb-4">Your Learning Stats</h3>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Assessments This Week</span>
                                    <span className="font-bold text-blue-600">{recentAssessments.filter(a =>
                                        new Date(a.created_at) > new Date(Date.now() - 7 * 86400000)
                                    ).length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Average Understanding</span>
                                    <span className="font-bold text-green-600">
                                        {recentAssessments.length > 0
                                            ? (recentAssessments.reduce((acc, a) => acc + a.understanding_level, 0) / recentAssessments.length).toFixed(1)
                                            : '0'
                                        }/5
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Topics Needing Help</span>
                                    <span className="font-bold text-orange-600">
                                        {recentAssessments.filter(a => a.needs_help).length}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Tip Card */}
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                            <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                                <Lightbulb className="w-5 h-5" />
                                Pro Tip
                            </h3>
                            <p className="text-sm text-blue-700">
                                Regular self-assessment helps you identify gaps early. Try to assess yourself after each lesson or chapter for the best results!
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
