import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import ClassSubjectSelector from './components/ClassSubjectSelector';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import ScreenAdapter from './components/common/ScreenAdapter';

// Lazy load route screens on demand
const StudentDashboard = React.lazy(() => import('./components/student/StudentDashboard'));
const TeacherDashboard = React.lazy(() => import('./components/teacher/TeacherDashboard'));
const SchoolDashboard = React.lazy(() => import('./components/school/SchoolDashboard'));
const QuizApp = React.lazy(() => import('./components/student/QuizApp'));
const ExaminationApp = React.lazy(() => import('./components/student/ExaminationApp'));
const NotesApp = React.lazy(() => import('./components/student/NotesApp'));
const DashboardAnalysis = React.lazy(() => import('./components/student/DashboardAnalysis'));
const TestApp = React.lazy(() => import('./components/student/TestApp'));
const NotificationCenter = React.lazy(() => import('./components/student/NotificationCenter'));
const HistoryViewer = React.lazy(() => import('./components/student/HistoryViewer'));
const LifeActivityApp = React.lazy(() => import('./components/student/LifeActivityApp'));
const FloatingAIChatbot = React.lazy(() => import('./components/student/FloatingAIChatbot'));
const LiveChatbot = React.lazy(() => import('./components/student/LiveChatbot'));
const SocialLearningDashboard = React.lazy(() => import('./components/student/SocialLearningDashboard'));
const SelfAssessment = React.lazy(() => import('./components/student/SelfAssessment'));
const PeerReview = React.lazy(() => import('./components/student/PeerReview'));

const ScreenLoader = () => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-500">Loading module...</p>
        </div>
    </div>
);

function AppContent() {
    const { user, userType, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading Feature Desk...</p>
                </div>
            </div>
        );
    }

    // Not logged in
    if (!user || !userType) {
        return (
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        );
    }

    // School admin - direct to school dashboard
    if (userType === 'school') {
        return (
            <Suspense fallback={<ScreenLoader />}>
                <Routes>
                    <Route path="/" element={<SchoolDashboard />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        );
    }

    // Student without class/subject selected
    if (userType === 'student' && (!(user as any).current_class || !(user as any).current_subject)) {
        return (
            <Routes>
                <Route path="/" element={<ClassSubjectSelector />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        );
    }

    // Teacher (class teacher doesn't need subject selection)
    if (userType === 'teacher' && !(user as any).is_class_teacher && !((user as any).assigned_subjects?.length)) {
        return (
            <Routes>
                <Route path="/" element={<ClassSubjectSelector />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        );
    }

    // Routes for authenticated users
    return (
        <>
            <PWAInstallPrompt />
            <Suspense fallback={null}>
                {(userType === 'student' || userType === 'teacher') && <FloatingAIChatbot />}
            </Suspense>
            <Suspense fallback={<ScreenLoader />}>
                <Routes>
                    {userType === 'student' ? (
                        <>
                            <Route path="/" element={<StudentDashboard />} />
                            <Route path="/quiz" element={<QuizApp />} />
                            <Route path="/history" element={<HistoryViewer />} />
                            <Route path="/exam" element={<ExaminationApp />} />
                            <Route path="/notes" element={<NotesApp />} />
                            <Route path="/dashboard" element={<DashboardAnalysis />} />
                            <Route path="/chatbot" element={<LiveChatbot />} />
                            <Route path="/life-activity" element={<LifeActivityApp />} />
                            <Route path="/test" element={<TestApp />} />
                            <Route path="/notifications" element={<NotificationCenter />} />
                            <Route path="/social-learning" element={<SocialLearningDashboard />} />
                            <Route path="/self-assessment" element={<SelfAssessment />} />
                            <Route path="/peer-review" element={<PeerReview />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </>
                    ) : (
                        <>
                            <Route path="/" element={<TeacherDashboard />} />
                            <Route path="/chatbot" element={<LiveChatbot />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </>
                    )}
                </Routes>
            </Suspense>
        </>
    );
}

function App() {
    return (
        <AuthProvider>
            <ScreenAdapter>
                <AppContent />
            </ScreenAdapter>
        </AuthProvider>
    );
}

export default App;
