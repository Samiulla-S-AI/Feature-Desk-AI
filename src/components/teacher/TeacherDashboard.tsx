import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  LogOut,
  BarChart3,
  Users,
  BookOpen,
  Bell,
  Plus,
  TrendingUp,
  Award,
  Target,
  CheckSquare,
  Send,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Upload,
  Users2,
  FolderOpen,
  ClipboardList
} from 'lucide-react';

// Import Teacher Portal Components
import StudentManagement from './StudentManagement';
import AssessmentCreator from './AssessmentCreator';
import GradingCenter from './GradingCenter';
import AnalyticsDashboard from './AnalyticsDashboard';
import ContentManager from './ContentManager';
import NotificationBroadcaster from './NotificationBroadcaster';
import BatchQuestionImport from './BatchQuestionImport';
import TeacherCollaboration from './TeacherCollaboration';
import StudyMaterialsManager from './StudyMaterialsManager';
import AssessmentManager from './AssessmentManager';

// Import database functions
import { getClassAnalytics, getStudentsNeedingIntervention, getPendingResults } from '../../lib/teacherDb';

interface DashboardStats {
  totalStudents: number;
  activeQuizzes: number;
  avgPerformance: number;
  pendingGrading: number;
  needsIntervention: number;
}

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [showAssessmentCreator, setShowAssessmentCreator] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    activeQuizzes: 0,
    avgPerformance: 0,
    pendingGrading: 0,
    needsIntervention: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const isClassTeacher = (user as any)?.is_class_teacher;
  const assignedClass = (user as any)?.assigned_class || 10;
  const assignedSubjects = (user as any)?.assigned_subjects || ['MATH'];

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'analytics', name: 'Analytics', icon: TrendingUp },
    { id: 'assessments', name: 'Assessments', icon: ClipboardList },
    { id: 'students', name: 'Students', icon: Users },
    { id: 'content', name: 'Content', icon: BookOpen },
    { id: 'materials', name: 'Materials', icon: FolderOpen },
    { id: 'grading', name: 'Grading', icon: CheckSquare },
    { id: 'import', name: 'Import', icon: Upload },
    { id: 'collaborate', name: 'Collaborate', icon: Users2 },
    { id: 'notifications', name: 'Broadcast', icon: Bell },
  ];

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);

    try {
      // Load analytics
      const analytics = await getClassAnalytics(assignedClass);

      // Load intervention needs
      const interventionStudents = await getStudentsNeedingIntervention(assignedClass);

      // Load pending results
      const pendingResults = await getPendingResults(user?.id || '', assignedClass);

      setStats({
        totalStudents: analytics?.totalStudents || 42,
        activeQuizzes: 8,
        avgPerformance: analytics?.averageScore || 75,
        pendingGrading: pendingResults.length || 12,
        needsIntervention: interventionStudents.length || 3
      });

      // Mock recent activities
      setRecentActivities([
        { type: 'quiz', message: 'Math Quiz completed by 23 students', time: '2 hours ago', color: 'green' },
        { type: 'content', message: 'New notes uploaded for Physics', time: '4 hours ago', color: 'blue' },
        { type: 'grading', message: '5 submissions pending review', time: '6 hours ago', color: 'orange' },
        { type: 'alert', message: '3 students need intervention', time: '1 day ago', color: 'red' },
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }

    setLoading(false);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg flex flex-col h-full border-r border-gray-200">
        <div className="p-6 border-b">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Feature Desk</h1>
              <p className="text-xs text-gray-500">Teacher Portal</p>
            </div>
          </div>
        </div>

        <nav className="mt-6 flex-1 overflow-y-auto pr-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-6 py-3 text-left hover:bg-blue-50 transition-colors ${activeTab === tab.id ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-600' : 'text-gray-700'
                  }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {tab.name}
                {tab.id === 'grading' && stats.pendingGrading > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {stats.pendingGrading}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-6 border-t">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold">
                {(user as any)?.teacher_name?.charAt(0) || 'T'}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{(user as any)?.teacher_name || 'Teacher'}</p>
              <p className="text-xs text-gray-500">
                {isClassTeacher ? `Class ${assignedClass} Teacher` : 'Subject Teacher'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 capitalize">{activeTab}</h2>
              <p className="text-gray-600">
                {isClassTeacher
                  ? `Managing Class ${assignedClass} - All Subjects`
                  : `Teaching ${assignedSubjects.join(', ')}`
                }
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowAssessmentCreator(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                <span>Create Quiz</span>
              </button>
              <button
                onClick={() => setShowNotificationModal(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
              >
                <Bell className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={loadDashboardData}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <button
                onClick={logout}
                className="flex items-center space-x-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-sm font-medium"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Total Students</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-full">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Active Quizzes</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.activeQuizzes}</p>
                    </div>
                    <div className="bg-green-100 p-3 rounded-full">
                      <Target className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Avg Performance</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.avgPerformance}%</p>
                    </div>
                    <div className="bg-purple-100 p-3 rounded-full">
                      <Award className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Pending Grading</p>
                      <p className="text-2xl font-bold text-orange-600">{stats.pendingGrading}</p>
                    </div>
                    <div className="bg-orange-100 p-3 rounded-full">
                      <CheckSquare className="w-5 h-5 text-orange-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Need Support</p>
                      <p className="text-2xl font-bold text-red-600">{stats.needsIntervention}</p>
                    </div>
                    <div className="bg-red-100 p-3 rounded-full">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Intervention Alert */}
              {stats.needsIntervention > 0 && (
                <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <AlertTriangle className="w-6 h-6 text-orange-600" />
                      <div>
                        <h3 className="font-semibold text-orange-900">Students Need Intervention</h3>
                        <p className="text-sm text-orange-700">
                          {stats.needsIntervention} students have failed 2+ quizzes and need support
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('students')}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      View Students
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activities */}
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Recent Activities</h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {recentActivities.map((activity, index) => (
                        <div key={index} className="flex items-center space-x-4">
                          <div className={`w-2 h-2 bg-${activity.color}-500 rounded-full`}></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                            <p className="text-xs text-gray-500">{activity.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setShowAssessmentCreator(true)}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all flex flex-col items-center"
                      >
                        <Plus className="w-8 h-8 text-blue-600 mb-2" />
                        <span className="text-sm font-medium text-gray-700">Create Quiz</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('content')}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-green-300 hover:bg-green-50 transition-all flex flex-col items-center"
                      >
                        <BookOpen className="w-8 h-8 text-green-600 mb-2" />
                        <span className="text-sm font-medium text-gray-700">Add Content</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('grading')}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-all flex flex-col items-center"
                      >
                        <CheckSquare className="w-8 h-8 text-purple-600 mb-2" />
                        <span className="text-sm font-medium text-gray-700">Grade Work</span>
                      </button>
                      <button
                        onClick={() => setShowNotificationModal(true)}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-all flex flex-col items-center"
                      >
                        <Send className="w-8 h-8 text-orange-600 mb-2" />
                        <span className="text-sm font-medium text-gray-700">Send Alert</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Features Showcase */}
              <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
                <div className="flex items-center space-x-2 mb-4">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-purple-900">AI-Powered Features</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/80 backdrop-blur rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">📝 Smart Question Generation</h4>
                    <p className="text-sm text-gray-600">Upload PDFs and let AI generate quiz questions automatically</p>
                  </div>
                  <div className="bg-white/80 backdrop-blur rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">✅ AI-Assisted Grading</h4>
                    <p className="text-sm text-gray-600">Get AI suggestions for grading with rubric-based evaluation</p>
                  </div>
                  <div className="bg-white/80 backdrop-blur rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">📊 Mistake Pattern Detection</h4>
                    <p className="text-sm text-gray-600">Identify common class misconceptions and get teaching recommendations</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <AnalyticsDashboard classId={assignedClass} />
          )}

          {/* Assessments Tab */}
          {activeTab === 'assessments' && (
            <AssessmentManager classId={assignedClass} subjects={assignedSubjects} />
          )}

          {/* Students Tab */}
          {activeTab === 'students' && (
            <StudentManagement classId={assignedClass} subjectCode={assignedSubjects[0]} />
          )}

          {/* Content Tab */}
          {activeTab === 'content' && (
            <ContentManager subjectCode={assignedSubjects[0]} classId={assignedClass} />
          )}

          {/* Grading Tab */}
          {activeTab === 'grading' && (
            <GradingCenter classId={assignedClass} />
          )}

          {/* Materials Tab - Study Materials Manager */}
          {activeTab === 'materials' && (
            <StudyMaterialsManager classId={assignedClass} subjects={assignedSubjects} />
          )}

          {/* Import Tab */}
          {activeTab === 'import' && (
            <BatchQuestionImport
              subjectCode={assignedSubjects[0]}
              classId={assignedClass}
            />
          )}

          {/* Collaborate Tab */}
          {activeTab === 'collaborate' && (
            <TeacherCollaboration />
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="max-w-2xl mx-auto">
              <NotificationBroadcaster classId={assignedClass} />
            </div>
          )}
        </main>
      </div>

      {/* Assessment Creator Modal */}
      {showAssessmentCreator && (
        <AssessmentCreator
          subjectCode={assignedSubjects[0]}
          classId={assignedClass}
          availableSubjects={assignedSubjects}
          onClose={() => setShowAssessmentCreator(false)}
        />
      )}

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6">
              <NotificationBroadcaster
                classId={assignedClass}
                onClose={() => setShowNotificationModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}