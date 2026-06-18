import { useState, useEffect } from 'react';
import {
    Building2,
    Users,
    GraduationCap,
    Calendar,
    Bell,
    BarChart3,
    Clock,
    AlertTriangle,
    CheckCircle,
    Sparkles,
    RefreshCw,
    FileText,
    TrendingUp,
    TrendingDown,
    UserCheck,
    UserX,
    Send,
    ChevronRight,
    Target,
    BookOpen,
    LogOut,
    Award,
    ArrowUpRight,
    UserPlus,
    FileBarChart
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getSchoolStats,
    getTeacherAbsences,
    getClassPerformance,
    getTeacherPerformance,
    getStudentAttendanceRisk,
    SchoolStats,
    TeacherAbsence
} 
from '../../lib/schoolDb';
import {
    generateLessonPlan,
    generateAbsentDayNotification,
    analyzeDropoutRisk,
    analyzeExamReadiness,
    generateAnnualReport,
    generateBenchmarkReport
} from '../../lib/schoolAI';
import ParentPortal from './ParentPortal';
import AutomatedReportCard from './AutomatedReportCard';

export default function SchoolDashboard() {
    const { logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'overview' | 'absences' | 'schedule' | 'analytics' | 'readiness' | 'reports' | 'parents' | 'report-cards'>('overview');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<SchoolStats | null>(null);
    const [absences, setAbsences] = useState<TeacherAbsence[]>([]);
    const [classPerformance, setClassPerformance] = useState<any[]>([]);
    const [teacherPerformance, setTeacherPerformance] = useState<any[]>([]);
    const [studentRisk, setStudentRisk] = useState<any[]>([]);
    const [generatingPlan, setGeneratingPlan] = useState<string | null>(null);
    const [lessonPlans, setLessonPlans] = useState<{ [key: string]: any }>({});
    const [aiInsights, setAiInsights] = useState<any>(null);
    const [loadingAI, setLoadingAI] = useState(false);
    const [examReadiness, setExamReadiness] = useState<any>(null);
    const [annualReport, setAnnualReport] = useState<any>(null);
    const [benchmarkReport, setBenchmarkReport] = useState<any>(null);
    const [generatingReport, setGeneratingReport] = useState<'annual' | 'benchmark' | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statsData, absencesData, classData, teacherData, riskData] = await Promise.all([
                getSchoolStats(),
                getTeacherAbsences(),
                getClassPerformance(),
                getTeacherPerformance(),
                getStudentAttendanceRisk()
            ]);

            setStats(statsData);
            setAbsences(absencesData);
            setClassPerformance(classData);
            setTeacherPerformance(teacherData);
            setStudentRisk(riskData);
        } catch (error) {
            console.error('Error loading school data:', error);
        }
        setLoading(false);
    };

    const handleGenerateLessonPlan = async (absence: TeacherAbsence) => {
        setGeneratingPlan(absence.id);
        try {
            const plan = await generateLessonPlan(
                'Mathematics', // Would come from teacher's subject
                'Algebra Fundamentals',
                10,
                45,
                'intermediate'
            );
            setLessonPlans(prev => ({ ...prev, [absence.id]: plan }));

            // Also generate notification
            const notification = await generateAbsentDayNotification(
                absence.teacher_name,
                'Mathematics',
                'Class 10',
                plan.title
            );
            console.log('Generated notification:', notification);
        } catch (error) {
            console.error('Error generating lesson plan:', error);
        }
        setGeneratingPlan(null);
    };

    const handleAnalyzeRisk = async () => {
        setLoadingAI(true);
        try {
            const riskAnalysis = await analyzeDropoutRisk(
                studentRisk.map(s => ({
                    name: s.name,
                    class: s.class,
                    attendanceRate: s.attendanceRate,
                    averageGrades: s.averageGrades,
                    engagementScore: 70,
                    recentTrend: s.status === 'at-risk' ? 'declining' as const : 'stable' as const
                }))
            );
            setAiInsights(riskAnalysis);
        } catch (error) {
            console.error('Error analyzing risk:', error);
        }
        setLoadingAI(false);
    };

    const handleAnalyzeExamReadiness = async () => {
        setLoadingAI(true);
        try {
            const readiness = await analyzeExamReadiness({
                examName: 'Board Examinations 2025',
                daysRemaining: 90,
                classes: classPerformance.map(c => ({
                    className: c.className,
                    topicsCovered: Math.floor(Math.random() * 20 + 15),
                    totalTopics: 30,
                    averageScore: c.averageScore
                }))
            });
            setExamReadiness(readiness);
        } catch (error) {
            console.error('Error analyzing exam readiness:', error);
        }
        setLoadingAI(false);
    };

    const handleGenerateAnnualReport = async () => {
        setLoadingAI(true);
        setGeneratingReport('annual');
        try {
            const report = await generateAnnualReport({
                totalStudents: stats?.totalStudents || 1200,
                totalTeachers: stats?.totalTeachers || 45,
                averageAttendance: stats?.averageAttendance || 92,
                performanceByClass: classPerformance.map(c => ({
                    className: c.className,
                    averageScore: c.averageScore,
                    improvement: 5 // mock
                })),
                topPerformers: [
                    { name: 'Alice', class: '10A', achievement: 'Math Olympiad Gold' },
                    { name: 'Bob', class: '9B', achievement: 'Science Fair Winner' }
                ],
                areasForImprovement: ['Physics Lab Equipment', 'Grade 8 Math Scores']
            });
            setAnnualReport(report);
        } catch (error) {
            console.error('Error generating annual report:', error);
        }
        setLoadingAI(false);
        setGeneratingReport(null);
    };

    const handleGenerateBenchmarkReport = async () => {
        setLoadingAI(true);
        setGeneratingReport('benchmark');
        try {
            const report = await generateBenchmarkReport([
                { subject: 'Mathematics', schoolAverage: 78, districtAverage: 72, stateAverage: 70 },
                { subject: 'Science', schoolAverage: 82, districtAverage: 75, stateAverage: 74 },
                { subject: 'English', schoolAverage: 85, districtAverage: 80, stateAverage: 78 },
                { subject: 'History', schoolAverage: 65, districtAverage: 68, stateAverage: 65 }
            ]);
            setBenchmarkReport(report);
        } catch (error) {
            console.error('Error generating benchmark report:', error);
        }
        setLoadingAI(false);
        setGeneratingReport(null);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg">
                                <Building2 className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                    School Management Portal
                                </h1>
                                <p className="text-sm text-slate-600">Feature Desk Central Dashboard</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors relative">
                                <Bell className="h-5 w-5 text-slate-600" />
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">3</span>
                            </button>
                            <button
                                onClick={logout}
                                className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                <span className="font-medium">Logout</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Tab Navigation */}
                <div className="flex space-x-2 mb-8 bg-white/50 p-2 rounded-2xl backdrop-blur-sm overflow-x-auto scrollbar-none whitespace-nowrap">
                    {[
                        { id: 'overview', label: 'Overview', icon: BarChart3 },
                        { id: 'absences', label: 'Substitute Management', icon: UserX },
                        { id: 'schedule', label: 'Schedule', icon: Calendar },
                        { id: 'analytics', label: 'Analytics & Risk', icon: AlertTriangle },
                        { id: 'readiness', label: 'Exam Readiness', icon: Target },
                        { id: 'reports', label: 'AI Reports', icon: FileText },
                        { id: 'parents', label: 'Parent Portal', icon: UserPlus },
                        { id: 'report-cards', label: 'Report Cards', icon: FileBarChart }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center flex-shrink-0 whitespace-nowrap space-x-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === tab.id
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                                : 'text-slate-600 hover:bg-white hover:shadow-md'
                                }`}
                        >
                            <tab.icon className="h-5 w-5" />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-8">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">Total Students</p>
                                        <p className="text-3xl font-bold text-slate-900">{stats?.totalStudents || 0}</p>
                                    </div>
                                    <div className="bg-blue-100 p-3 rounded-xl">
                                        <GraduationCap className="h-6 w-6 text-blue-600" />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center text-sm text-green-600">
                                    <TrendingUp className="h-4 w-4 mr-1" />
                                    <span>+12% from last year</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">Total Teachers</p>
                                        <p className="text-3xl font-bold text-slate-900">{stats?.totalTeachers || 0}</p>
                                    </div>
                                    <div className="bg-purple-100 p-3 rounded-xl">
                                        <Users className="h-6 w-6 text-purple-600" />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center text-sm text-purple-600">
                                    <UserCheck className="h-4 w-4 mr-1" />
                                    <span>{absences.filter(a => a.status === 'pending').length} absent today</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">Avg. Attendance</p>
                                        <p className="text-3xl font-bold text-slate-900">{stats?.averageAttendance || 0}%</p>
                                    </div>
                                    <div className="bg-green-100 p-3 rounded-xl">
                                        <CheckCircle className="h-6 w-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center text-sm text-green-600">
                                    <TrendingUp className="h-4 w-4 mr-1" />
                                    <span>Above district average</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">Avg. Performance</p>
                                        <p className="text-3xl font-bold text-slate-900">{stats?.averagePerformance || 0}%</p>
                                    </div>
                                    <div className="bg-amber-100 p-3 rounded-xl">
                                        <BarChart3 className="h-6 w-6 text-amber-600" />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center text-sm text-amber-600">
                                    <Target className="h-4 w-4 mr-1" />
                                    <span>Target: 80%</span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Today's Absences */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                                        <UserX className="h-5 w-5 mr-2 text-red-500" />
                                        Today's Teacher Absences
                                    </h3>
                                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                                        {absences.filter(a => a.status === 'pending').length} Pending
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {absences.slice(0, 3).map((absence) => (
                                        <div key={absence.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                            <div>
                                                <p className="font-medium text-slate-900">{absence.teacher_name}</p>
                                                <p className="text-sm text-slate-600">{absence.reason}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${absence.status === 'covered'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                                }`}>
                                                {absence.status === 'covered' ? 'Covered' : 'Pending'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setActiveTab('absences')}
                                    className="mt-4 w-full py-2 text-blue-600 font-medium hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center"
                                >
                                    View All <ChevronRight className="h-4 w-4 ml-1" />
                                </button>
                            </div>

                            {/* Class Performance */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                                        <BarChart3 className="h-5 w-5 mr-2 text-blue-500" />
                                        Class Performance
                                    </h3>
                                    <button
                                        onClick={loadData}
                                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        <RefreshCw className="h-4 w-4 text-slate-600" />
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {classPerformance.slice(0, 5).map((cls, index) => (
                                        <div key={index} className="flex items-center justify-between">
                                            <span className="text-sm text-slate-600">{cls.className}</span>
                                            <div className="flex items-center space-x-3">
                                                <div className="w-32 bg-slate-200 rounded-full h-2">
                                                    <div
                                                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full"
                                                        style={{ width: `${cls.averageScore}%` }}
                                                    ></div>
                                                </div>
                                                <span className={`text-sm font-medium ${cls.averageScore >= 75 ? 'text-green-600' : cls.averageScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {Math.round(cls.averageScore)}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Absences Tab */}
                {activeTab === 'absences' && (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
                            <div className="flex items-center space-x-3">
                                <Sparkles className="h-8 w-8" />
                                <div>
                                    <h2 className="text-xl font-bold">AI-Powered Substitute Management</h2>
                                    <p className="text-blue-100">Automatically generate lesson plans and notify parents</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {absences.map((absence) => (
                                <div key={absence.id} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start space-x-4">
                                            <div className={`p-3 rounded-xl ${absence.status === 'covered' ? 'bg-green-100' : 'bg-red-100'}`}>
                                                {absence.status === 'covered' ? (
                                                    <UserCheck className="h-6 w-6 text-green-600" />
                                                ) : (
                                                    <UserX className="h-6 w-6 text-red-600" />
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-slate-900">{absence.teacher_name}</h3>
                                                <p className="text-slate-600">{absence.reason}</p>
                                                <p className="text-sm text-slate-500 mt-1">
                                                    <Clock className="h-4 w-4 inline mr-1" />
                                                    {new Date(absence.date).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex space-x-2">
                                            {absence.status === 'pending' && (
                                                <button
                                                    onClick={() => handleGenerateLessonPlan(absence)}
                                                    disabled={generatingPlan === absence.id}
                                                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center space-x-2"
                                                >
                                                    {generatingPlan === absence.id ? (
                                                        <>
                                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                                            <span>Generating...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles className="h-4 w-4" />
                                                            <span>Generate AI Lesson Plan</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {lessonPlans[absence.id] && (
                                        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                                            <h4 className="font-semibold text-blue-900 flex items-center mb-3">
                                                <FileText className="h-5 w-5 mr-2" />
                                                AI-Generated Lesson Plan: {lessonPlans[absence.id].title}
                                            </h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">Objectives:</p>
                                                    <ul className="list-disc list-inside text-sm text-slate-600">
                                                        {lessonPlans[absence.id].objectives?.map((obj: string, i: number) => (
                                                            <li key={i}>{obj}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">Activities:</p>
                                                    <div className="space-y-2 mt-2">
                                                        {lessonPlans[absence.id].activities?.map((act: any, i: number) => (
                                                            <div key={i} className="flex items-center space-x-3 text-sm">
                                                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-medium">
                                                                    {act.duration} min
                                                                </span>
                                                                <span className="font-medium text-slate-700">{act.name}</span>
                                                                <span className="text-slate-500">- {act.description}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex space-x-3">
                                                <button className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
                                                    <Send className="h-4 w-4 inline mr-2" />
                                                    Send to Substitute
                                                </button>
                                                <button className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg font-medium hover:bg-slate-50">
                                                    <Bell className="h-4 w-4 inline mr-2" />
                                                    Notify Parents
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {absence.status === 'covered' && (
                                        <div className="mt-4 p-3 bg-green-50 rounded-xl flex items-center text-green-700">
                                            <CheckCircle className="h-5 w-5 mr-2" />
                                            <span>Covered by {absence.substitute_name || 'Substitute Teacher'}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Schedule Tab */}
                {activeTab === 'schedule' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
                                <Calendar className="h-6 w-6 mr-2 text-blue-600" />
                                Weekly Class Schedule
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Period</th>
                                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => (
                                                <th key={day} className="px-4 py-3 text-left text-sm font-semibold text-slate-700">{day}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[1, 2, 3, 4, 5, 6].map((period) => (
                                            <tr key={period} className="border-t border-slate-200">
                                                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                                    Period {period}
                                                    <br />
                                                    <span className="text-xs text-slate-500">{8 + period}:00 - {9 + period}:00</span>
                                                </td>
                                                {[1, 2, 3, 4, 5].map((day) => {
                                                    const subjects = ['Mathematics', 'Science', 'English', 'History', 'Geography'];
                                                    const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-cyan-100 text-cyan-700'];
                                                    const subjectIndex = (day + period) % 5;
                                                    return (
                                                        <td key={day} className="px-4 py-3">
                                                            <div className={`px-3 py-2 rounded-lg ${colors[subjectIndex]}`}>
                                                                <p className="text-sm font-medium">{subjects[subjectIndex]}</p>
                                                                <p className="text-xs opacity-75">Class 10A</p>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Analytics & Risk Tab */}
                {activeTab === 'analytics' && (
                    <div className="space-y-6">
                        {/* AI Risk Analysis */}
                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-slate-900 flex items-center">
                                    <AlertTriangle className="h-6 w-6 mr-2 text-amber-500" />
                                    Dropout Risk Analysis
                                </h2>
                                <button
                                    onClick={handleAnalyzeRisk}
                                    disabled={loadingAI}
                                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {loadingAI ? (
                                        <>
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            <span>Analyzing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            <span>Run AI Analysis</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {aiInsights ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                                        <p className="text-amber-900">{aiInsights.summary}</p>
                                    </div>
                                    {aiInsights.highRisk?.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold text-red-700 mb-3">High Risk Students ({aiInsights.highRisk.length})</h3>
                                            <div className="space-y-2">
                                                {aiInsights.highRisk.map((student: any, i: number) => (
                                                    <div key={i} className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-center justify-between">
                                                        <div>
                                                            <p className="font-medium text-red-900">{student.name} - {student.class}</p>
                                                            <p className="text-sm text-red-700">{student.riskFactors?.join(', ')}</p>
                                                        </div>
                                                        <button className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm">
                                                            Intervene
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {studentRisk.slice(0, 6).map((student, index) => (
                                        <div key={index} className={`p-4 rounded-xl border ${student.status === 'at-risk' ? 'bg-red-50 border-red-200' :
                                            student.status === 'moderate' ? 'bg-amber-50 border-amber-200' :
                                                'bg-green-50 border-green-200'
                                            }`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="font-medium text-slate-900">{student.name}</p>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.status === 'at-risk' ? 'bg-red-100 text-red-700' :
                                                    student.status === 'moderate' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                    {student.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-600">{student.class}</p>
                                            <div className="mt-2 space-y-1">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-500">Attendance</span>
                                                    <span className={student.attendanceRate < 75 ? 'text-red-600' : 'text-green-600'}>
                                                        {student.attendanceRate}%
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-500">Grades</span>
                                                    <span className={student.averageGrades < 50 ? 'text-red-600' : 'text-green-600'}>
                                                        {student.averageGrades}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Teacher Performance */}
                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
                                <Users className="h-6 w-6 mr-2 text-purple-600" />
                                Teacher Performance
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Teacher</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Subject</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Classes</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Avg. Score</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teacherPerformance.map((teacher, index) => (
                                            <tr key={index} className="border-t border-slate-200">
                                                <td className="px-4 py-3 text-sm font-medium text-slate-900">{teacher.teacherName}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600">{teacher.subject}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600">{teacher.classCount}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-20 bg-slate-200 rounded-full h-2">
                                                            <div
                                                                className={`h-2 rounded-full ${teacher.classAverage >= 75 ? 'bg-green-500' : teacher.classAverage >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                style={{ width: `${teacher.classAverage}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-sm font-medium">{Math.round(teacher.classAverage)}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {teacher.classAverage >= 75 ? (
                                                        <span className="flex items-center text-green-600 text-sm">
                                                            <TrendingUp className="h-4 w-4 mr-1" />
                                                            Excellent
                                                        </span>
                                                    ) : teacher.classAverage >= 60 ? (
                                                        <span className="flex items-center text-amber-600 text-sm">
                                                            <Target className="h-4 w-4 mr-1" />
                                                            Good
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center text-red-600 text-sm">
                                                            <TrendingDown className="h-4 w-4 mr-1" />
                                                            Needs Attention
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Exam Readiness Tab */}
                {activeTab === 'readiness' && (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <Target className="h-8 w-8" />
                                    <div>
                                        <h2 className="text-xl font-bold">Board Exam Readiness Countdown</h2>
                                        <p className="text-indigo-200">AI-powered analysis for exam preparedness</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold">90</p>
                                    <p className="text-indigo-200">Days Remaining</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                                    <BookOpen className="h-5 w-5 mr-2 text-indigo-600" />
                                    Class-wise Readiness Analysis
                                </h3>
                                <button
                                    onClick={handleAnalyzeExamReadiness}
                                    disabled={loadingAI}
                                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {loadingAI ? (
                                        <>
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            <span>Analyzing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            <span>Analyze Readiness</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {examReadiness ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-indigo-50 rounded-xl p-4 text-center">
                                            <p className="text-4xl font-bold text-indigo-600">{examReadiness.overallReadiness}%</p>
                                            <p className="text-sm text-indigo-700">Overall Readiness</p>
                                        </div>
                                        <div className="bg-green-50 rounded-xl p-4">
                                            <p className="text-sm font-medium text-green-700 mb-2">On Track</p>
                                            <p className="text-2xl font-bold text-green-600">
                                                {examReadiness.classReadiness?.filter((c: any) => c.status === 'on-track').length || 0} Classes
                                            </p>
                                        </div>
                                        <div className="bg-red-50 rounded-xl p-4">
                                            <p className="text-sm font-medium text-red-700 mb-2">Needs Attention</p>
                                            <p className="text-2xl font-bold text-red-600">
                                                {examReadiness.classReadiness?.filter((c: any) => c.status !== 'on-track').length || 0} Classes
                                            </p>
                                        </div>
                                    </div>

                                    {examReadiness.focusAreas?.length > 0 && (
                                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                                            <h4 className="font-semibold text-amber-900 mb-2">Focus Areas for Next 90 Days</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {examReadiness.focusAreas.map((area: string, i: number) => (
                                                    <span key={i} className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                                                        {area}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {examReadiness.recommendations?.length > 0 && (
                                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                                            <h4 className="font-semibold text-blue-900 mb-2">AI Recommendations</h4>
                                            <ul className="space-y-2">
                                                {examReadiness.recommendations.map((rec: string, i: number) => (
                                                    <li key={i} className="flex items-start text-sm text-blue-800">
                                                        <CheckCircle className="h-4 w-4 mr-2 mt-0.5 text-blue-600" />
                                                        {rec}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {classPerformance.slice(0, 6).map((cls, index) => {
                                        const topicsCovered = Math.floor(Math.random() * 20 + 10);
                                        const totalTopics = 30;
                                        const readiness = Math.round((topicsCovered / totalTopics) * 100 * (cls.averageScore / 100));

                                        return (
                                            <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="font-semibold text-slate-900">{cls.className}</h4>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${readiness >= 70 ? 'bg-green-100 text-green-700' :
                                                        readiness >= 50 ? 'bg-amber-100 text-amber-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {readiness >= 70 ? 'On Track' : readiness >= 50 ? 'At Risk' : 'Behind'}
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">Topics Covered</span>
                                                        <span className="font-medium">{topicsCovered}/{totalTopics}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full ${readiness >= 70 ? 'bg-green-500' :
                                                                readiness >= 50 ? 'bg-amber-500' :
                                                                    'bg-red-500'
                                                                }`}
                                                            style={{ width: `${(topicsCovered / totalTopics) * 100}%` }}
                                                        ></div>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">Readiness Score</span>
                                                        <span className={`font-bold ${readiness >= 70 ? 'text-green-600' :
                                                            readiness >= 50 ? 'text-amber-600' :
                                                                'text-red-600'
                                                            }`}>{readiness}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Reports Tab */}
                {activeTab === 'reports' && (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
                            <div className="flex items-center space-x-3">
                                <FileText className="h-8 w-8" />
                                <div>
                                    <h2 className="text-xl font-bold">AI School Reports</h2>
                                    <p className="text-emerald-100">Generate comprehensive annual and benchmark reports instantly</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Annual Report Card */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                                        <Award className="h-5 w-5 mr-2 text-emerald-600" />
                                        Annual School Report Card
                                    </h3>
                                    <button
                                        onClick={handleGenerateAnnualReport}
                                        disabled={loadingAI}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                                    >
                                        {loadingAI && generatingReport === 'annual' ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                <span>Generating...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="h-4 w-4" />
                                                <span>Generate Report</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {annualReport ? (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                            <h4 className="font-semibold text-slate-900 mb-2">Executive Summary</h4>
                                            <p className="text-sm text-slate-700 leading-relaxed">{annualReport.executiveSummary}</p>
                                        </div>

                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">Key Highlights</h4>
                                            <ul className="space-y-2">
                                                {annualReport.keyHighlights.map((highlight: string, i: number) => (
                                                    <li key={i} className="flex items-start text-sm text-slate-700">
                                                        <CheckCircle className="h-4 w-4 mr-2 mt-0.5 text-emerald-500 flex-shrink-0" />
                                                        {highlight}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">Recommendations</h4>
                                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                                <ul className="space-y-2">
                                                    {annualReport.recommendations.map((rec: string, i: number) => (
                                                        <li key={i} className="flex items-start text-sm text-emerald-800">
                                                            <ArrowUpRight className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                                                            {rec}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Generate a detailed annual report card for the school year</p>
                                    </div>
                                )}
                            </div>

                            {/* Benchmark Analysis */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                                        <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
                                        District Benchmark Analysis
                                    </h3>
                                    <button
                                        onClick={handleGenerateBenchmarkReport}
                                        disabled={loadingAI}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                                    >
                                        {loadingAI && generatingReport === 'benchmark' ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                <span>Analyzing...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="h-4 w-4" />
                                                <span>Run Analysis</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {benchmarkReport ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                                                <h4 className="font-semibold text-green-900 mb-2 flex items-center">
                                                    <TrendingUp className="h-4 w-4 mr-2" /> Strengths
                                                </h4>
                                                <ul className="space-y-1">
                                                    {benchmarkReport.strengths.map((s: string, i: number) => (
                                                        <li key={i} className="text-sm text-green-800">• {s}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                                                <h4 className="font-semibold text-red-900 mb-2 flex items-center">
                                                    <TrendingDown className="h-4 w-4 mr-2" /> Needs Focus
                                                </h4>
                                                <ul className="space-y-1">
                                                    {benchmarkReport.weaknesses.map((w: string, i: number) => (
                                                        <li key={i} className="text-sm text-red-800">• {w}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                                            <h4 className="font-semibold text-blue-900 mb-2">Strategic Insights</h4>
                                            <p className="text-sm text-blue-800 leading-relaxed">{benchmarkReport.insights}</p>
                                        </div>

                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">Action Items</h4>
                                            <ul className="space-y-2">
                                                {benchmarkReport.actionItems.map((item: string, i: number) => (
                                                    <li key={i} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700">
                                                        <Target className="h-4 w-4 mr-3 text-blue-500" />
                                                        {item}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Compare school performance against district & state benchmarks</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Parent Portal Tab */}
                {activeTab === 'parents' && (
                    <div className="space-y-6">
                        <ParentPortal />
                    </div>
                )}

                {/* Report Cards Tab */}
                {activeTab === 'report-cards' && (
                    <div className="space-y-6">
                        <AutomatedReportCard
                            studentId="demo-student-001"
                            studentName="Alex Johnson"
                            className="Class 10A"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
