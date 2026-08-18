import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Users,
    Search,
    Filter,
    RefreshCw,
    Key,
    Phone,
    AlertTriangle,
    CheckCircle,
    TrendingDown,
    Eye,
    Send,
    FileText,
    Copy,
    Check
} from 'lucide-react';
import { getStudentsByClass, getStudentsBySubject, resetStudentPassword, getStudentsNeedingIntervention, sendNotification, StudentProfile } from '../../lib/teacherDb';
import { generateInterventionMessage, generateParentReport } from '../../lib/teacherAI';
import { supabase } from '../../lib/supabase';

interface StudentManagementProps {
    classId?: number;
    subjectCode?: string;
}

export default function StudentManagement({ classId, subjectCode }: StudentManagementProps) {
    const { user } = useAuth();
    const isClassTeacher = (user as any)?.is_class_teacher;

    const [students, setStudents] = useState<StudentProfile[]>([]);
    const [filteredStudents, setFilteredStudents] = useState<StudentProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showInterventionModal, setShowInterventionModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [interventionMessage, setInterventionMessage] = useState('');
    const [interventionStudents, setInterventionStudents] = useState<StudentProfile[]>([]);
    const [showParentReportModal, setShowParentReportModal] = useState(false);
    const [parentReport, setParentReport] = useState('');
    const [generatingReport, setGeneratingReport] = useState(false);
    const [reportCopied, setReportCopied] = useState(false);

    useEffect(() => {
        loadStudents();
        if (classId && isClassTeacher) {
            loadInterventionStudents();
        }
    }, [classId, subjectCode]);

    useEffect(() => {
        filterStudents();
    }, [searchQuery, students]);

    const loadStudents = async () => {
        setLoading(true);
        let data: StudentProfile[] = [];

        if (isClassTeacher && classId) {
            data = await getStudentsByClass(classId);
        } else if (subjectCode) {
            data = await getStudentsBySubject(subjectCode, classId);
        }

        setStudents(data);
        setFilteredStudents(data);
        setLoading(false);
    };

    const loadInterventionStudents = async () => {
        if (classId) {
            const needsIntervention = await getStudentsNeedingIntervention(classId);
            setInterventionStudents(needsIntervention);
        }
    };

    const filterStudents = () => {
        if (!searchQuery.trim()) {
            setFilteredStudents(students);
            return;
        }

        const query = searchQuery.toLowerCase();
        setFilteredStudents(
            students.filter(s =>
                s.student_name.toLowerCase().includes(query) ||
                s.roll_number.toLowerCase().includes(query)
            )
        );
    };

    const handleResetPassword = async () => {
        if (!selectedStudent || !newPassword.trim()) return;

        const success = await resetStudentPassword(selectedStudent.id, newPassword);
        if (success) {
            alert(`Password reset successfully for ${selectedStudent.student_name}`);
            setShowPasswordModal(false);
            setNewPassword('');
            setSelectedStudent(null);
        } else {
            alert('Failed to reset password');
        }
    };


    const handleSendIntervention = async (student: StudentProfile) => {
        setSelectedStudent(student);
        setShowInterventionModal(true);

        // Fetch real student scores from database
        const { data: recentResults } = await supabase
            .from('quiz_results')
            .select('score, total_marks')
            .eq('student_id', student.id)
            .order('timestamp', { ascending: false })
            .limit(3);

        // Calculate actual score percentages
        const actualScores = (recentResults || []).map((r: any) =>
            Math.round((r.score / r.total_marks) * 100)
        );

        // Use actual scores or fallback to indicating no recent data
        const scoresToUse = actualScores.length > 0 ? actualScores : [45]; // Default low score if no data

        // Generate AI message with real performance data
        const message = await generateInterventionMessage(
            student.student_name,
            subjectCode || 'your subject',
            scoresToUse
        );
        setInterventionMessage(message);
    };

    const handleGenerateParentReport = async (student: StudentProfile) => {
        setSelectedStudent(student);
        setShowParentReportModal(true);
        setGeneratingReport(true);
        setReportCopied(false);

        try {
            const { data: recentResults } = await supabase
                .from('quiz_results')
                .select('score, total_marks, quiz_title')
                .eq('student_id', student.id)
                .order('timestamp', { ascending: false })
                .limit(5);

            const scores = (recentResults || []).map((r: any) =>
                Math.round((r.score / r.total_marks) * 100)
            );
            const currentScore = scores.length > 0 ? scores[0] : 70;
            const previousScore = scores.length > 1 ? scores[1] : 65;

            const report = await generateParentReport(
                student.student_name,
                {
                    subject: subjectCode || 'General',
                    currentScore,
                    previousScore,
                    strengths: currentScore >= 70 ? ['Consistent effort', 'Good participation'] : ['Showing determination'],
                    areasForFocus: currentScore < 80 ? ['Practice more problems', 'Review weak topics'] : ['Challenge with advanced topics']
                }
            );
            setParentReport(report);
        } catch (error) {
            console.error('Error generating parent report:', error);
            setParentReport(`${student.student_name} is making progress in their studies. Please continue to encourage their learning at home.`);
        } finally {
            setGeneratingReport(false);
        }
    };

    const copyReportToClipboard = () => {
        navigator.clipboard.writeText(parentReport);
        setReportCopied(true);
        setTimeout(() => setReportCopied(false), 2000);
    };

    const sendInterventionNotification = async () => {
        if (!selectedStudent) return;

        const success = await sendNotification({
            recipient_type: 'student',
            recipient_ids: [selectedStudent.id],
            title: 'Support Message from Your Teacher',
            message: interventionMessage,
            type: 'info'
        });

        if (success) {
            alert('Intervention message sent successfully!');
            setShowInterventionModal(false);
            setInterventionMessage('');
            setSelectedStudent(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Student Management</h2>
                    <p className="text-gray-600">
                        {isClassTeacher
                            ? `Managing Class ${classId} - ${students.length} students`
                            : `${subjectCode} students - ${students.length} enrolled`
                        }
                    </p>
                </div>
                <button
                    onClick={loadStudents}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Intervention Alerts */}
            {interventionStudents.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="flex items-center space-x-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        <h3 className="font-semibold text-orange-800">Students Needing Intervention</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {interventionStudents.map(student => (
                            <button
                                key={student.id}
                                onClick={() => handleSendIntervention(student)}
                                className="flex items-center space-x-2 px-3 py-2 bg-white border border-orange-300 rounded-lg hover:bg-orange-100 transition-colors"
                            >
                                <span className="text-sm font-medium text-gray-700">{student.student_name}</span>
                                <TrendingDown className="w-4 h-4 text-orange-600" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Search & Filter */}
            <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by name or roll number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <button className="flex items-center space-x-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    <Filter className="w-4 h-4 text-gray-600" />
                    <span>Filter</span>
                </button>
            </div>

            {/* Students Table */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Student
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Roll Number
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Class
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredStudents.map((student) => (
                                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                                                {student.student_name.charAt(0)}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{student.student_name}</div>
                                                {isClassTeacher && student.parent_phone && (
                                                    <div className="flex items-center text-xs text-gray-500">
                                                        <Phone className="w-3 h-3 mr-1" />
                                                        {student.parent_phone}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-900 font-mono">{student.roll_number}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                            Class {student.current_class}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {interventionStudents.some(s => s.id === student.id) ? (
                                            <span className="flex items-center text-orange-600 text-sm">
                                                <AlertTriangle className="w-4 h-4 mr-1" />
                                                Needs Support
                                            </span>
                                        ) : (
                                            <span className="flex items-center text-green-600 text-sm">
                                                <CheckCircle className="w-4 h-4 mr-1" />
                                                On Track
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button
                                                onClick={() => {/* View student details */ }}
                                                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="View Details"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            {isClassTeacher && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedStudent(student);
                                                        setShowPasswordModal(true);
                                                    }}
                                                    className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                    title="Reset Password"
                                                >
                                                    <Key className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleSendIntervention(student)}
                                                className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                title="Send Message"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleGenerateParentReport(student)}
                                                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Generate Parent Report"
                                            >
                                                <FileText className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredStudents.length === 0 && (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">No students found</p>
                        </div>
                    )}
                </div>
            )}

            {/* Password Reset Modal */}
            {showPasswordModal && selectedStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Reset Password</h3>
                        <p className="text-gray-600 mb-4">
                            Reset password for <span className="font-semibold">{selectedStudent.student_name}</span>
                        </p>
                        <input
                            type="password"
                            placeholder="Enter new password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                        />
                        <div className="flex space-x-3">
                            <button
                                onClick={() => {
                                    setShowPasswordModal(false);
                                    setNewPassword('');
                                    setSelectedStudent(null);
                                }}
                                className="flex-1 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResetPassword}
                                className="flex-1 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Intervention Message Modal */}
            {showInterventionModal && selectedStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Send Support Message</h3>
                        <p className="text-gray-600 mb-4">
                            Sending to <span className="font-semibold">{selectedStudent.student_name}</span>
                        </p>
                        <div className="mb-2 text-xs text-gray-500 flex items-center">
                            <span className="animate-pulse">✨</span>
                            <span className="ml-1">AI-Generated Message (editable)</span>
                        </div>
                        <textarea
                            value={interventionMessage}
                            onChange={(e) => setInterventionMessage(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4 resize-none"
                        />
                        <div className="flex space-x-3">
                            <button
                                onClick={() => {
                                    setShowInterventionModal(false);
                                    setInterventionMessage('');
                                    setSelectedStudent(null);
                                }}
                                className="flex-1 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={sendInterventionNotification}
                                className="flex-1 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                            >
                                <Send className="w-4 h-4" />
                                <span>Send Message</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Parent Report Modal */}
            {showParentReportModal && selectedStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center">
                            <FileText className="w-5 h-5 mr-2 text-indigo-600" />
                            Parent Progress Report
                        </h3>
                        <p className="text-gray-600 mb-4">
                            Report for <span className="font-semibold">{selectedStudent.student_name}</span>'s parents
                        </p>
                        {generatingReport ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3"></div>
                                <span className="text-gray-500">AI is generating report...</span>
                            </div>
                        ) : (
                            <>
                                <div className="mb-2 text-xs text-gray-500 flex items-center">
                                    <span className="animate-pulse">✨</span>
                                    <span className="ml-1">AI-Generated Report (editable)</span>
                                </div>
                                <textarea
                                    value={parentReport}
                                    onChange={(e) => setParentReport(e.target.value)}
                                    rows={6}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4 resize-none text-sm leading-relaxed"
                                />
                            </>
                        )}
                        <div className="flex space-x-3">
                            <button
                                onClick={() => {
                                    setShowParentReportModal(false);
                                    setParentReport('');
                                    setSelectedStudent(null);
                                }}
                                className="flex-1 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={copyReportToClipboard}
                                disabled={generatingReport}
                                className="flex-1 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                            >
                                {reportCopied ? (
                                    <><Check className="w-4 h-4" /><span>Copied!</span></>
                                ) : (
                                    <><Copy className="w-4 h-4" /><span>Copy Report</span></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
