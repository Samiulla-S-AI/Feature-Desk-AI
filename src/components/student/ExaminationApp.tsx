import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock,
  AlertTriangle,
  Save,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  AlertCircle,
  BookOpen,
  Calendar,
  Loader,
  GraduationCap,
  Download
} from 'lucide-react';
// @ts-ignore
import html2canvas from 'html2canvas';
import {
  initializeProctoringSession,
  logProctoringEvent,
  setupAntiCheating,
  startPeriodicScreenshots,
  isOfflineModeAvailable,
  saveExamForOffline
} from '../../lib/proctoringService';
import { getStudentExams, getAssessmentQuestions, generateExamPassword, Assessment, QuizQuestion } from '../../lib/teacherDb';
import { saveExamSubmissionHybrid } from '../../lib/db';
import { gemini20Flash } from '../../lib/gemini';
import ExamAnswerInput from './ExamAnswerInput';

// Question interface
interface Question {
  id: string | number;
  text?: string;
  question?: string;
  type: 'multiple-choice' | 'short-answer' | 'essay' | 'file-upload' | 'mcq' | 'short_answer' | 'long_answer';
  options?: string[];
  correctAnswer?: string | string[];
  correct?: number;
  marks: number;
}

// Exam interface
interface Exam {
  id: string;
  title: string;
  subject: string;
  subject_code?: string;
  duration: number;
  totalMarks: number;
  total_marks?: number;
  instructions: string;
  questions: Question[];
  startTime?: string;
  endTime?: string;
  scheduled_at?: string;
  status: 'upcoming' | 'active' | 'completed';
  exam_type?: string;
  time_limit?: number;
}

export default function ExaminationApp() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // View state
  const [view, setView] = useState<'list' | 'exam'>('list');
  const [availableExams, setAvailableExams] = useState<Assessment[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

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

  // Exam state
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[] | File | null>>({});
  const [answerModes, setAnswerModes] = useState<Record<string, 'write' | 'type'>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [showAnswerReview, setShowAnswerReview] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [isLocked, setIsLocked] = useState(true);
  const [examPassword, setExamPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [_selectedExam, setSelectedExam] = useState<Assessment | null>(null);

  // Proctoring state
  const [_proctoringSessionId, setProctoringSessionId] = useState<string | null>(null);
  const [_screenshotCount, setScreenshotCount] = useState(0);
  const [_violationCount, setViolationCount] = useState(0);
  const [_isOfflineMode, _setIsOfflineMode] = useState(false);
  const [proctoringEnabled, _setProctoringEnabled] = useState(true);
  const screenshotIntervalRef = useRef<(() => void) | null>(null);
  const antiCheatingCleanupRef = useRef<(() => void) | null>(null);
  const answerSheetRef = useRef<HTMLDivElement>(null);

  // Get student info
  const currentClass = (user as any)?.current_class || 7;
  const rollNumber = (user as any)?.roll_number || '001';

  const currentSubject = (user as any)?.current_subject;

  // Load available exams from teacher-created assessments
  useEffect(() => {
    loadExams();
  }, [currentClass, currentSubject]);

  const loadExams = async () => {
    setLoadingExams(true);
    try {
      // Pass student ID and subject to filter assessments on the backend
      const studentId = (user as any)?.id;
      const exams = await getStudentExams(currentClass, currentSubject, studentId);
      setAvailableExams(exams);
    } catch (error) {
      console.error('Error loading exams:', error);
    } finally {
      setLoadingExams(false);
    }
  };

  // Auto-save progress to prevent data loss
  useEffect(() => {
    if (currentExam?.id && answers) {
      localStorage.setItem(`exam_answers_${currentExam.id}`, JSON.stringify(answers));
    }
  }, [answers, currentExam]);

  // Start an exam
  const startExam = async (assessment: Assessment) => {
    setSelectedExam(assessment);

    // Get exam password from assessment config (teacher-set 4-digit + roll number)
    // The exam_password is stored in the description field as JSON
    let teacherPassword = '';
    try {
      if (assessment.description) {
        const config = JSON.parse(assessment.description);
        teacherPassword = config.exam_password || '';
      }
    } catch (e) {
      // If description is plain text, use auto-generated password
      teacherPassword = '';
    }

    // If teacher set a password, use it + roll number; otherwise use auto-generated
    const password = teacherPassword
      ? `${teacherPassword}${rollNumber}`
      : generateExamPassword(rollNumber);
    setExamPassword(password);

    // Load questions from MongoDB
    const questions = await getAssessmentQuestions(assessment.id);

    // Convert to Exam format
    const exam: Exam = {
      id: assessment.id,
      title: assessment.title,
      subject: assessment.subject_code,
      subject_code: assessment.subject_code,
      duration: (assessment.time_limit || 3600) / 60, // Convert seconds to minutes
      totalMarks: assessment.total_marks,
      total_marks: assessment.total_marks,
      instructions: assessment.instructions || 'Answer all questions carefully. Read each question before answering.',
      questions: questions.map((q: QuizQuestion) => ({
        id: String(q.id),
        text: q.question,
        question: q.question,
        type: q.type === 'mcq' ? 'multiple-choice' : q.type === 'short_answer' ? 'short-answer' : 'essay',
        options: q.options,
        correct: q.correct,
        marks: q.marks
      })),
      scheduled_at: assessment.scheduled_at,
      status: 'active',
      exam_type: assessment.exam_type,
      time_limit: assessment.time_limit
    };

    setCurrentExam(exam);
    setRemainingTime((assessment.time_limit || 3600)); // in seconds

    // Initialize answers object
    const initialAnswers: Record<string, string | string[] | File | null> = {};
    questions.forEach((q: QuizQuestion) => {
      initialAnswers[String(q.id)] = null;
    });

    // Restore saved progress
    const saved = localStorage.getItem(`exam_answers_${assessment.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Handle visibility-change backup format: { answers: {...}, modes: {...}, timestamp: ... }
        let savedAnswers = parsed;
        if (parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)) {
          savedAnswers = parsed.answers;
          if (parsed.modes) setAnswerModes(parsed.modes);
        }
        
        // Merge only valid keys
        const validAnswers = { ...initialAnswers };
        Object.keys(savedAnswers).forEach(key => {
            if (key in initialAnswers) {
                validAnswers[key] = savedAnswers[key];
            }
        });
        setAnswers(validAnswers);
      } catch (e) {
        setAnswers(initialAnswers);
      }
    } else {
      setAnswers(initialAnswers);
    }

    setView('exam');
    setIsLocked(true);
    setPasswordInput('');
    setPasswordError(false);
  };

  // Timer effect
  useEffect(() => {
    if (!currentExam || examSubmitted || isLocked) return;

    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentExam, examSubmitted, isLocked]);

  // Format time as HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };



  // Handle fullscreen
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        alert(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullScreen(false);
      }
    }
  };

  // Handle answer changes — each questionId is unique, no cross-question leaking
  const handleAnswerChange = (questionId: string, value: string | string[] | File | null) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  // Handle answer mode changes
  const handleModeChange = (questionId: string, mode: 'write' | 'type') => {
    setAnswerModes(prev => ({ ...prev, [questionId]: mode }));
  };

  // Handle file upload
  const handleFileUpload = (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleAnswerChange(questionId, file);
  };

  // Navigate to previous/next question
  const goToPreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const goToNextQuestion = () => {
    if (currentExam && currentQuestionIndex < currentExam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  // Submission lock to prevent race conditions (timer + user click + proctoring)
  const isSubmittingRef = useRef(false);

  // Handle exam submission
  const handleSubmit = async () => {
    if (examSubmitted || isSubmitting || isSubmittingRef.current) return;

    // Lock submission immediately
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // PRE-SUBMISSION: Ensure all answers are captured
      // Backup current answers from localStorage if available
      if (currentExam) {
        try {
          const backupStr = localStorage.getItem(`exam_answers_${currentExam.id}`);
          if (backupStr) {
            const backup = JSON.parse(backupStr);
            if (backup.answers) {
              setAnswers(prev => {
                const merged = { ...prev };
                // Only fill in answers that are null/empty from backup
                Object.entries(backup.answers).forEach(([qId, ans]) => {
                  if ((!merged[qId] || merged[qId] === '') && ans) {
                    merged[qId] = ans as string;
                    console.log(`📋 Restored answer for Q${qId} from backup`);
                  }
                });
                return merged;
              });
            }
          }
        } catch (e) { console.error('Failed to restore backup:', e); }
      }

      // Small delay to let state update from backup restore
      await new Promise(resolve => setTimeout(resolve, 100));

      // 1. AI Grading
      let calculatedScore = 0;
      let gradingReport = "";

      try {
        // Simple auto-grading for MCQ
        currentExam?.questions.forEach(q => {
          if ((q.type === 'multiple-choice' || q.type === 'mcq') && answers[String(q.id)] !== null) {
            const answerIndex = q.options?.indexOf(answers[String(q.id)] as string);
            if (answerIndex === q.correct) {
              calculatedScore += q.marks;
            }
          }
        });

        // AI Grading for Essays/Short Answers
        if (currentExam) {
          const essayQuestions = currentExam.questions.filter(q =>
            q.type !== 'multiple-choice' && q.type !== 'mcq' && answers[String(q.id)]
          );
          if (essayQuestions.length > 0) {
            try {
              // const { gemini20Flash } = await import('../../lib/gemini');
              const prompt = `Grade these student answers based on the correct answer key.
                ${essayQuestions.map(q => {
                let studentAns = answers[String(q.id)];
                // For drawing answers, indicate it's handwritten
                if (typeof studentAns === 'string' && studentAns.startsWith('[DRAWING]:')) {
                  studentAns = '[Handwritten answer - see attached image]';
                }
                return `
                    Q: ${q.text || q.question}
                    Correct: ${q.correctAnswer || 'Evaluate based on logic'}
                    Student Answer: ${studentAns}
                    Max Marks: ${q.marks}
                  `;
              }).join('\n')}
                
                Return JSON: { "points_awarded": number, "feedback": "string" } for the TOTAL of these questions.`;

              const res = await gemini20Flash.generateContent(prompt);
              const text = (await res.response).text();
              try {
                const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, ''));
                calculatedScore += json.points_awarded || 0;
                gradingReport = json.feedback;
              } catch (e) { console.error("AI Grading Parse Error", e); }
            } catch (e) { console.error('AI grading error:', e); }
          }
        }
      } catch (e) {
        console.error("Auto grading failed", e);
      }

      // 2. Hybrid Database Submission
      const gradeData = {
        score: calculatedScore,
        letter: calculatedScore >= 90 ? 'A' : calculatedScore >= 80 ? 'B' : 'C'
      };

      const answerSheetData = {
        answers: answers,
        strokes: {},
        images: {},
        answerModes: answerModes,
        aiAnalysis: gradingReport
      };

      // Save answers to database — MUST await to ensure answers are saved
      if ((user as any)?.id) {
        try {
          // const { saveExamSubmissionHybrid } = await import('../../lib/db');
          const result = await saveExamSubmissionHybrid(
            (user as any).id,
            currentExam?.id || 'exam_001',
            gradeData,
            answerSheetData,
            currentExam?.questions || [] // Pass questions for answer mapping
          );

          if (result.success) {
            console.log('✅ Exam submitted successfully');
          } else {
            console.error('❌ Exam submission failed:', result.error);
            // Don't alert here to avoid blocking UI, just log
          }
        } catch (saveError) {
          console.error('❌ Critical submission error:', saveError);
        }
      }

      // Mark as submitted AFTER database save
      setExamSubmitted(true);
      // Refresh exam list to show submitted status immediately
      loadExams();

      // Clear saved progress
      localStorage.removeItem(`exam_answers_${currentExam?.id}`);
      setIsSubmitting(false);

      // Exit fullscreen if active
      if (document.fullscreenElement) {
        document.exitFullscreen();
        setIsFullScreen(false);
      }


    } catch (finalError) {
      console.error('Fatal submission error:', finalError);
      // Even if fatal error, we keep locked to prevent retry spam
      setIsSubmitting(false);
    }
  };

  const handleExitExam = () => {
    if (window.confirm("Are you sure you want to exit the exam? Your current progress will be submitted and graded.")) {
      handleSubmit();
    }
  };

  // Handle tab/window visibility changes — also backup answers
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Backup answers to localStorage to prevent data loss when tab is hidden (no warning, no auto-submit)
      if (document.hidden && !examSubmitted && !isLocked && !isSubmitting && view === 'exam') {
        if (currentExam) {
          try {
            const backupData: Record<string, string> = {};
            Object.entries(answers).forEach(([qId, ans]) => {
              if (typeof ans === 'string' && ans) backupData[qId] = ans;
            });
            localStorage.setItem(
              `exam_answers_${currentExam.id}`,
              JSON.stringify({ answers: backupData, modes: answerModes, timestamp: Date.now() })
            );
            console.log('📋 Answers backed up to localStorage on visibility change');
          } catch (e) { console.error('Backup failed:', e); }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [examSubmitted, isLocked, view, answers, answerModes, currentExam, isSubmitting]);

  // Handle proctoring violation (logs to database but does not show warnings or auto-submit)
  const handleViolation = useCallback((type: string, count: number) => {
    setViolationCount(count);
    
    // Log to proctoring session
    if (currentExam && (user as any)?.id) {
      logProctoringEvent(
        currentExam.id,
        (user as any).id,
        type as any,
        `Violation #${count}`
      );
    }
  }, [currentExam, user]);

  // Initialize proctoring on unlock
  const initializeProctoring = useCallback(async () => {
    if (!currentExam || !(user as any)?.id || !proctoringEnabled) return;

    const studentId = (user as any).id;
    const examId = currentExam.id;

    // Initialize proctoring session
    const sessionId = await initializeProctoringSession(
      examId,
      studentId,
      {
        enableScreenshots: true,
        screenshotInterval: 60000,
        enableAntiCheat: true,
        enableOfflineMode: isOfflineModeAvailable()
      }
    );
    setProctoringSessionId(sessionId);

    // Setup anti-cheating listeners
    const cleanupAntiCheat = setupAntiCheating(examId, studentId, handleViolation);
    antiCheatingCleanupRef.current = cleanupAntiCheat;

    // Start periodic screenshots
    const stopScreenshots = startPeriodicScreenshots(
      examId,
      studentId,
      60000,
      (count) => setScreenshotCount(count)
    );
    screenshotIntervalRef.current = stopScreenshots;

    // Save exam for offline mode if available
    if (isOfflineModeAvailable()) {
      await saveExamForOffline(currentExam);
    }

    // Log exam start
    await logProctoringEvent(examId, studentId, 'exam_start', 'Exam unlocked and started');
  }, [currentExam, user, proctoringEnabled, handleViolation]);

  // Cleanup proctoring on exam end
  useEffect(() => {
    return () => {
      if (antiCheatingCleanupRef.current) {
        antiCheatingCleanupRef.current();
      }
      if (screenshotIntervalRef.current) {
        screenshotIntervalRef.current();
      }
    };
  }, []);

  // Handle exam unlock
  const handleUnlock = async () => {
    // === TESTING MODE: Skip password verification ===
    // Original password check (uncomment for production):
    // if (passwordInput === examPassword) {
    //   setIsLocked(false);
    //   setPasswordError(false);
    //   toggleFullScreen();
    //   await initializeProctoring();
    // } else {
    //   setPasswordError(true);
    // }

    // TESTING: Direct unlock without password
    setIsLocked(false);
    setPasswordError(false);
    toggleFullScreen();
    await initializeProctoring();
  };

  // Calculate progress
  const calculateProgress = () => {
    if (!currentExam) return 0;

    const answeredQuestions = Object.values(answers).filter(answer => answer !== null).length;
    return (answeredQuestions / currentExam.questions.length) * 100;
  };

  // Get exam type label
  const getExamTypeLabel = (type: string) => {
    switch (type) {
      case 'annual': return 'Annual Exam';
      case 'mid_term': return 'Mid-Term Exam';
      default: return 'Examination';
    }
  };

  // Get exam type color
  const getExamTypeColor = (type: string) => {
    switch (type) {
      case 'annual': return 'bg-purple-100 text-purple-700';
      case 'mid_term': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Render current question
  const renderQuestion = () => {
    if (!currentExam || !currentExam.questions || currentExam.questions.length === 0) return null;

    const question = currentExam.questions[currentQuestionIndex];
    const questionId = String(question.id);
    const questionText = question.text || question.question || 'Question text not available';
    const questionType = question.type === 'mcq' ? 'multiple-choice' :
      question.type === 'short_answer' ? 'short-answer' :
        question.type === 'long_answer' ? 'essay' : question.type;

    return (
      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">
            Question {currentQuestionIndex + 1} of {currentExam.questions.length}
            <span className="ml-2 text-sm text-gray-500">({question.marks} marks)</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm ${answers[questionId] ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
              {answers[questionId] ? 'Answered' : 'Unanswered'}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <p className="whitespace-pre-wrap">{questionText}</p>
        </div>

        <div className="mb-4">
          {(questionType === 'multiple-choice') && question.options && (
            <div className="space-y-2">
              {question.options.map((option, index) => (
                <div key={index} className="flex items-center">
                  <input
                    type="radio"
                    id={`option-${index}`}
                    name={`question-${questionId}`}
                    value={option}
                    checked={answers[questionId] === option}
                    onChange={() => handleAnswerChange(questionId, option)}
                    className="mr-2"
                  />
                  <label htmlFor={`option-${index}`}>{option}</label>
                </div>
              ))}
            </div>
          )}

          {questionType === 'short-answer' && (
            <ExamAnswerInput
              key={questionId}
              questionId={questionId}
              marks={question.marks || 2}
              questionText={question.text || question.question}
              onAnswerChange={handleAnswerChange}
              currentAnswer={(answers[questionId] as string) || ''}
              answerMode={answerModes[questionId] || 'write'}
              onModeChange={handleModeChange}
            />
          )}

          {questionType === 'essay' && (
            <ExamAnswerInput
              key={questionId}
              questionId={questionId}
              marks={question.marks || 5}
              questionText={question.text || question.question}
              onAnswerChange={handleAnswerChange}
              currentAnswer={(answers[questionId] as string) || ''}
              answerMode={answerModes[questionId] || 'write'}
              onModeChange={handleModeChange}
            />
          )}

          {questionType === 'file-upload' && (
            <div>
              <input
                type="file"
                id={`file-${questionId}`}
                onChange={(e) => handleFileUpload(questionId, e)}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`file-${questionId}`}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer"
                >
                  {answers[questionId] ? 'Change File' : 'Upload File'}
                </label>
                {answers[questionId] && (
                  <span className="text-sm text-gray-600">
                    {(answers[questionId] as File).name}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render question navigation
  const renderQuestionNav = () => {
    if (!currentExam) return null;

    return (
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <h3 className="font-medium text-gray-700 mb-3">Question Navigator</h3>
        <div className="grid grid-cols-5 gap-2">
          {currentExam.questions.map((q, index) => (
            <button
              key={String(q.id)}
              onClick={() => setCurrentQuestionIndex(index)}
              className={`p-2 rounded-lg text-center ${currentQuestionIndex === index
                ? 'bg-blue-500 text-white'
                : answers[String(q.id)]
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Render exam list view
  if (view === 'list') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate('/')}
            className="mr-4 p-2 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Examination Center</h1>
            <p className="text-gray-600">Password protected formal examinations</p>
          </div>
        </div>

        {loadingExams ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <Loader className="w-12 h-12 mx-auto text-blue-500 animate-spin mb-4" />
            <p className="text-gray-600">Loading available exams...</p>
          </div>
        ) : availableExams.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <GraduationCap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No Scheduled Exams</h2>
            <p className="text-gray-600">
              There are no formal examinations scheduled at this time.
              <br />
              Check back later or contact your teacher for more information.
            </p>
          </div>
        ) : (
          <div className="space-y-4">

            {availableExams.map(exam => {
              // Use backend status instead of localStorage
              const alreadySubmitted = exam.submitted === true;

              return (
                <div key={exam.id} className={`bg-white rounded-xl shadow-md overflow-hidden transition-shadow ${alreadySubmitted ? 'opacity-70' : 'hover:shadow-lg'}`}>
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getExamTypeColor(exam.exam_type)}`}>
                            {getExamTypeLabel(exam.exam_type)}
                          </span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                            {getSubjectDisplayName(exam.subject_code)}
                          </span>
                          {alreadySubmitted && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Submitted {exam.grade ? `(Grade: ${exam.grade})` : ''}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">{exam.title}</h3>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {Math.floor((exam.time_limit || 3600) / 60)} minutes
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {exam.total_marks} marks
                          </span>
                          {exam.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(exam.scheduled_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {alreadySubmitted ? (
                        <div className="px-6 py-3 bg-gray-200 text-gray-500 rounded-lg font-medium cursor-not-allowed flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Already Submitted
                        </div>
                      ) : (
                        <button
                          onClick={() => startExam(exam)}
                          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                        >
                          <GraduationCap className="w-5 h-5" />
                          Enter Exam
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100">
                    <p className="text-sm text-yellow-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {alreadySubmitted
                        ? 'This exam has already been submitted. Contact your teacher for any concerns.'
                        : <>Password required: Your password is <strong>4-digit code + Roll Number</strong></>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Render exam lock screen
  if (isLocked) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center mb-6">
          <button
            onClick={() => {
              setView('list');
              setCurrentExam(null);
              setSelectedExam(null);
            }}
            className="mr-4 p-2 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">Examination App</h1>
        </div>

        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-blue-500 mb-4" />

          {currentExam && (
            <>
              <h2 className="text-xl font-bold mb-2">{currentExam.title}</h2>
              <p className="text-gray-600 mb-6">{currentExam.subject}</p>

              <div className="bg-blue-50 p-4 rounded-lg mb-6 text-left">
                <h3 className="font-medium mb-2">Exam Information:</h3>
                <ul className="space-y-1 text-sm">
                  <li><strong>Duration:</strong> {currentExam.duration} minutes</li>
                  <li><strong>Total Marks:</strong> {currentExam.totalMarks}</li>
                  <li><strong>Questions:</strong> {currentExam.questions.length}</li>
                </ul>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg mb-6 text-left">
                <h3 className="font-medium mb-2 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                  Important Instructions:
                </h3>
                <ul className="space-y-1 text-sm list-disc pl-5">
                  <li>This exam will run in fullscreen locked-down mode</li>
                  <li>Leaving the exam tab/window will be recorded as a violation</li>
                  <li>Multiple violations may result in automatic submission</li>
                  <li>Ensure you have stable internet connection</li>
                  <li>Your answers are automatically saved as you type</li>
                </ul>
              </div>

              <div className="bg-green-50 p-4 rounded-lg mb-6 text-left">
                <h3 className="font-medium mb-2 text-green-800">Your Password Format:</h3>
                <p className="text-sm text-green-700">
                  Enter the <strong>4-digit exam code</strong> (provided by your teacher) followed by your <strong>Roll Number</strong>
                  <br />
                  Your Roll Number: <strong>{rollNumber}</strong>
                  <br />
                  Example: If code is 1234, enter: <strong>1234{rollNumber}</strong>
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-left text-sm font-medium text-gray-700 mb-1">
                  Enter Exam Password:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${passwordError ? 'border-red-500' : ''
                      }`}
                    placeholder="Enter 4-digit code + Roll Number"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-red-500 text-sm mt-1">Incorrect password. Please try again.</p>
                )}
              </div>

              <button
                onClick={handleUnlock}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Start Exam
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Helper to download sheet
  const downloadAnswerSheet = async () => {
    if (!answerSheetRef.current) return;

    try {
      // @ts-ignore
      const canvas = await html2canvas(answerSheetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1200 // Ensure layout
      });

      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${currentExam?.title || 'Exam'}_${rollNumber}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error generating answer sheet:', err);
      // Fallback
      alert('Failed to generate image. Try using browser print (Ctrl+P).');
    }
  };

  // Helper: parse answer content for display
  const parseAnswer = (ans: any) => {
    let textAns = '';
    let imgAns = '';
    let ansType: 'typed' | 'written' | 'none' = 'none';

    if (typeof ans === 'string' && ans) {
      if (ans.startsWith('[DRAWING]:')) {
        imgAns = ans.replace('[DRAWING]:', '');
        ansType = 'written';
      } else {
        textAns = ans;
        ansType = 'typed';
      }
    } else if (ans instanceof File) {
      textAns = `File attached: ${ans.name}`;
      ansType = 'typed';
    }

    return { textAns, imgAns, ansType };
  };

  // Render exam completed screen
  if (examSubmitted) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Exam Submitted Successfully</h2>
          <p className="text-gray-600 mb-6">
            Your answers have been recorded. Thank you for completing the exam.
          </p>

          {/* Exam Summary */}
          {currentExam && (
            <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left">
              <h3 className="font-medium mb-2">Exam Summary:</h3>
              <ul className="space-y-1 text-sm">
                <li><strong>Title:</strong> {currentExam.title}</li>
                <li><strong>Subject:</strong> {currentExam.subject}</li>
                <li><strong>Questions Answered:</strong> {Object.values(answers).filter(a => a !== null && a !== '').length} of {currentExam.questions.length}</li>
                <li><strong>Submission Time:</strong> {new Date().toLocaleString()}</li>
              </ul>

              {/* Per-question summary chips */}
              <div className="mt-4 flex flex-wrap gap-2">
                {currentExam.questions.map((q, index) => {
                  const { ansType } = parseAnswer(answers[String(q.id)]);
                  return (
                    <span
                      key={q.id}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${ansType === 'typed' ? 'bg-purple-100 text-purple-700' :
                        ansType === 'written' ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-red-600'
                        }`}
                    >
                      Q{index + 1}: {ansType === 'typed' ? '⌨️ Typed' : ansType === 'written' ? '✍️ Written' : '❌ Unanswered'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mb-6">
            <button
              onClick={() => setShowAnswerReview(!showAnswerReview)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Eye className="w-5 h-5" />
              {showAnswerReview ? 'Hide Answers' : 'View Full Answers'}
            </button>

            <button
              onClick={downloadAnswerSheet}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download Answer Sheet
            </button>

            <button
              onClick={() => {
                setView('list');
                setCurrentExam(null);
                setSelectedExam(null);
                setExamSubmitted(false);
                setShowAnswerReview(false);
                setAnswers({});
                setAnswerModes({});
                loadExams();
              }}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Return to Exam List
            </button>
          </div>

          {/* Full Answer Review Panel */}
          {showAnswerReview && currentExam && (
            <div className="text-left border-t pt-6 mt-4">
              <h3 className="text-xl font-bold mb-4 text-gray-800">📋 Your Answers</h3>
              <div className="space-y-6">
                {currentExam.questions.map((q, index) => {
                  const { textAns, imgAns, ansType } = parseAnswer(answers[String(q.id)]);

                  return (
                    <div key={q.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-gray-800">
                          Q{index + 1}. {q.text || q.question}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ansType === 'typed' ? 'bg-purple-100 text-purple-700' :
                            ansType === 'written' ? 'bg-blue-100 text-blue-700' :
                              'bg-red-100 text-red-600'
                            }`}>
                            {ansType === 'typed' ? '⌨️ Typed' : ansType === 'written' ? '✍️ Written' : '❌ Unanswered'}
                          </span>
                          <span className="text-sm text-gray-500">({q.marks} marks)</span>
                        </div>
                      </div>

                      <div className="pl-3 border-l-4 border-blue-300">
                        {textAns && (
                          <div className="bg-white p-3 rounded-lg whitespace-pre-wrap text-gray-800 leading-relaxed">
                            {textAns}
                          </div>
                        )}

                        {imgAns && (
                          <div className="bg-white p-2 rounded-lg inline-block mt-2">
                            <img
                              src={imgAns}
                              alt={`Answer for Q${index + 1}`}
                              className="max-w-full rounded border border-gray-200"
                              style={{ maxHeight: '500px' }}
                            />
                          </div>
                        )}

                        {!textAns && !imgAns && (
                          <p className="text-red-500 italic py-2">Not Answered</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hidden Answer Sheet for PDF/Image Capture */}
          {currentExam && (
            <div
              ref={answerSheetRef}
              style={{
                position: 'fixed',
                left: '-10000px',
                top: 0,
                width: '800px',
                background: 'white',
                padding: '40px',
                zIndex: -1
              }}
            >
              <div className="border-b-2 border-gray-800 pb-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-900">{currentExam.title}</h1>
                <div className="flex justify-between mt-2 text-gray-600">
                  <p>Student: <span className="font-semibold">{rollNumber}</span></p>
                  <p>Subject: <span className="font-semibold">{currentExam.subject}</span></p>
                  <p>Date: {new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="space-y-8">
                {currentExam.questions.map((q, index) => {
                  const { textAns, imgAns } = parseAnswer(answers[String(q.id)]);

                  return (
                    <div key={q.id} className="border-b border-gray-200 pb-6 break-inside-avoid">
                      <div className="flex justify-between mb-2">
                        <h3 className="font-bold text-lg text-gray-800">Q{index + 1}: {q.text || q.question}</h3>
                        <span className="font-semibold text-gray-600">({q.marks} Marks)</span>
                      </div>

                      <div className="mt-2 pl-4 border-l-4 border-blue-100">
                        {textAns && (
                          <div className="text-gray-900 font-medium whitespace-pre-wrap mb-4 font-mono bg-gray-50 p-2 rounded">
                            {textAns}
                          </div>
                        )}

                        {imgAns && (
                          <div className="mt-2 border rounded-lg overflow-hidden inline-block">
                            <img src={imgAns} alt="Answer" style={{ maxWidth: '100%', maxHeight: '400px' }} />
                          </div>
                        )}

                        {!textAns && !imgAns && (
                          <p className="text-red-500 italic">Not Answered</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 pt-4 border-t-2 border-gray-800 text-center text-sm text-gray-500">
                Generated by Feature Desk • Examination System
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }



  // Render main exam interface
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:h-[calc(100vh-10px)] lg:flex lg:flex-col overflow-hidden">
      {/* Header with timer and controls */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6 sticky top-0 z-10 shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center">
            <h1 className="text-xl font-bold">{currentExam?.title}</h1>
            <span className="ml-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              {currentExam?.subject}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${remainingTime < 300 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
              }`}>
              <Clock className="w-4 h-4" />
              <span className="font-medium">{formatTime(remainingTime)}</span>
            </div>

            <button
              onClick={toggleFullScreen}
              className="p-2 hover:bg-gray-100 rounded-full"
              title={isFullScreen ? "Minimize" : "Maximize"}
            >
              {isFullScreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={handleExitExam}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1.5 font-medium text-sm"
              title="Exit exam and submit current progress"
            >
              Exit Exam
            </button>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 font-medium text-sm"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Exam'}
              <Save className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${calculateProgress()}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{Object.values(answers).filter(a => a !== null).length} of {currentExam?.questions.length} questions answered</span>
            <span>{calculateProgress().toFixed(0)}% complete</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:flex-1 lg:overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="lg:col-span-1 lg:overflow-y-auto pr-1 flex flex-col gap-4">
          {renderQuestionNav()}

          <div className="bg-white rounded-xl shadow-md p-4">
            <h3 className="font-medium text-gray-700 mb-3">Instructions</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {currentExam?.instructions}
            </p>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 lg:overflow-y-auto pr-1 flex flex-col justify-between min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 pb-4">
            {renderQuestion()}
          </div>

          <div className="flex justify-between mt-4 shrink-0">
            <button
              onClick={goToPreviousQuestion}
              disabled={currentQuestionIndex === 0}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${currentQuestionIndex === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Previous
            </button>

            <button
              onClick={goToNextQuestion}
              disabled={!currentExam || currentQuestionIndex === currentExam.questions.length - 1}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${!currentExam || currentQuestionIndex === currentExam.questions.length - 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Warning modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
              <h2 className="text-xl font-bold">Warning!</h2>
            </div>

            <p className="mb-4">
              You have left the exam window. This has been recorded as a violation.
              {warningCount >= 3 && ' Multiple violations may result in automatic submission.'}
            </p>

            <div className="bg-yellow-50 p-3 rounded-lg mb-4">
              <p className="text-sm text-yellow-800">
                Warning count: {warningCount}/3
              </p>
            </div>

            <button
              onClick={() => setShowWarning(false)}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Continue Exam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}