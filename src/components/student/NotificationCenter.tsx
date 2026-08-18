import { useState, useEffect } from 'react';
import { ArrowLeft, Bell, BellOff, Filter, Clock, Calendar, BookOpen, AlertTriangle, Award, ChevronDown, ExternalLink, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import MarkdownRenderer from '../common/MarkdownRenderer';
import {
  getStudentNotifications,
  fetchStudentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotification,
  StudentNotification,
  QuestionFeedback
} from '../../lib/notificationService';

export default function NotificationCenter() {
  const { user } = useAuth();
  const studentId = (user as any)?.id || '';

  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'urgent'>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedNotification, setExpandedNotification] = useState<string | null>(null);

  // Load notifications from the service (Async)
  useEffect(() => {
    if (studentId) {
      // Initial load from local storage for instant render
      const local = getStudentNotifications(studentId);
      setNotifications(local);

      // Then fetch fresh data from Supabase
      fetchStudentNotifications(studentId).then(remote => {
        setNotifications(remote);
      });
    }
  }, [studentId]);

  // Refresh notifications every 10 seconds for real-time feel
  useEffect(() => {
    if (!studentId) return;
    const interval = setInterval(() => {
      fetchStudentNotifications(studentId).then(remote => {
        setNotifications(remote);
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [studentId]);

  const filteredNotifications = notifications.filter(notification => {
    const matchesFilter =
      (activeFilter === 'all') ||
      (activeFilter === 'unread' && !notification.read) ||
      (activeFilter === 'urgent' && notification.urgent);

    const matchesType =
      (selectedType === 'all') ||
      (notification.type === selectedType);

    return matchesFilter && matchesType;
  });

  const handleMarkAsRead = (id: string) => {
    markNotificationAsRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const handleMarkAllAsRead = () => {
    markAllNotificationsAsRead(studentId);
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  };

  const handleDismiss = (id: string) => {
    dismissNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'grade_report':
        return <Award className="w-6 h-6 text-emerald-600" />;
      case 'exam_result':
        return <BookOpen className="w-6 h-6 text-blue-600" />;
      case 'assignment':
        return <BookOpen className="w-6 h-6 text-indigo-600" />;
      case 'exam':
        return <Calendar className="w-6 h-6 text-purple-600" />;
      case 'announcement':
        return <Bell className="w-6 h-6 text-pink-600" />;
      case 'reminder':
        return <Clock className="w-6 h-6 text-orange-600" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-red-600" />;
      default:
        return <Bell className="w-6 h-6 text-gray-600" />;
    }
  };

  const getIconBackground = (type: string) => {
    switch (type) {
      case 'grade_report': return 'bg-emerald-100';
      case 'exam_result': return 'bg-blue-100';
      case 'assignment': return 'bg-indigo-100';
      case 'exam': return 'bg-purple-100';
      case 'announcement': return 'bg-pink-100';
      case 'reminder': return 'bg-orange-100';
      case 'warning': return 'bg-red-100';
      default: return 'bg-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const unreadCount = notifications.filter(notification => !notification.read).length;

  // Render question-wise feedback for grade reports
  const renderQuestionFeedback = (questionFeedback: QuestionFeedback[]) => {
    return (
      <div className="mt-8 space-y-6">
        <h4 className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase text-gray-800">
          <Sparkles className="w-4 h-4 text-purple-500" />
          Detailed Breakdown
        </h4>
        <div className="grid gap-4">
          {questionFeedback.map((qf, index) => {
            const percentage = (qf.marksAwarded / qf.totalMarks) * 100;
            const isGood = percentage >= 80;
            const isAverage = percentage >= 50;

            return (
              <div key={index} className="group relative overflow-hidden bg-white rounded-xl border border-gray-100 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gray-200">
                {/* Status Indicator Stripe */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isGood ? 'bg-emerald-500' : isAverage ? 'bg-amber-500' : 'bg-red-500'
                  }`} />

                <div className="p-5 pl-7">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                    <div className="flex-1 space-y-2">
                      <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                        Question {qf.questionNumber}
                      </span>
                      <p className="text-base font-medium text-gray-900 leading-normal">
                        {qf.questionText}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${isGood ? 'text-emerald-600' : isAverage ? 'text-amber-600' : 'text-red-600'}`}>
                        {qf.marksAwarded}
                      </span>
                      <span className="text-sm font-medium text-gray-400">
                        / {qf.totalMarks}
                      </span>
                    </div>
                  </div>

                  {/* Styled Progress Bar */}
                  <div className="relative h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div
                      className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out ${isGood ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                        isAverage ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                          'bg-gradient-to-r from-red-400 to-red-500'
                        }`}
                      style={{ width: `${Math.max(5, percentage)}%` }}
                    />
                  </div>

                  {qf.feedback && (
                    <div className="bg-gray-50/90 rounded-2xl p-4 text-sm text-gray-700 leading-relaxed border-l-4 border-indigo-400 shadow-2xs space-y-2">
                      <span className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs uppercase tracking-wider mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Teacher Math Feedback:
                      </span>
                      <MarkdownRenderer content={qf.feedback} />
                      {qf.feedbackImage && (
                        <div className="mt-3 p-2 bg-white rounded-xl border border-gray-200">
                          <img src={qf.feedbackImage} alt="Feedback Diagram" className="max-h-60 w-auto object-contain rounded-lg mx-auto" />
                          <span className="text-[10px] text-gray-500 font-medium block text-center mt-1">Teacher Visual Aid</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#FDFDFD] text-gray-900 pb-20 font-sans">
      {/* Cinematic Glass Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-gray-200/50 shadow-sm transition-all duration-300 supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100/80 active:scale-95 transition-transform text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-800">
              Notification Center
            </h1>
            {unreadCount > 0 && (
              <span className="hidden sm:flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full border border-indigo-100 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse ring-2 ring-indigo-200" />
                {unreadCount} New
              </span>
            )}
          </div>
          <button
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${unreadCount > 0
              ? 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95'
              : 'text-gray-300 cursor-not-allowed'
              }`}
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">

        {/* Controls Section */}
        <div className="flex flex-col md:flex-row gap-6 mb-10 items-start md:items-center justify-between">

          {/* Custom Tab Switcher */}
          <div className="bg-gray-100/80 p-1.5 rounded-2xl flex w-full md:w-auto">
            {['all', 'unread', 'urgent'].map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter as any)}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 capitalize ${activeFilter === filter
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5 transform scale-[1.02]'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                  }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Type Filter Dropdown */}
          <div className="relative group w-full md:w-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              <Filter className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="appearance-none w-full md:w-[220px] pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300 transition-all cursor-pointer"
            >
              <option value="all">All Notification Types</option>
              <option value="grade_report">Grade Reports</option>
              <option value="exam_result">Exam Results</option>
              <option value="assignment">Assignments</option>
              <option value="announcement">Announcements</option>
              <option value="reminder">Reminders</option>
              <option value="warning">System Warnings</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Notifications Grid */}
        <div className="space-y-5">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification, idx) => {
              const isExpanded = expandedNotification === notification.id;
              const hasDetails = (notification.type === 'grade_report' || notification.type === 'exam_result') && notification.metadata;
              const isUnread = !notification.read;

              return (
                <div
                  key={notification.id}
                  className={`group relative bg-white rounded-3xl border transition-all duration-300 overflow-hidden ${isUnread
                    ? 'border-indigo-200 shadow-[0_4px_20px_-12px_rgba(99,102,241,0.3)] ring-1 ring-indigo-100'
                    : 'border-gray-100 shadow-sm hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)] hover:border-gray-200'
                    }`}
                  style={{ animationDelay: `${idx * 75}ms` }}
                >
                  {/* Unread Indicator Dot */}
                  {isUnread && (
                    <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-100 animate-pulse" />
                  )}

                  <div
                    className={`p-6 cursor-pointer transition-colors ${isExpanded ? 'bg-gray-50/30' : ''}`}
                    onClick={() => {
                      setExpandedNotification(isExpanded ? null : notification.id);
                      if (!notification.read) handleMarkAsRead(notification.id);
                    }}
                  >
                    <div className="flex items-start gap-5">
                      {/* Icon */}
                      <div className={`flex-shrink-0 p-3.5 rounded-2xl ${getIconBackground(notification.type)} transition-transform group-hover:scale-110 duration-500 shadow-sm`}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <div>
                            <h3 className={`text-lg font-bold leading-snug tracking-tight ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </h3>
                            {notification.urgent && (
                              <span className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-rose-50 text-rose-600 border border-rose-100">
                                Urgent
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-gray-400 whitespace-nowrap bg-gray-50 px-2 py-1 rounded-lg">
                            {formatDate(notification.created_at)}
                          </span>
                        </div>

                        {!isExpanded && (
                          <p className="mt-2 text-sm text-gray-500 line-clamp-2 leading-relaxed max-w-2xl">
                            {notification.message}
                          </p>
                        )}

                        {/* Action Buttons Row */}
                        <div className="mt-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0" onClick={(e) => e.stopPropagation()}>
                          {!notification.read && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100"
                            >
                              Mark as read
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(notification.id)}
                            className="text-xs font-bold text-gray-400 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>

                      <div className="flex-shrink-0 self-center pl-2">
                        <button className={`p-2.5 rounded-xl transition-all duration-300 ${isExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                          <ChevronDown className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100/80 bg-white p-6 md:p-8 animate-in slide-in-from-top-4 duration-500 ease-out">

                      {!hasDetails && (
                        <div className="prose prose-sm max-w-none text-gray-600 mb-8 font-medium leading-relaxed bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                          {notification.message}
                        </div>
                      )}

                      {hasDetails && notification.metadata && (
                        <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl border border-gray-200 shadow-sm overflow-hidden ring-1 ring-black/5">
                          {/* Grade Summary Header */}
                          <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8 border-b border-gray-100">
                            <div className="text-center md:text-left">
                              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Assessment Result</h4>
                              <div className="text-xl md:text-2xl font-bold text-gray-900">{notification.title}</div>
                            </div>

                            <div className="flex items-stretch gap-6">
                              <div className="flex flex-col items-center md:items-end justify-center">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Score</div>
                                <div className="text-3xl font-black text-gray-900 tracking-tight">
                                  {notification.metadata.score}
                                  <span className="text-lg text-gray-400 font-medium ml-1">/{notification.metadata.total_marks}</span>
                                </div>
                              </div>

                              <div className="w-px bg-gray-200 scale-y-75 origin-center hidden md:block" />

                              <div className={`flex flex-col items-center justify-center h-20 w-20 rounded-2xl border-2 shadow-sm ${notification.metadata.grade?.startsWith('A') ? 'border-emerald-100 bg-emerald-50 text-emerald-700' :
                                notification.metadata.grade?.startsWith('B') ? 'border-blue-100 bg-blue-50 text-blue-700' :
                                  notification.metadata.grade?.startsWith('C') ? 'border-amber-100 bg-amber-50 text-amber-700' :
                                    'border-red-100 bg-red-50 text-red-700'
                                }`}>
                                <span className="text-3xl font-black tracking-tighter leading-none">{notification.metadata.grade}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 mt-1">Grade</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-6 md:p-8">
                            {/* Score Progress Bar */}
                            {notification.metadata.score !== undefined && notification.metadata.total_marks !== undefined && (
                              <div className="mb-10">
                                <div className="flex justify-between items-end mb-3">
                                  <span className="text-sm font-bold text-gray-600">Performance Score</span>
                                  <span className="text-sm font-bold text-indigo-600">{Math.round((notification.metadata.score / notification.metadata.total_marks) * 100)}%</span>
                                </div>
                                <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-lg"
                                    style={{ width: `${Math.min(100, (notification.metadata.score / notification.metadata.total_marks) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Question Feedback */}
                            {notification.metadata.question_feedback && notification.metadata.question_feedback.length > 0 && (
                              renderQuestionFeedback(notification.metadata.question_feedback)
                            )}

                            {/* Answer Sheet Link */}
                            {notification.metadata.answer_sheet_url && (
                              <div className="mt-10 pt-8 border-t border-gray-100 flex justify-center md:justify-end">
                                <a
                                  href={notification.metadata.answer_sheet_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group inline-flex items-center gap-3 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-indigo-600 transition-all font-bold text-sm shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-1 active:translate-y-0 active:scale-95"
                                >
                                  <ExternalLink className="w-4 h-4 group-hover:rotate-45 transition-transform" />
                                  View Combined Answer Sheet
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in duration-700">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-full mb-6 shadow-inner ring-1 ring-black/5">
                <BellOff className="h-12 w-12 text-gray-300" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">No notifications found</h3>
              <p className="text-gray-500 max-w-sm mx-auto leading-relaxed">
                {activeFilter !== 'all' || selectedType !== 'all'
                  ? 'We couldn\'t find any matches. Try adjusting your filters to see more results.'
                  : "You're all caught up! Check back later for updates from your teachers."}
              </p>
              {(activeFilter !== 'all' || selectedType !== 'all') && (
                <button
                  onClick={() => { setActiveFilter('all'); setSelectedType('all'); }}
                  className="mt-8 px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}