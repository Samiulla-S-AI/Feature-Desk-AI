import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, X, Send, Minimize2, Sparkles, HelpCircle } from 'lucide-react';
import { gemini20Flash, CHATBOT_FORMATTING_PROMPT } from '../../lib/gemini';
import { useAuth } from '../../contexts/AuthContext';
import MarkdownRenderer from '../common/MarkdownRenderer';
import {
  getStudentsByClass,
  getTeacherAssessments,
  getPendingResults,
  getPublishedResults,
  getStudentsNeedingIntervention,
  getTeacherContent
} from '../../lib/teacherDb';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const FloatingAIChatbot = () => {
  const location = useLocation();
  const { user, userType } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);

  // For teacher context database caching
  const [teacherDbData, setTeacherDbData] = useState<{
    students: any[];
    assessments: any[];
    pendingResults: any[];
    publishedResults: any[];
    interventionStudents: any[];
    content: any[];
  } | null>(null);

  const fetchTeacherData = async () => {
    if (!user) return null;
    try {
      const assignedClass = (user as any)?.assigned_class || 10;
      const teacherId = user.id || '';

      const [students, assessments, pending, published, intervention, content] = await Promise.all([
        getStudentsByClass(assignedClass),
        getTeacherAssessments(teacherId),
        getPendingResults(teacherId, assignedClass),
        getPublishedResults(teacherId, assignedClass),
        getStudentsNeedingIntervention(assignedClass),
        getTeacherContent(teacherId)
      ]);

      const data = {
        students,
        assessments,
        pendingResults: pending,
        publishedResults: published,
        interventionStudents: intervention,
        content
      };
      setTeacherDbData(data);
      return data;
    } catch (err) {
      console.error('Error fetching teacher dashboard data for chatbot:', err);
      return null;
    }
  };

  useEffect(() => {
    if (isOpen && userType === 'teacher' && user) {
      fetchTeacherData();
    }
  }, [isOpen, userType, user]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragStartTimeRef = useRef<number>(0);

  // Draggable state - Start position on right side
  const [position, setPosition] = useState({
    x: window.innerWidth - 100,
    y: Math.max(100, window.innerHeight - 150)
  });
  const [chatPosition, setChatPosition] = useState({
    x: window.innerWidth - 440,
    y: Math.max(60, Math.min(window.innerHeight - 640, 80))
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Pages where chatbot should NOT appear
  const excludedPaths = ['/exam', '/test', '/quiz'];
  const shouldShow = !excludedPaths.includes(location.pathname);

  // Get context-aware greeting and suggestions based on current page
  const getContextInfo = () => {
    const path = location.pathname;
    
    if (userType === 'teacher') {
      const activeTabEl = document.querySelector('header h2');
      const activeTab = activeTabEl ? activeTabEl.textContent?.trim() : 'Dashboard';
      return {
        title: `Teacher Portal - ${activeTab}`,
        greeting: `Hi ${(user as any)?.teacher_name || 'Teacher'}! I see you're on the Teacher Dashboard (${activeTab} tab). I am adaptive to this dashboard and can answer anything about your classes, students, grading, or assessment data visible here. How can I help you today?`,
        suggestions: [
          'Who needs intervention?',
          'Summarize class performance',
          'Tell me about recent activities',
          'How do I edit assessments?'
        ]
      };
    }

    const contexts: { [key: string]: { title: string; greeting: string; suggestions: string[] } } = {
      '/': {
        title: 'Writing Canvas',
        greeting: `Hi ${(user as any)?.student_name || 'there'}! I see you're on the Writing Canvas. I can help you with note-taking, using tools, or organizing your work. What would you like to do?`,
        suggestions: [
          'How do I use different paper types?',
          'Show me how to import shapes',
          'How can I convert handwriting to text?',
          'Tips for better note-taking'
        ]
      },
      '/notes': {
        title: 'Notes App',
        greeting: 'I can help you create better notes! Would you like tips on organizing, formatting, or tagging your notes?',
        suggestions: [
          'How should I organize my notes?',
          'Best practices for note-taking',
          'How to use tags effectively',
          'Create a study guide from my notes'
        ]
      },
      '/dashboard': {
        title: 'Dashboard',
        greeting: 'Looking at your performance? I can explain your stats, suggest improvements, or help you set learning goals!',
        suggestions: [
          'Explain my performance metrics',
          'How can I improve my scores?',
          'What should I focus on?',
          'Set a study goal for me'
        ]
      },
      '/chatbot': {
        title: 'AI Assistant',
        greeting: 'You\'re already in the main AI Assistant! But I\'m here too if you need quick help.',
        suggestions: [
          'What can the AI Assistant do?',
          'Quick math help',
          'Science concept explanation',
          'Study tips'
        ]
      },
      '/friendly-ai': {
        title: 'AI Friend',
        greeting: 'Visiting your AI Friend? I can help you make the most of the conversation!',
        suggestions: [
          'What topics can I discuss?',
          'How to ask better questions',
          'Get study motivation',
          'Daily learning tips'
        ]
      },
      '/gmail': {
        title: 'Mail',
        greeting: 'Need help composing an email or organizing your messages?',
        suggestions: [
          'Help me write a professional email',
          'How to share my work via email',
          'Email organization tips',
          'Draft an email to my teacher'
        ]
      },
      '/history': {
        title: 'History Viewer',
        greeting: 'Reviewing your past work? I can help you find specific notes, analyze patterns, or create summaries!',
        suggestions: [
          'Find my math notes from last week',
          'Summarize my recent progress',
          'What topics have I covered?',
          'Create a study plan from history'
        ]
      },
      '/notifications': {
        title: 'Notifications',
        greeting: 'Managing your alerts? Let me help you prioritize and organize!',
        suggestions: [
          'What\'s most urgent?',
          'Help me plan my tasks',
          'Summarize today\'s notifications',
          'Create a to-do list'
        ]
      }
    };

    return contexts[path] || {
      title: 'Feature Desk',
      greeting: `Hi! I'm your AI assistant. I can help guide you through this app. What do you need help with?`,
      suggestions: [
        'What can you help me with?',
        'Show me around',
        'Study tips',
        'Quick help'
      ]
    };
  };

  const contextInfo = getContextInfo();

  // Initialize with context-aware greeting
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: '1',
        content: contextInfo.greeting,
        sender: 'bot',
        timestamp: new Date()
      }]);
    }
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const analyzeScreen = async (): Promise<string> => {
    try {
      let screenContext = ``;

      if (userType === 'teacher') {
        const activeTabEl = document.querySelector('header h2');
        const activeTab = activeTabEl ? activeTabEl.textContent?.trim() : 'Dashboard';
        screenContext += `Active Dashboard Tab: ${activeTab}\n\n`;

        // Extract stats cards data
        const statsCards = Array.from(document.querySelectorAll('.bg-white.p-5.rounded-xl, .bg-white.p-4.rounded-xl, .bg-white.p-5.border, .bg-white.p-4.border'));
        if (statsCards.length > 0) {
          screenContext += `### Key Dashboard Stats:\n`;
          statsCards.forEach(card => {
            const textParagraphs = Array.from(card.querySelectorAll('p, span, div')).map(el => el.textContent?.trim() || '').filter(Boolean);
            const cleanTexts = textParagraphs.filter((t, i) => textParagraphs.indexOf(t) === i);
            if (cleanTexts.length >= 2) {
              screenContext += `- ${cleanTexts[0]}: ${cleanTexts[1]}\n`;
            }
          });
          screenContext += `\n`;
        }

        // Extract tables / data rows
        const tables = Array.from(document.querySelectorAll('table'));
        if (tables.length > 0) {
          tables.forEach((table, idx) => {
            screenContext += `### Data Table ${idx + 1}:\n`;
            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
            if (headers.length > 0) {
              screenContext += `Headers: ${headers.join(' | ')}\n`;
            }
            const rows = Array.from(table.querySelectorAll('tbody tr')).slice(0, 25);
            rows.forEach((row, rowIdx) => {
              const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim().replace(/\s+/g, ' ') || '');
              if (cells.length > 0) {
                screenContext += `Row ${rowIdx + 1}: ${cells.join(' | ')}\n`;
              }
            });
            screenContext += `\n`;
          });
        }

        // Extract list items (recent activities, alerts, contents)
        const listItems = Array.from(document.querySelectorAll('.space-y-4 .flex.items-center, .space-y-3 .flex.items-center, .grid.grid-cols-1.gap-4 .border, .space-y-4 .border'));
        if (listItems.length > 0) {
          screenContext += `### Dashboard Lists & Activities:\n`;
          let listCount = 0;
          listItems.forEach(item => {
            if (!item.closest('nav') && !item.closest('header') && listCount < 20) {
              const text = item.textContent?.trim().replace(/\s+/g, ' ');
              if (text) {
                screenContext += `- ${text}\n`;
                listCount++;
              }
            }
          });
          screenContext += `\n`;
        }

        // Generic visible text summary
        const bodyText = document.body.innerText.substring(0, 5000);
        screenContext += `### Full Visible Text Summary:\n${bodyText}`;

      } else {
        // Student view
        const canvas = document.querySelector('canvas');
        screenContext += `Page: ${contextInfo.title}\n`;

        if (canvas) {
          screenContext += `Canvas detected with drawings.\n`;
        }

        const bodyText = document.body.innerText.substring(0, 1500);
        screenContext += `Content: ${bodyText}`;
      }

      return screenContext;
    } catch (error) {
      console.error('Error during screen analysis:', error);
      return 'Unable to analyze';
    }
  };

  const generateResponse = async (userMessage: string): Promise<string> => {
    try {
      let context = '';
      let activeDbData = teacherDbData;

      if (userType === 'teacher' && !activeDbData) {
        setIsAnalyzingScreen(true);
        activeDbData = await fetchTeacherData();
        setIsAnalyzingScreen(false);
      }
      
      if (userType === 'teacher') {
        const assignedClass = (user as any)?.assigned_class || 10;
        const assignedSubjects = (user as any)?.assigned_subjects || ['MATH'];
        context = `You are a helpful, smart AI assistant for teacher ${(user as any)?.teacher_name || 'Teacher'} (Class ${assignedClass}, Subjects: ${assignedSubjects.join(', ')}).
        
You are adaptive to their Teacher Dashboard. You can answer queries about any data, students, classes, or items currently visible on their dashboard, or in the database.

Page: ${contextInfo.title}`;

        if (activeDbData) {
          context += `\n\n### COMPLETE DATABASE STATE (Always refer to this state to answer questions about counts, lists, grades, pending reviews, etc. even if not visible on the current DOM/screen):
- Total Students in Class ${assignedClass}: ${activeDbData.students.length}
- Students List: ${JSON.stringify(activeDbData.students.map(s => ({ name: s.student_name, roll: s.roll_number, class: s.current_class })))}
- Total Assessments: ${activeDbData.assessments.length}
- Assessments List: ${JSON.stringify(activeDbData.assessments.map(a => ({ title: a.title, subject: a.subject_code, class: a.class_id, active: a.is_active })))}
- Pending Submissions for Review Count: ${activeDbData.pendingResults.length}
- Pending Submissions List: ${JSON.stringify(activeDbData.pendingResults.map(p => ({ student: p.student_name, roll: p.roll_number, title: p.quiz_title, score: p.score, total_marks: p.total_marks, submitted_at: p.submitted_at })))}
- Published Answer Sheets/Grades Count: ${activeDbData.publishedResults.length}
- Published Answer Sheets/Grades List: ${JSON.stringify(activeDbData.publishedResults.map(pr => ({ student: pr.student_name, roll: pr.roll_number, title: pr.quiz_title, score: pr.score, total_marks: pr.total_marks, grade: pr.grade, submitted_at: pr.submitted_at })))}
- Students Needing Intervention Count: ${activeDbData.interventionStudents.length}
- Students Needing Intervention List: ${JSON.stringify(activeDbData.interventionStudents.map(is => ({ name: is.student_name, roll: is.roll_number })))}
- Uploaded Study Materials/Content Count: ${activeDbData.content.length}
- Study Materials/Content List: ${JSON.stringify(activeDbData.content.map(c => ({ title: c.title, subject: c.subject, type: c.type, url: c.fileUrl })))}
`;
        }
      } else {
        context = `AI Assistant for ${(user as any)?.student_name || 'Student'} (Class ${(user as any)?.current_class}, ${(user as any)?.current_subject})
        
Page: ${contextInfo.title}

You have access to the student dashboard data, writing canvas context, and notes. You can answer general questions, academic questions, and questions about their learning progress.

Current Page Focus & Recommendations:`;

        const capabilities: { [key: string]: string } = {
          '/': '- Guide writing tools\n- Convert handwriting\n- Organize pages\n- Suggest strategies',
          '/notes': '- Create notes\n- Generate guides\n- Organize tags\n- Make flashcards',
          '/dashboard': '- Analyze metrics\n- Identify gaps\n- Create plans\n- Track trends',
          '/history': '- Search activities\n- Create summaries\n- Generate reviews\n- Build schedules',
          '/gmail': '- Draft emails\n- Format content\n- Suggest etiquette\n- Create templates',
          '/notifications': '- Prioritize alerts\n- Create to-dos\n- Organize tasks\n- Plan actions'
        };

        context += capabilities[location.pathname] || capabilities['/'];
      }

      // Always analyze screen for teachers to make it completely adaptive to dashboard data
      if (userType === 'teacher') {
        setIsAnalyzingScreen(true);
        const screenData = await analyzeScreen();
        context += `\n\nActive Teacher Dashboard Screen Data (You MUST use this data to answer questions about stats, student lists, results, grades, etc. in combination with the database state):\n${screenData}`;
        setIsAnalyzingScreen(false);
      } else {
        // For students, check if they are asking about screen/grades/scores or dashboard, and supply screen context
        if (userMessage.toLowerCase().match(/screen|see|what|analyze|show|grade|score|performance|result|answer|quiz|test|stats|detail/)) {
          setIsAnalyzingScreen(true);
          const screenData = await analyzeScreen();
          context += `\n\nActive Student Screen Data (Use this to answer questions about their current view, progress, notes, or stats):\n${screenData}`;
          setIsAnalyzingScreen(false);
        }
      }

      // Apply formatting guidelines
      context += `\n\n${CHATBOT_FORMATTING_PROMPT}\n\nIMPORTANT: Use LaTeX for Math ($x^2$ inline, $$x^2$$ block).\n\nTask: ${userMessage}\n\nProvide a helpful, well-formatted response using markdown. If automation requested, DO IT.`;

      const result = await gemini20Flash.generateContent(context);
      return (await result.response).text();
    } catch (error) {
      return "Error. Try again!";
    }
  };

  const handleSendMessage = async () => {
    if (inputValue.trim() === '') return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    const responseText = await generateResponse(userMessage.content);

    const botMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: responseText,
      sender: 'bot',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, botMessage]);
    setIsTyping(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
  };

  // Handle icon dragging
  const handleIconMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartTimeRef.current = Date.now();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  // Handle chat window header dragging
  const handleChatMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chat-header')) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - chatPosition.x,
        y: e.clientY - chatPosition.y
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      if (isOpen) {
        // Moving the chat window
        const newX = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragStart.x));
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragStart.y));
        setChatPosition({ x: newX, y: newY });
      } else {
        // Moving the icon
        const newX = Math.max(20, Math.min(window.innerWidth - 80, e.clientX - dragStart.x));
        const newY = Math.max(20, Math.min(window.innerHeight - 80, e.clientY - dragStart.y));
        setPosition({ x: newX, y: newY });
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleIconClick = () => {
    // Only open if not a drag (drag took less than 200ms and moved less)
    const dragDuration = Date.now() - dragStartTimeRef.current;
    if (dragDuration < 200) {
      setIsOpen(true);
      // Position chat window - always open at top-right, fully visible
      const winWidth = window.innerWidth;
      const chatWidth = 400;
      // Position near top-right, below the header
      setChatPosition({
        x: Math.max(20, winWidth - chatWidth - 40),
        y: 80 // Fixed position below header, always visible
      });
    }
  };

  // Minimize to icon
  const handleMinimize = () => {
    setIsOpen(false);
    // Update icon position to be near where the chat was
    setPosition({
      x: Math.min(window.innerWidth - 80, chatPosition.x + 360),
      y: Math.max(80, chatPosition.y + 30)
    });
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, isOpen]);

  if (!shouldShow) return null;

  return (
    <>
      {/* Floating AI Icon - Shows when chat is closed */}
      {!isOpen && (
        <div
          className={`fixed z-[9999] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transition: isDragging ? 'none' : 'all 0.2s ease-out'
          }}
          onMouseDown={handleIconMouseDown}
          onClick={handleIconClick}
        >
          {/* Glowing Ring Animation */}
          <div className="absolute -inset-2 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full opacity-40 blur-lg animate-pulse" />

          {/* Main Button */}
          <button
            className="relative w-16 h-16 bg-gradient-to-br from-purple-600 via-pink-500 to-rose-500 text-white rounded-full shadow-2xl hover:shadow-purple-500/50 hover:scale-110 transition-all duration-300 flex items-center justify-center group"
          >
            {/* Animated Bot Icon */}
            <div className="relative">
              <Bot className="w-7 h-7" />
              {/* Sparkle effects */}
              <Sparkles className="absolute -top-2 -right-2 w-4 h-4 text-yellow-300 animate-pulse" />
            </div>

            {/* Online Indicator */}
            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white shadow-lg">
              <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75" />
            </div>



            {/* Hover Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none transform group-hover:-translate-y-1">
              <div className="bg-slate-900/95 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl text-sm whitespace-nowrap shadow-2xl border border-slate-700/50">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="font-medium">AI Assistant</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Click to chat • Drag to move</p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-slate-900/95" />
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Chat Window - Full size, draggable */}
      {isOpen && (
        <div
          onMouseDown={handleChatMouseDown}
          className={`fixed z-[9999] w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDragging ? 'cursor-grabbing' : ''}`}
          style={{
            left: `${chatPosition.x}px`,
            top: `${chatPosition.y}px`,
            height: 'min(580px, calc(100vh - 80px))',
            maxHeight: 'calc(100vh - 80px)',
            transition: isDragging ? 'none' : 'all 0.3s ease-out',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(168, 85, 247, 0.2)'
          }}
        >
          {/* Header - Draggable handle */}
          <div className="chat-header bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 text-white p-4 cursor-move select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">AI Assistant</h3>
                  <p className="text-xs text-white/80 flex items-center">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5" />
                    {contextInfo.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {/* Minimize to Icon Button */}
                <button
                  onClick={handleMinimize}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all duration-200 group"
                  title="Minimize to icon"
                >
                  <Minimize2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all duration-200 group"
                  title="Close"
                >
                  <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            {/* Drag indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1 opacity-40">
              <div className="w-1 h-1 bg-white rounded-full" />
              <div className="w-1 h-1 bg-white rounded-full" />
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50 to-white">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${message.sender === 'user'
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-br-md'
                    : 'bg-white text-gray-800 rounded-bl-md border border-slate-100'
                    }`}
                >
                  {message.sender === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  ) : (
                    <MarkdownRenderer content={message.content} className="text-sm" />
                  )}
                  <p className={`text-[10px] mt-1.5 ${message.sender === 'user' ? 'text-purple-200' : 'text-slate-400'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {(isTyping || isAnalyzingScreen) && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-slate-100">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    {isAnalyzingScreen && (
                      <span className="text-xs text-purple-600 font-medium">Analyzing...</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions (shown when few messages) */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 bg-white">
              <p className="text-xs text-slate-500 mb-2 flex items-center font-medium">
                <HelpCircle className="w-3 h-3 mr-1.5" />
                Quick suggestions
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {contextInfo.suggestions.slice(0, 2).map((suggestion: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-left px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 rounded-xl text-xs text-slate-700 transition-all duration-200 border border-purple-100 hover:border-purple-200 hover:shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white text-sm transition-all duration-200"
              />
              <button
                onClick={handleSendMessage}
                disabled={inputValue.trim() === '' || isTyping}
                className="p-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingAIChatbot;
