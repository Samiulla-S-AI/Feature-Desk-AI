import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  Award,
  Target,
  BookOpen,
  Clock,
  Trophy,
  Star,
  Brain
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { analyzeStudentPerformance } from '../../lib/gemini';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const performanceData = [
  { month: 'Jan', score: 75, avgTime: 45 },
  { month: 'Feb', score: 78, avgTime: 42 },
  { month: 'Mar', score: 82, avgTime: 40 },
  { month: 'Apr', score: 85, avgTime: 38 },
  { month: 'May', score: 88, avgTime: 35 },
  { month: 'Jun', score: 90, avgTime: 33 }
];

const subjectData = [
  { subject: 'Math', score: 92 },
  { subject: 'Science', score: 88 },
  { subject: 'English', score: 85 },
  { subject: 'History', score: 90 },
  { subject: 'Physics', score: 87 }
];

const skillsData = [
  { skill: 'Problem Solving', value: 90 },
  { skill: 'Critical Thinking', value: 85 },
  { skill: 'Communication', value: 80 },
  { skill: 'Collaboration', value: 88 },
  { skill: 'Creativity', value: 82 },
  { skill: 'Time Management', value: 75 }
];

const badges = [
  { id: 1, name: 'Quick Learner', icon: '⚡', color: 'bg-yellow-100 text-yellow-800', earned: true },
  { id: 2, name: 'Perfect Score', icon: '🎯', color: 'bg-green-100 text-green-800', earned: true },
  { id: 3, name: 'Consistent Performer', icon: '📈', color: 'bg-blue-100 text-blue-800', earned: true },
  { id: 4, name: 'Math Wizard', icon: '🧮', color: 'bg-purple-100 text-purple-800', earned: true },
  { id: 5, name: 'Week Streak', icon: '🔥', color: 'bg-orange-100 text-orange-800', earned: true },
  { id: 6, name: 'Top 10%', icon: '👑', color: 'bg-pink-100 text-pink-800', earned: false }
];

export default function DashboardAnalysis() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState('6months');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);

  const handleEvolveAnalysis = async () => {
    setAnalyzing(true);
    try {
      // 1. Fetch Real Data from Supabase (Structured Results)
      const { data: recentActivity, error } = await supabase
        .from('quiz_results')
        .select('quiz_title, score, total_marks, created_at')
        .eq('student_id', (user as any)?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      // 2. Prepare Data for AI
      // Fallback if no data
      const studentPerformanceData = {
        studentName: (user as any)?.user_metadata?.name || 'Student',
        recent_quiz_scores: (recentActivity && recentActivity.length > 0) ? recentActivity.map((log: any) => ({
          quiz: log.quiz_title || 'Quiz',
          score: log.score && log.total_marks ? Math.round((log.score / log.total_marks) * 100) : 'N/A',
          date: log.created_at
        })) : [{ quiz: 'No recent quizzes', score: 'N/A' }],
        goals: ['Improve consistency', 'Master weak topics']
      };

      console.log("sending to AI:", studentPerformanceData);

      // 3. Send to Gemini Agents
      const analysis = await analyzeStudentPerformance(studentPerformanceData);
      setAiInsights(analysis);
    } catch (e) {
      console.error("Analysis Failed", e);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 min-h-screen w-full">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/')}
              className="mr-4 p-2 rounded-full hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Performance Dashboard</h1>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="1month">Last Month</option>
            <option value="3months">Last 3 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last Year</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Overall Score</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">88%</p>
                <div className="flex items-center text-green-600 text-sm mt-2">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  <span>+5% from last month</span>
                </div>
              </div>
              <div className="bg-indigo-100 p-3 rounded-full">
                <Trophy className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Quizzes Completed</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">45</p>
                <div className="flex items-center text-blue-600 text-sm mt-2">
                  <Target className="w-4 h-4 mr-1" />
                  <span>15 this month</span>
                </div>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <BookOpen className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Study Time</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">42h</p>
                <div className="flex items-center text-purple-600 text-sm mt-2">
                  <Clock className="w-4 h-4 mr-1" />
                  <span>This month</span>
                </div>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <Clock className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Rank</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">12th</p>
                <div className="flex items-center text-green-600 text-sm mt-2">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  <span>Top 15%</span>
                </div>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <Award className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Performance Trend */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} name="Score %" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Subject Performance */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Subject Performance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={subjectData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" fill="#8b5cf6" name="Score %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Skills Radar Chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Skills Assessment</h3>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={skillsData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="skill" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar name="Skills" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Badges & Achievements */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Badges & Achievements</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {badges.map(badge => (
              <div
                key={badge.id}
                className={`relative p-4 rounded-xl border-2 text-center transition-all ${badge.earned
                  ? `${badge.color} border-transparent`
                  : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}
              >
                <div className="text-3xl mb-2">{badge.icon}</div>
                <p className="text-xs font-medium">{badge.name}</p>
                {badge.earned && (
                  <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1">
                    <Star className="w-3 h-3 text-white fill-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Insights & Recommendations */}
        <div className="mt-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-sm p-6 text-white relative overflow-hidden">
          <div className="flex justify-between items-center mb-4 relative z-10">
            <h3 className="text-lg font-semibold flex items-center">
              <Brain className="w-5 h-5 mr-2" />
              AI-Powered Insights
            </h3>
            <button
              onClick={handleEvolveAnalysis}
              disabled={analyzing}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors flex items-center backdrop-blur-sm border border-white/30"
            >
              {analyzing ? (
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
              ) : (
                <span className="mr-2">✨</span>
              )}
              {analyzing ? 'Analyzing...' : 'Am I Ready? (Evolve)'}
            </button>
          </div>

          <div className="space-y-3 relative z-10 min-h-[100px]">
            {aiInsights ? (
              <>
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="font-semibold text-yellow-300 text-sm mb-1">Motivational:</p>
                  <p className="text-sm italic">"{aiInsights.motivationalMessage}"</p>
                </div>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div className="bg-white/10 rounded-lg p-3">
                    <p className="font-semibold text-green-300 text-sm mb-1">Strengths:</p>
                    <ul className="list-disc pl-4 text-xs space-y-1">
                      {aiInsights.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="bg-white/10 rounded-lg p-3">
                    <p className="font-semibold text-red-300 text-sm mb-1">Focus Areas:</p>
                    <ul className="list-disc pl-4 text-xs space-y-1">
                      {aiInsights.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 opacity-90">
                <div className="flex items-start">
                  <TrendingUp className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">Your performance in Mathematics has improved by 12% this month. Keep up the great work!</p>
                </div>
                <div className="flex items-start">
                  <Target className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">Focus on improving your response time in Science quizzes. Practice more timed exercises.</p>
                </div>
                <div className="flex items-start">
                  <Award className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">You are close to earning the "Top 10%" badge. Complete 3 more quizzes with 90%+ scores!</p>
                </div>
              </div>
            )}
          </div>

          {/* Background decoration */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>
        </div>
      </div>
    </div>
  );
}
