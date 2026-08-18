import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Trophy, 
  RotateCcw, 
  Lightbulb, 
  Target, 
  HelpCircle,
  TrendingUp,
  Award,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { offlineSyncEngine } from '../../lib/offlineSyncEngine';
import { generateAdaptiveQuizFromFeedback, StudentCorrectionSummary } from '../../lib/adaptiveQuizService';
import SyncStatusIndicator from '../common/SyncStatusIndicator';

interface AdaptiveQuizProps {
  isOpen: boolean;
  onClose: () => void;
  targetSubject?: string;
  targetConcept?: string;
}

interface QuizQuestion {
  id: number | string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  positiveEncouragement?: string;
  concept?: string;
  timeEstimate?: number;
}

const encouragingQuotes = [
  "Mistakes are the stepping stones of mastery!",
  "Your brain grows every time you tackle a tricky concept!",
  "Great thinkers love learning from corrections!",
  "You're turning yesterday's confusion into today's power!"
];

export default function AdaptiveQuiz({ 
  isOpen, 
  onClose,
  targetSubject = 'MATH',
  targetConcept 
}: AdaptiveQuizProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizTitle, setQuizTitle] = useState('Personalized Reinforcement Quiz');
  const [feedbackSummary, setFeedbackSummary] = useState<StudentCorrectionSummary | null>(null);
  const [isFromRealFeedback, setIsFromRealFeedback] = useState(false);
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [randomQuote] = useState(() => encouragingQuotes[Math.floor(Math.random() * encouragingQuotes.length)]);

  // Load dynamically generated quiz based on student's corrected answers & feedback
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setScore(0);
    setQuizCompleted(false);
    setShowHint(false);

    const loadFeedbackQuiz = async () => {
      const studentId = (user as any)?.id || 'guest';
      const subject = (user as any)?.current_subject || targetSubject || 'MATH';

      try {
        const result = await generateAdaptiveQuizFromFeedback(studentId, subject, targetConcept, 'medium');
        if (!isMounted) return;

        if (result.quiz && result.quiz.questions && result.quiz.questions.length > 0) {
          setQuestions(result.quiz.questions);
          setQuizTitle(result.quiz.title || 'Targeted Reinforcement Quiz');
          setFeedbackSummary(result.feedbackSummary);
          setIsFromRealFeedback(result.fromRealFeedback);
        } else {
          throw new Error('No questions returned');
        }
      } catch (err) {
        console.error('Failed to load adaptive feedback quiz:', err);
        if (!isMounted) return;
        // Fallback pleasant reinforcement questions
        setQuestions([
          {
            id: 1,
            question: `How does reviewing mistakes improve your problem-solving in ${targetSubject}?`,
            options: [
              "A) It isolates the misconception and strengthens correct logical pathways",
              "B) It has no effect on long-term memory",
              "C) It only matters for memorizing facts without understanding",
              "D) It takes away practice time"
            ],
            correct: 0,
            explanation: "Active reflection on corrections transforms conceptual gaps into permanent mastery.",
            positiveEncouragement: "Spot on! Targeted reflection is the secret of top achievers.",
            concept: "Concept Mastery Strategy"
          }
        ]);
        setIsFromRealFeedback(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadFeedbackQuiz();

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetSubject, targetConcept, user]);

  const handleOptionSelect = (index: number) => {
    if (!isAnswerSubmitted) {
      setSelectedOption(index);
    }
  };

  const handleSubmitAnswer = () => {
    if (selectedOption === null || isAnswerSubmitted) return;
    
    setIsAnswerSubmitted(true);
    const isCorrect = selectedOption === questions[currentQuestionIndex]?.correct;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
  };

  const handleNextQuestion = async () => {
    setShowHint(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      setQuizCompleted(true);
      // Safely cache quiz completion result
      const userId = (user as any)?.id || 'guest';
      const classId = (user as any)?.current_class || 1;
      const subjectCode = (user as any)?.current_subject || targetSubject || 'MATH';
      const finalScore = score + (selectedOption === questions[currentQuestionIndex]?.correct ? 1 : 0);

      await offlineSyncEngine.saveQuizResultSafe(
        userId,
        { title: quizTitle, totalMarks: questions.length * 5 },
        finalScore * 5,
        {
          totalQuestions: questions.length,
          reinforcedConcepts: feedbackSummary?.weakConcepts || [],
          sourceFeedbackExams: feedbackSummary?.sourceExams || []
        },
        subjectCode,
        classId
      );
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setScore(0);
    setQuizCompleted(false);
    setShowHint(false);
  };

  if (!isOpen) return null;

  const currentQ = questions[currentQuestionIndex];
  const progressPercent = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
  const isSelectedCorrect = selectedOption !== null && selectedOption === currentQ?.correct;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300 animate-fadeIn">
      {/* Main Positive Card */}
      <div className="bg-white/95 rounded-3xl shadow-2xl border border-indigo-100 w-full max-w-2xl flex flex-col overflow-hidden backdrop-blur-xl transition-all">
        
        {/* Positive Header */}
        <div className="bg-gradient-to-r from-indigo-50 via-white to-emerald-50/60 p-5 border-b border-indigo-50/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800 tracking-tight">Adaptive Reinforcement Quiz</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  <Sparkles className="w-3 h-3 text-emerald-600" /> Positive Mastery
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {isFromRealFeedback 
                  ? `Targeted practice generated from your evaluated mistake corrections`
                  : `Empowering practice quiz designed to solidify your core concepts`
                }
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <SyncStatusIndicator compact={true} />
            <button 
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Close Quiz"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Source Badge */}
        {feedbackSummary && feedbackSummary.weakConcepts.length > 0 && isFromRealFeedback && (
          <div className="bg-amber-50/80 border-b border-amber-100/80 px-5 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
              <span>Reinforcing:</span>
              <span className="font-bold text-amber-950">{feedbackSummary.weakConcepts.slice(0, 3).join(', ')}</span>
            </div>
            {feedbackSummary.sourceExams.length > 0 && (
              <span className="text-amber-700/80 text-[11px]">
                From: {feedbackSummary.sourceExams[0]}
              </span>
            )}
          </div>
        )}

        {/* Modal Content */}
        <div className="p-6 md:p-8">
          {loading ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto animate-spin">
                <Loader2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Generating Your Targeted Questions...</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Analyzing your previous corrections & feedback to build questions that help you master these concepts with ease.
              </p>
            </div>
          ) : !quizCompleted && currentQ ? (
            <div className="space-y-6">
              
              {/* Progress & Question Counter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                    <Award className="w-3.5 h-3.5" /> Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                  {currentQ.concept && (
                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                      💡 {currentQ.concept}
                    </span>
                  )}
                </div>

                {/* Smooth Gradient Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Question Box */}
              <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/70">
                <h3 className="text-base md:text-lg font-semibold text-slate-800 leading-relaxed">
                  {currentQ.question}
                </h3>
              </div>

              {/* Option Cards */}
              <div className="space-y-3">
                {currentQ.options.map((option, index) => {
                  let cardStyle = "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300";
                  let badgeStyle = "bg-slate-100 text-slate-600";

                  if (selectedOption === index) {
                    if (isAnswerSubmitted) {
                      if (index === currentQ.correct) {
                        cardStyle = "bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold shadow-sm";
                        badgeStyle = "bg-emerald-500 text-white";
                      } else {
                        cardStyle = "bg-rose-50 border-rose-400 text-rose-950 font-semibold shadow-sm";
                        badgeStyle = "bg-rose-500 text-white";
                      }
                    } else {
                      cardStyle = "bg-indigo-50 border-indigo-500 text-indigo-950 font-semibold shadow-xs ring-1 ring-indigo-200";
                      badgeStyle = "bg-indigo-600 text-white";
                    }
                  } else if (isAnswerSubmitted && index === currentQ.correct) {
                    cardStyle = "bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold";
                    badgeStyle = "bg-emerald-500 text-white";
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleOptionSelect(index)}
                      disabled={isAnswerSubmitted}
                      className={`w-full p-4 text-left rounded-2xl border-2 transition-all flex items-center justify-between group ${cardStyle}`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${badgeStyle}`}>
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="text-sm font-medium">{option.replace(/^[A-D]\)\s*/, '')}</span>
                      </div>

                      {isAnswerSubmitted && index === currentQ.correct && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      )}
                      {isAnswerSubmitted && selectedOption === index && index !== currentQ.correct && (
                        <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Socratic Hint Area */}
              {showHint && !isAnswerSubmitted && (
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-amber-900 text-xs space-y-1 animate-fadeIn">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <Lightbulb className="w-4 h-4 text-amber-600" /> Socratic Thinking Hint:
                  </div>
                  <p className="text-amber-800/90 leading-relaxed pl-5">
                    Think about: What is the core rule behind {currentQ.concept || 'this concept'}? Notice how one option avoids the common misunderstanding.
                  </p>
                </div>
              )}

              {/* Instant Encouraging Feedback Card on Submit */}
              {isAnswerSubmitted && (
                <div className={`p-4 rounded-2xl border text-xs space-y-1.5 animate-fadeIn ${
                  isSelectedCorrect 
                    ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                    : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-1.5">
                      {isSelectedCorrect ? (
                        <>
                          <Sparkles className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-800 text-sm">Excellent understanding!</span>
                        </>
                      ) : (
                        <>
                          <Lightbulb className="w-4 h-4 text-indigo-600" />
                          <span className="text-indigo-800 text-sm">Great learning opportunity!</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <p className="leading-relaxed text-slate-700">
                    {currentQ.explanation}
                  </p>

                  {currentQ.positiveEncouragement && (
                    <p className="font-semibold text-emerald-700 pt-1">
                      🌱 {currentQ.positiveEncouragement}
                    </p>
                  )}
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {!isAnswerSubmitted && (
                  <button
                    onClick={() => setShowHint(prev => !prev)}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100/80 px-3 py-2 rounded-xl transition-colors"
                  >
                    <HelpCircle className="w-4 h-4" />
                    {showHint ? 'Hide Hint' : 'Need a Hint?'}
                  </button>
                )}

                <div className="ml-auto flex items-center space-x-3">
                  {!isAnswerSubmitted ? (
                    <button
                      onClick={handleSubmitAnswer}
                      disabled={selectedOption === null}
                      className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Check Answer
                    </button>
                  ) : (
                    <button
                      onClick={handleNextQuestion}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold text-sm shadow-md shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 flex items-center space-x-1.5 transition-all animate-pulse hover:animate-none"
                    >
                      <span>{currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'See Mastery Results'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Celebration & Completion Card */
            <div className="text-center py-8 space-y-6 animate-fadeIn">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-emerald-400 text-white flex items-center justify-center mx-auto shadow-xl shadow-amber-100">
                <Trophy className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                  Concepts Reinforced
                </span>
                <h3 className="text-2xl md:text-3xl font-extrabold text-slate-800 pt-2">
                  Fantastic Job!
                </h3>
                <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto">
                  "{randomQuote}"
                </p>
              </div>

              {/* Score Box */}
              <div className="bg-gradient-to-br from-indigo-50/50 via-white to-emerald-50/50 rounded-2xl p-6 border border-indigo-100 max-w-sm mx-auto shadow-xs">
                <div className="text-4xl font-extrabold text-slate-800">
                  <span className="text-emerald-600">{score}</span> / {questions.length}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {score === questions.length 
                    ? '🎉 100% Mastery! All previous misunderstandings cleared!' 
                    : score >= questions.length / 2
                    ? '👏 Great progress! You are turning weak areas into core strengths.'
                    : '🌱 Good practice! Reviewing these concepts will make your next exam much easier.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleRestart}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold text-sm transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Practice Again
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-indigo-600 text-white hover:from-emerald-700 hover:to-indigo-700 rounded-xl font-semibold text-sm shadow-md shadow-emerald-100 transition-all"
                >
                  Continue Learning
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}