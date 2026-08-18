import { useState, useEffect } from 'react';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Sparkles, 
  Brain, 
  Loader, 
  Calendar, 
  Play, 
  ChevronRight, 
  Search, 
  Eye, 
  X,
  Target,
  Trophy,
  TrendingUp,
  Lightbulb,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generateAdaptiveQuiz, generateSocraticHints, generateStudentQuizFeedback, generateReinforcementQuizFromMistakes } from '../../lib/gemini';
import { saveQuizResultHybrid } from '../../lib/db';
import { 
  getAdaptiveQuizRecommendations, 
  completeAdaptiveQuizRecommendation, 
  AdaptiveQuizRecommendation,
  fetchStudentCorrectionFeedback,
  StudentCorrectionSummary
} from '../../lib/adaptiveQuizService';
import { supabase } from '../../lib/supabase';
import SyncStatusIndicator from '../common/SyncStatusIndicator';

interface QuizQuestion {
  id: number | string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  timeEstimate: number;
  marks?: number;
  difficulty?: string;
  sourceContentTitle?: string;
  imageUrl?: string;
  positiveEncouragement?: string;
  concept?: string;
}

interface Quiz {
  title: string;
  questions: QuizQuestion[];
  totalMarks: number;
  timeLimit: number;
  reinforcedConcepts?: string[];
}

export interface DetailedQuestionReview {
  questionId: string | number;
  questionText: string;
  options: string[];
  studentAnswer: string;
  studentAnswerIndex?: number;
  correctAnswer: string;
  correctAnswerIndex?: number;
  isCorrect: boolean;
  explanation: string;
  positiveEncouragement?: string;
  concept?: string;
  marks?: number;
}

export default function QuizApp() {
  const { user } = useAuth();
  const [loading] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [, setQuizCompleted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [difficulty] = useState('medium');
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [noContentMessage, setNoContentMessage] = useState<string | null>(null);

  // Adaptive Learning & Navigation states
  const [recommendations, setRecommendations] = useState<AdaptiveQuizRecommendation[]>([]);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [correctionFeedback, setCorrectionFeedback] = useState<StudentCorrectionSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewQuizItem, setReviewQuizItem] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'practice' | 'completed'>('recommendations');
  const [activeRecommendation, setActiveRecommendation] = useState<AdaptiveQuizRecommendation | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState<string>('');
  const [reviewFeedback, setReviewFeedback] = useState<string>('');
  const [loadingReviewFeedback, setLoadingReviewFeedback] = useState(false);

  // Hint State
  const [hints, setHints] = useState<{ level1: string, level2: string, level3: string } | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [loadingHint, setLoadingHint] = useState(false);

  // Launcher states
  const [showLauncher, setShowLauncher] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [, setQuizType] = useState<'teacher' | 'ai' | 'recommendation'>('recommendation');

  // Get current class and subject from user context
  const currentClass = (user as any)?.current_class || 1;
  const currentSubject = (user as any)?.current_subject || 'MATH';

  const getSubjectDisplayName = (code?: string): string => {
    if (!code) return '';
    const upper = code.toUpperCase();
    if (upper === 'MATH') return 'Mathematics';
    if (upper === 'SCI' || upper === 'SCIENCE') return 'Science';
    if (upper === 'ENG' || upper === 'ENGLISH') return 'English';
    if (upper === 'HIST' || upper === 'GEO' || upper === 'SOCIAL') return 'Social Studies';
    if (upper === 'COMP' || upper === 'COMPUTER') return 'Computer Science';
    if (upper === 'HINDI') return 'Hindi';
    if (upper === 'TAMIL') return 'Tamil';
    if (upper === 'PHY') return 'Physics';
    return code;
  };

  const subjectName = getSubjectDisplayName(currentSubject);

  // Fetch recommendations, history, and evaluated mistake corrections
  useEffect(() => {
    fetchRecommendations();
    fetchQuizHistory();
    fetchCorrectionData();
  }, [currentClass, currentSubject, user]);

  const fetchCorrectionData = async () => {
    if (!user) return;
    try {
      const summary = await fetchStudentCorrectionFeedback(user.id, currentSubject);
      setCorrectionFeedback(summary);
    } catch (err) {
      console.error('Failed to fetch correction feedback:', err);
    }
  };

  const fetchRecommendations = async () => {
    if (!user) return;
    setLoadingRecommendations(true);
    try {
      const data = await getAdaptiveQuizRecommendations(user.id);
      setRecommendations(data || []);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const fetchQuizHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('quiz_results')
        .select('*')
        .eq('student_id', user.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setQuizHistory(data || []);
      localStorage.setItem('fd_quiz_history', JSON.stringify(data || []));
    } catch (err) {
      console.error('Failed to fetch quiz history:', err);
      try {
        const stored = localStorage.getItem('fd_quiz_history');
        if (stored) setQuizHistory(JSON.parse(stored));
      } catch {}
    } finally {
      setLoadingHistory(false);
    }
  };

  const saveToLocalHistory = (
    quizObj: any, 
    finalScore: number, 
    feedback?: string, 
    detailedAnswers?: DetailedQuestionReview[]
  ) => {
    try {
      const historyItem = {
        id: `history_${Date.now()}`,
        student_id: user?.id || 'student_123',
        quiz_title: quizObj.title,
        score: finalScore,
        total_marks: quizObj.totalMarks,
        timestamp: new Date().toISOString(),
        subject_code: currentSubject,
        feedback: feedback || null,
        answers: detailedAnswers || quizObj.questions.map((q: any, idx: number) => ({
          questionId: q.id,
          questionText: q.question,
          options: q.options || [],
          studentAnswer: selectedAnswers[idx] >= 0 ? q.options[selectedAnswers[idx]] : 'No Answer',
          studentAnswerIndex: selectedAnswers[idx],
          correctAnswer: q.options[q.correct] || '',
          correctAnswerIndex: q.correct,
          isCorrect: selectedAnswers[idx] === q.correct,
          concept: q.concept || '',
          explanation: q.explanation || '',
          positiveEncouragement: q.positiveEncouragement || '',
          marks: q.marks || 5
        }))
      };
      const current = localStorage.getItem('fd_quiz_history');
      const all = current ? JSON.parse(current) : [];
      all.unshift(historyItem);
      localStorage.setItem('fd_quiz_history', JSON.stringify(all));
      setQuizHistory(all);
    } catch (e) {
      console.error('Failed to save history locally:', e);
    }
  };

  const getNormalizedReviewAnswers = (item: any): DetailedQuestionReview[] => {
    if (!item) return [];
    let raw = item.answers;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (raw && !Array.isArray(raw)) {
      if (Array.isArray(raw.answers)) raw = raw.answers;
      else if (Array.isArray(raw.structuredAnswers)) raw = raw.structuredAnswers;
      else if (typeof raw === 'object') raw = Object.values(raw);
    }
    if (!Array.isArray(raw)) raw = [];

    return raw.map((a: any, idx: number) => {
      const questionText = a.questionText || a.question || `Question ${idx + 1}`;
      let options: string[] = Array.isArray(a.options) ? a.options : [];
      const studentAnswer = a.studentAnswer || a.student_answer || '';
      const correctAnswer = a.correctAnswer || a.correct_answer || '';
      
      // If options are missing, synthesize them from student & correct answers
      if (options.length === 0 && (studentAnswer || correctAnswer)) {
        options = Array.from(new Set([correctAnswer, studentAnswer, 'Other Choice 1', 'Other Choice 2'])).filter(Boolean).slice(0, 4);
      }

      const isCorrect = typeof a.isCorrect === 'boolean' 
        ? a.isCorrect 
        : (studentAnswer && correctAnswer ? studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase() : false);

      const explanation = a.explanation || a.feedback || 'This verified principle demonstrates the core concept step-by-step.';
      const positiveEncouragement = a.positiveEncouragement || (isCorrect ? 'Outstanding work mastering this concept!' : 'Great effort! Reviewing why other choices differ builds lasting understanding.');
      const concept = a.concept || '';

      return {
        questionId: a.questionId || a.id || idx + 1,
        questionText,
        options,
        studentAnswer,
        studentAnswerIndex: a.studentAnswerIndex,
        correctAnswer,
        correctAnswerIndex: a.correctAnswerIndex,
        isCorrect,
        explanation,
        positiveEncouragement,
        concept,
        marks: a.marks || 5
      };
    });
  };

  const isMatchingAnswer = (optionStr: string, optIdx: number, answerTarget: string, targetIdx?: number): boolean => {
    if (targetIdx !== undefined && targetIdx >= 0 && targetIdx === optIdx) return true;
    if (!answerTarget || !optionStr) return false;
    const cleanOpt = optionStr.replace(/^[A-D]\)\s*/i, '').trim().toLowerCase();
    const cleanTarget = answerTarget.replace(/^[A-D]\)\s*/i, '').trim().toLowerCase();
    return cleanOpt === cleanTarget || optionStr.trim().toLowerCase() === answerTarget.trim().toLowerCase();
  };

  const handleOpenReview = async (hist: any) => {
    setReviewQuizItem(hist);
    if (!hist.feedback) {
      setLoadingReviewFeedback(true);
      setReviewFeedback('');
      try {
        const parsedAnswers = getNormalizedReviewAnswers(hist);
        
        const questions = parsedAnswers.map((a, idx) => ({
          question: a.questionText || `Question ${idx + 1}`,
          correct: 0,
          options: a.options.length > 0 ? a.options : [a.correctAnswer, a.studentAnswer].filter(Boolean)
        }));
        
        const studentAnswers = parsedAnswers.map(a => a.isCorrect ? 0 : 1);

        const feedback = await generateStudentQuizFeedback(
          hist.quiz_title || 'Practice Quiz',
          getSubjectDisplayName(hist.subject_code),
          hist.score,
          hist.total_marks || 10,
          questions,
          studentAnswers
        );
        
        setReviewFeedback(feedback);
        
        await supabase
          .from('quiz_results')
          .update({ feedback })
          .eq('id', hist.id);
          
        setQuizHistory(prev => prev.map(item => item.id === hist.id ? { ...item, feedback } : item));
      } catch (err) {
        console.error('Error fetching review feedback:', err);
      } finally {
        setLoadingReviewFeedback(false);
      }
    } else {
      setReviewFeedback(hist.feedback);
    }
  };

  /**
   * 🎯 GENERATE QUIZ STRICTLY FROM EVALUATED CORRECTION FEEDBACK
   */
  const startRecommendationQuiz = async (rec: AdaptiveQuizRecommendation) => {
    setActiveRecommendation(rec);
    setGeneratingAI(true);
    setShowLauncher(false);
    setNoContentMessage(null);
    setQuizType('recommendation');

    try {
      console.log('🎯 Generating targeted reinforcement quiz from feedback for:', rec.exam_title, rec.weak_concepts);
      
      const correctionsPayload = rec.weak_concepts.map(wc => ({
        concept: wc,
        questionText: `Evaluated problem on ${wc}`,
        studentAnswer: 'Previous incorrect understanding',
        correctAnswer: `Accurate rule for ${wc}`,
        feedback: `Focus on mastering ${wc} as highlighted in your ${rec.exam_title} evaluation.`,
        sourceExam: rec.exam_title
      }));

      const aiQuiz = await generateReinforcementQuizFromMistakes(
        getSubjectDisplayName(rec.subject_code),
        difficulty,
        correctionsPayload,
        rec.weak_concepts
      );

      if (aiQuiz && aiQuiz.questions && aiQuiz.questions.length > 0) {
        setQuiz(aiQuiz);
        setTimeRemaining(aiQuiz.timeLimit || 300);
        setSelectedAnswers(new Array(aiQuiz.questions.length).fill(-1));
        setReactionTimes(new Array(aiQuiz.questions.length).fill(0));
        setCurrentQuestionIndex(0);
        setQuizCompleted(false);
        setShowResults(false);
        setScore(0);
        setQuizFeedback('');
      } else {
        throw new Error('AI returned empty questions');
      }
    } catch (error) {
      console.error('Failed to generate recommendation quiz:', error);
      const fallbackQuestions = rec.weak_concepts.map((wc, index) => ({
        id: index + 1,
        question: `Reinforce Concept: ${wc}. Which statement reflects the correct principle?`,
        options: [
          `A) The verified core methodology for ${wc}`,
          `B) A common misconception about ${wc}`,
          `C) An incomplete definition`,
          `D) An unrelated rule`
        ],
        correct: 0,
        explanation: `This practice question helps you reinforce ${wc}.`,
        positiveEncouragement: "Great job reviewing your corrections!",
        concept: wc,
        timeEstimate: 60
      }));

      const fallbackQuiz: Quiz = {
        title: `Reinforce: ${rec.exam_title}`,
        questions: fallbackQuestions,
        totalMarks: fallbackQuestions.length * 5,
        timeLimit: fallbackQuestions.length * 60,
        reinforcedConcepts: rec.weak_concepts
      };

      setQuiz(fallbackQuiz);
      setTimeRemaining(fallbackQuiz.timeLimit);
      setSelectedAnswers(new Array(fallbackQuiz.questions.length).fill(-1));
      setReactionTimes(new Array(fallbackQuiz.questions.length).fill(0));
      setCurrentQuestionIndex(0);
      setQuizCompleted(false);
      setShowResults(false);
      setScore(0);
    } finally {
      setGeneratingAI(false);
    }
  };

  /**
   * General AI Quiz Generation with fallback to mistake corrections
   */
  const generateWithAI = async () => {
    setGeneratingAI(true);
    setShowLauncher(false);
    setNoContentMessage(null);
    setQuizType('ai');

    try {
      console.log('🤖 Generating AI quiz for:', subjectName, difficulty);
      
      // If student has corrections, prioritize them
      if (correctionFeedback && correctionFeedback.corrections.length > 0) {
        const aiQuiz = await generateReinforcementQuizFromMistakes(
          subjectName,
          difficulty,
          correctionFeedback.corrections,
          correctionFeedback.weakConcepts
        );
        setQuiz(aiQuiz);
        setTimeRemaining(aiQuiz.timeLimit || 300);
        setSelectedAnswers(new Array(aiQuiz.questions.length).fill(-1));
        setReactionTimes(new Array(aiQuiz.questions.length).fill(0));
        setCurrentQuestionIndex(0);
        setQuizCompleted(false);
        setShowResults(false);
        setScore(0);
        setQuizFeedback('');
        return;
      }

      // Otherwise generate curriculum quiz
      const aiQuiz = await generateAdaptiveQuiz(
        subjectName,
        difficulty,
        [subjectName, 'Core Concepts'],
        undefined,
        []
      );

      if (aiQuiz && aiQuiz.questions && aiQuiz.questions.length > 0) {
        setQuiz(aiQuiz);
        setTimeRemaining(aiQuiz.timeLimit || 300);
        setSelectedAnswers(new Array(aiQuiz.questions.length).fill(-1));
        setReactionTimes(new Array(aiQuiz.questions.length).fill(0));
        setCurrentQuestionIndex(0);
        setQuizCompleted(false);
        setShowResults(false);
        setScore(0);
        setQuizFeedback('');
      }
    } catch (error) {
      console.error('Error generating AI quiz:', error);
      setNoContentMessage('Failed to generate adaptive quiz. Please check your connection.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleRequestHint = async () => {
    if (!quiz || !quiz.questions[currentQuestionIndex]) return;
    const q = quiz.questions[currentQuestionIndex];
    
    if (hints && hintLevel < 3) {
      setHintLevel(prev => prev + 1);
      return;
    }

    setLoadingHint(true);
    try {
      const studentAttempt = selectedAnswers[currentQuestionIndex] >= 0
        ? q.options[selectedAnswers[currentQuestionIndex]]
        : 'Need conceptual direction';
      const generatedHints = await generateSocraticHints(
        q.question,
        q.options[q.correct],
        studentAttempt,
        getSubjectDisplayName(currentSubject)
      );
      setHints(generatedHints);
      setHintLevel(1);
    } catch (err) {
      console.error('Failed to get hints:', err);
    } finally {
      setLoadingHint(false);
    }
  };

  const handleAnswerSelect = (optionIndex: number) => {
    if (showExplanation) return;
    
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setSelectedAnswers(newAnswers);

    const reactionTime = Math.round((Date.now() - questionStartTime) / 1000);
    const newReactionTimes = [...reactionTimes];
    newReactionTimes[currentQuestionIndex] = reactionTime;
    setReactionTimes(newReactionTimes);

    setShowExplanation(true);
  };

  const handleNextQuestion = async () => {
    setShowExplanation(false);
    setHints(null);
    setHintLevel(0);

    if (currentQuestionIndex < (quiz?.questions.length || 0) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setQuestionStartTime(Date.now());
    } else {
      setQuizCompleted(true);
      setShowResults(true);

      const finalScore = selectedAnswers.reduce((acc, ans, idx) => {
        return ans === quiz!.questions[idx].correct ? acc + (quiz!.questions[idx].marks || 5) : acc;
      }, 0);
      setScore(finalScore);

      if (user) {
        const detailedAnswersList: DetailedQuestionReview[] = quiz!.questions.map((q, idx) => ({
          questionId: q.id,
          questionText: q.question,
          options: q.options || [],
          studentAnswer: selectedAnswers[idx] >= 0 ? q.options[selectedAnswers[idx]] : 'No Answer',
          studentAnswerIndex: selectedAnswers[idx],
          correctAnswer: q.options[q.correct] || '',
          correctAnswerIndex: q.correct,
          isCorrect: selectedAnswers[idx] === q.correct,
          concept: q.concept || '',
          explanation: q.explanation || '',
          positiveEncouragement: q.positiveEncouragement || '',
          marks: q.marks || 5
        }));

        const detailedLogs = {
          answers: detailedAnswersList,
          structuredAnswers: detailedAnswersList
        };

        generateStudentQuizFeedback(
          quiz!.title,
          subjectName,
          finalScore,
          quiz!.totalMarks,
          quiz!.questions,
          selectedAnswers
        ).then(async (aiFeedback) => {
          setQuizFeedback(aiFeedback);
          
          await saveQuizResultHybrid(
            (user as any).id || 'student_123',
            quiz!,
            finalScore,
            { ...detailedLogs, feedback: aiFeedback },
            currentSubject,
            currentClass
          );
          
          saveToLocalHistory(quiz!, finalScore, aiFeedback, detailedAnswersList);
          fetchQuizHistory();
        }).catch(() => {
          setQuizFeedback('Review your answers below to celebrate your growth!');
        });

        if (activeRecommendation) {
          try {
            await completeAdaptiveQuizRecommendation(activeRecommendation.id, finalScore, quiz!.totalMarks);
            setActiveRecommendation(null);
            fetchRecommendations();
          } catch {}
        }
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LAUNCHER SCREEN (Positive White & Empowering Theme)
  // ═══════════════════════════════════════════════════════════════════════════
  if (showLauncher) {
    const activeSubjectName = getSubjectDisplayName(currentSubject);

    const filteredRecs = recommendations.filter(r => {
      const matchSub = r.subject_code === currentSubject;
      const matchStatus = r.status === 'pending';
      const matchSearch = searchQuery.trim() === '' || 
        r.exam_title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        r.weak_concepts.some(wc => wc.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSub && matchStatus && matchSearch;
    });

    const filteredHistory = quizHistory.filter(h => {
      const matchSub = h.subject_code === currentSubject;
      const matchSearch = searchQuery.trim() === '' || 
        h.quiz_title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSub && matchSearch;
    });

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 text-slate-800 p-4 md:p-8 flex flex-col items-center justify-start font-sans">
        
        {/* Main Positive Card Container */}
        <div className="w-full max-w-5xl bg-white/95 backdrop-blur-xl border border-indigo-100/80 rounded-3xl shadow-xl shadow-indigo-100/40 overflow-hidden flex flex-col">
          
          {/* Top Header Section */}
          <div className="bg-gradient-to-r from-indigo-50 via-white to-emerald-50/60 p-6 md:p-8 border-b border-indigo-100/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-indigo-600 to-emerald-500 rounded-2xl text-white shadow-lg shadow-indigo-200">
                  <Brain className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
                      Adaptive Reinforcement Quiz
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-600" /> Positive Growth
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mt-0.5 font-medium">
                    Class {currentClass} • {activeSubjectName} • Practice Generated from Corrected Answer Feedback
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SyncStatusIndicator />
              <button
                onClick={generateWithAI}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold rounded-2xl shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all flex items-center gap-2 text-sm"
              >
                <Sparkles className="w-4 h-4 text-emerald-300" />
                <span>Instant AI Quiz</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="bg-slate-50/80 border-b border-slate-200/80 px-6 py-3 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('recommendations')}
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'recommendations'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
                }`}
              >
                <Target className="w-4 h-4" />
                <span>Reinforce Corrected Answers</span>
                {filteredRecs.length > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                    activeTab === 'recommendations' ? 'bg-white text-indigo-700' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {filteredRecs.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('completed')}
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'completed'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Completed & Review History</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search concepts or exams..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tab Body Content */}
          <div className="p-6 md:p-8 flex-1">
            
            {/* TAB 1: RECOMMENDATIONS (CORRECTED ANSWERS REINFORCEMENT) */}
            {activeTab === 'recommendations' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-emerald-50/70 via-indigo-50/40 to-white p-4 rounded-2xl border border-emerald-100/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Targeted Mastery from Recent Corrections</h3>
                      <p className="text-xs text-slate-500 font-medium">
                        These practice sets are generated strictly around mistakes identified during exam evaluation.
                      </p>
                    </div>
                  </div>
                </div>

                {loadingRecommendations ? (
                  <div className="text-center py-12 space-y-3">
                    <Loader className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                    <p className="text-sm text-slate-500">Checking your evaluated answer feedback...</p>
                  </div>
                ) : filteredRecs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredRecs.map(rec => (
                      <div
                        key={rec.id}
                        className="bg-white border border-slate-200/90 hover:border-indigo-400 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                              {rec.subject_code} Assessment
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {new Date(rec.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <h4 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                            {rec.exam_title}
                          </h4>

                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-slate-500">Reinforced Concepts:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {rec.weak_concepts.map((concept, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 bg-amber-50 text-amber-900 text-xs font-medium rounded-lg border border-amber-200/80"
                                >
                                  💡 {concept}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs text-slate-400 font-medium">~5-10 Minutes</span>
                          <button
                            onClick={() => startRecommendationQuiz(rec)}
                            className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-100 hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Practice Corrections</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8 space-y-4">
                    <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-800">All Caught Up! Zero Misconceptions Found</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        You have addressed all recent evaluated mistakes. You can take an instant AI mastery challenge to keep your skills sharp!
                      </p>
                    </div>
                    <button
                      onClick={generateWithAI}
                      className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 transition-all"
                    >
                      Take Mastery Challenge
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: COMPLETED & HISTORY */}
            {activeTab === 'completed' && (
              <div className="space-y-6">
                {loadingHistory ? (
                  <div className="text-center py-12 space-y-3">
                    <Loader className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                    <p className="text-sm text-slate-500">Loading your past attempts...</p>
                  </div>
                ) : filteredHistory.length > 0 ? (
                  <div className="space-y-3">
                    {filteredHistory.map(hist => (
                      <div
                        key={hist.id}
                        onClick={() => handleOpenReview(hist)}
                        className="bg-white border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-4 flex items-center justify-between gap-4 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">
                            {hist.quiz_title}
                          </h4>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>{new Date(hist.timestamp || hist.created_at).toLocaleDateString()}</span>
                            <span>•</span>
                            <span className="text-slate-600 font-semibold">{hist.subject_code}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-slate-400 font-medium">Score</p>
                            <p className="font-extrabold text-slate-800 text-base">
                              <span className="text-emerald-600">{Math.round(hist.score)}</span> / {hist.total_marks || 10}
                            </p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleOpenReview(hist); }}
                            className="p-2 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl transition-colors"
                            title="Review Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No completed reinforcement quizzes recorded yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            FULL COMPREHENSIVE QUIZ REVIEW MODAL
           ═══════════════════════════════════════════════════════════════════════════ */}
        {reviewQuizItem && (() => {
          const reviewQuestions = getNormalizedReviewAnswers(reviewQuizItem);
          const correctCount = reviewQuestions.filter(q => q.isCorrect).length;
          const totalQCount = reviewQuestions.length || 1;
          const percentage = Math.round((reviewQuizItem.score / (reviewQuizItem.total_marks || (totalQCount * 5))) * 100);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
              <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-indigo-100 flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Modal Header */}
                <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 via-white to-emerald-50/60 sticky top-0 z-10">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg md:text-xl font-extrabold text-slate-800">
                          Comprehensive Quiz Review
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">{reviewQuizItem.quiz_title}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setReviewQuizItem(null)}
                    className="p-2.5 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="p-5 md:p-8 overflow-y-auto space-y-6 flex-1 bg-slate-50/40">
                  
                  {/* Summary Score Card */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs text-center">
                      <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Final Score</p>
                      <p className="text-2xl font-black text-slate-800">
                        <span className="text-indigo-600">{Math.round(reviewQuizItem.score)}</span> / {reviewQuizItem.total_marks || (totalQCount * 5)}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs text-center">
                      <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Concept Mastery</p>
                      <p className="text-2xl font-black text-emerald-600">{percentage}%</p>
                    </div>

                    <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs text-center">
                      <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Questions Correct</p>
                      <p className="text-2xl font-black text-slate-800">
                        {correctCount} / {totalQCount}
                      </p>
                    </div>
                  </div>

                  {/* AI Learning Feedback Box */}
                  {(reviewFeedback || loadingReviewFeedback) && (
                    <div className="bg-gradient-to-r from-indigo-50 via-white to-emerald-50 border border-indigo-100 p-4 md:p-5 rounded-2xl text-xs space-y-1.5 shadow-xs">
                      <p className="font-bold text-indigo-900 flex items-center gap-1.5 text-sm">
                        <Sparkles className="w-4 h-4 text-indigo-600" /> AI Growth & Mastery Insights:
                      </p>
                      <p className="text-slate-700 leading-relaxed italic text-xs md:text-sm">
                        "{reviewFeedback || 'Analyzing your detailed performance to generate growth insights...'}"
                      </p>
                    </div>
                  )}

                  {/* Section Title */}
                  <div className="flex items-center justify-between pt-2">
                    <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <BookOpenIcon /> Question Breakdown & Conceptual Deep-Dive
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {totalQCount} {totalQCount === 1 ? 'Question' : 'Questions'}
                    </span>
                  </div>

                  {/* Question-By-Question Detailed Cards */}
                  {reviewQuestions.length > 0 ? (
                    <div className="space-y-5">
                      {reviewQuestions.map((q, qIdx) => (
                        <div
                          key={qIdx}
                          className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-xs space-y-4"
                        >
                          {/* Card Top: Number, Concept, Status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xs flex items-center justify-center">
                                Q{qIdx + 1}
                              </span>
                              {q.concept && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 flex items-center gap-1">
                                  💡 {q.concept}
                                </span>
                              )}
                            </div>

                            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                              q.isCorrect 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {q.isCorrect ? (
                                <><CheckCircle className="w-3.5 h-3.5 text-emerald-700" /> Correct (+{q.marks || 5})</>
                              ) : (
                                <><XCircle className="w-3.5 h-3.5 text-rose-700" /> Needs Review</>
                              )}
                            </span>
                          </div>

                          {/* Question Prompt */}
                          <h4 className="text-sm md:text-base font-bold text-slate-800 leading-snug">
                            {q.questionText}
                          </h4>

                          {/* Options Breakdown Grid */}
                          {q.options && q.options.length > 0 && (
                            <div className="space-y-2 pt-1">
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                Answer Choices & Evaluation
                              </p>
                              <div className="grid grid-cols-1 gap-2">
                                {q.options.map((opt, optIdx) => {
                                  const isThisCorrect = isMatchingAnswer(opt, optIdx, q.correctAnswer, q.correctAnswerIndex);
                                  const isThisStudentChoice = isMatchingAnswer(opt, optIdx, q.studentAnswer, q.studentAnswerIndex);

                                  let cardStyle = "bg-slate-50/70 border-slate-200 text-slate-700";
                                  let badgeStyle = "bg-slate-200 text-slate-600";
                                  let pill = null;

                                  if (isThisCorrect) {
                                    cardStyle = "bg-emerald-50/90 border-emerald-500 text-emerald-950 font-semibold ring-1 ring-emerald-200";
                                    badgeStyle = "bg-emerald-600 text-white";
                                    pill = (
                                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-200 text-emerald-900 flex items-center gap-1 shrink-0">
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-700" /> Correct Answer
                                      </span>
                                    );
                                  } else if (isThisStudentChoice) {
                                    cardStyle = "bg-rose-50/90 border-rose-400 text-rose-950 font-semibold ring-1 ring-rose-200";
                                    badgeStyle = "bg-rose-500 text-white";
                                    pill = (
                                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-200 text-rose-900 flex items-center gap-1 shrink-0">
                                        <XCircle className="w-3.5 h-3.5 text-rose-700" /> Your Choice
                                      </span>
                                    );
                                  }

                                  return (
                                    <div
                                      key={optIdx}
                                      className={`p-3 rounded-xl border text-xs md:text-sm flex items-center justify-between gap-3 transition-all ${cardStyle}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${badgeStyle}`}>
                                          {String.fromCharCode(65 + optIdx)}
                                        </span>
                                        <span className="leading-snug">{opt.replace(/^[A-D]\)\s*/, '')}</span>
                                      </div>
                                      {pill}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Deep-Dive Explanation & Distractor Analysis */}
                          <div className="bg-gradient-to-r from-emerald-50/60 via-indigo-50/40 to-white rounded-2xl p-4 border border-emerald-100/90 space-y-3 text-xs md:text-sm">
                            <div>
                              <p className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1">
                                <Sparkles className="w-4 h-4 text-emerald-600" /> Why the Correct Answer is Right:
                              </p>
                              <p className="text-slate-700 leading-relaxed pl-5">
                                {q.explanation}
                              </p>
                            </div>

                            {/* Misconception Guidance when incorrect */}
                            {!q.isCorrect && (
                              <div className="pt-2 border-t border-emerald-100/60 pl-5 space-y-1">
                                <p className="font-bold text-rose-800 flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 text-rose-600" /> Understanding Why Your Answer Was Incorrect:
                                </p>
                                <p className="text-slate-600 leading-relaxed italic">
                                  {q.studentAnswer ? `You chose "${q.studentAnswer}". ` : ''}
                                  Reviewing the difference between this choice and the verified principle prevents recurring errors in upcoming exams.
                                </p>
                              </div>
                            )}

                            {/* Growth Encouragement */}
                            {q.positiveEncouragement && (
                              <div className="pt-1 pl-5 text-xs font-semibold text-emerald-700">
                                🌱 {q.positiveEncouragement}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 p-6 space-y-2">
                      <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-slate-700">No question breakdown log available</p>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        This attempt only saved overall score metrics. Newly taken quizzes will automatically store all option explanations.
                      </p>
                    </div>
                  )}
                </div>

                {/* Modal Sticky Footer */}
                <div className="p-4 md:p-5 border-t border-slate-100 bg-white flex justify-end sticky bottom-0 z-10">
                  <button
                    onClick={() => setReviewQuizItem(null)}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm"
                  >
                    Close Review
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. LOADING STATE
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading || generatingAI) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center animate-spin mb-4">
          <Loader className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Generating Your Adaptive Reinforcement Quiz...</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Targeting your evaluated mistake corrections to build permanent conceptual mastery.
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. NO CONTENT FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════
  if (!quiz) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-200 space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800">Quiz Content Unavailable</h3>
          <p className="text-sm text-slate-500">{noContentMessage || 'Please try selecting another subject.'}</p>
          <button
            onClick={() => setShowLauncher(true)}
            className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all"
          >
            Back to Quiz Center
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ACTIVE QUIZ TAKING VIEW (Positive White Theme)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!showResults) {
    const currentQ = quiz.questions[currentQuestionIndex];
    const progressPercent = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 text-slate-800 p-4 md:p-8 flex flex-col items-center justify-start">
        <div className="w-full max-w-3xl bg-white/95 backdrop-blur-xl border border-indigo-100 rounded-3xl shadow-xl p-6 md:p-8 space-y-6">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{quiz.title}</h2>
              <span className="text-xs text-slate-500">Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>{formatTime(timeRemaining)}</span>
              </div>
              <SyncStatusIndicator compact={true} />
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Question Text */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
            <h3 className="text-base md:text-lg font-semibold text-slate-800 leading-relaxed">
              {currentQ.question}
            </h3>
            {(currentQ.imageUrl || (currentQ as any).image_url) && (
              <div className="mt-4 p-3 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center max-w-lg mx-auto shadow-xs">
                <img
                  src={currentQ.imageUrl || (currentQ as any).image_url}
                  alt={`Question ${currentQuestionIndex + 1} Visual`}
                  className="max-h-72 w-auto object-contain rounded-xl"
                />
              </div>
            )}
          </div>

          {/* Options Grid */}
          <div className="space-y-3">
            {currentQ.options.map((option, idx) => {
              const selectedThis = selectedAnswers[currentQuestionIndex] === idx;
              let cardClass = "bg-white hover:bg-slate-50 border-slate-200 text-slate-700";
              let badgeClass = "bg-slate-100 text-slate-600";

              if (showExplanation) {
                if (idx === currentQ.correct) {
                  cardClass = "bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold shadow-xs";
                  badgeClass = "bg-emerald-500 text-white";
                } else if (selectedThis) {
                  cardClass = "bg-rose-50 border-rose-400 text-rose-950 font-semibold shadow-xs";
                  badgeClass = "bg-rose-500 text-white";
                }
              } else if (selectedThis) {
                cardClass = "bg-indigo-50 border-indigo-500 text-indigo-950 font-semibold shadow-xs ring-1 ring-indigo-200";
                badgeClass = "bg-indigo-600 text-white";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswerSelect(idx)}
                  disabled={showExplanation}
                  className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${cardClass}`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${badgeClass}`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm font-medium">{option.replace(/^[A-D]\)\s*/, '')}</span>
                  </div>

                  {showExplanation && idx === currentQ.correct && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  {showExplanation && selectedThis && idx !== currentQ.correct && (
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Socratic Hint */}
          {hints && hintLevel > 0 && !showExplanation && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-1 animate-fadeIn">
              <p className="font-bold flex items-center gap-1.5 text-amber-800">
                <Lightbulb className="w-4 h-4 text-amber-600" /> Socratic Step {hintLevel}:
              </p>
              <p className="leading-relaxed pl-5">
                {hintLevel === 1 ? hints.level1 : hintLevel === 2 ? hints.level2 : hints.level3}
              </p>
            </div>
          )}

          {/* Explanation Banner */}
          {showExplanation && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-slate-700 space-y-1.5 animate-fadeIn">
              <p className="font-bold text-indigo-900 flex items-center gap-1.5 text-sm">
                <Sparkles className="w-4 h-4 text-indigo-600" /> Concept Insight:
              </p>
              <p className="leading-relaxed">{currentQ.explanation}</p>
              {currentQ.positiveEncouragement && (
                <p className="font-semibold text-emerald-700 pt-1">
                  🌱 {currentQ.positiveEncouragement}
                </p>
              )}
            </div>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {!showExplanation && (
              <button
                onClick={handleRequestHint}
                disabled={loadingHint}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 rounded-xl transition-colors"
              >
                <Lightbulb className="w-4 h-4" />
                <span>{loadingHint ? 'Thinking...' : hintLevel === 0 ? 'Need a Hint?' : 'Next Step Hint'}</span>
              </button>
            )}

            <div className="ml-auto">
              {showExplanation && (
                <button
                  onClick={handleNextQuestion}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-100 hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center gap-1.5"
                >
                  <span>{currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question' : 'View Results'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RESULTS & CELEBRATION SCREEN (Positive White Theme)
  // ═══════════════════════════════════════════════════════════════════════════
  const correctCount = selectedAnswers.filter((ans, idx) => ans === quiz.questions[idx].correct).length;
  const percent = Math.round((correctCount / quiz.questions.length) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 text-slate-800 p-4 md:p-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-4xl bg-white/95 backdrop-blur-xl border border-indigo-100 rounded-3xl shadow-2xl p-6 md:p-8 space-y-6 animate-fadeIn">
        
        {/* Celebration Trophy */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-emerald-400 text-white flex items-center justify-center mx-auto shadow-xl shadow-amber-100">
            <Trophy className="w-10 h-10" />
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800">Quiz Completed!</h2>
          <p className="text-sm text-slate-500 font-medium">
            Every mistake corrected is a permanent skill mastered!
          </p>
        </div>

        {/* Score Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl text-center">
            <p className="text-xs text-indigo-700 font-bold uppercase mb-1">Score</p>
            <p className="text-3xl font-extrabold text-indigo-950">{score}/{quiz.totalMarks}</p>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl text-center">
            <p className="text-xs text-emerald-700 font-bold uppercase mb-1">Mastery</p>
            <p className="text-3xl font-extrabold text-emerald-950">{percent}%</p>
          </div>
          <div className="bg-amber-50/70 border border-amber-100 p-4 rounded-2xl text-center">
            <p className="text-xs text-amber-700 font-bold uppercase mb-1">Reinforced</p>
            <p className="text-3xl font-extrabold text-amber-950">{correctCount}/{quiz.questions.length}</p>
          </div>
        </div>

        {/* AI Learning Feedback Box */}
        {quizFeedback && (
          <div className="bg-gradient-to-r from-indigo-50/80 to-emerald-50/50 border border-indigo-100 p-4 rounded-2xl text-xs space-y-1">
            <p className="font-bold text-indigo-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" /> AI Growth Feedback:
            </p>
            <p className="text-slate-700 leading-relaxed italic text-xs md:text-sm">"{quizFeedback}"</p>
          </div>
        )}

        {/* Section Heading */}
        <div className="pt-2">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <BookOpenIcon /> Question Breakdown & Conceptual Deep-Dive
          </h3>
        </div>

        {/* Detailed Question Review Breakdown */}
        <div className="space-y-4">
          {quiz.questions.map((q, idx) => {
            const isCorrect = selectedAnswers[idx] === q.correct;
            const studentChoice = selectedAnswers[idx] >= 0 ? q.options[selectedAnswers[idx]] : 'No Answer';
            
            return (
              <div
                key={q.id || idx}
                className="p-5 md:p-6 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-xs"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xs flex items-center justify-center">
                      Q{idx + 1}
                    </span>
                    {q.concept && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 flex items-center gap-1">
                        💡 {q.concept}
                      </span>
                    )}
                  </div>
                  
                  <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                    isCorrect 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    {isCorrect ? (
                      <><CheckCircle className="w-3.5 h-3.5 text-emerald-700" /> Mastered (+{q.marks || 5})</>
                    ) : (
                      <><XCircle className="w-3.5 h-3.5 text-rose-700" /> Needs Review</>
                    )}
                  </span>
                </div>

                {/* Question Prompt */}
                <h4 className="text-sm md:text-base font-bold text-slate-800 leading-snug">
                  {q.question}
                </h4>

                {/* All Options Breakdown */}
                {q.options && q.options.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Answer Choices & Evaluation
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {q.options.map((opt, optIdx) => {
                        const isThisCorrect = optIdx === q.correct;
                        const isThisStudentChoice = optIdx === selectedAnswers[idx];

                        let cardStyle = "bg-slate-50/70 border-slate-200 text-slate-700";
                        let badgeStyle = "bg-slate-200 text-slate-600";
                        let pill = null;

                        if (isThisCorrect) {
                          cardStyle = "bg-emerald-50/90 border-emerald-500 text-emerald-950 font-semibold ring-1 ring-emerald-200";
                          badgeStyle = "bg-emerald-600 text-white";
                          pill = (
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-200 text-emerald-900 flex items-center gap-1 shrink-0">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-700" /> Correct Answer
                            </span>
                          );
                        } else if (isThisStudentChoice) {
                          cardStyle = "bg-rose-50/90 border-rose-400 text-rose-950 font-semibold ring-1 ring-rose-200";
                          badgeStyle = "bg-rose-500 text-white";
                          pill = (
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-200 text-rose-900 flex items-center gap-1 shrink-0">
                              <XCircle className="w-3.5 h-3.5 text-rose-700" /> Your Choice
                            </span>
                          );
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-xl border text-xs md:text-sm flex items-center justify-between gap-3 transition-all ${cardStyle}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${badgeStyle}`}>
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="leading-snug">{opt.replace(/^[A-D]\)\s*/, '')}</span>
                            </div>
                            {pill}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Deep-Dive Explanation & Distractor Analysis */}
                <div className="bg-gradient-to-r from-emerald-50/60 via-indigo-50/40 to-white rounded-2xl p-4 border border-emerald-100/90 space-y-3 text-xs md:text-sm">
                  <div>
                    <p className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-4 h-4 text-emerald-600" /> Why the Correct Answer is Right:
                    </p>
                    <p className="text-slate-700 leading-relaxed pl-5">
                      {q.explanation}
                    </p>
                  </div>

                  {/* Misconception Guidance when incorrect */}
                  {!isCorrect && (
                    <div className="pt-2 border-t border-emerald-100/60 pl-5 space-y-1">
                      <p className="font-bold text-rose-800 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-rose-600" /> Understanding Why Your Answer Was Incorrect:
                      </p>
                      <p className="text-slate-600 leading-relaxed italic">
                        You selected "{studentChoice}". Understanding why this differs from the correct concept helps lock in the rule permanently.
                      </p>
                    </div>
                  )}

                  {/* Growth Encouragement */}
                  {q.positiveEncouragement && (
                    <div className="pt-1 pl-5 text-xs font-semibold text-emerald-700">
                      🌱 {q.positiveEncouragement}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-100">
          <button
            onClick={() => setShowLauncher(true)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs md:text-sm transition-all shadow-md shadow-indigo-100"
          >
            Back to Quiz Center
          </button>
        </div>
      </div>
    </div>
  );
}

// Icon Component
function BookOpenIcon() {
  return (
    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}