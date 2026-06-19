import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Calendar,
    Clock,
    Trash2,
    Eye,
    Edit,
    CheckCircle,
    AlertCircle,
    BookOpen,
    Loader,
    Search,
    Filter,
    GraduationCap,
    Target,
    ToggleLeft,
    ToggleRight
} from 'lucide-react';
import { getTeacherAssessments } from '../../lib/teacherDb';
import { supabase } from '../../lib/supabase';
import AssessmentCreator from './AssessmentCreator';

interface AssessmentManagerProps {
    classId: number;
    subjects: string[];
}

interface Assessment {
    id: string;
    title: string;
    subject_code: string;
    class_id: number;
    total_marks: number;
    time_limit?: number;
    scheduled_at?: string;
    is_active: boolean;
    created_at: string;
    description?: string;
    // Parsed from description
    exam_type?: string;
    passing_marks?: number;
    negative_marking?: boolean;
    shuffle_questions?: boolean;
    instructions?: string;
}

export default function AssessmentManager({ classId: _classId, subjects: _subjects }: AssessmentManagerProps) {
    const { user } = useAuth();
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
    const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

    useEffect(() => {
        loadAssessments();
    }, [user]);

    const loadAssessments = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const data = await getTeacherAssessments(user.id);

            // Parse exam config from description for each assessment
            const parsedAssessments = data.map((a: any) => {
                let examConfig = { exam_type: 'unit_test' };
                try {
                    if (a.description) {
                        examConfig = JSON.parse(a.description);
                    }
                } catch (e) {
                    // Description is plain text
                }
                return { ...a, ...examConfig };
            });

            setAssessments(parsedAssessments);
        } catch (error) {
            console.error('Error loading assessments:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleAssessmentStatus = async (assessmentId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('assessments')
                .update({ is_active: !currentStatus })
                .eq('id', assessmentId);

            if (!error) {
                setAssessments(prev =>
                    prev.map(a => a.id === assessmentId ? { ...a, is_active: !currentStatus } : a)
                );
            }
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    const deleteAssessment = async (assessmentId: string) => {
        try {
            const { error } = await supabase
                .from('assessments')
                .delete()
                .eq('id', assessmentId);

            if (!error) {
                setAssessments(prev => prev.filter(a => a.id !== assessmentId));
                setShowDeleteConfirm(null);
                if (selectedIds.includes(assessmentId)) {
                    setSelectedIds(prev => prev.filter(id => id !== assessmentId));
                }
            }
        } catch (error) {
            console.error('Error deleting assessment:', error);
        }
    };

    const deleteSelectedAssessments = async () => {
        try {
            const { error } = await supabase
                .from('assessments')
                .delete()
                .in('id', selectedIds);

            if (!error) {
                setAssessments(prev => prev.filter(a => !selectedIds.includes(a.id)));
                setSelectedIds([]);
                setShowBulkDeleteConfirm(false);
            }
        } catch (error) {
            console.error('Error deleting assessments:', error);
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredAssessments.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredAssessments.map(a => a.id));
        }
    };

    const getExamTypeLabel = (type: string) => {
        const types: Record<string, string> = {
            annual: 'Annual Exam',
            mid_term: 'Mid-Term Exam',
            unit_test: 'Unit Test',
            weekly: 'Weekly Test',
            practice: 'Practice Test',
            quiz: 'Quick Quiz'
        };
        return types[type] || 'Assessment';
    };

    const getExamTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            annual: 'bg-purple-100 text-purple-700',
            mid_term: 'bg-blue-100 text-blue-700',
            unit_test: 'bg-orange-100 text-orange-700',
            weekly: 'bg-green-100 text-green-700',
            practice: 'bg-gray-100 text-gray-700',
            quiz: 'bg-rose-100 text-rose-700'
        };
        return colors[type] || 'bg-gray-100 text-gray-700';
    };

    const getPortalType = (type: string) => {
        return ['annual', 'mid_term'].includes(type) ? 'Examination App' : 'Test App';
    };

    const filteredAssessments = assessments.filter(a => {
        const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.subject_code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || a.exam_type === typeFilter;
        return matchesSearch && matchesType;
    });

    const formatDate = (dateString: string) => {
        if (!dateString) return 'Not scheduled';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="ml-3 text-gray-600">Loading assessments...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total Assessments</p>
                            <p className="text-2xl font-bold text-gray-900">{assessments.length}</p>
                        </div>
                        <div className="bg-blue-100 p-3 rounded-full">
                            <BookOpen className="w-5 h-5 text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Active</p>
                            <p className="text-2xl font-bold text-green-600">
                                {assessments.filter(a => a.is_active).length}
                            </p>
                        </div>
                        <div className="bg-green-100 p-3 rounded-full">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Formal Exams</p>
                            <p className="text-2xl font-bold text-purple-600">
                                {assessments.filter(a => ['annual', 'mid_term'].includes(a.exam_type || '')).length}
                            </p>
                        </div>
                        <div className="bg-purple-100 p-3 rounded-full">
                            <GraduationCap className="w-5 h-5 text-purple-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Tests & Quizzes</p>
                            <p className="text-2xl font-bold text-orange-600">
                                {assessments.filter(a => !['annual', 'mid_term'].includes(a.exam_type || '')).length}
                            </p>
                        </div>
                        <div className="bg-orange-100 p-3 rounded-full">
                            <Target className="w-5 h-5 text-orange-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                    {selectedIds.length > 0 && (
                        <button
                            onClick={() => setShowBulkDeleteConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Selected ({selectedIds.length})
                        </button>
                    )}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search assessments..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={toggleSelectAll}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                        <div className={`w-4 h-4 border rounded flex items-center justify-center ${selectedIds.length === filteredAssessments.length && filteredAssessments.length > 0
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-400'
                            }`}>
                            {selectedIds.length === filteredAssessments.length && filteredAssessments.length > 0 && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>
                        {selectedIds.length === filteredAssessments.length ? 'Deselect All' : 'Select All'}
                    </button>

                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="pl-10 pr-8 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                        >
                            <option value="all">All Types</option>
                            <option value="annual">Annual Exam</option>
                            <option value="mid_term">Mid-Term Exam</option>
                            <option value="unit_test">Unit Test</option>
                            <option value="weekly">Weekly Test</option>
                            <option value="practice">Practice Test</option>
                            <option value="quiz">Quick Quiz</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Assessments List */}
            {filteredAssessments.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">No Assessments Found</h3>
                    <p className="text-gray-600">
                        {assessments.length === 0
                            ? "You haven't created any assessments yet. Click 'Create Quiz' to get started."
                            : "No assessments match your search criteria."
                        }
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredAssessments.map((assessment) => (
                        <div
                            key={assessment.id}
                            className="bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow"
                        >
                            <div className="p-5">
                                <div className="flex items-start gap-4">
                                    <div className="pt-1">
                                        <button
                                            onClick={() => toggleSelection(assessment.id)}
                                            className={`w-5 h-5 border rounded flex items-center justify-center transition-colors ${selectedIds.includes(assessment.id)
                                                    ? 'bg-blue-600 border-blue-600'
                                                    : 'border-gray-300 hover:border-blue-500'
                                                }`}
                                        >
                                            {selectedIds.includes(assessment.id) && (
                                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getExamTypeColor(assessment.exam_type || 'unit_test')}`}>
                                                {getExamTypeLabel(assessment.exam_type || 'unit_test')}
                                            </span>
                                            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                                                {assessment.subject_code}
                                            </span>
                                            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                                                Class {assessment.class_id}
                                            </span>
                                            {assessment.is_active ? (
                                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> Active
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> Inactive
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{assessment.title}</h3>

                                        <div className="flex items-center gap-4 text-sm text-gray-600">
                                            <span className="flex items-center gap-1">
                                                <Target className="w-4 h-4" />
                                                {assessment.total_marks} marks
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-4 h-4" />
                                                {Math.floor((assessment.time_limit || 1800) / 60)} min
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-4 h-4" />
                                                {formatDate(assessment.scheduled_at || assessment.created_at)}
                                            </span>
                                        </div>

                                        <div className="mt-2">
                                            <span className="text-xs text-gray-500">
                                                Shows in: <span className="font-medium text-blue-600">{getPortalType(assessment.exam_type || 'unit_test')}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-start">

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => toggleAssessmentStatus(assessment.id, assessment.is_active)}
                                            className={`p-2 rounded-lg transition-colors ${assessment.is_active
                                                ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            title={assessment.is_active ? 'Deactivate' : 'Activate'}
                                        >
                                            {assessment.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                        </button>

                                        <button
                                            onClick={() => setSelectedAssessment(assessment)}
                                            className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                            title="View Details"
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>

                                        <button
                                            onClick={() => setEditingAssessment(assessment)}
                                            className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                                            title="Edit Assessment"
                                        >
                                            <Edit className="w-5 h-5" />
                                        </button>

                                        <button
                                            onClick={() => setShowDeleteConfirm(assessment.id)}
                                            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Delete Assessment</h3>
                                <p className="text-sm text-gray-600">This action cannot be undone.</p>
                            </div>
                        </div>
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to delete this assessment? All associated questions and student submissions will be permanently removed.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => deleteAssessment(showDeleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirmation Modal */}
            {showBulkDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Delete {selectedIds.length} Assessments</h3>
                                <p className="text-sm text-gray-600">This action cannot be undone.</p>
                            </div>
                        </div>
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to delete {selectedIds.length} assessments? All associated questions and student submissions will be permanently removed.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowBulkDeleteConfirm(false)}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={deleteSelectedAssessments}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Delete All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assessment Details Modal */}
            {selectedAssessment && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                        <div className="p-6 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getExamTypeColor(selectedAssessment.exam_type || 'unit_test')}`}>
                                            {getExamTypeLabel(selectedAssessment.exam_type || 'unit_test')}
                                        </span>
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900">{selectedAssessment.title}</h2>
                                </div>
                                <button
                                    onClick={() => setSelectedAssessment(null)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-auto max-h-[60vh]">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Subject</p>
                                    <p className="font-semibold">{selectedAssessment.subject_code}</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Class</p>
                                    <p className="font-semibold">Class {selectedAssessment.class_id}</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Total Marks</p>
                                    <p className="font-semibold">{selectedAssessment.total_marks}</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Duration</p>
                                    <p className="font-semibold">{Math.floor((selectedAssessment.time_limit || 1800) / 60)} minutes</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Passing Marks</p>
                                    <p className="font-semibold">{selectedAssessment.passing_marks || 40}%</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Negative Marking</p>
                                    <p className="font-semibold">{selectedAssessment.negative_marking ? 'Yes' : 'No'}</p>
                                </div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-lg mb-4">
                                <p className="text-sm text-blue-600 font-medium mb-1">Student Portal</p>
                                <p className="text-blue-800">
                                    This assessment appears in: <strong>{getPortalType(selectedAssessment.exam_type || 'unit_test')}</strong>
                                    {['annual', 'mid_term'].includes(selectedAssessment.exam_type || '') && (
                                        <span className="block text-sm mt-1">
                                            Password Required: 4-digit code + Roll Number
                                        </span>
                                    )}
                                </p>
                            </div>

                            {selectedAssessment.instructions && (
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600 mb-2">Instructions</p>
                                    <p className="text-gray-800">{selectedAssessment.instructions}</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t bg-gray-50">
                            <button
                                onClick={() => setSelectedAssessment(null)}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Assessment Modal */}
            {editingAssessment && (
                <AssessmentCreator
                    subjectCode={editingAssessment.subject_code}
                    classId={editingAssessment.class_id}
                    availableSubjects={[editingAssessment.subject_code]}
                    assessmentToEdit={editingAssessment}
                    onClose={() => {
                        setEditingAssessment(null);
                        loadAssessments();
                    }}
                />
            )}
        </div>
    );
}
