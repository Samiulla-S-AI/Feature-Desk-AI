import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock,
  ArrowLeft,
  AlertCircle,
  BookOpen,
  Calendar,
  Loader,
  GraduationCap,
  Maximize2,
  Minimize2,
  CheckCircle,
  Eye,
  Download
} from 'lucide-react';
// @ts-ignore
import html2canvas from 'html2canvas';
import {
  initializeProctoringSession,
  logProctoringEvent,
  setupAntiCheating,
  isOfflineModeAvailable,
  saveExamForOffline
} from '../../lib/proctoringService';
import { getStudentTests, getAssessmentQuestions, Assessment, QuizQuestion } from '../../lib/teacherDb';
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

// Exam/Test interface
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

export default function TestApp() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // View state
  const [view, setView] = useState<'list' | 'exam'>('list');
  const [availableTests, setAvailableTests] = useState<Assessment[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  // Exam/Test state
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [currentTest, setCurrentTest] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[] | File | null>>({});
  const [answerModes, setAnswerModes] = useState<Record<string, 'write' | 'type'>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [_showWarning, setShowWarning] = useState(false);
  const [_warningCount, setWarningCount] = useState(0);
  const [_selectedTest, setSelectedTest] = useState<Assessment | null>(null);

  // Proctoring state (Optional for tests, but kept for consistency)
  const [_proctoringSessionId, _setProctoringSessionId] = useState<string | null>(null);
  const [_screenshotCount, _setScreenshotCount] = useState(0);
  const [_violationCount, setViolationCount] = useState(0);
  const [proctoringEnabled] = useState(true); // Enabled for consistency as requested
  const screenshotIntervalRef = useRef<(() => void) | null>(null);
  const antiCheatingCleanupRef = useRef<(() => void) | null>(null);
  const answerSheetRef = useRef<HTMLDivElement>(null);
  const [showAnswerReview, setShowAnswerReview] = useState(false);

  // Get student info
  const currentClass = (user as any)?.current_class || 7;

  // Load available tests from teacher-created assessments
  useEffect(() => {
    loadTests();
  }, [currentClass]);

  const loadTests = async () => {
    setLoadingTests(true);
    try {
      const tests = await getStudentTests(currentClass); // Use getStudentTests for Unit/Weekly etc.
      setAvailableTests(tests);
    } catch (error) {
      console.error('Error loading tests:', error);
    } finally {
      setLoadingTests(false);
    }
  };

  // Auto-save progress to prevent data loss
  useEffect(() => {
    if (currentTest?.id && answers) {
      localStorage.setItem(`test_answers_${currentTest.id}`, JSON.stringify(answers));
    }
  }, [answers, currentTest]);

  // Start a test
  const startTest = async (assessment: Assessment) => {
    setSelectedTest(assessment);

    // Load questions from MongoDB/Supabase
    const questions = await getAssessmentQuestions(assessment.id);

    // Convert to Exam/Test format
    const test: Exam = {
      id: assessment.id,
      title: assessment.title,
      subject: assessment.subject_code,
      subject_code: assessment.subject_code,
      duration: (assessment.time_limit || 1800) / 60, // Convert seconds to minutes
      totalMarks: assessment.total_marks,
      total_marks: assessment.total_marks,
      instructions: assessment.instructions || 'Answer all questions. Good luck!',
      questions: questions.map((q: QuizQuestion) => ({
        id: String(q.id),
        text: q.question,
        question: q.question,
        type: q.type === 'mcq' ? 'multiple-choice' :
          q.type === 'short_answer' ? 'short-answer' :
            q.type === 'long_answer' ? 'essay' : 'short-answer', // Default fallback
        options: q.options,
        correct: q.correct,
        marks: q.marks
      })),
      scheduled_at: assessment.scheduled_at,
      status: 'active',
      exam_type: assessment.exam_type,
      time_limit: assessment.time_limit
    };

    setCurrentTest(test);
    setRemainingTime((assessment.time_limit || 1800)); // in seconds

    // Initialize answers object
    const initialAnswers: Record<string, string | string[] | File | null> = {};
    questions.forEach((q: QuizQuestion) => {
      initialAnswers[String(q.id)] = null;
    });

    // Restore saved progress
    const saved = localStorage.getItem(`test_answers_${assessment.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Handle potential wrapper format
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
    setTestSubmitted(false);

    // Initialize proctoring consistency
    initializeProctoring(test.id);
  };

  // Timer effect
  useEffect(() => {
    if (!currentTest || testSubmitted) return;

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
  }, [currentTest, testSubmitted]);

  // Format time as HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullScreen(false);
      }
    }
  };

  const handleAnswerChange = (questionId: string, value: string | string[] | File | null) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleModeChange = (questionId: string, mode: 'write' | 'type') => {
    setAnswerModes(prev => ({ ...prev, [questionId]: mode }));
  };

  const handleFileUpload = (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleAnswerChange(questionId, file);
  };

  // Handle test submission
  const handleSubmit = async () => {
    if (testSubmitted || isSubmitting) return;
    setIsSubmitting(true);

    let calculatedScore = 0;
    let gradingReport = "";

    try {
      // Simple auto-grading for MCQ
      currentTest?.questions.forEach(q => {
        if ((q.type === 'multiple-choice' || q.type === 'mcq') && answers[String(q.id)] !== null) {
          const answerIndex = q.options?.indexOf(answers[String(q.id)] as string);
          if (answerIndex === q.correct) {
            calculatedScore += q.marks;
          }
        }
      });

      // AI Grading for Essay/Short Answer (Mocked or Real)
      if (currentTest) {
        const essayQuestions = currentTest.questions.filter(q =>
          q.type !== 'multiple-choice' && q.type !== 'mcq' && answers[String(q.id)]
        );

        if (essayQuestions.length > 0) {
          try {
            // const { gemini20Flash } = await import('../../lib/gemini');
            const prompt = `Grade these student answers based on the correct answer key.
                 Test Type: ${currentTest.exam_type}
                 ${essayQuestions.map(q => {
              let studentAns = answers[String(q.id)];
              if (typeof studentAns === 'string' && studentAns.startsWith('[DRAWING]:')) {
                studentAns = '[Handwritten answer]';
              }
              return `Q: ${q.text || q.question}
                    Correct: ${q.correctAnswer || 'Evaluate based on correctness'}
                    Student Answer: ${studentAns}
                    Max Marks: ${q.marks}`;
            }).join('\n')}
                 
                 Return JSON: { "points_awarded": number, "feedback": "string" } for the TOTAL of these questions.`;

            const res = await gemini20Flash.generateContent(prompt);
            const text = (await res.response).text();
            try {
              const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, ''));
              calculatedScore += json.points_awarded || 0;
              gradingReport = json.feedback;
            } catch (e) {
              console.error("AI Grading JSON Parse Error", e);
            }
          } catch (e) {
            console.error("AI Grading Error", e);
          }
        }
      }
    } catch (e) {
      console.error("Auto grading failed", e);
    }

    // Hybrid Database Submission
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

    if ((user as any)?.id) {
      try {
        // const { saveExamSubmissionHybrid } = await import('../../lib/db');
        const result = await saveExamSubmissionHybrid(
          (user as any).id,
          currentTest?.id || 'test_001',
          gradeData,
          answerSheetData,
          currentTest?.questions || []
        );

        if (result.success) {
          console.log('✅ Test submitted successfully');
        } else {
          console.error('❌ Test submission failed:', result.error);
          alert('Warning: Your test answers may not have been saved properly. Please contact your teacher.');
        }
      } catch (saveError) {
        console.error('❌ Critical submission error:', saveError);
        alert('Warning: There was an error saving your test.');
      }
    }

    setTestSubmitted(true);
    localStorage.removeItem(`test_answers_${currentTest?.id}`);
    setIsSubmitting(false);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
  };

  const handleExitTest = () => {
    if (window.confirm("Are you sure you want to exit the assessment? Your current progress will be submitted and graded.")) {
      handleSubmit();
    }
  };

  // Proctoring Violation Handler (logs only, no modal popups)
  const handleViolation = useCallback((type: string, count: number) => {
    setViolationCount(count);

    if (currentTest && (user as any)?.id) {
      logProctoringEvent(
        currentTest.id,
        (user as any).id,
        type as any,
        `Violation #${count} (Test Mode)`
      );
    }
  }, [currentTest, user]);

  const initializeProctoring = useCallback(async (testId: string) => {
    if (!proctoringEnabled || !(user as any)?.id) return;

    const studentId = (user as any).id;
    await initializeProctoringSession(
      testId,
      studentId,
      {
        enableScreenshots: false,
        screenshotInterval: 0,
        enableAntiCheat: true,
        enableOfflineMode: isOfflineModeAvailable()
      }
    );
    // Setup anti-cheating listeners
    const cleanupAntiCheat = setupAntiCheating(testId, studentId, handleViolation);
    antiCheatingCleanupRef.current = cleanupAntiCheat;

    if (isOfflineModeAvailable() && currentTest) {
      await saveExamForOffline(currentTest);
    }

    await logProctoringEvent(testId, studentId, 'exam_start', 'Test started');
  }, [currentTest, user, proctoringEnabled, handleViolation]);

  useEffect(() => {
    return () => {
      if (antiCheatingCleanupRef.current) antiCheatingCleanupRef.current();
      if (screenshotIntervalRef.current) screenshotIntervalRef.current();
    };
  }, []);

  // Helper to download sheet
  const downloadAnswerSheet = async () => {
    if (!answerSheetRef.current) return;
    try {
      // @ts-ignore
      const canvas = await html2canvas(answerSheetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1200
      });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${currentTest?.title || 'Test'}_${(user as any)?.roll_number || 'Student'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error generating answer sheet:', err);
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

  // Render Functions
  const renderQuestion = () => {
    if (!currentTest || !currentTest.questions || currentTest.questions.length === 0) return null;

    const question = currentTest.questions[currentQuestionIndex];
    const questionId = String(question.id);
    const questionType = question.type;
    const questionText = question.text || question.question || 'Question text not available';

    return (
      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">
            Question {currentQuestionIndex + 1} of {currentTest.questions.length}
            <span className="ml-2 text-sm text-gray-500">({question.marks} marks)</span>
          </h3>
          <span className={`px-3 py-1 rounded-full text-sm ${answers[questionId] ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {answers[questionId] ? 'Answered' : 'Unanswered'}
          </span>
        </div>

        <div className="mb-6">
          <p className="whitespace-pre-wrap text-lg text-gray-800">{questionText}</p>
        </div>

        <div className="mb-4">
          {(questionType === 'multiple-choice' || questionType === 'mcq') && question.options ? (
            <div className="space-y-3">
              {question.options.map((option, index) => (
                <div key={index} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 bg-white">
                  <input
                    type="radio"
                    id={`option-${index}`}
                    name={`question-${questionId}`}
                    value={option}
                    checked={answers[questionId] === option}
                    onChange={() => handleAnswerChange(questionId, option)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor={`option-${index}`} className="ml-3 block text-sm font-medium text-gray-700 w-full cursor-pointer">
                    {option}
                  </label>
                </div>
              ))}
            </div>
          ) : questionType === 'file-upload' ? (
            <div>
              <input
                type="file"
                id={`file-${questionId}`}
                onChange={(e) => handleFileUpload(questionId, e)}
                className="hidden"
              />
              <label
                htmlFor={`file-${questionId}`}
                className="inline-flex items-center px-4 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 cursor-pointer"
              >
                {answers[questionId] ? 'Change File' : 'Upload File'}
              </label>
              {answers[questionId] && (
                <span className="ml-3 text-sm text-gray-600">
                  {(answers[questionId] as File).name}
                </span>
              )}
            </div>
          ) : (
            <ExamAnswerInput
              key={questionId}
              questionId={questionId}
              marks={question.marks}
              questionText={questionText}
              onAnswerChange={handleAnswerChange}
              currentAnswer={(answers[questionId] as string) || ''}
              answerMode={answerModes[questionId] || 'write'}
              onModeChange={handleModeChange}
            />
          )}
        </div>
      </div>
    );
  };

  const renderQuestionNav = () => {
    if (!currentTest) return null;
    return (
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <h3 className="font-medium text-gray-700 mb-3">Question Navigator</h3>
        <div className="grid grid-cols-5 gap-2">
          {currentTest.questions.map((q, index) => (
            <button
              key={String(q.id)}
              onClick={() => setCurrentQuestionIndex(index)}
              className={`p-2 rounded-lg text-center text-sm font-medium transition-colors ${currentQuestionIndex === index
                ? 'bg-blue-600 text-white'
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

  if (view === 'list') {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="mr-4 p-2 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Test Portal</h1>
            <p className="text-gray-500 mt-1">Access your Unit Tests, Weekly Assessments, and Practice Quizzes</p>
          </div>
        </div>

        {loadingTests ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm">
            <Loader className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-500">Loading assessments...</p>
          </div>
        ) : availableTests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
            <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Active Tests</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              You're all caught up! There are no pending assessments at the moment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableTests.map(test => (
              <div key={test.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200 group">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${test.exam_type === 'unit_test' ? 'bg-purple-100 text-purple-700' :
                      test.exam_type === 'weekly' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                      {(test.exam_type || 'Test').replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {test.subject_code}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {test.title}
                  </h3>

                  <div className="space-y-2 mt-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{Math.floor((test.time_limit || 1800) / 60)} mins</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-gray-400" />
                      <span>{test.total_marks} Marks</span>
                    </div>
                    {test.scheduled_at && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{new Date(test.scheduled_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => startTest(test)}
                    className="mt-6 w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                  >
                    Start Assessment
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Exam View
  if (!currentTest) return null;

  // Render test completed screen
  if (testSubmitted) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Test Submitted Successfully</h2>
          <p className="text-gray-600 mb-6">
            Your answers have been recorded. Thank you for completing the assessment.
          </p>

          {currentTest && (
            <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left">
              <h3 className="font-medium mb-2">Summary:</h3>
              <ul className="space-y-1 text-sm">
                <li><strong>Title:</strong> {currentTest.title}</li>
                <li><strong>Subject:</strong> {currentTest.subject}</li>
                <li><strong>Questions Answered:</strong> {Object.values(answers).filter(a => a !== null && a !== '').length} of {currentTest.questions.length}</li>
                <li><strong>Submission Time:</strong> {new Date().toLocaleString()}</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {currentTest.questions.map((q, index) => {
                  const { ansType } = parseAnswer(answers[String(q.id)]);
                  return (
                    <span key={q.id} className={`px-3 py-1 rounded-full text-xs font-semibold ${ansType === 'typed' ? 'bg-purple-100 text-purple-700' : ansType === 'written' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                      Q{index + 1}: {ansType === 'typed' ? '⌨️ Typed' : ansType === 'written' ? '✍️ Written' : '❌ Unanswered'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4 mb-6">
            <button onClick={() => setShowAnswerReview(!showAnswerReview)} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
              <Eye className="w-5 h-5" /> {showAnswerReview ? 'Hide Answers' : 'View Full Answers'}
            </button>
            <button onClick={downloadAnswerSheet} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2">
              <Download className="w-5 h-5" /> Download Answer Sheet
            </button>
            <button onClick={() => {
              setView('list');
              setCurrentTest(null);
              setSelectedTest(null);
              setTestSubmitted(false);
              setShowAnswerReview(false);
              setAnswers({});
              setAnswerModes({});
              loadTests();
            }} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              Return to Test List
            </button>
          </div>

          {showAnswerReview && currentTest && (
            <div className="text-left border-t pt-6 mt-4">
              <h3 className="text-xl font-bold mb-4 text-gray-800">📋 Your Answers</h3>
              <div className="space-y-6">
                {currentTest.questions.map((q, index) => {
                  const { textAns, imgAns } = parseAnswer(answers[String(q.id)]);
                  return (
                    <div key={q.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-gray-800">Q{index + 1}. {q.text || q.question}</h4>
                        <span className="text-sm text-gray-500">({q.marks} marks)</span>
                      </div>
                      <div className="pl-3 border-l-4 border-blue-300">
                        {textAns && <div className="bg-white p-3 rounded-lg whitespace-pre-wrap text-gray-800 leading-relaxed">{textAns}</div>}
                        {imgAns && <div className="bg-white p-2 rounded-lg inline-block mt-2"><img src={imgAns} alt={`Answer Q${index + 1}`} className="max-w-full rounded border border-gray-200" style={{ maxHeight: '500px' }} /></div>}
                        {!textAns && !imgAns && <p className="text-red-500 italic py-2">Not Answered</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentTest && (
            <div ref={answerSheetRef} style={{ position: 'fixed', left: '-10000px', top: 0, width: '800px', background: 'white', padding: '40px', zIndex: -1 }}>
              <div className="border-b-2 border-gray-800 pb-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-900">{currentTest.title}</h1>
                <div className="flex justify-between mt-2 text-gray-600">
                  <p>Student: <span className="font-semibold">{(user as any)?.roll_number || 'Student'}</span></p>
                  <p>Subject: <span className="font-semibold">{currentTest.subject}</span></p>
                  <p>Date: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <div className="space-y-8">
                {currentTest.questions.map((q, index) => {
                  const { textAns, imgAns } = parseAnswer(answers[String(q.id)]);
                  return (
                    <div key={q.id} className="border-b border-gray-200 pb-6 break-inside-avoid">
                      <div className="flex justify-between mb-2">
                        <h3 className="font-bold text-lg text-gray-800">Q{index + 1}: {q.text || q.question}</h3>
                        <span className="font-semibold text-gray-600">({q.marks} Marks)</span>
                      </div>
                      <div className="mt-2 pl-4 border-l-4 border-blue-100">
                        {textAns && <div className="text-gray-900 font-medium whitespace-pre-wrap mb-4 font-mono bg-gray-50 p-2 rounded">{textAns}</div>}
                        {imgAns && <div className="mt-2 border rounded-lg overflow-hidden inline-block"><img src={imgAns} alt="Answer" style={{ maxWidth: '100%', maxHeight: '400px' }} /></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 pt-4 border-t-2 border-gray-800 text-center text-sm text-gray-500">Generated by Feature Desk • Test Portal</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">{currentTest.title}</h1>
          <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium">
            {currentTest.subject_code}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleFullScreen}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          <button
            onClick={handleExitTest}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm"
            title="Exit assessment and submit current progress"
          >
            Exit Assessment
          </button>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-lg ${remainingTime < 300 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'
            }`}>
            <Clock className="w-5 h-5" />
            {formatTime(remainingTime)}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4 hidden lg:block">
          {renderQuestionNav()}

          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Instructions
            </h4>
            <p className="text-sm text-blue-700 leading-relaxed">
              {currentTest.instructions}
            </p>
          </div>
        </div>

        {/* Question Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {renderQuestion()}

            <div className="flex justify-between mt-8 mb-12">
              <button
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Previous
              </button>

              {currentQuestionIndex < currentTest.questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                  className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Next Question
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-8 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    'Submit Assessment'
                  )}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Nav Overlay (if needed) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          Q {currentQuestionIndex + 1} / {currentTest.questions.length}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              if (currentQuestionIndex < currentTest.questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
              } else {
                handleSubmit();
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium"
          >
            {currentQuestionIndex < currentTest.questions.length - 1 ? 'Next' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}