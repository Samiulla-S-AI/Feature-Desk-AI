import { useState, useEffect, useRef } from 'react';
import {
    Download,
    Printer,
    Award,
    TrendingUp,
    TrendingDown,
    Minus,
    BarChart3,
    Star,
    CheckCircle,
    AlertTriangle,
    BookOpen,
    Target,
    Users
} from 'lucide-react';

interface StudentData {
    id: string;
    name: string;
    roll_number: string;
    class: number;
    section: string;
    photo?: string;
}

interface SubjectScore {
    subject: string;
    subject_code: string;
    unit_test_1: number | null;
    unit_test_2: number | null;
    half_yearly: number | null;
    annual: number | null;
    practical: number | null;
    total: number;
    percentage: number;
    grade: string;
    trend: 'up' | 'down' | 'stable';
    teacher_remarks?: string;
}

interface ReportCardData {
    student: StudentData;
    term: string;
    academic_year: string;
    scores: SubjectScore[];
    attendance: {
        total_days: number;
        present: number;
        percentage: number;
    };
    overall: {
        total_marks: number;
        obtained_marks: number;
        percentage: number;
        grade: string;
        rank: number;
        total_students: number;
    };
    ai_insights: {
        strengths: string[];
        areas_to_improve: string[];
        personalized_feedback: string;
        learning_style: string;
    };
    co_curricular: {
        activities: string[];
        achievements: string[];
    };
    teacher_remarks: string;
    principal_remarks: string;
    generated_at: string;
}

interface AutomatedReportCardProps {
    studentId: string;
    studentName?: string;
    className?: string;
    term?: 'First' | 'Second' | 'Annual';
    academicYear?: string;
    onClose?: () => void;
}

export default function AutomatedReportCard({
    studentId,
    studentName,
    className,
    term = 'Annual',
    academicYear = '2025-26',
    onClose
}: AutomatedReportCardProps) {
    const [reportData, setReportData] = useState<ReportCardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        generateReportCard();
    }, [studentId, term]);

    const generateReportCard = async () => {
        setIsGenerating(true);
        try {
            // In production, this would fetch from Supabase and MongoDB
            // and use AI to generate insights

            // Simulated delay for AI generation
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Parse class and section from className prop (e.g., "Class 10A")
            let classNum = 9;
            let section = 'A';

            if (className) {
                const match = className.match(/Class (\d+)([A-Za-z])/i) || className.match(/(\d+)([A-Za-z])/);
                if (match) {
                    classNum = parseInt(match[1]);
                    section = match[2];
                }
            }

            const mockData: ReportCardData = {
                student: {
                    id: studentId,
                    name: studentName || 'Arjun Kumar',
                    roll_number: '1034',
                    class: classNum,
                    section: section,
                },
                term: term,
                academic_year: academicYear,
                scores: [
                    {
                        subject: 'Mathematics',
                        subject_code: 'MATH',
                        unit_test_1: 85,
                        unit_test_2: 88,
                        half_yearly: 82,
                        annual: 90,
                        practical: null,
                        total: 345,
                        percentage: 86.25,
                        grade: 'A',
                        trend: 'up',
                        teacher_remarks: 'Excellent problem-solving skills'
                    },
                    {
                        subject: 'Science',
                        subject_code: 'SCIENCE',
                        unit_test_1: 78,
                        unit_test_2: 82,
                        half_yearly: 75,
                        annual: 85,
                        practical: 42,
                        total: 362,
                        percentage: 80.44,
                        grade: 'B+',
                        trend: 'up',
                        teacher_remarks: 'Good practical understanding'
                    },
                    {
                        subject: 'English',
                        subject_code: 'ENGLISH',
                        unit_test_1: 92,
                        unit_test_2: 94,
                        half_yearly: 88,
                        annual: 95,
                        practical: null,
                        total: 369,
                        percentage: 92.25,
                        grade: 'A+',
                        trend: 'stable',
                        teacher_remarks: 'Outstanding language proficiency'
                    },
                    {
                        subject: 'Hindi',
                        subject_code: 'HINDI',
                        unit_test_1: 88,
                        unit_test_2: 85,
                        half_yearly: 82,
                        annual: 88,
                        practical: null,
                        total: 343,
                        percentage: 85.75,
                        grade: 'A',
                        trend: 'stable',
                        teacher_remarks: 'Very good grasp of literature'
                    },
                    {
                        subject: 'Social Studies',
                        subject_code: 'SOCIAL',
                        unit_test_1: 75,
                        unit_test_2: 78,
                        half_yearly: 72,
                        annual: 80,
                        practical: 38,
                        total: 343,
                        percentage: 76.22,
                        grade: 'B',
                        trend: 'up',
                        teacher_remarks: 'Needs more focus on geography'
                    }
                ],
                attendance: {
                    total_days: 180,
                    present: 168,
                    percentage: 93.33
                },
                overall: {
                    total_marks: 2000,
                    obtained_marks: 1762,
                    percentage: 88.1,
                    grade: 'A',
                    rank: 5,
                    total_students: 45
                },
                ai_insights: {
                    strengths: [
                        'Exceptional performance in English literature and language',
                        'Consistent improvement in Science practical understanding',
                        'Strong analytical and problem-solving abilities in Mathematics'
                    ],
                    areas_to_improve: [
                        'Geography concepts in Social Studies need more attention',
                        'Can participate more actively in class discussions',
                        'Practice more numerical problems in Physics'
                    ],
                    personalized_feedback: 'Arjun has shown remarkable progress this academic year. His dedication to studies is evident from his consistent performance. With focused attention on geographical concepts and more active classroom participation, he can achieve top rankings.',
                    learning_style: 'Visual-Kinesthetic learner who benefits from diagrams, charts, and hands-on activities'
                },
                co_curricular: {
                    activities: ['Science Club Member', 'School Cricket Team', 'Environment Club'],
                    achievements: ['2nd Place in Inter-School Quiz', 'Best Performance Award in Science Exhibition']
                },
                teacher_remarks: 'Arjun is a diligent and focused student with excellent academic potential. He actively participates in co-curricular activities and is a responsible class citizen.',
                principal_remarks: 'Commendable all-round performance. Continue the good work!',
                generated_at: new Date().toISOString()
            };

            setReportData(mockData);
        } catch (error) {
            console.error('Failed to generate report card:', error);
        } finally {
            setIsLoading(false);
            setIsGenerating(false);
        }
    };

    const getGradeColor = (grade: string) => {
        if (grade === 'A+' || grade === 'A') return 'text-green-600 bg-green-100';
        if (grade === 'B+' || grade === 'B') return 'text-blue-600 bg-blue-100';
        if (grade === 'C+' || grade === 'C') return 'text-yellow-600 bg-yellow-100';
        return 'text-red-600 bg-red-100';
    };

    const getTrendIcon = (trend: string) => {
        switch (trend) {
            case 'up': return <TrendingUp className="w-4 h-4 text-green-500" />;
            case 'down': return <TrendingDown className="w-4 h-4 text-red-500" />;
            default: return <Minus className="w-4 h-4 text-gray-400" />;
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = async () => {
        try {
            const jsPDF = (await import('jspdf')).default;
            const html2canvas = (await import('html2canvas')).default;

            if (!reportRef.current) return;

            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(`Report_Card_${reportData?.student.name}_${reportData?.term}_${reportData?.academic_year}.pdf`);
        } catch (error) {
            console.error('Failed to generate PDF:', error);
        }
    };

    if (isLoading || isGenerating) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                        {isGenerating ? 'Generating Report Card...' : 'Loading...'}
                    </h3>
                    <p className="text-gray-500">
                        {isGenerating
                            ? 'AI is analyzing student performance and generating personalized insights'
                            : 'Please wait while we fetch the data'
                        }
                    </p>
                </div>
            </div>
        );
    }

    if (!reportData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Error Generating Report</h3>
                    <p className="text-gray-500 mb-4">Could not generate the report card. Please try again.</p>
                    <button
                        onClick={generateReportCard}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
            {/* Action Bar - Hidden in print */}
            <div className="max-w-4xl mx-auto px-4 mb-6 print:hidden">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-800">Automated Report Card</h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            <Printer className="w-4 h-4" />
                            Print
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            <Download className="w-4 h-4" />
                            Download PDF
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Report Card Content */}
            <div ref={reportRef} className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-3xl font-bold text-blue-600">
                                {reportData.student.name.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">{reportData.student.name}</h2>
                                <p className="text-blue-100">
                                    Class {reportData.student.class}-{reportData.student.section} |
                                    Roll No: {reportData.student.roll_number}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-semibold">{reportData.term} Term Report</p>
                            <p className="text-blue-100">Academic Year: {reportData.academic_year}</p>
                            <p className="text-sm text-blue-200 mt-1">
                                Generated: {new Date(reportData.generated_at).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Overall Summary */}
                <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
                    <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Overall Percentage</p>
                        <p className="text-3xl font-bold text-blue-600">{reportData.overall.percentage.toFixed(1)}%</p>
                        <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${getGradeColor(reportData.overall.grade)}`}>
                            Grade {reportData.overall.grade}
                        </span>
                    </div>
                    <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Class Rank</p>
                        <p className="text-3xl font-bold text-purple-600">#{reportData.overall.rank}</p>
                        <p className="text-sm text-gray-400 mt-2">of {reportData.overall.total_students} students</p>
                    </div>
                    <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Attendance</p>
                        <p className="text-3xl font-bold text-green-600">{reportData.attendance.percentage.toFixed(1)}%</p>
                        <p className="text-sm text-gray-400 mt-2">{reportData.attendance.present}/{reportData.attendance.total_days} days</p>
                    </div>
                    <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Total Marks</p>
                        <p className="text-3xl font-bold text-orange-600">{reportData.overall.obtained_marks}</p>
                        <p className="text-sm text-gray-400 mt-2">out of {reportData.overall.total_marks}</p>
                    </div>
                </div>

                {/* Subject-wise Scores */}
                <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        Subject-wise Performance
                    </h3>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 text-gray-600 text-sm">
                                    <th className="text-left p-3 rounded-l-lg">Subject</th>
                                    <th className="text-center p-3">UT-1 (25)</th>
                                    <th className="text-center p-3">UT-2 (25)</th>
                                    <th className="text-center p-3">Half Yearly (100)</th>
                                    <th className="text-center p-3">Annual (100)</th>
                                    <th className="text-center p-3">Practical (50)</th>
                                    <th className="text-center p-3">Total</th>
                                    <th className="text-center p-3">%</th>
                                    <th className="text-center p-3">Grade</th>
                                    <th className="text-center p-3 rounded-r-lg">Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.scores.map((score, index) => (
                                    <tr key={index} className="border-b hover:bg-gray-50">
                                        <td className="p-3">
                                            <p className="font-medium text-gray-800">{score.subject}</p>
                                            <p className="text-xs text-gray-400">{score.subject_code}</p>
                                        </td>
                                        <td className="text-center p-3">{score.unit_test_1 ?? '-'}</td>
                                        <td className="text-center p-3">{score.unit_test_2 ?? '-'}</td>
                                        <td className="text-center p-3">{score.half_yearly ?? '-'}</td>
                                        <td className="text-center p-3">{score.annual ?? '-'}</td>
                                        <td className="text-center p-3">{score.practical ?? '-'}</td>
                                        <td className="text-center p-3 font-medium">{score.total}</td>
                                        <td className="text-center p-3 font-medium">{score.percentage.toFixed(1)}%</td>
                                        <td className="text-center p-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(score.grade)}`}>
                                                {score.grade}
                                            </span>
                                        </td>
                                        <td className="text-center p-3">{getTrendIcon(score.trend)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* AI Insights */}
                <div className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50 mx-6 mb-6 rounded-xl">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-purple-500" />
                        AI-Powered Insights
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="bg-white rounded-lg p-4">
                            <h4 className="font-medium text-green-700 mb-2 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Strengths
                            </h4>
                            <ul className="space-y-2">
                                {reportData.ai_insights.strengths.map((strength, i) => (
                                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                        <span className="text-green-500 mt-1">•</span>
                                        {strength}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="bg-white rounded-lg p-4">
                            <h4 className="font-medium text-orange-700 mb-2 flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Areas to Improve
                            </h4>
                            <ul className="space-y-2">
                                {reportData.ai_insights.areas_to_improve.map((area, i) => (
                                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                        <span className="text-orange-500 mt-1">•</span>
                                        {area}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4">
                        <h4 className="font-medium text-purple-700 mb-2">Personalized Feedback</h4>
                        <p className="text-sm text-gray-600">{reportData.ai_insights.personalized_feedback}</p>
                        <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-gray-500">
                                <BookOpen className="w-3 h-3 inline mr-1" />
                                Learning Style: {reportData.ai_insights.learning_style}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Co-curricular Activities */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4 text-blue-500" />
                            Co-curricular Activities
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {reportData.co_curricular.activities.map((activity, i) => (
                                <span key={i} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                    {activity}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <Award className="w-4 h-4 text-yellow-500" />
                            Achievements
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {reportData.co_curricular.achievements.map((achievement, i) => (
                                <span key={i} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                                    {achievement}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Remarks */}
                <div className="p-6 border-t space-y-4">
                    <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Class Teacher's Remarks:</p>
                        <p className="text-gray-700 p-3 bg-gray-50 rounded-lg">{reportData.teacher_remarks}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Principal's Remarks:</p>
                        <p className="text-gray-700 p-3 bg-gray-50 rounded-lg">{reportData.principal_remarks}</p>
                    </div>
                </div>

                {/* Signatures */}
                <div className="p-6 border-t grid grid-cols-3 gap-8 text-center">
                    <div>
                        <div className="w-32 border-b border-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Class Teacher</p>
                    </div>
                    <div>
                        <div className="w-32 border-b border-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Parent/Guardian</p>
                    </div>
                    <div>
                        <div className="w-32 border-b border-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Principal</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-100 p-4 text-center text-xs text-gray-500">
                    <p>This is an AI-generated report card. For any discrepancies, please contact the school office.</p>
                    <p className="mt-1">Generated by Feature Desk AI • {new Date().toLocaleDateString()}</p>
                </div>
            </div>
        </div>
    );
}
