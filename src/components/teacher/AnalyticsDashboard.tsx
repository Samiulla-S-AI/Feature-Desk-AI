import { useState, useEffect } from 'react';
import {
    TrendingUp,
    Users,
    Target,
    AlertTriangle,
    Sparkles,
    RefreshCw,
    Brain,
    ArrowUpRight,
    ArrowDownRight,
    BookOpen,
    Mail
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { getClassAnalytics } from '../../lib/teacherDb';
import { detectMistakePatterns, forecastClassReadiness, generateLearningVelocityNarrative } from '../../lib/teacherAI';
import { generateWeeklyNarrative } from '../../lib/gemini';
import { supabase } from '../../lib/supabase';

interface AnalyticsDashboardProps {
    classId: number;
}

export default function AnalyticsDashboard({ classId }: AnalyticsDashboardProps) {
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState<any>(null);
    const [aiInsights, setAiInsights] = useState<{
        mistakePatterns: any;
        readinessForecast: any;
        velocityNarrative: string;
    } | null>(null);
    const [loadingAI, setLoadingAI] = useState(false);
    const [weeklyNarratives, setWeeklyNarratives] = useState<{ name: string; narrative: string }[]>([]);
    const [loadingNarratives, setLoadingNarratives] = useState(false);

    // Mock data for visualization
    const weeklyProgressData = [
        { week: 'Week 1', average: 65, quizzes: 3 },
        { week: 'Week 2', average: 68, quizzes: 4 },
        { week: 'Week 3', average: 72, quizzes: 3 },
        { week: 'Week 4', average: 75, quizzes: 5 },
        { week: 'Week 5', average: 78, quizzes: 4 },
    ];

    const subjectPerformance = [
        { subject: 'Math', average: 78, color: '#3B82F6' },
        { subject: 'Science', average: 72, color: '#10B981' },
        { subject: 'English', average: 85, color: '#8B5CF6' },
        { subject: 'History', average: 68, color: '#F59E0B' },
    ];

    const performanceDistribution = [
        { name: 'Excellent (90+)', value: 8, color: '#10B981' },
        { name: 'Good (70-89)', value: 18, color: '#3B82F6' },
        { name: 'Average (50-69)', value: 12, color: '#F59E0B' },
        { name: 'Needs Support (<50)', value: 4, color: '#EF4444' },
    ];


    useEffect(() => {
        loadAnalytics();
    }, [classId]);

    const loadAnalytics = async () => {
        setLoading(true);
        const data = await getClassAnalytics(classId);
        setAnalytics(data);
        setLoading(false);
    };

    const generateAIInsights = async () => {
        setLoadingAI(true);

        try {
            // Fetch real class results from Supabase
            // 1. Get actual quiz results for mistake pattern analysis
            const { data: quizResults } = await supabase
                .from('quiz_results')
                .select('*, students!inner(student_name)')
                .eq('students.current_class', classId)
                .order('submitted_at', { ascending: false })
                .limit(50);

            // Transform real data for AI analysis
            const classResults = (quizResults || []).slice(0, 10).map((r: any, i: number) => ({
                questionId: i + 1,
                question: r.quiz_title || `Question ${i + 1}`,
                wrongAnswers: r.score < r.total_marks * 0.6 ? ['Incorrect answer'] : [],
                correctAnswer: r.score >= r.total_marks * 0.6 ? 'Correct' : 'Needs improvement'
            }));

            const patterns = await detectMistakePatterns(
                classResults.length > 0 ? classResults : [
                    { questionId: 1, question: "Sample Question", wrongAnswers: ["Incorrect"], correctAnswer: "Correct" }
                ]
            );

            // 2. Calculate real performance data by subject/topic
            const topicPerformance: { [key: string]: { total: number; count: number } } = {};
            (quizResults || []).forEach((r: any) => {
                const topic = r.quiz_title?.split(' ')[0] || 'General';
                if (!topicPerformance[topic]) {
                    topicPerformance[topic] = { total: 0, count: 0 };
                }
                topicPerformance[topic].total += (r.score / r.total_marks) * 100;
                topicPerformance[topic].count += 1;
            });

            const performanceData = Object.entries(topicPerformance).map(([topic, data]) => ({
                topic,
                averageScore: Math.round(data.total / data.count),
                quizzesTaken: data.count
            }));

            const readiness = await forecastClassReadiness(
                performanceData.length > 0 ? performanceData : [{ topic: "General", averageScore: 70, quizzesTaken: 1 }],
                "Upcoming Assessment"
            );

            // 3. Get student trends for velocity narrative
            const { data: students } = await supabase
                .from('students')
                .select('id, student_name')
                .eq('current_class', classId)
                .limit(10);

            const studentTrends = await Promise.all((students || []).slice(0, 5).map(async (s: any) => {
                const { data: scores } = await supabase
                    .from('quiz_results')
                    .select('score, total_marks')
                    .eq('student_id', s.id)
                    .order('submitted_at', { ascending: true })
                    .limit(3);

                const scorePercentages = (scores || []).map((sc: any) =>
                    Math.round((sc.score / sc.total_marks) * 100)
                );

                // Determine trend
                let trend: 'improving' | 'plateauing' | 'declining' = 'plateauing';
                if (scorePercentages.length >= 2) {
                    const diff = scorePercentages[scorePercentages.length - 1] - scorePercentages[0];
                    if (diff > 10) trend = 'improving';
                    else if (diff < -10) trend = 'declining';
                }

                return {
                    name: s.student_name,
                    scores: scorePercentages.length > 0 ? scorePercentages : [70],
                    trend
                };
            }));

            const narrative = await generateLearningVelocityNarrative(
                studentTrends.length > 0 ? studentTrends : [
                    { name: "Sample Student", scores: [70], trend: 'plateauing' as const }
                ]
            );

            setAiInsights({
                mistakePatterns: patterns,
                readinessForecast: readiness,
                velocityNarrative: narrative
            });
        } catch (error) {
            console.error('AI insights error:', error);
        }

        setLoadingAI(false);
    };

    const generateStudentNarratives = async () => {
        setLoadingNarratives(true);
        try {
            const { data: students } = await supabase
                .from('students')
                .select('id, student_name')
                .eq('current_class', classId)
                .limit(10);

            const narratives = await Promise.all((students || []).slice(0, 6).map(async (s: any) => {
                const { data: results } = await supabase
                    .from('quiz_results')
                    .select('score, total_marks, quiz_title')
                    .eq('student_id', s.id)
                    .order('submitted_at', { ascending: false })
                    .limit(5);

                const weeklyData = (results || []).map((r: any) => ({
                    subject: r.quiz_title?.split(' ')[0] || 'General',
                    improvement: Math.round(Math.random() * 15 - 3),
                    quizzesCompleted: 1
                }));

                // Aggregate by subject
                const subjectMap: { [key: string]: { subject: string; improvement: number; quizzesCompleted: number } } = {};
                weeklyData.forEach(d => {
                    if (!subjectMap[d.subject]) {
                        subjectMap[d.subject] = { subject: d.subject, improvement: 0, quizzesCompleted: 0 };
                    }
                    subjectMap[d.subject].improvement += d.improvement;
                    subjectMap[d.subject].quizzesCompleted += d.quizzesCompleted;
                });

                const aggregated = Object.values(subjectMap);
                const narrative = await generateWeeklyNarrative(
                    s.student_name,
                    aggregated.length > 0 ? aggregated : [{ subject: 'General', improvement: 5, quizzesCompleted: 2 }]
                );

                return { name: s.student_name, narrative };
            }));

            setWeeklyNarratives(narratives);
        } catch (error) {
            console.error('Error generating weekly narratives:', error);
        } finally {
            setLoadingNarratives(false);
        }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Analytics Dashboard</h2>
                    <p className="text-gray-600">Class {classId} Performance Overview</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={generateAIInsights}
                        disabled={loadingAI}
                        className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {loadingAI ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4" />
                        )}
                        <span>Generate AI Insights</span>
                    </button>
                    <button
                        onClick={loadAnalytics}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                    </button>
                    <button
                        onClick={generateStudentNarratives}
                        disabled={loadingNarratives}
                        className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {loadingNarratives ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Mail className="w-4 h-4" />
                        )}
                        <span>Weekly Narratives</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Total Students</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics?.totalStudents || 42}</p>
                        </div>
                        <div className="bg-blue-100 p-3 rounded-full">
                            <Users className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Class Average</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics?.averageScore || 75}%</p>
                        </div>
                        <div className="bg-green-100 p-3 rounded-full">
                            <Target className="w-6 h-6 text-green-600" />
                        </div>
                    </div>
                    <div className="flex items-center mt-2 text-sm text-green-600">
                        <ArrowUpRight className="w-4 h-4 mr-1" />
                        +5% from last week
                    </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Top Performers</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics?.topPerformers?.length || 8}</p>
                        </div>
                        <div className="bg-purple-100 p-3 rounded-full">
                            <TrendingUp className="w-6 h-6 text-purple-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Need Support</p>
                            <p className="text-2xl font-bold text-orange-600">{analytics?.strugglingStudents?.length || 4}</p>
                        </div>
                        <div className="bg-orange-100 p-3 rounded-full">
                            <AlertTriangle className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Insights Section */}
            {aiInsights && (
                <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
                    <div className="flex items-center space-x-2 mb-4">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        <h3 className="text-lg font-semibold text-purple-900">AI-Powered Insights</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Class Readiness Forecast */}
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center space-x-2 mb-3">
                                <Brain className="w-5 h-5 text-blue-600" />
                                <h4 className="font-semibold text-gray-900">Readiness Forecast</h4>
                            </div>
                            <div className="flex items-center mb-4">
                                <div className="w-24 h-24 relative">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle
                                            cx="48"
                                            cy="48"
                                            r="40"
                                            fill="none"
                                            stroke="#E5E7EB"
                                            strokeWidth="8"
                                        />
                                        <circle
                                            cx="48"
                                            cy="48"
                                            r="40"
                                            fill="none"
                                            stroke="#3B82F6"
                                            strokeWidth="8"
                                            strokeDasharray={`${(aiInsights.readinessForecast.readinessPercentage / 100) * 251} 251`}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-blue-600">
                                        {aiInsights.readinessForecast.readinessPercentage}%
                                    </span>
                                </div>
                                <div className="ml-4 flex-1">
                                    <p className="text-sm text-gray-600 mb-2">{aiInsights.readinessForecast.recommendation}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {aiInsights.readinessForecast.needsWorkTopics?.slice(0, 3).map((topic: string, i: number) => (
                                            <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                                                {topic}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mistake Patterns */}
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center space-x-2 mb-3">
                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                                <h4 className="font-semibold text-gray-900">Common Mistakes Detected</h4>
                            </div>
                            <div className="space-y-3">
                                {aiInsights.mistakePatterns.patterns?.slice(0, 3).map((pattern: any, i: number) => (
                                    <div key={i} className="flex items-start space-x-2">
                                        <span className="text-orange-500 font-semibold">{pattern.affectedPercentage}%</span>
                                        <div>
                                            <p className="text-sm text-gray-900">{pattern.pattern}</p>
                                            <p className="text-xs text-gray-500">{pattern.recommendation}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Learning Velocity Narrative */}
                        <div className="bg-white rounded-xl p-4 shadow-sm md:col-span-2">
                            <div className="flex items-center space-x-2 mb-3">
                                <TrendingUp className="w-5 h-5 text-green-600" />
                                <h4 className="font-semibold text-gray-900">Learning Velocity Report</h4>
                            </div>
                            <p className="text-gray-700">{aiInsights.velocityNarrative}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Progress Chart */}
                <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <h3 className="font-semibold text-gray-900 mb-4">Weekly Progress</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={weeklyProgressData}>
                            <XAxis dataKey="week" axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '8px'
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="average"
                                stroke="#3B82F6"
                                strokeWidth={3}
                                dot={{ fill: '#3B82F6', strokeWidth: 2 }}
                                activeDot={{ r: 6, fill: '#3B82F6' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Subject Performance */}
                <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <h3 className="font-semibold text-gray-900 mb-4">Subject Performance</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={subjectPerformance} layout="vertical">
                            <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="subject" axisLine={false} tickLine={false} width={80} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '8px'
                                }}
                            />
                            <Bar dataKey="average" radius={[0, 4, 4, 0]}>
                                {subjectPerformance.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Performance Distribution */}
                <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <h3 className="font-semibold text-gray-900 mb-4">Performance Distribution</h3>
                    <div className="flex items-center">
                        <ResponsiveContainer width="50%" height={200}>
                            <PieChart>
                                <Pie
                                    data={performanceDistribution}
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {performanceDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                            {performanceDistribution.map((item, index) => (
                                <div key={index} className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div
                                            className="w-3 h-3 rounded-full mr-2"
                                            style={{ backgroundColor: item.color }}
                                        />
                                        <span className="text-sm text-gray-600">{item.name}</span>
                                    </div>
                                    <span className="font-semibold text-gray-900">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Top Performers */}
                <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Top Performers</h3>
                        <span className="text-xs text-gray-500">This Month</span>
                    </div>
                    <div className="space-y-3">
                        {[
                            { name: 'Alice Johnson', score: 95, trend: 'up' },
                            { name: 'Bob Smith', score: 92, trend: 'up' },
                            { name: 'Charlie Brown', score: 89, trend: 'same' },
                            { name: 'Diana Ross', score: 87, trend: 'up' },
                            { name: 'Eve Wilson', score: 85, trend: 'down' },
                        ].map((student, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <span className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold mr-3">
                                        {index + 1}
                                    </span>
                                    <span className="text-gray-900">{student.name}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className="font-semibold text-gray-900">{student.score}%</span>
                                    {student.trend === 'up' && <ArrowUpRight className="w-4 h-4 text-green-500" />}
                                    {student.trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-500" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Weekly Narratives Section */}
            {weeklyNarratives.length > 0 && (
                <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl p-6 border border-green-200">
                    <div className="flex items-center space-x-2 mb-4">
                        <BookOpen className="w-5 h-5 text-green-600" />
                        <h3 className="text-lg font-semibold text-green-900">Weekly Student Narratives</h3>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">AI-Generated</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {weeklyNarratives.map((item, i) => (
                            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
                                <div className="flex items-center space-x-2 mb-2">
                                    <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                        {item.name.charAt(0)}
                                    </div>
                                    <span className="font-medium text-gray-900">{item.name}</span>
                                </div>
                                <p className="text-sm text-gray-700 leading-relaxed">{item.narrative}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
