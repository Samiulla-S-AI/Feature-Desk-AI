import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, AlertCircle, CheckCircle, XCircle, Sparkles, Brain, Loader, BookOpen, RefreshCw, Calendar, Award, Play, ChevronRight, HelpCircle, Search, Eye, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getRandomQuizQuestions, hasUploadedMaterials } from '../../lib/questionDb';
import { generateAdaptiveQuiz, generateSocraticHints } from '../../lib/gemini';
import { saveQuizResultHybrid } from '../../lib/db';
import { getStudentContent } from '../../lib/teacherDb';
import { getAdaptiveQuizRecommendations, completeAdaptiveQuizRecommendation, AdaptiveQuizRecommendation } from '../../lib/adaptiveQuizService';
import { supabase } from '../../lib/supabase';

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
}

interface Quiz {
  title: string;
  questions: QuizQuestion[];
  totalMarks: number;
  timeLimit: number;
}

export default function QuizApp() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [noContentMessage, setNoContentMessage] = useState<string | null>(null);

  // Adaptive Learning & Navigation states
  const [recommendations, setRecommendations] = useState<AdaptiveQuizRecommendation[]>([]);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewQuizItem, setReviewQuizItem] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'practice' | 'completed'>('recommendations');
  const [activeRecommendation, setActiveRecommendation] = useState<AdaptiveQuizRecommendation | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Hint State
  const [hints, setHints] = useState<{ level1: string, level2: string, level3: string } | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [loadingHint, setLoadingHint] = useState(false);

  // Launcher states
  const [showLauncher, setShowLauncher] = useState(true);
  const [checkingContent, setCheckingContent] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [hasUploadedChapters, setHasUploadedChapters] = useState(false);
  const [quizType, setQuizType] = useState<'teacher' | 'ai' | 'recommendation'>('ai');

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

  // Check for teacher content, recommendations, and history when class/subject changes
  useEffect(() => {
    checkTeacherContent();
    fetchRecommendations();
    fetchQuizHistory();
  }, [currentClass, currentSubject]);

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
      // cache locally
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

  const saveToLocalHistory = (quizObj: any, finalScore: number) => {
    try {
      const historyItem = {
        id: `history_${Date.now()}`,
        student_id: user?.id || 'student_123',
        quiz_title: quizObj.title,
        score: finalScore,
        total_marks: quizObj.totalMarks,
        timestamp: new Date().toISOString(),
        subject_code: currentSubject
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

  // Timer for quiz
  useEffect(() => {
    if (!quiz || quizCompleted) return;

    if (timeRemaining <= 0) {
      setQuizCompleted(true);
      setShowResults(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, quiz, quizCompleted]);

  // Start timing when a new question is shown
  useEffect(() => {
    if (quiz && !quizCompleted) {
      setQuestionStartTime(Date.now());
    }
  }, [currentQuestionIndex, quiz]);

  // Check if teacher has uploaded content
  const checkTeacherContent = async () => {
    setCheckingContent(true);
    try {
      // Check for uploaded chapters (PDFs/notes) in teacher_content
      const chapterContent = await getStudentContent(currentClass, currentSubject);
      const hasChapters = chapterContent && chapterContent.some(m => m.description && m.description.trim().length > 0);
      setHasUploadedChapters(hasChapters);
    } catch (error) {
      console.error('Error checking content:', error);
    } finally {
      setCheckingContent(false);
    }
  };

  // Generate quiz with teacher content
  const generateQuiz = async () => {
    setLoading(true);
    setShowLauncher(false);
    setNoContentMessage(null);
    setQuizType('teacher');

    try {
      // Try to get questions from teacher-uploaded materials
      const { questions, available, message } = await getRandomQuizQuestions(
        currentClass,
        currentSubject,
        5, // Number of questions
        difficulty as 'easy' | 'medium' | 'hard' | 'mixed'
      );

      if (!available || questions.length === 0) {
        // No content available - show message to student
        setNoContentMessage(message);
        setLoading(false);
        return;
      }

      // Convert GeneratedQuestion format to QuizQuestion format
      const quizQuestions: QuizQuestion[] = questions
        .filter(q => q.type === 'mcq' && q.options)
        .map(q => ({
          id: q.id,
          question: q.question,
          options: q.options || [],
          correct: q.correct || 0,
          explanation: q.explanation || 'Please review the lesson material for more details.',
          timeEstimate: 60,
          marks: q.marks,
          difficulty: q.difficulty,
          sourceContentTitle: q.sourceContentTitle,
          imageUrl: q.imageUrl
        }));

      if (quizQuestions.length === 0) {
        setNoContentMessage('No multiple choice questions available. Your teacher needs to generate MCQ questions from the uploaded materials.');
        setLoading(false);
        return;
      }

      const newQuiz: Quiz = {
        title: `${subjectName} Quiz - Class ${currentClass}`,
        questions: quizQuestions,
        totalMarks: quizQuestions.reduce((sum, q) => sum + (q.marks || 1), 0),
        timeLimit: quizQuestions.length * 60 // 1 minute per question
      };

      setQuiz(newQuiz);
      setTimeRemaining(newQuiz.timeLimit);
      setSelectedAnswers(new Array(newQuiz.questions.length).fill(-1));
      setReactionTimes(new Array(newQuiz.questions.length).fill(0));
      setCurrentQuestionIndex(0);
      setQuizCompleted(false);
      setShowResults(false);
      setScore(0);
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      setNoContentMessage('Failed to load quiz. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Generate reinforcement quiz targeting weak concepts
  const startRecommendationQuiz = async (rec: AdaptiveQuizRecommendation) => {
    setActiveRecommendation(rec);
    setGeneratingAI(true);
    setShowLauncher(false);
    setNoContentMessage(null);
    setQuizType('recommendation');

    // Temporarily override the subject for the active reinforcement session
    const recSubjectName = getSubjectDisplayName(rec.subject_code);

    try {
      console.log('🤖 Generating AI reinforcement quiz for:', rec.exam_title, rec.weak_concepts);
      
      // Fetch teacher-uploaded content for the class and subject
      let contentText = '';
      try {
        const materials = await getStudentContent(currentClass, rec.subject_code);
        if (materials && materials.length > 0) {
          const texts = materials
            .map(m => m.description || '')
            .filter(text => text.trim().length > 0);
          if (texts.length > 0) {
            contentText = texts.join('\n\n');
            console.log(`📚 Grounding reinforcement quiz in teacher content (length: ${contentText.length})`);
          }
        }
      } catch (err) {
        console.error('Error fetching student content for reinforcement quiz:', err);
      }

      // Generate reinforcement quiz with Gemini
      const aiQuiz = await generateAdaptiveQuiz(
        recSubjectName,
        difficulty,
        [recSubjectName, ...rec.weak_concepts],
        contentText || undefined,
        rec.weak_concepts
      );

      if (aiQuiz && aiQuiz.questions && aiQuiz.questions.length > 0) {
        console.log('✅ AI reinforcement quiz generated successfully');
        setQuiz(aiQuiz);
        setTimeRemaining(aiQuiz.timeLimit || 300);
        setSelectedAnswers(new Array(aiQuiz.questions.length).fill(-1));
        setReactionTimes(new Array(aiQuiz.questions.length).fill(0));
        setCurrentQuestionIndex(0);
        setQuizCompleted(false);
        setShowResults(false);
        setScore(0);
      } else {
        throw new Error('AI returned empty quiz for weak concepts');
      }
    } catch (error) {
      console.error('Failed to generate recommendation quiz:', error);
      // Fallback
      const fallbackQuestions = rec.weak_concepts.map((wc, index) => ({
        id: index + 1,
        question: `Review concept: ${wc}. Which statement is correct?`,
        options: [
          `A) Correct definition for ${wc}`,
          `B) Incorrect theory about ${wc}`,
          `C) Irrelevant statement`,
          `D) All of the above`
        ],
        correct: 0,
        explanation: `This practice question helps you reinforce ${wc}.`,
        timeEstimate: 60
      }));

      const fallbackQuiz: Quiz = {
        title: `Reinforce: ${rec.exam_title}`,
        questions: fallbackQuestions,
        totalMarks: fallbackQuestions.length * 5,
        timeLimit: fallbackQuestions.length * 60
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

  // Generate quiz with AI
  const generateWithAI = async () => {
    setGeneratingAI(true);
    setShowLauncher(false);
    setNoContentMessage(null);
    setQuizType('ai');

    try {
      console.log('🤖 Generating AI quiz for:', subjectName, difficulty);
      
      // Fetch teacher-uploaded content for the class and subject
      let contentText = '';
      try {
        const materials = await getStudentContent(currentClass, currentSubject);
        if (materials && materials.length > 0) {
          // Filter to items that have text description/content and concatenate them
          const texts = materials
            .map(m => m.description || '')
            .filter(text => text.trim().length > 0);
          if (texts.length > 0) {
            contentText = texts.join('\n\n');
            console.log(`📚 Found ${texts.length} uploaded files/notes, using text content (length: ${contentText.length}) for AI generation.`);
          }
        }
      } catch (err) {
        console.error('Error fetching student content for AI quiz generation:', err);
      }

      const aiQuiz = await generateAdaptiveQuiz(
        subjectName,
        difficulty,
        [subjectName],
        contentText || undefined
      );

      if (aiQuiz && aiQuiz.questions && aiQuiz.questions.length > 0) {
        console.log('✅ AI Quiz generated successfully with', aiQuiz.questions.length, 'questions');
        setQuiz(aiQuiz);
        setTimeRemaining(aiQuiz.timeLimit || 300);
        setSelectedAnswers(new Array(aiQuiz.questions.length).fill(-1));
        setReactionTimes(new Array(aiQuiz.questions.length).fill(0));
        setCurrentQuestionIndex(0);
        setQuizCompleted(false);
        setShowResults(false);
        setScore(0);
      } else {
        // This shouldn't happen now since gemini.ts has fallback
        console.warn('⚠️ AI returned empty quiz, using fallback');
        const fallbackQuiz = createFallbackQuiz();
        setQuiz(fallbackQuiz);
        setTimeRemaining(fallbackQuiz.timeLimit);
        setSelectedAnswers(new Array(fallbackQuiz.questions.length).fill(-1));
        setReactionTimes(new Array(fallbackQuiz.questions.length).fill(0));
      }
    } catch (error) {
      console.error('Failed to generate AI quiz:', error);
      // Use fallback quiz instead of showing error
      const fallbackQuiz = createFallbackQuiz();
      setQuiz(fallbackQuiz);
      setTimeRemaining(fallbackQuiz.timeLimit);
      setSelectedAnswers(new Array(fallbackQuiz.questions.length).fill(-1));
      setReactionTimes(new Array(fallbackQuiz.questions.length).fill(0));
    } finally {
      setGeneratingAI(false);
    }
  };

  // Create a fallback quiz when AI fails
  const createFallbackQuiz = (): Quiz => ({
    title: `${subjectName} Practice Quiz - Class ${currentClass}`,
    questions: [
      {
        id: 1,
        question: `Which of the following best describes a fundamental concept in ${subjectName}?`,
        options: ["A) The correct fundamental concept", "B) An incorrect statement", "C) A common misconception", "D) An unrelated topic"],
        correct: 0,
        explanation: `Understanding fundamentals is key to mastering ${subjectName}.`,
        timeEstimate: 60,
        difficulty: difficulty
      },
      {
        id: 2,
        question: `In ${subjectName}, what is the relationship between theory and practice?`,
        options: ["A) Theory guides practice effectively", "B) They are unrelated", "C) Practice doesn't need theory", "D) Theory is always wrong"],
        correct: 0,
        explanation: `Theory and practice work together in ${subjectName}.`,
        timeEstimate: 60,
        difficulty: difficulty
      },
      {
        id: 3,
        question: `What skill is most important for success in ${subjectName}?`,
        options: ["A) Critical thinking and analysis", "B) Memorization only", "C) Guessing answers", "D) Avoiding practice"],
        correct: 0,
        explanation: `Critical thinking helps you understand ${subjectName} deeply.`,
        timeEstimate: 60,
        difficulty: difficulty
      },
      {
        id: 4,
        question: `How should you approach problem-solving in ${subjectName}?`,
        options: ["A) Break problems into smaller steps", "B) Skip difficult problems", "C) Only solve easy problems", "D) Never ask for help"],
        correct: 0,
        explanation: `Breaking problems into steps is an effective strategy.`,
        timeEstimate: 60,
        difficulty: difficulty
      },
      {
        id: 5,
        question: `What helps you learn ${subjectName} more effectively?`,
        options: ["A) Regular practice and review", "B) Studying only before exams", "C) Avoiding homework", "D) Not taking notes"],
        correct: 0,
        explanation: `Consistent practice leads to better understanding of ${subjectName}.`,
        timeEstimate: 60,
        difficulty: difficulty
      }
    ],
    totalMarks: 25,
    timeLimit: 300
  });

  const handleAnswerSelect = (answerIndex: number) => {
    if (quizCompleted || showExplanation) return;

    // Record reaction time
    const reactionTime = Math.floor((Date.now() - questionStartTime) / 1000);
    const newReactionTimes = [...reactionTimes];
    newReactionTimes[currentQuestionIndex] = reactionTime;
    setReactionTimes(newReactionTimes);

    // Record selected answer
    const newSelectedAnswers = [...selectedAnswers];
    newSelectedAnswers[currentQuestionIndex] = answerIndex;
    setSelectedAnswers(newSelectedAnswers);

    // Show explanation
    setShowExplanation(true);

    // Update score if correct
    if (quiz && answerIndex === quiz.questions[currentQuestionIndex].correct) {
      setScore(prev => prev + (quiz.totalMarks / quiz.questions.length));
    }

    // Adjust difficulty based on performance (adaptive learning)
    if (currentQuestionIndex === quiz!.questions.length - 1) {
      const correctAnswers = newSelectedAnswers.filter(
        (answer, idx) => answer === quiz!.questions[idx].correct
      ).length;
      const successRate = correctAnswers / quiz!.questions.length;

      if (successRate > 0.8) {
        setDifficulty('hard');
      } else if (successRate < 0.4) {
        setDifficulty('easy');
      } else {
        setDifficulty('medium');
      }
    }
  };

  // user is already defined at the top of the component

  const handleNextQuestion = async () => {
    setShowExplanation(false);

    if (currentQuestionIndex < quiz!.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      // Reset Hints
      setHints(null);
      setHintLevel(0);
    } else {
      setQuizCompleted(true);
      setShowResults(true);

      // Save Results to Hybrid Database
      if (user) {
        // Format structured answers containing question text, student's answer text, and correctness check
        const structuredAnswers = quiz!.questions.map((q, idx) => {
          const selectedIdx = selectedAnswers[idx];
          const isCorrect = selectedIdx === q.correct;
          const chosenAnswerText = selectedIdx !== -1 && q.options ? q.options[selectedIdx] : 'No Answer';
          return {
            question: q.question,
            student_answer: chosenAnswerText,
            is_correct: isCorrect,
            options: q.options,
            correct_answer: q.options ? q.options[q.correct] : ''
          };
        });

        // Prepare detailed logs
        const detailedLogs = {
          answers: selectedAnswers,
          reactionTimes: reactionTimes,
          questions: quiz!.questions, // Saving the generated questions to Mongo since they are ephemeral
          difficulty: difficulty,
          topics: [currentSubject, subjectName],
          structuredAnswers
        };

        // Calculate final score
        const finalScore = score + (selectedAnswers[currentQuestionIndex] === quiz!.questions[currentQuestionIndex].correct ? (quiz!.totalMarks / quiz!.questions.length) : 0);

        saveQuizResultHybrid(
          (user as any).id || 'student_123',
          quiz!,
          finalScore,
          detailedLogs,
          currentSubject,
          currentClass
        );

        saveToLocalHistory(quiz!, finalScore);
        fetchQuizHistory();

        if (activeRecommendation) {
          try {
            await completeAdaptiveQuizRecommendation(activeRecommendation.id, finalScore, quiz!.totalMarks);
            setActiveRecommendation(null);
            fetchRecommendations();
          } catch (recErr) {
            console.error('Failed to complete recommendation:', recErr);
          }
        }
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Show launcher screen first
  if (showLauncher) {
    const subjects = [
      { code: 'ALL', name: 'All Subjects' },
      { code: 'MATH', name: 'Mathematics' },
      { code: 'SCIENCE', name: 'Science' },
      { code: 'ENGLISH', name: 'English' },
      { code: 'SOCIAL', name: 'Social Studies' },
      { code: 'COMPUTER', name: 'Computer Science' },
      { code: 'HINDI', name: 'Hindi' },
      { code: 'TAMIL', name: 'Tamil' }
    ];

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
      <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8 flex flex-col items-center justify-start font-sans">
        {/* Floating background glowing orbs */}
        <div className="absolute top-10 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-4xl bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden relative z-10 flex flex-col">
          {/* Top Header Section */}
          <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 p-6 md:p-8 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl text-white shadow-lg shadow-purple-500/20">
                  <Brain className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
                    Adaptive Quiz Center
                  </h1>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Class {currentClass} • Personal Reinforcement Hub
                  </p>
                </div>
              </div>
            </div>

            {/* Active Subject Badge (Read-only) */}
            <div className="flex items-center gap-3 bg-slate-850 px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-bold text-slate-200">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:inline">
                Active Subject:
              </span>
              <span className="text-purple-450 font-extrabold uppercase">
                {activeSubjectName}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-850 px-6 bg-slate-950/40">
            {[
              { id: 'recommendations', label: 'Adaptive Reinforce', count: filteredRecs.length, icon: Sparkles },
              { id: 'practice', label: 'Standard Practice', icon: BookOpen },
              { id: 'completed', label: 'History & completed', count: filteredHistory.length, icon: Award }
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-4 text-sm font-bold transition-all relative border-b-2 -mb-[2px] ${
                    isActive
                      ? 'border-purple-500 text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <TabIcon className={`w-4 h-4 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div className="p-6 md:p-8 flex-1 min-h-[350px] flex flex-col gap-6">
            
            {/* Global Search Bar */}
            <div className="relative w-full max-w-md">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics, exams, or keywords..."
                className="w-full pl-11 pr-10 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-semibold"
                >
                  Clear
                </button>
              )}
            </div>
            
            {/* TABS 1: RECOMMENDATIONS */}
            {activeTab === 'recommendations' && (
              <div className="space-y-6">
                <div className="text-sm text-slate-400 leading-relaxed max-w-xl">
                  We analyze your graded submissions. If you struggle with specific topics, custom adaptive practice tests will appear here.
                </div>

                {loadingRecommendations ? (
                  <div className="text-center py-12">
                    <Loader className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Checking for study recommendations...</p>
                  </div>
                ) : filteredRecs.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredRecs.map((rec) => (
                      <div
                        key={rec.id}
                        className="bg-gradient-to-r from-slate-900 to-slate-850 border border-purple-500/20 rounded-2xl p-5 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5 transition-all group"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2.5">
                              <span className="px-2.5 py-0.5 text-xs font-extrabold bg-purple-500/10 text-purple-300 rounded-full border border-purple-500/20">
                                {rec.subject_code}
                              </span>
                              <span className="text-slate-500 text-xs flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(rec.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <h3 className="font-bold text-lg text-slate-100 group-hover:text-purple-300 transition-colors">
                              Reinforce: {rec.exam_title}
                            </h3>
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                Target Weak Areas to Practice:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {rec.weak_concepts.map((concept, cIdx) => (
                                  <span
                                    key={cIdx}
                                    className="px-2 py-1 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-700"
                                  >
                                    {concept}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => startRecommendationQuiz(rec)}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 text-sm"
                          >
                            <Play className="w-4 h-4 fill-white" />
                            <span>Start Practice</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-800 rounded-2xl p-8 text-center max-w-md mx-auto my-4 bg-slate-950/20">
                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <h3 className="font-bold text-lg text-slate-200">All Caught Up!</h3>
                    <p className="text-slate-500 text-sm mt-1">
                      No weak concepts flagged for {activeSubjectName}. Keep up the great work!
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PRACTICE */}
            {activeTab === 'practice' && (() => {
              const tab2Recs = recommendations.filter(r => {
                const matchSub = r.subject_code === currentSubject;
                const matchSearch = searchQuery.trim() === '' || 
                  r.exam_title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  r.weak_concepts.some(wc => wc.toLowerCase().includes(searchQuery.toLowerCase()));
                return matchSub && matchSearch;
              });
              return (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Difficulty Level
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {['easy', 'medium', 'hard'].map((diff) => (
                          <button
                            key={diff}
                            onClick={() => setDifficulty(diff)}
                            className={`py-2 rounded-xl text-xs font-bold capitalize transition-all border ${
                              difficulty === diff
                                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/15'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Grounding Info Card */}
                    {checkingContent ? (
                      <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl border border-slate-800">
                        <Loader className="w-4 h-4 text-purple-500 animate-spin" />
                        <span className="text-xs text-slate-500">Checking study materials...</span>
                      </div>
                    ) : hasUploadedChapters ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
                        <BookOpen className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-xs text-emerald-400 uppercase tracking-wider">
                            Personalized Grounding Available
                          </h4>
                          <p className="text-xs text-emerald-300/80 mt-0.5">
                            Your teacher uploaded materials for {activeSubjectName}. Quizzes will be generated directly from these documents!
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-xs text-amber-400 uppercase tracking-wider">
                            Mock Curriculum Fallback
                          </h4>
                          <p className="text-xs text-amber-300/80 mt-0.5">
                            No study materials uploaded for this subject yet. We'll generate questions using our general mock curriculum.
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={generateWithAI}
                      disabled={generatingAI}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:from-purple-500 hover:to-indigo-500 transition-all shadow-lg active:scale-95 text-sm"
                    >
                      {generatingAI ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          <span>Generating Quiz...</span>
                        </>
                      ) : (
                        <>
                          <Brain className="w-5 h-5" />
                          <span>Generate Quiz with AI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Topic-specific Reinforce Learning Practice Tests */}
                  {tab2Recs.length > 0 && (
                    <div className="space-y-4 mt-6">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                        Reinforce Learning Practice Tests
                      </h4>
                      <div className="space-y-3">
                        {tab2Recs.map((rec) => (
                          <div
                            key={`tab2-rec-${rec.id}`}
                            className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-purple-500/30 transition-all group shadow-md"
                          >
                            <div className="space-y-2">
                              <h5 className="font-extrabold text-slate-200 text-base group-hover:text-purple-400 transition-colors">
                                {rec.exam_title} - Reinforce Learning Test
                              </h5>
                              <div className="flex flex-wrap gap-1.5">
                                {rec.weak_concepts.map((concept, cIdx) => (
                                  <span
                                    key={cIdx}
                                    className="px-2 py-0.5 bg-slate-850 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700"
                                  >
                                    {concept} - Reinforce Learning Practice
                                  </span>
                                ))}
                              </div>
                              {rec.status === 'completed' && (
                                <p className="text-xs text-emerald-450 font-bold flex items-center gap-1">
                                  <Award className="w-3.5 h-3.5" />
                                  Completed Score: {rec.score}/{rec.total_marks}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => startRecommendationQuiz(rec)}
                              className="bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 text-xs sm:self-center"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Take Test</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TAB 3: HISTORY */}
            {activeTab === 'completed' && (
              <div className="space-y-6">
                <div className="text-sm text-slate-400">
                  Review your past quiz history. Practice regularly to maintain your scores!
                </div>

                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Loading performance logs...</p>
                  </div>
                ) : filteredHistory.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredHistory.map((hist) => (
                      <div
                        key={hist.id}
                        onClick={() => setReviewQuizItem(hist)}
                        className="bg-slate-900/50 border border-slate-850 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-purple-500/40 hover:shadow-lg transition-all cursor-pointer group"
                      >
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-200 text-sm group-hover:text-purple-300 transition-colors">
                            {hist.quiz_title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(hist.timestamp || hist.created_at).toLocaleDateString()}
                            </span>
                            {hist.subject_code && (
                              <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                                {hist.subject_code}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Score</p>
                            <p className="font-extrabold text-slate-200 text-base">
                              {Math.round(hist.score)}/{hist.total_marks || 10}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReviewQuizItem(hist);
                              }}
                              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-purple-400 transition-all"
                              title="Review Quiz"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Reload quiz directly with same topic as standard AI
                                setDifficulty('medium');
                                generateWithAI();
                              }}
                              className="p-2 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
                              title="Retake Quiz"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-850 rounded-2xl p-8 text-center max-w-sm mx-auto my-4">
                    <HelpCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-400">No History Yet</h3>
                    <p className="text-slate-500 text-xs mt-1">
                      Complete standard practice or adaptive quizzes to see your records!
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-850/80 flex justify-between items-center text-xs text-slate-500">
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 hover:bg-slate-850 text-slate-400 hover:text-slate-200 rounded-lg transition-all flex items-center gap-2 font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Avg. duration: ~5 minutes</span>
            </div>
          </div>
        </div>

        {/* Quiz Review Modal */}
        {reviewQuizItem && (() => {
          const hist = reviewQuizItem;
          const percentage = Math.round((hist.score / (hist.total_marks || 10)) * 100);
          
          let rawAnswers: any[] = [];
          if (hist.answers) {
            if (Array.isArray(hist.answers)) {
              rawAnswers = hist.answers;
            } else if (typeof hist.answers === 'string') {
              try {
                rawAnswers = JSON.parse(hist.answers);
              } catch (e) {
                console.error(e);
              }
            }
          }
          
          const normalizedAnswers = rawAnswers.map((a: any, i: number) => {
            const questionText = a.question || a.questionText || `Question ${i + 1}`;
            const studentAnswer = a.student_answer || a.studentAnswer || '';
            const correctAnswer = a.correct_answer || a.correctAnswer || '';
            
            let isCorrect = false;
            let feedbackText = a.feedback || a.feedbackText || '';
            let marksText = '';
            
            // Calculate marks per question based on total marks and number of questions
            const defaultQMarks = hist.total_marks && rawAnswers.length ? (hist.total_marks / rawAnswers.length) : 5;
            
            if (a.is_correct !== undefined) {
              isCorrect = !!a.is_correct;
              marksText = isCorrect ? `${defaultQMarks}/${defaultQMarks}` : `0/${defaultQMarks}`;
            } else if (a.marksAwarded !== undefined) {
              isCorrect = a.marksAwarded > 0;
              marksText = `${a.marksAwarded}/${a.totalMarks || defaultQMarks}`;
            } else if (a.marks_awarded !== undefined) {
              isCorrect = a.marks_awarded > 0;
              marksText = `${a.marks_awarded}/${a.total_marks || defaultQMarks}`;
            } else if (a.marks !== undefined) {
              isCorrect = a.allocatedMarks > 0 || a.marksAwarded > 0;
              marksText = `${a.allocatedMarks || 0}/${a.marks}`;
            } else {
              // Try comparing answers as fallback
              isCorrect = studentAnswer === correctAnswer;
              marksText = isCorrect ? `${defaultQMarks}/${defaultQMarks}` : `0/${defaultQMarks}`;
            }
            
            return {
              questionNumber: a.questionNumber || (i + 1),
              questionText,
              studentAnswer,
              correctAnswer,
              isCorrect,
              feedbackText,
              marksText,
              feedbackImage: a.feedbackImage || ''
            };
          });

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 to-indigo-950/50">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                      <Award className="w-6 h-6 text-purple-400" />
                      <span>Quiz Review</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {hist.quiz_title} • {new Date(hist.timestamp || hist.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setReviewQuizItem(null)}
                    className="p-2 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl text-center">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Score</p>
                      <p className="text-2xl font-extrabold text-purple-400">
                        {Math.round(hist.score)}/{hist.total_marks || 10}
                      </p>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl text-center">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Percentage</p>
                      <p className="text-2xl font-extrabold text-indigo-400">{percentage}%</p>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl text-center">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Status</p>
                      <p className={`text-lg font-bold flex items-center justify-center gap-1.5 ${
                        percentage >= 80 ? 'text-emerald-450' : percentage >= 50 ? 'text-amber-450' : 'text-rose-450'
                      }`}>
                        {percentage >= 80 ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Excellent</span>
                          </>
                        ) : percentage >= 50 ? (
                          <>
                            <AlertCircle className="w-4 h-4" />
                            <span>Passed</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            <span>Needs Work</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* General Teacher/AI Feedback */}
                  {hist.feedback && (
                    <div className="bg-purple-950/20 border border-purple-500/20 rounded-2xl p-4">
                      <h4 className="font-bold text-xs text-purple-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        Teacher Feedback
                      </h4>
                      <p className="text-sm text-purple-200/90 italic leading-relaxed">
                        "{hist.feedback}"
                      </p>
                    </div>
                  )}

                  {/* Question-by-Question breakdown */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Question Analysis
                    </h3>

                    {normalizedAnswers.length > 0 ? (
                      <div className="space-y-4">
                        {normalizedAnswers.map((a, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950/20 border border-slate-850 rounded-2xl p-5 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <span className="mt-0.5">
                                  {a.isCorrect ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                                  )}
                                </span>
                                <div>
                                  <span className="text-xs font-bold text-slate-500 block mb-0.5">
                                    Question {a.questionNumber}
                                  </span>
                                  <p className="text-slate-200 font-semibold text-sm leading-relaxed">
                                    {a.questionText}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-xs font-extrabold px-2 py-1 rounded-md border ${
                                a.isCorrect 
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450' 
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-450'
                              }`}>
                                {a.marksText}
                              </span>
                            </div>

                            <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-850/60">
                                <span className="text-slate-500 font-bold block mb-1">YOUR ANSWER</span>
                                <span className={a.isCorrect ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                  {a.studentAnswer || '(No Answer)'}
                                </span>
                              </div>
                              {a.correctAnswer && (
                                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-850/60">
                                  <span className="text-slate-500 font-bold block mb-1">CORRECT ANSWER</span>
                                  <span className="text-emerald-400 font-semibold">{a.correctAnswer}</span>
                                </div>
                              )}
                            </div>

                            {a.feedbackText && (
                              <div className="pl-7">
                                <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-3 text-xs leading-relaxed text-slate-300">
                                  <span className="font-bold text-indigo-400 block mb-0.5">Question Explanation/Feedback</span>
                                  {a.feedbackText}
                                </div>
                              </div>
                            )}

                            {a.feedbackImage && (
                              <div className="pl-7 mt-2">
                                <img
                                  src={a.feedbackImage}
                                  alt={`Feedback Image for Question ${a.questionNumber}`}
                                  className="rounded-xl border border-slate-800 max-h-48 object-contain"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 border border-dashed border-slate-850 rounded-2xl text-slate-500 text-sm">
                        No individual question breakdown saved for this quiz.
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-850 bg-slate-950/40 flex justify-end">
                  <button
                    onClick={() => setReviewQuizItem(null)}
                    className="bg-slate-850 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl font-bold transition-all text-xs"
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

  if (loading || generatingAI) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0F172A] text-slate-100">
        <Loader className="w-16 h-16 text-purple-500 animate-spin" />
        <p className="mt-4 text-lg font-medium text-slate-300">
          {generatingAI ? 'Generating Adaptive AI Quiz...' : 'Loading your quiz...'}
        </p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6">
        <div className="max-w-md text-center bg-white p-8 rounded-2xl shadow-lg">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {noContentMessage ? 'Content Not Available' : 'Failed to Load Quiz'}
          </h2>
          <p className="text-gray-600 mb-6">
            {noContentMessage || 'There was an error loading the quiz. Please try again.'}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={generateWithAI}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              <Brain className="w-5 h-5" />
              Generate with AI Instead
            </button>
            <button
              onClick={() => { setShowLauncher(true); checkTeacherContent(); }}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showResults) {
    const correctAnswers = selectedAnswers.filter(
      (answer, idx) => answer === quiz.questions[idx].correct
    ).length;
    const percentage = Math.round((correctAnswers / quiz.questions.length) * 100);
    const avgReactionTime = Math.round(
      reactionTimes.reduce((sum, time) => sum + time, 0) / reactionTimes.length
    );

    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg my-8">
        <h1 className="text-2xl font-bold text-center mb-6">{quiz.title} - Results</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <p className="text-sm text-blue-700 mb-1">Score</p>
            <p className="text-3xl font-bold text-blue-800">{Math.round(score)}/{quiz.totalMarks}</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg text-center">
            <p className="text-sm text-green-700 mb-1">Correct Answers</p>
            <p className="text-3xl font-bold text-green-800">{correctAnswers}/{quiz.questions.length}</p>
            <p className="text-lg font-medium text-green-700">{percentage}%</p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <p className="text-sm text-purple-700 mb-1">Avg. Response Time</p>
            <p className="text-3xl font-bold text-purple-800">{avgReactionTime}s</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold mb-4">Question Analysis</h2>
        <div className="space-y-4 mb-8">
          {quiz.questions.map((question, idx) => (
            <div key={question.id} className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                {selectedAnswers[idx] === question.correct ? (
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                )}
                <div>
                  <p className="font-medium">{question.question}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Your answer: {selectedAnswers[idx] >= 0 ? question.options[selectedAnswers[idx]] : 'Not answered'}
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    Correct answer: {question.options[question.correct]}
                  </p>
                  <p className="text-sm text-gray-700 mt-2">{question.explanation}</p>
                  <p className="text-xs text-gray-500 mt-2">Response time: {reactionTimes[idx]}s</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => {
              setDifficulty(percentage > 80 ? 'hard' : percentage < 40 ? 'easy' : 'medium');
              if (quizType === 'teacher') {
                generateQuiz();
              } else {
                generateWithAI();
              }
            }}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-500 font-bold transition-all active:scale-95 text-sm"
          >
            Take Another Quiz
          </button>
          <button
            onClick={() => {
              setShowLauncher(true);
            }}
            className="px-6 py-3 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 font-bold transition-all active:scale-95 text-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg my-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{quiz.title}</h1>
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
          <Clock className="w-5 h-5 text-blue-700" />
          <span className="font-medium text-blue-700">{formatTime(timeRemaining)}</span>
        </div>
      </div>

      <div className="mb-4 flex justify-between items-center">
        <p className="text-gray-600">Question {currentQuestionIndex + 1} of {quiz.questions.length}</p>
        <p className="text-gray-600">Difficulty: <span className="font-medium capitalize">{difficulty}</span></p>
      </div>

      <div className="w-full bg-gray-200 h-2 rounded-full mb-8">
        <div
          className="bg-blue-500 h-2 rounded-full"
          style={{ width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}
        ></div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-medium mb-4">{currentQuestion.question}</h2>

        {currentQuestion.imageUrl && (
          <div className="mb-6 flex justify-center">
            <img
              src={currentQuestion.imageUrl}
              alt="Visual Aid"
              className="max-h-64 object-contain rounded-lg border border-gray-200 shadow-sm"
            />
          </div>
        )}

        <div className="space-y-3">
          {currentQuestion.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswerSelect(idx)}
              disabled={showExplanation}
              className={`w-full text-left p-4 rounded-lg border transition-colors ${selectedAnswers[currentQuestionIndex] === idx
                ? showExplanation
                  ? idx === currentQuestion.correct
                    ? 'bg-green-100 border-green-300'
                    : 'bg-red-100 border-red-300'
                  : 'bg-blue-100 border-blue-300'
                : 'hover:bg-gray-50 border-gray-200'
                }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Hints Section */}
      {!showExplanation && !quizCompleted && (
        <div className="mb-6">
          <button
            onClick={async () => {
              if (hintLevel < 3) {
                setLoadingHint(true);
                // Generate hints only if not already generated
                if (!hints) {
                  try {
                    const generatedHints = await generateSocraticHints(
                      currentQuestion.question,
                      currentQuestion.options[currentQuestion.correct],
                      "Student is asking for a hint", // Context
                      subjectName
                    );
                    setHints(generatedHints);
                    setHintLevel(1);
                  } catch (e) {
                    console.error("Failed to generate hint", e);
                  }
                } else {
                  setHintLevel(prev => prev + 1);
                }
                setLoadingHint(false);
              }
            }}
            disabled={loadingHint || hintLevel >= 3}
            className="text-sm font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {loadingHint ? 'Thinking...' : hintLevel === 0 ? 'Need a Hint?' : 'Get Next Hint'}
          </button>

          {hintLevel > 0 && hints && (
            <div className="mt-3 bg-purple-50 p-3 rounded-lg border border-purple-100 animate-in fade-in slide-in-from-top-2">
              <p className="text-xs font-semibold text-purple-800 mb-1">
                HINT {hintLevel}/3: {hintLevel === 1 ? 'Concept' : hintLevel === 2 ? 'Strategy' : 'Guidance'}
              </p>
              <p className="text-sm text-purple-900">
                {hintLevel === 1 ? hints.level1 : hintLevel === 2 ? hints.level2 : hints.level3}
              </p>
            </div>
          )}
        </div>
      )}

      {showExplanation && (
        <div className="mb-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">Explanation:</h3>
          <p className="text-blue-700">{currentQuestion.explanation}</p>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="w-5 h-5" />
          Exit Quiz
        </button>

        {showExplanation && (
          <button
            onClick={handleNextQuestion}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            {currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question' : 'See Results'}
          </button>
        )}
      </div>
    </div>
  );
}