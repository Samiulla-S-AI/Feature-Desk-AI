import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Undo2, Redo2, Trash2, Pencil, Eraser, Highlighter, MousePointer, Type, Square,
  Circle, Triangle, Minus, ArrowRight, Star, Heart, Hexagon,
  Image as ImageIcon, Download, Settings2, ZoomIn, ZoomOut,
  Maximize, Minimize, Plus, ChevronLeft, ChevronRight, Layers,
  Grid3X3, FileText, Sparkles, BookOpen, PenTool, Keyboard, RotateCcw,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Palette, Group, GripHorizontal, X, Save
} from 'lucide-react';
/* Unused imports removed */
import { useAuth } from '../../contexts/AuthContext';
/* useNavigate removed */
import HandwritingConverter from './HandwritingConverter';
import AdaptiveQuiz from './AdaptiveQuiz';
import { saveCanvasNoteHybrid, updateCanvasNoteHybrid } from '../../lib/db';
import { compressImage } from '../../utils/compression';

// Types
interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  type: 'pen' | 'highlighter';
  points: Point[];
  color: string;
  size: number;
}

interface Shape {
  id: string;
  type: string;
  start: Point;
  end: Point;
  color: string;
  size: number;
  filled: boolean;
  // For partial erasure: shape boundary points
  pathPoints?: Point[];
  isRasterized?: boolean;
}

interface TextElement {
  id: string;
  type: 'text';
  position: Point;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  alignment: 'left' | 'center' | 'right';
  width: number;
  height: number;
}

interface ImageElement {
  id: string;
  type: 'image';
  position: Point;
  width: number;
  height: number;
  src: string;
  imageData: HTMLImageElement;
}

type DrawingElement = Stroke | Shape | TextElement | ImageElement;

// Subjects list
const subjects = [
  { code: 'MATH', name: 'Mathematics', color: '#3B82F6' },
  { code: 'SCI', name: 'Science', color: '#10B981' },
  { code: 'ENG', name: 'English', color: '#8B5CF6' },
  { code: 'HIST', name: 'History', color: '#F59E0B' },
  { code: 'GEO', name: 'Geography', color: '#06B6D4' },
  { code: 'COMP', name: 'Computer Science', color: '#EC4899' },
  { code: 'ART', name: 'Art', color: '#EF4444' },
  { code: 'MUSIC', name: 'Music', color: '#6366F1' }
];

// Color palette
const colorPalette = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#EF4444', '#F97316', '#F59E0B', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#D946EF', '#EC4899', '#F43F5E'
];

// Brush sizes
const brushSizes = [1, 2, 4, 6, 8, 12, 16, 24];

// Font families
const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Comic Sans', value: 'Comic Sans MS, cursive' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Trebuchet', value: 'Trebuchet MS, sans-serif' },
];

// Font sizes
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export default function WritingCanvas() {
  /* Unused variables/imports removed */
  const { user, setClassSubject } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for scrollable container
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'select' | 'shape' | 'text' | 'move'>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);
  const [eraserSize, setEraserSize] = useState(20);

  const [shapeType, setShapeType] = useState<'rectangle' | 'circle' | 'triangle' | 'line' | 'arrow' | 'star' | 'heart' | 'hexagon'>('rectangle');
  const [shapeFilled, setShapeFilled] = useState(false);

  // Canvas state
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [historyStack, setHistoryStack] = useState<DrawingElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [shapePreview, setShapePreview] = useState<Point | null>(null);

  // Text input ref for explicit focusing
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // UI state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBrushSettings, setShowBrushSettings] = useState(false);
  const [showEraserSettings, setShowEraserSettings] = useState(false);
  const [showShapePanel, setShowShapePanel] = useState(false);
  const [showClassSelector, setShowClassSelector] = useState(false);
  const [showSubjectSelector, setShowSubjectSelector] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Fixed page size (Wide notebook: 1800 x 1170 pixels for comfortable horizontal writing)
  const PAGE_WIDTH = 1800;
  const PAGE_HEIGHT = 1170;

  // Paper settings
  const [paperType, setPaperType] = useState<'blank' | 'ruled' | 'grid' | 'dotted'>('ruled');
  const [showMargin, setShowMargin] = useState(true);

  // Pages
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState<{ [key: number]: DrawingElement[] }>({ 1: [] });
  const [totalPages, setTotalPages] = useState(1);
  const [pageThumbnails, setPageThumbnails] = useState<{ [key: number]: string }>({});

  // Text input
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);

  // Text formatting state (MS Word-like)
  const [textFontFamily, setTextFontFamily] = useState('Arial, sans-serif');
  const [textFontSize, setTextFontSize] = useState(20);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textAlignment, setTextAlignment] = useState<'left' | 'center' | 'right'>('left');

  // Full-page Typing State (MS Word mode)
  const [inputMode, setInputMode] = useState<'write' | 'type'>('write');
  const typingAreaRef = useRef<HTMLDivElement>(null);
  const typedHtmlRef = useRef<string>('');
  const [typedText, setTypedText] = useState('');
  const [typedHtmlForDisplay, setTypedHtmlForDisplay] = useState('');
  const [typingFontFamily, setTypingFontFamily] = useState('Arial, sans-serif');
  const [typingFontSize, setTypingFontSize] = useState(20);
  const [typingAlignment, setTypingAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [typingColor, setTypingColor] = useState('#000000');

  // Multi-selection / Grouping state
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const [isGroupSelecting, setIsGroupSelecting] = useState(false);
  const [groupSelectStart, setGroupSelectStart] = useState<Point | null>(null);
  const [groupSelectEnd, setGroupSelectEnd] = useState<Point | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Features
  const [showHandwritingConverter, setShowHandwritingConverter] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);

  // Load requested note/exam data
  useEffect(() => {
    const loadNote = localStorage.getItem('load_note_in_canvas');
    if (loadNote) {
      try {
        const note = JSON.parse(loadNote);
        if (note.id) setCurrentNoteId(note.id);
        if (note.elements) setElements(note.elements);
        if (note.pages) setPages(note.pages);
        if (note.totalPages) setTotalPages(note.totalPages);
        if (note.currentPage) setCurrentPage(note.currentPage);
        if (note.title) setNoteTitle(note.title);
        // Clean up
        localStorage.removeItem('load_note_in_canvas');
      } catch (e) {
        console.error('Failed to load note data', e);
      }
    }
    const createNew = localStorage.getItem('create_new_note');
    if (createNew) {
      // Setup fresh state if needed
      localStorage.removeItem('create_new_note');
    }
  }, []);
  const [showAdaptiveQuiz, setShowAdaptiveQuiz] = useState(false);

  // Virtual keyboard state
  const [showFloatingKeyboard, setShowFloatingKeyboard] = useState(false);
  const [keyboardPosition, setKeyboardPosition] = useState({ x: 100, y: 100 });
  const [keyboardSize, setKeyboardSize] = useState({ width: 750, height: 320 });
  const [isDraggingKeyboard, setIsDraggingKeyboard] = useState(false);
  const [isResizingKeyboard, setIsResizingKeyboard] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [keyboardLayoutType, setKeyboardLayoutType] = useState<'basic' | 'math'>('basic');
  const keyboardDragStartRef = useRef({ x: 0, y: 0 });
  const keyboardResizeStartRef = useRef({ width: 0, height: 0, x: 0, y: 0 });

  // Scroll State for Header Slider
  const [headerScrollLeft, setHeaderScrollLeft] = useState(0);
  const [headerScrollMax, setHeaderScrollMax] = useState(1);

  // Update scroll bounds on zoom/resize
  useEffect(() => {
    const updateScrollBounds = () => {
      if (scrollContainerRef.current) {
        const { scrollWidth, clientWidth, scrollLeft } = scrollContainerRef.current;
        setHeaderScrollMax(Math.max(1, scrollWidth - clientWidth));
        setHeaderScrollLeft(scrollLeft);
      }
    };
    updateScrollBounds();
    window.addEventListener('resize', updateScrollBounds);

    // Also attach to the element's scroll event manually if needed, 
    // but the onScroll prop handles the active scrolling.

    return () => window.removeEventListener('resize', updateScrollBounds);
  }, [zoomLevel, PAGE_WIDTH, PAGE_HEIGHT]);

  const switchMode = (newMode: 'write' | 'type') => {
    if (newMode === inputMode) return;
    if (inputMode === 'type' && typingAreaRef.current) {
      typedHtmlRef.current = typingAreaRef.current.innerHTML;
      setTypedHtmlForDisplay(typedHtmlRef.current);
      setTypedText(typingAreaRef.current.innerText || '');
    }
    setInputMode(newMode);
    if (newMode === 'type') {
      setTool('pen');
      setTimeout(() => {
        if (typingAreaRef.current) {
          if (typedHtmlRef.current) {
            typingAreaRef.current.innerHTML = typedHtmlRef.current;
          } else if (typedText) {
            typingAreaRef.current.innerText = typedText;
            typedHtmlRef.current = typingAreaRef.current.innerHTML;
          }
          typingAreaRef.current.focus();
          const sel = window.getSelection();
          if (sel && typingAreaRef.current.childNodes.length > 0) {
            sel.selectAllChildren(typingAreaRef.current);
            sel.collapseToEnd();
          }
        }
      }, 50);
    }
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (typingAreaRef.current) {
      typingAreaRef.current.focus();
      typedHtmlRef.current = typingAreaRef.current.innerHTML;
      setTypedHtmlForDisplay(typedHtmlRef.current);
    }
  };

  // Keyboard Drags
  const handleKeyboardDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingKeyboard(true);
    keyboardDragStartRef.current = { x: e.clientX - keyboardPosition.x, y: e.clientY - keyboardPosition.y };
  };

  const handleKeyboardDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingKeyboard) return;
    setKeyboardPosition({
      x: Math.max(0, e.clientX - keyboardDragStartRef.current.x),
      y: Math.max(0, e.clientY - keyboardDragStartRef.current.y)
    });
  }, [isDraggingKeyboard]);

  const handleKeyboardDragEnd = useCallback(() => setIsDraggingKeyboard(false), []);

  const handleKeyboardResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsResizingKeyboard(true);
    keyboardResizeStartRef.current = { width: keyboardSize.width, height: keyboardSize.height, x: e.clientX, y: e.clientY };
  };

  const handleKeyboardResize = useCallback((e: MouseEvent) => {
    if (!isResizingKeyboard) return;
    setKeyboardSize({
      width: Math.max(500, Math.min(1200, keyboardResizeStartRef.current.width + (e.clientX - keyboardResizeStartRef.current.x))),
      height: Math.max(250, Math.min(600, keyboardResizeStartRef.current.height + (e.clientY - keyboardResizeStartRef.current.y)))
    });
  }, [isResizingKeyboard]);

  const handleKeyboardResizeEnd = useCallback(() => setIsResizingKeyboard(false), []);

  useEffect(() => {
    if (isDraggingKeyboard) {
      window.addEventListener('mousemove', handleKeyboardDrag);
      window.addEventListener('mouseup', handleKeyboardDragEnd);
    }
    return () => { window.removeEventListener('mousemove', handleKeyboardDrag); window.removeEventListener('mouseup', handleKeyboardDragEnd); };
  }, [isDraggingKeyboard, handleKeyboardDrag, handleKeyboardDragEnd]);

  useEffect(() => {
    if (isResizingKeyboard) {
      window.addEventListener('mousemove', handleKeyboardResize);
      window.addEventListener('mouseup', handleKeyboardResizeEnd);
    }
    return () => { window.removeEventListener('mousemove', handleKeyboardResize); window.removeEventListener('mouseup', handleKeyboardResizeEnd); };
  }, [isResizingKeyboard, handleKeyboardResize, handleKeyboardResizeEnd]);

  const handleVirtualKeyPress = (key: string) => {
    if (key === '⇧') { setIsShiftPressed(!isShiftPressed); return; }
    if (key === 'Math' || key === 'ABC') { setKeyboardLayoutType(prev => prev === 'basic' ? 'math' : 'basic'); return; }

    if (typingAreaRef.current) typingAreaRef.current.focus();

    if (key === '⌫') {
      document.execCommand('delete', false, undefined);
      return;
    }
    if (key === '↵') {
      document.execCommand('insertLineBreak', false, undefined);
      return;
    }

    let charToInsert = key;
    if (key === 'Space') charToInsert = ' ';
    else if (isShiftPressed && key.length === 1 && /[a-z]/.test(key)) charToInsert = key.toUpperCase();

    document.execCommand('insertText', false, charToInsert);

    if (isShiftPressed) setIsShiftPressed(false);
  };

  const KEYBOARD_LAYOUTS = {
    basic: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '↵'],
      ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.'],
      ['Math', 'Space']
    ],
    math: [
      ['+', '-', '×', '÷', '=', '≠', '<', '>', '±', '√', '⌫'],
      ['π', 'θ', 'Δ', 'Σ', '∫', '∞', '^', '°', 'μ', 'λ'],
      ['(', ')', '[', ']', '{', '}', 'α', 'β', 'γ', '↵'],
      ['Ω', 'sin', 'cos', 'tan', 'log', 'ln', 'e', '!', '%', 'ABC'],
      ['Space']
    ]
  };

  const getKeyDimensions = () => {
    const baseWidth = keyboardSize.width / 12;
    const baseHeight = keyboardSize.height / 6;
    return { width: Math.max(40, baseWidth), height: Math.max(40, baseHeight), fontSize: Math.max(14, Math.min(24, keyboardSize.width / 35)) };
  };
  const currentKeyDimensions = getKeyDimensions();

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      setHeaderScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  };

  // Selection and Move state
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  // Current class and subject
  const currentClass = (user as any)?.current_class || 1;
  const currentSubject = subjects.find(s => s.code === (user as any)?.current_subject) || subjects[0];

  // Initialize canvas with fixed page size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT;
    redrawCanvas();
  }, []);

  // Redraw canvas when elements change
  useEffect(() => {
    redrawCanvas();
  }, [elements, paperType, showMargin, zoomLevel, shapePreview]);

  // Draw paper background
  const drawPaper = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    if (paperType === 'ruled') {
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      // Increased line spacing from 30 (~1cm) to 45 (~1.5cm)
      for (let y = 45; y < height; y += 45) {
        ctx.beginPath();
        ctx.moveTo(showMargin ? 80 : 0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (paperType === 'grid') {
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 0.5;
      const gridSize = 20;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (paperType === 'dotted') {
      ctx.fillStyle = '#D1D5DB';
      const dotSize = 20;
      for (let x = dotSize; x < width; x += dotSize) {
        for (let y = dotSize; y < height; y += dotSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw margin line
    if (showMargin && (paperType === 'ruled' || paperType === 'blank')) {
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(80, 0);
      ctx.lineTo(80, height);
      ctx.stroke();
    }
  }, [paperType, showMargin]);

  // Draw a stroke
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.size;

    if (stroke.type === 'highlighter') {
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = stroke.size * 3;
    }

    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  // Draw a shape
  const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { start, end, type, filled } = shape;
    const width = end.x - start.x;
    const height = end.y - start.y;

    ctx.beginPath();

    switch (type) {
      case 'rectangle':
        if (filled) {
          ctx.fillRect(start.x, start.y, width, height);
        } else {
          ctx.strokeRect(start.x, start.y, width, height);
        }
        break;

      case 'circle':
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        const centerX = start.x + width / 2;
        const centerY = start.y + height / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        filled ? ctx.fill() : ctx.stroke();
        break;

      case 'triangle':
        ctx.moveTo(start.x + width / 2, start.y);
        ctx.lineTo(start.x + width, start.y + height);
        ctx.lineTo(start.x, start.y + height);
        ctx.closePath();
        filled ? ctx.fill() : ctx.stroke();
        break;

      case 'line':
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        break;

      case 'arrow':
        const angle = Math.atan2(height, width);
        const headLen = 15;
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        filled ? ctx.fill() : ctx.stroke();
        break;

      case 'star':
        const outerRadius = Math.min(Math.abs(width), Math.abs(height)) / 2;
        const innerRadius = outerRadius / 2;
        const cx = start.x + width / 2;
        const cy = start.y + height / 2;
        const spikes = 5;

        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        const step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
          x = cx + Math.cos(rot) * outerRadius;
          y = cy + Math.sin(rot) * outerRadius;
          ctx.lineTo(x, y);
          rot += step;

          x = cx + Math.cos(rot) * innerRadius;
          y = cy + Math.sin(rot) * innerRadius;
          ctx.lineTo(x, y);
          rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        filled ? ctx.fill() : ctx.stroke();
        break;

      case 'heart':
        const hx = start.x + width / 2;
        const hy = start.y + height / 3;
        const size = Math.min(Math.abs(width), Math.abs(height)) / 2;
        ctx.moveTo(hx, hy + size / 4);
        ctx.bezierCurveTo(hx, hy, hx - size, hy, hx - size, hy + size / 2);
        ctx.bezierCurveTo(hx - size, hy + size, hx, hy + size * 1.5, hx, hy + size * 1.5);
        ctx.bezierCurveTo(hx, hy + size * 1.5, hx + size, hy + size, hx + size, hy + size / 2);
        ctx.bezierCurveTo(hx + size, hy, hx, hy, hx, hy + size / 4);
        filled ? ctx.fill() : ctx.stroke();
        break;

      case 'hexagon':
        const hexR = Math.min(Math.abs(width), Math.abs(height)) / 2;
        const hexCx = start.x + width / 2;
        const hexCy = start.y + height / 2;
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 - Math.PI / 6;
          if (i === 0) ctx.moveTo(hexCx + hexR * Math.cos(a), hexCy + hexR * Math.sin(a));
          else ctx.lineTo(hexCx + hexR * Math.cos(a), hexCy + hexR * Math.sin(a));
        }
        ctx.closePath();
        filled ? ctx.fill() : ctx.stroke();
        break;
    }

    ctx.restore();
  }, []);

  // Draw text
  const drawText = useCallback((ctx: CanvasRenderingContext2D, textEl: TextElement) => {
    ctx.save();
    const fontStyle = textEl.isItalic ? 'italic ' : '';
    const fontWeight = textEl.isBold ? 'bold ' : '';
    ctx.font = `${fontStyle}${fontWeight}${textEl.fontSize}px ${textEl.fontFamily || 'Arial, sans-serif'}`;
    ctx.fillStyle = textEl.color;
    ctx.textBaseline = 'top';

    // Word-wrap text within width
    const maxWidth = textEl.width || 300;
    const lineHeight = textEl.fontSize * 1.3;
    const words = textEl.text.split(' ');
    let line = '';
    let y = textEl.position.y;
    const x = textEl.alignment === 'center' ? textEl.position.x + maxWidth / 2
      : textEl.alignment === 'right' ? textEl.position.x + maxWidth
        : textEl.position.x;
    ctx.textAlign = textEl.alignment || 'left';

    for (const word of words) {
      const testLine = line ? line + ' ' + word : word;
      const measured = ctx.measureText(testLine).width;
      if (measured > maxWidth && line) {
        ctx.fillText(line, x, y);
        if (textEl.isUnderline) {
          const w = ctx.measureText(line).width;
          const ux = textEl.alignment === 'center' ? x - w / 2 : textEl.alignment === 'right' ? x - w : x;
          ctx.fillRect(ux, y + textEl.fontSize + 2, w, 1);
        }
        line = word;
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, y);
      if (textEl.isUnderline) {
        const w = ctx.measureText(line).width;
        const ux = textEl.alignment === 'center' ? x - w / 2 : textEl.alignment === 'right' ? x - w : x;
        ctx.fillRect(ux, y + textEl.fontSize + 2, w, 1);
      }
    }

    ctx.restore();
  }, []);

  // Draw image
  const drawImage = useCallback((ctx: CanvasRenderingContext2D, imgEl: ImageElement) => {
    ctx.drawImage(imgEl.imageData, imgEl.position.x, imgEl.position.y, imgEl.width, imgEl.height);
  }, []);

  // Redraw entire canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI / Retina Display Support
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = PAGE_WIDTH * dpr;
    const targetHeight = PAGE_HEIGHT * dpr;

    // Resize canvas if dimensions don't match (clears canvas)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw paper at logical full canvas size
    drawPaper(ctx, PAGE_WIDTH, PAGE_HEIGHT);

    // Draw all elements
    elements.forEach(el => {
      if ('points' in el) {
        drawStroke(ctx, el as Stroke);
      } else if ('start' in el && 'end' in el) {
        drawShape(ctx, el as Shape);
      } else if ('text' in el) {
        drawText(ctx, el as TextElement);
      } else if ('imageData' in el) {
        drawImage(ctx, el as ImageElement);
      }
    });

    // Draw shape preview
    if (shapeStart && shapePreview && tool === 'shape') {
      drawShape(ctx, {
        id: 'preview',
        type: shapeType,
        start: shapeStart,
        end: shapePreview,
        color: color,
        size: brushSize,
        filled: shapeFilled,
      } as Shape);
    }

    ctx.restore();
  }, [elements, shapePreview, shapeStart, tool, shapeType, color, brushSize, shapeFilled, PAGE_WIDTH, PAGE_HEIGHT, drawPaper, drawStroke, drawShape, drawText, drawImage]);


  // Get mouse position relative to canvas
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoomLevel,
      y: (e.clientY - rect.top) / zoomLevel
    };
  };

  // Get touch position relative to canvas
  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: (touch.clientX - rect.left) / zoomLevel,
      y: (touch.clientY - rect.top) / zoomLevel
    };
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling
    const pos = getTouchPos(e);
    setIsDrawing(true);

    if (tool === 'pen' || tool === 'highlighter') {
      setCurrentStroke([pos]);
    } else if (tool === 'eraser') {
      eraseAtPosition(pos);
    } else if (tool === 'shape') {
      setShapeStart(pos);
      setShapePreview(pos);
    } else if (tool === 'text') {
      // If there's an active text input, commit it first
      if (showTextInput && textInput.trim()) {
        handleTextSubmit();
      }

      // Allow React to commit the previous state if needed, then set new
      requestAnimationFrame(() => {
        setTextInput('');
        setTextPosition(pos);
        setShowTextInput(true);
      });
    } else if (tool === 'select' || tool === 'move') {
      if (isGroupSelecting) {
        // Start group selection rectangle
        setGroupSelectStart(pos);
        setGroupSelectEnd(pos);
      } else {
        const element = findElementAtPosition(pos);
        if (element) {
          // If element is already in multi-selection, drag all
          if (selectedElementIds.has(element.id)) {
            setIsDragging(true);
            setDragOffset(pos);
          } else {
            setSelectedElementId(element.id);
            setSelectedElementIds(new Set([element.id]));
            setIsDragging(true);
            setDragOffset(pos);
          }
        } else {
          setSelectedElementId(null);
          setSelectedElementIds(new Set());
          // Long press to start group select
          longPressTimerRef.current = setTimeout(() => {
            setIsGroupSelecting(true);
            setGroupSelectStart(pos);
            setGroupSelectEnd(pos);
            if (navigator.vibrate) navigator.vibrate(50);
          }, 500);
        }
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getTouchPos(e);

    // Cancel long press if touch moves
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (tool === 'pen' || tool === 'highlighter') {
      setCurrentStroke(prev => [...prev, pos]);

      // Draw current stroke immediately
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentStroke.length > 0) {
        ctx.save();
        // Apply High DPI scaling
        const dpr = window.devicePixelRatio || 1;
        ctx.scale(dpr, dpr);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = color;

        if (tool === 'highlighter') {
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = brushSize * 3;
        }

        ctx.beginPath();
        ctx.moveTo(currentStroke[currentStroke.length - 1].x, currentStroke[currentStroke.length - 1].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      }
    } else if (tool === 'eraser') {
      eraseAtPosition(pos);
    } else if (tool === 'shape' && shapeStart) {
      setShapePreview(pos);
    } else if ((tool === 'select' || tool === 'move') && isGroupSelecting && groupSelectStart) {
      // Update group selection rectangle
      setGroupSelectEnd(pos);
    } else if ((tool === 'select' || tool === 'move') && isDragging) {
      const dx = pos.x - dragOffset.x;
      const dy = pos.y - dragOffset.y;
      if (selectedElementIds.size > 1) {
        moveMultipleElements(selectedElementIds, dx, dy);
      } else if (selectedElementId) {
        moveElement(selectedElementId, dx, dy);
      }
      setDragOffset(pos);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handleMouseUp(); // Reuse mouse up logic
  };



  // Save to history
  const saveToHistory = (newElements: DrawingElement[]) => {
    const newHistory = historyStack.slice(0, historyIndex + 1);
    newHistory.push([...newElements]);
    setHistoryStack(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Find element at position (for selection/move)
  const findElementAtPosition = (pos: Point): DrawingElement | null => {
    // Check in reverse order (top elements first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];

      if ('points' in el) {
        const stroke = el as Stroke;
        if (stroke.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 10)) {
          return el;
        }
      } else if ('start' in el && 'end' in el) {
        const shape = el as Shape;
        const minX = Math.min(shape.start.x, shape.end.x);
        const maxX = Math.max(shape.start.x, shape.end.x);
        const minY = Math.min(shape.start.y, shape.end.y);
        const maxY = Math.max(shape.start.y, shape.end.y);
        if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
          return el;
        }
      } else if ('text' in el) {
        const textEl = el as TextElement;
        if (pos.x >= textEl.position.x && pos.x <= textEl.position.x + 200 &&
          pos.y >= textEl.position.y - 20 && pos.y <= textEl.position.y + 10) {
          return el;
        }
      } else if ('imageData' in el) {
        const imgEl = el as ImageElement;
        if (pos.x >= imgEl.position.x && pos.x <= imgEl.position.x + imgEl.width &&
          pos.y >= imgEl.position.y && pos.y <= imgEl.position.y + imgEl.height) {
          return el;
        }
      }
    }
    return null;
  };

  // Helper: Generate path points for a shape (for partial erasure)
  const getShapePathPoints = (shape: Shape): Point[] => {
    const { start, end, type } = shape;
    const width = end.x - start.x;
    const height = end.y - start.y;
    const points: Point[] = [];
    const step = 3; // Pixel spacing between points

    switch (type) {
      case 'rectangle':
        // Top edge
        for (let x = start.x; x <= start.x + width; x += step) points.push({ x, y: start.y });
        // Right edge
        for (let y = start.y; y <= start.y + height; y += step) points.push({ x: start.x + width, y });
        // Bottom edge
        for (let x = start.x + width; x >= start.x; x -= step) points.push({ x, y: start.y + height });
        // Left edge
        for (let y = start.y + height; y >= start.y; y -= step) points.push({ x: start.x, y });
        break;

      case 'circle':
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        const centerX = start.x + width / 2;
        const centerY = start.y + height / 2;
        const circumference = Math.PI * 2 * Math.max(radiusX, radiusY);
        const numPoints = Math.max(36, Math.floor(circumference / step));
        for (let i = 0; i <= numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          points.push({
            x: centerX + radiusX * Math.cos(angle),
            y: centerY + radiusY * Math.sin(angle)
          });
        }
        break;

      case 'triangle':
        const p1 = { x: start.x + width / 2, y: start.y };
        const p2 = { x: start.x + width, y: start.y + height };
        const p3 = { x: start.x, y: start.y + height };
        // Edge 1-2
        const dist12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        for (let t = 0; t <= 1; t += step / dist12) {
          points.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
        }
        // Edge 2-3
        const dist23 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
        for (let t = 0; t <= 1; t += step / dist23) {
          points.push({ x: p2.x + t * (p3.x - p2.x), y: p2.y + t * (p3.y - p2.y) });
        }
        // Edge 3-1
        const dist31 = Math.hypot(p1.x - p3.x, p1.y - p3.y);
        for (let t = 0; t <= 1; t += step / dist31) {
          points.push({ x: p3.x + t * (p1.x - p3.x), y: p3.y + t * (p1.y - p3.y) });
        }
        break;

      case 'line':
      case 'arrow':
        const lineLength = Math.hypot(width, height);
        for (let t = 0; t <= 1; t += step / lineLength) {
          points.push({ x: start.x + t * width, y: start.y + t * height });
        }
        if (type === 'arrow') {
          const angle = Math.atan2(height, width);
          const headLen = 15;
          // Arrow head lines
          for (let t = 0; t <= 1; t += 0.1) {
            points.push({
              x: end.x - t * headLen * Math.cos(angle - Math.PI / 6),
              y: end.y - t * headLen * Math.sin(angle - Math.PI / 6)
            });
            points.push({
              x: end.x - t * headLen * Math.cos(angle + Math.PI / 6),
              y: end.y - t * headLen * Math.sin(angle + Math.PI / 6)
            });
          }
        }
        break;

      case 'star':
        const starPointsCount = 5;
        const outerR = Math.min(Math.abs(width), Math.abs(height)) / 2;
        const innerR = outerR / 2;
        const cx = start.x + width / 2;
        const cy = start.y + height / 2;
        const starVertices: Point[] = [];
        for (let i = 0; i < starPointsCount * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / starPointsCount - Math.PI / 2;
          starVertices.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        for (let i = 0; i < starVertices.length; i++) {
          const p1Star = starVertices[i];
          const p2Star = starVertices[(i + 1) % starVertices.length];
          const distStar = Math.hypot(p2Star.x - p1Star.x, p2Star.y - p1Star.y);
          for (let t = 0; t <= 1; t += step / distStar) {
            points.push({ x: p1Star.x + t * (p2Star.x - p1Star.x), y: p1Star.y + t * (p2Star.y - p1Star.y) });
          }
        }
        break;

      case 'hexagon':
        const hexR = Math.min(Math.abs(width), Math.abs(height)) / 2;
        const hexCx = start.x + width / 2;
        const hexCy = start.y + height / 2;
        const hexVertices: Point[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 - Math.PI / 6;
          hexVertices.push({ x: hexCx + hexR * Math.cos(a), y: hexCy + hexR * Math.sin(a) });
        }
        for (let i = 0; i < hexVertices.length; i++) {
          const p1Hex = hexVertices[i];
          const p2Hex = hexVertices[(i + 1) % hexVertices.length];
          const distHex = Math.hypot(p2Hex.x - p1Hex.x, p2Hex.y - p1Hex.y);
          for (let t = 0; t <= 1; t += step / distHex) {
            points.push({ x: p1Hex.x + t * (p2Hex.x - p1Hex.x), y: p1Hex.y + t * (p2Hex.y - p1Hex.y) });
          }
        }
        break;

      default:
        // For unsupported shapes, just add corners
        points.push(start, end);
    }

    return points;
  };

  // Eraser logic - split strokes at erased points, partial shape erasure
  const eraseAtPosition = (pos: Point) => {
    const eraserRadius = eraserSize / 2;
    let modified = false;
    const newElements: DrawingElement[] = [];

    elements.forEach(el => {
      if ('points' in el) {
        const stroke = el as Stroke;
        // Split stroke at erased points
        let currentSegment: Point[] = [];
        let segmentCreated = false;

        stroke.points.forEach((p) => {
          const distance = Math.hypot(p.x - pos.x, p.y - pos.y);

          if (distance >= eraserRadius) {
            // Point is outside eraser - keep it
            currentSegment.push(p);
          } else {
            // Point is inside eraser - break the stroke here
            modified = true;
            if (currentSegment.length > 1) {
              // Save the current segment as a new stroke
              newElements.push({
                ...stroke,
                id: generateId(),
                points: [...currentSegment]
              });
              segmentCreated = true;
            }
            currentSegment = [];
          }
        });

        // Add remaining segment if any
        if (currentSegment.length > 1) {
          if (segmentCreated || modified) {
            newElements.push({
              ...stroke,
              id: generateId(),
              points: currentSegment
            });
          } else {
            // Original stroke unchanged
            newElements.push(stroke);
          }
        } else if (!modified && currentSegment.length <= 1 && stroke.points.length > 0) {
          // Keep original if not modified
          newElements.push(stroke);
        }
      } else if ('start' in el && 'end' in el) {
        const shape = el as Shape;

        // Get or generate path points for the shape
        let pathPoints = shape.pathPoints;
        if (!pathPoints || pathPoints.length === 0) {
          pathPoints = getShapePathPoints(shape);
        }

        // Check if eraser touches any point on the shape
        const touchedIndices: Set<number> = new Set();
        pathPoints.forEach((p, idx) => {
          const distance = Math.hypot(p.x - pos.x, p.y - pos.y);
          if (distance < eraserRadius) {
            touchedIndices.add(idx);
          }
        });

        if (touchedIndices.size === 0) {
          // Shape not touched - keep it as is
          newElements.push(el);
        } else if (touchedIndices.size >= pathPoints.length * 0.9) {
          // Almost all points erased - remove the shape
          modified = true;
        } else {
          // Partial erasure - convert shape to strokes representing remaining segments
          modified = true;

          // Create segments from non-erased points
          let currentSegment: Point[] = [];
          const segments: Point[][] = [];

          pathPoints.forEach((p, idx) => {
            if (!touchedIndices.has(idx)) {
              currentSegment.push(p);
            } else {
              if (currentSegment.length > 1) {
                segments.push([...currentSegment]);
              }
              currentSegment = [];
            }
          });

          // Handle last segment
          if (currentSegment.length > 1) {
            segments.push(currentSegment);
          }

          // Convert segments to strokes
          segments.forEach(seg => {
            if (seg.length > 1) {
              newElements.push({
                id: generateId(),
                type: 'pen',
                points: seg,
                color: shape.color,
                size: shape.size
              } as Stroke);
            }
          });
        }
      } else if ('text' in el) {
        const textEl = el as TextElement;
        const distance = Math.hypot(pos.x - textEl.position.x - 50, pos.y - textEl.position.y);
        if (distance > eraserRadius + 30) {
          newElements.push(el);
        } else {
          modified = true;
        }
      } else {
        newElements.push(el);
      }
    });

    if (modified) {
      setElements(newElements);
    }
  };

  // Move element by offset
  const moveElement = (elementId: string, dx: number, dy: number) => {
    setElements(prev => prev.map(el => {
      if (el.id !== elementId) return el;

      if ('points' in el) {
        const stroke = el as Stroke;
        return {
          ...stroke,
          points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
        };
      }

      if ('start' in el && 'end' in el) {
        const shape = el as Shape;
        return {
          ...shape,
          start: { x: shape.start.x + dx, y: shape.start.y + dy },
          end: { x: shape.end.x + dx, y: shape.end.y + dy }
        };
      }

      if ('text' in el) {
        const textEl = el as TextElement;
        return {
          ...textEl,
          position: { x: textEl.position.x + dx, y: textEl.position.y + dy }
        };
      }

      if ('imageData' in el) {
        const imgEl = el as ImageElement;
        return {
          ...imgEl,
          position: { x: imgEl.position.x + dx, y: imgEl.position.y + dy }
        };
      }

      return el;
    }));
  };

  // Move multiple elements (for group selection)
  const moveMultipleElements = (ids: Set<string>, dx: number, dy: number) => {
    setElements(prev => prev.map(el => {
      if (!ids.has(el.id)) return el;

      if ('points' in el) {
        const stroke = el as Stroke;
        return { ...stroke, points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      }
      if ('start' in el && 'end' in el) {
        const shape = el as Shape;
        return { ...shape, start: { x: shape.start.x + dx, y: shape.start.y + dy }, end: { x: shape.end.x + dx, y: shape.end.y + dy } };
      }
      if ('text' in el) {
        const textEl = el as TextElement;
        return { ...textEl, position: { x: textEl.position.x + dx, y: textEl.position.y + dy } };
      }
      if ('imageData' in el) {
        const imgEl = el as ImageElement;
        return { ...imgEl, position: { x: imgEl.position.x + dx, y: imgEl.position.y + dy } };
      }
      return el;
    }));
  };

  // Find elements within a rectangle (for group selection)
  const findElementsInRect = (start: Point, end: Point): Set<string> => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const foundIds = new Set<string>();

    elements.forEach(el => {
      if ('points' in el) {
        const stroke = el as Stroke;
        if (stroke.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)) { foundIds.add(el.id); }
      } else if ('start' in el && 'end' in el) {
        const shape = el as Shape;
        const sx = Math.min(shape.start.x, shape.end.x);
        const sy = Math.min(shape.start.y, shape.end.y);
        const ex = Math.max(shape.start.x, shape.end.x);
        const ey = Math.max(shape.start.y, shape.end.y);
        if (sx >= minX && ex <= maxX && sy >= minY && ey <= maxY) { foundIds.add(el.id); }
      } else if ('text' in el) {
        const txt = el as TextElement;
        if (txt.position.x >= minX && txt.position.x <= maxX && txt.position.y >= minY && txt.position.y <= maxY) { foundIds.add(el.id); }
      } else if ('imageData' in el) {
        const img = el as ImageElement;
        if (img.position.x >= minX && img.position.x + img.width <= maxX && img.position.y >= minY && img.position.y + img.height <= maxY) { foundIds.add(el.id); }
      }
    });

    return foundIds;
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (tool === 'pen' || tool === 'highlighter') {
      setCurrentStroke([pos]);
    } else if (tool === 'eraser') {
      eraseAtPosition(pos);
    } else if (tool === 'shape') {
      setShapeStart(pos);
      setShapePreview(pos);
    } else if (tool === 'text') {
      setTextPosition(pos);
      setShowTextInput(true);
    } else if (tool === 'select' || tool === 'move') {
      if (isGroupSelecting) {
        // Start group selection rectangle
        setGroupSelectStart(pos);
        setGroupSelectEnd(pos);
      } else {
        const element = findElementAtPosition(pos);
        if (element) {
          // If element is already in multi-selection, drag all
          if (selectedElementIds.has(element.id)) {
            setIsDragging(true);
            setDragOffset(pos);
          } else {
            setSelectedElementId(element.id);
            setSelectedElementIds(new Set([element.id]));
            setIsDragging(true);
            setDragOffset(pos);
          }
        } else {
          setSelectedElementId(null);
          setSelectedElementIds(new Set());
          // Long press to start group select
          longPressTimerRef.current = setTimeout(() => {
            setIsGroupSelecting(true);
            setGroupSelectStart(pos);
            setGroupSelectEnd(pos);
          }, 500);
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);

    // Cancel long press if mouse moves
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (tool === 'pen' || tool === 'highlighter') {
      setCurrentStroke(prev => [...prev, pos]);

      // Draw current stroke immediately
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentStroke.length > 0) {
        ctx.save();

        // Apply High DPI scaling
        const dpr = window.devicePixelRatio || 1;
        ctx.scale(dpr, dpr);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = color;

        if (tool === 'highlighter') {
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = brushSize * 3;
        }

        ctx.beginPath();
        ctx.moveTo(currentStroke[currentStroke.length - 1].x, currentStroke[currentStroke.length - 1].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      }
    } else if (tool === 'eraser') {
      eraseAtPosition(pos);
    } else if (tool === 'shape' && shapeStart) {
      setShapePreview(pos);
    } else if ((tool === 'select' || tool === 'move') && isGroupSelecting && groupSelectStart) {
      // Update group selection rectangle
      setGroupSelectEnd(pos);
    } else if ((tool === 'select' || tool === 'move') && isDragging) {
      const dx = pos.x - dragOffset.x;
      const dy = pos.y - dragOffset.y;
      if (selectedElementIds.size > 1) {
        moveMultipleElements(selectedElementIds, dx, dy);
      } else if (selectedElementId) {
        moveElement(selectedElementId, dx, dy);
      }
      setDragOffset(pos);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Cancel long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if ((tool === 'pen' || tool === 'highlighter') && currentStroke.length > 1) {
      const newStroke: Stroke = {
        id: generateId(),
        type: tool,
        points: currentStroke,
        color: color,
        size: brushSize
      };
      const newElements = [...elements, newStroke];
      setElements(newElements);
      saveToHistory(newElements);
    } else if (tool === 'shape' && shapeStart && shapePreview) {
      const newShape: Shape = {
        id: generateId(),
        type: shapeType,
        start: shapeStart,
        end: shapePreview,
        color: color,
        size: brushSize,
        filled: shapeFilled
      };
      const newElements = [...elements, newShape];
      setElements(newElements);
      saveToHistory(newElements);
    } else if ((tool === 'select' || tool === 'move') && isGroupSelecting && groupSelectStart && groupSelectEnd) {
      // Finalize group selection
      const foundIds = findElementsInRect(groupSelectStart, groupSelectEnd);
      setSelectedElementIds(foundIds);
      if (foundIds.size > 0) {
        setSelectedElementId(Array.from(foundIds)[0]);
      }
      setIsGroupSelecting(false);
      setGroupSelectStart(null);
      setGroupSelectEnd(null);
    } else if ((tool === 'select' || tool === 'move') && isDragging) {
      // Save history after moving element
      saveToHistory(elements);
    }

    setCurrentStroke([]);
    setShapeStart(null);
    setShapePreview(null);
    setIsDragging(false);
    redrawCanvas();
  };

  // Ensure text submission handles active state
  const handleTextSubmit = useCallback(() => {
    if (textInput.trim() && textPosition) {
      const newText: TextElement = {
        id: generateId(),
        type: 'text',
        position: textPosition,
        text: textInput,
        color: color,
        fontSize: textFontSize,
        fontFamily: textFontFamily,
        isBold: textBold,
        isItalic: textItalic,
        isUnderline: textUnderline,
        alignment: textAlignment,
        width: 300,
        height: textFontSize * 2
      };
      const newElements = [...elements, newText];
      setElements(newElements);
      saveToHistory(newElements);
    }
    setTextInput('');
    setTextPosition(null);
    setShowTextInput(false);
  }, [textInput, textPosition, elements, color, textFontSize, textFontFamily, textBold, textItalic, textUnderline, textAlignment]);

  // Submit text if tool changes
  useEffect(() => {
    if (tool !== 'text' && showTextInput) {
      handleTextSubmit();
    }
  }, [tool, showTextInput, handleTextSubmit]);

  // Force focus when popup opens
  useEffect(() => {
    if (showTextInput && textInputRef.current) {
      // Timeout is necessary to wait for the DOM render cycle to complete 
      // rendering the textarea inside the newly visible overlay.
      const id = setTimeout(() => {
        textInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [showTextInput]);

  // Undo/Redo
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(historyStack[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < historyStack.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(historyStack[historyIndex + 1]);
    }
  };

  // Clear canvas
  const clearCanvas = () => {
    setElements([]);
    saveToHistory([]);
  };

  // Save canvas
  const saveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `canvas - page - ${currentPage}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  // State for save as note dialog
  const [showSaveNoteDialog, setShowSaveNoteDialog] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteTags, setNoteTags] = useState('');

  // Save as Class Note
  const handleSave = async (isSaveAs: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isSaveAs) {
      setShowSaveNoteDialog(true);
      return;
    }

    // Direct Save (Overwrite)
    console.log('Overwriting note...');
    const canvasImage = canvas.toDataURL('image/png');
    const finalThumbnails = { ...pageThumbnails, [currentPage]: canvasImage };

    const userId = (user as any)?.id || 'guest';
    const existingNotes = JSON.parse(localStorage.getItem(`class_notes_${userId}`) || '[]');
    
    // Find existing note to preserve some metadata if needed, though we overwrite content
    const existingNoteIndex = existingNotes.findIndex((n: any) => n.id === currentNoteId);
    
    if (existingNoteIndex >= 0) {
      const existingNote = existingNotes[existingNoteIndex];
      const noteData = {
        ...existingNote,
        elements: elements,
        pages: pages,
        totalPages: totalPages,
        currentPage: currentPage,
        canvasData: canvasImage,
        pageThumbnails: finalThumbnails,
        updatedAt: new Date().toISOString()
      };
      existingNotes[existingNoteIndex] = noteData;
      localStorage.setItem(`class_notes_${userId}`, JSON.stringify(existingNotes));

      // Sync to cloud if not a local-only placeholder ID
      if (currentNoteId && !currentNoteId.startsWith('local_')) {
          await updateCanvasNoteHybrid(userId, currentSubject.code, currentNoteId, noteData);
      } else {
          // If it was local only, we can attempt to save it as a new cloud note
          const result = await saveCanvasNoteHybrid(userId, currentSubject.code, noteData);
          if (result.success && result.id) {
              noteData.id = result.id;
              existingNotes[existingNoteIndex] = noteData;
              localStorage.setItem(`class_notes_${userId}`, JSON.stringify(existingNotes));
              setCurrentNoteId(result.id);
          }
      }

      alert('Note saved successfully!');
    } else {
      // Fallback if not found
      setShowSaveNoteDialog(true);
    }
  };

  const saveAsClassNote = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('Saving note as new...');
    
    const canvasImage = canvas.toDataURL('image/png');
    const finalThumbnails = { ...pageThumbnails, [currentPage]: canvasImage };

    try {
      const noteData = {
        title: noteTitle || `${currentSubject.name} Notes - ${new Date().toLocaleDateString()}`,
        subject: currentSubject.code,
        classLevel: currentClass,
        elements: elements,
        pages: pages,
        totalPages: totalPages, 
        currentPage: currentPage,
        canvasData: canvasImage,
        pageThumbnails: finalThumbnails,
        tags: noteTags.split(',').map(t => t.trim()).filter(Boolean),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const userId = (user as any)?.id || 'guest';
      const result = await saveCanvasNoteHybrid(userId, currentSubject.code, noteData);

      if (result.success) {
        const existingNotes = JSON.parse(localStorage.getItem(`class_notes_${userId}`) || '[]');
        const newId = result.id || ('local_' + Date.now());
        localStorage.setItem(`class_notes_${userId}`, JSON.stringify([
          { ...noteData, id: newId, remoteUrl: result.url },
          ...existingNotes
        ]));
        setCurrentNoteId(newId);
        alert('Note saved successfully to Cloud and Local Storage!');
      } else {
        throw new Error('Cloud save failed');
      }

    } catch (error) {
      console.error('Failed to save note:', error);
      alert('Failed to save note to cloud. Saved locally only.');

      const userId = (user as any)?.id || 'guest';
      const noteId = Date.now().toString();
      const newNote = {
        id: noteId,
        title: noteTitle || `${currentSubject.name} Notes - ${new Date().toLocaleDateString()}`,
        subject: currentSubject.code,
        classLevel: currentClass,
        elements: elements,
        pages: pages,
        totalPages: totalPages,
        currentPage: currentPage,
        canvasData: canvasImage,
        pageThumbnails: finalThumbnails,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: noteTags.split(',').map(t => t.trim()).filter(Boolean)
      };
      const existingNotes = JSON.parse(localStorage.getItem(`class_notes_${userId}`) || '[]');
      localStorage.setItem(`class_notes_${userId}`, JSON.stringify([newNote, ...existingNotes]));
      setCurrentNoteId(noteId);
    }

    setShowSaveNoteDialog(false);
    setNoteTitle('');
    setNoteTags('');
  };

  // Import image
  const handleImageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Compress image before adding to canvas
      // Dynamically import compression utility
      // const { compressImage } = await import('../../utils/compression');
      const compressedBlob = await compressImage(file, 1200, 0.8); // Reasonable max width and quality

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const newImage: ImageElement = {
            id: generateId(),
            type: 'image',
            position: { x: 100, y: 100 },
            width: Math.min(img.width, 300),
            height: Math.min(img.height, 300),
            src: event.target?.result as string,
            imageData: img
          };
          const newElements = [...elements, newImage];
          setElements(newElements);
          saveToHistory(newElements);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(compressedBlob);
    } catch (error) {
      console.error('Image compression failed:', error);
      // Fallback to original file
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const newImage: ImageElement = {
            id: generateId(),
            type: 'image',
            position: { x: 100, y: 100 },
            width: Math.min(img.width, 300),
            height: Math.min(img.height, 300),
            src: event.target?.result as string,
            imageData: img
          };
          const newElements = [...elements, newImage];
          setElements(newElements);
          saveToHistory(newElements);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  // Class/Subject change handlers - FIXED
  const handleClassChange = async (classId: number) => {
    const subjectCode = (user as any)?.current_subject || 'MATH';
    await setClassSubject(classId, subjectCode);
    setShowClassSelector(false);
  };

  const handleSubjectChange = async (subjectCode: string) => {
    const classId = (user as any)?.current_class || 1;
    await setClassSubject(classId, subjectCode);
    setShowSubjectSelector(false);
  };

  // Page management
  const addPage = () => {
    const newPageNum = totalPages + 1;
    if (canvasRef.current) {
      setPageThumbnails(prev => ({ ...prev, [currentPage]: canvasRef.current!.toDataURL('image/png') }));
    }
    setPages(prev => ({ ...prev, [currentPage]: elements, [newPageNum]: [] }));
    setTotalPages(newPageNum);
    setCurrentPage(newPageNum);
    setElements([]);
  };

  const goToPage = (pageNum: number) => {
    if (pageNum < 1 || pageNum > totalPages) return;
    if (canvasRef.current) {
      setPageThumbnails(prev => ({ ...prev, [currentPage]: canvasRef.current!.toDataURL('image/png') }));
    }
    setPages(prev => ({ ...prev, [currentPage]: elements }));
    setCurrentPage(pageNum);
    setElements(pages[pageNum] || []);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Zoom controls
  const zoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 2));
  const zoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  const resetZoom = () => setZoomLevel(1);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-slate-100">
      {/* Top Header Bar */}
      <header className="bg-white shadow-sm border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        {/* Left - Logo & Class Info */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
              style={{ backgroundColor: currentSubject.color }}
            >
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-lg leading-tight">Writing Canvas</h1>
              <div className="flex items-center space-x-2 mt-0.5">
                <button
                  onClick={() => setShowClassSelector(true)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 transaction-colors text-slate-600 rounded text-xs font-semibold uppercase tracking-wider cursor-pointer border border-transparent hover:border-slate-300"
                >
                  Class {currentClass}
                </button>
                <span className="text-slate-300">•</span>
                <button
                  onClick={() => setShowSubjectSelector(true)}
                  className="px-2 py-0.5 hover:bg-slate-100 transaction-colors rounded text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer border border-transparent hover:border-slate-300"
                >
                  {currentSubject.name}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center - Page Navigation */}
        {/* Center - Page Navigation */}
        <div className="flex items-center space-x-1 bg-white border border-slate-200 shadow-sm px-2 py-1 rounded-md">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-md disabled:opacity-30 transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="px-2 min-w-[80px] text-center flex flex-col items-center justify-center leading-none">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Page</span>
            <span className="text-sm font-bold text-slate-700">{currentPage} <span className="text-slate-300">/</span> {totalPages}</span>
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-md disabled:opacity-30 transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-200 mx-1"></div>

          <button
            onClick={addPage}
            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md transition-colors"
            title="Add New Page"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Custom Horizontal Scrollbar Controller */}
        <div className="hidden md:flex items-center space-x-2 ml-4 flex-1 max-w-[200px]" title="Horizontal Scroll">
          <div className="relative w-full h-4 flex items-center">
            <input
              type="range"
              min={0}
              max={headerScrollMax}
              value={headerScrollLeft}
              onChange={(e) => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollLeft = Number(e.target.value);
                  setHeaderScrollLeft(Number(e.target.value));
                }
              }}
              className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 hover:bg-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Right - User Menu */}
        <div className="flex items-center space-x-3">
          {/* Quick Actions */}
          <button
            onClick={() => setShowHandwritingConverter(true)}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
            title="AI Handwriting Converter"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowAdaptiveQuiz(true)}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
            title="Practice Quiz"
          >
            <FileText className="w-5 h-5" />
          </button>


        </div>
      </header>

      {/* Main Content Area - Now with horizontal toolbar above canvas */}
      <div className="flex-1 flex flex-col relative overflow-hidden min-h-0">

        {/* Horizontal Drawing Toolbar */}
        <div className="bg-white border-b border-slate-200 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left: Drawing Tools */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Mode Toggle */}
              <div className="flex bg-slate-100 rounded-lg p-1 shadow-inner border border-slate-200 shrink-0 mr-4">
                <button
                  onClick={() => switchMode('write')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${inputMode === 'write' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  <PenTool className="w-4 h-4" /> Write
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1 self-center" />
                <button
                  onClick={() => switchMode('type')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${inputMode === 'type' ? 'bg-purple-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  <Keyboard className="w-4 h-4" /> Type
                </button>
              </div>

              {inputMode === 'write' ? (
                <>
                  {/* Pen */}
                  <button
                    onClick={() => setTool('pen')}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${tool === 'pen' ? 'bg-blue-500 text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}
                    title="Pen"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>

                  {/* Highlighter */}
                  <button
                    onClick={() => setTool('highlighter')}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${tool === 'highlighter' ? 'bg-yellow-400 text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}
                    title="Highlighter"
                  >
                    <Highlighter className="w-5 h-5" />
                  </button>

                  {/* Eraser */}
                  <div className="relative flex items-center gap-1">
                    <button
                      onClick={() => {
                        setTool('eraser');
                        setShowEraserSettings(false);
                      }}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${tool === 'eraser' ? 'bg-red-500 text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}
                      title="Eraser"
                    >
                      <Eraser className="w-5 h-5" />
                    </button>

                    {/* Eraser Settings Toggle */}
                    {tool === 'eraser' && (
                      <button
                        onClick={() => setShowEraserSettings(!showEraserSettings)}
                        className={`w-6 h-10 rounded-lg flex items-center justify-center transition-all ${showEraserSettings ? 'bg-slate-200 text-slate-800' : 'hover:bg-slate-100 text-slate-500'}`}
                        title="Eraser Settings"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    )}

                    {showEraserSettings && tool === 'eraser' && (
                      <div className="absolute top-full mt-2 left-0 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Eraser Size</h4>
                        <div className="mb-4">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            step="5"
                            value={eraserSize}
                            onChange={(e) => setEraserSize(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-slate-500 mt-2">
                            <span>Small</span>
                            <span className="font-medium text-slate-700">{eraserSize}px</span>
                            <span>Large</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowEraserSettings(false)}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Save Size
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="w-px h-8 bg-slate-200 mx-1"></div>

                  {/* Shapes */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setTool('shape');
                        setShowShapePanel(!showShapePanel);
                      }}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${tool === 'shape' ? 'bg-purple-500 text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}
                      title="Shapes"
                    >
                      <Square className="w-5 h-5" />
                    </button>
                    {showShapePanel && (
                      <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50">
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Select Shape</h4>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { type: 'rectangle', icon: <Square className="w-5 h-5" /> },
                            { type: 'circle', icon: <Circle className="w-5 h-5" /> },
                            { type: 'triangle', icon: <Triangle className="w-5 h-5" /> },
                            { type: 'line', icon: <Minus className="w-5 h-5" /> },
                            { type: 'arrow', icon: <ArrowRight className="w-5 h-5" /> },
                            { type: 'star', icon: <Star className="w-5 h-5" /> },
                            { type: 'heart', icon: <Heart className="w-5 h-5" /> },
                            { type: 'hexagon', icon: <Hexagon className="w-5 h-5" /> },
                          ].map(shape => (
                            <button
                              key={shape.type}
                              onClick={() => setShapeType(shape.type as any)}
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${shapeType === shape.type ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {shape.icon}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center mt-3">
                          <label className="flex items-center text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={shapeFilled}
                              onChange={(e) => setShapeFilled(e.target.checked)}
                              className="mr-2"
                            />
                            Filled Shape
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Free Text Type - Enhanced Button */}
                  <button
                    onClick={() => {
                      setTool('text');
                    }}
                    className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 border-2 ${tool === 'text'
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-200 border-emerald-300 scale-110'
                      : 'bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-600 border-emerald-200 hover:border-emerald-300 hover:scale-105'
                      }`}
                    title="Free Text Type — Click anywhere on canvas to place text"
                  >
                    <Type className="w-6 h-6" />
                    {tool === 'text' && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse border border-white" />
                    )}
                  </button>

                  {/* Select & Move */}
                  <button
                    onClick={() => {
                      setTool('select');
                      setSelectedElementIds(new Set());
                      setSelectedElementId(null);
                    }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tool === 'select'
                      ? 'bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-200'
                      : 'hover:bg-slate-100 text-slate-600'
                      }`}
                    title="Select & Move elements"
                  >
                    <MousePointer className="w-5 h-5" />
                  </button>

                  {/* Group Select */}
                  <button
                    onClick={() => {
                      setTool('select');
                      setIsGroupSelecting(true);
                    }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tool === 'select' && isGroupSelecting
                      ? 'bg-gradient-to-br from-violet-400 to-purple-500 text-white shadow-lg shadow-violet-200'
                      : 'hover:bg-slate-100 text-slate-600'
                      }`}
                    title="Group Select — Drag to select multiple elements"
                  >
                    <Group className="w-5 h-5" />
                  </button>

                  <div className="w-px h-8 bg-slate-200 mx-1"></div>

                  {/* Text Formatting Toolbar - shows when text tool or text element selected */}
                  {(tool === 'text' || (tool === 'select' && selectedElementId && elements.find(e => e.id === selectedElementId && 'text' in e))) && (
                    <div className="flex items-center gap-1 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-1.5 border border-emerald-200 shadow-sm">
                      {/* Bold */}
                      <button
                        onClick={() => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, isBold: !(el as TextElement).isBold } as any : el));
                            saveToHistory(elements);
                          } else {
                            setTextBold(!textBold);
                          }
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${(tool === 'text' ? textBold : (elements.find(e => e.id === selectedElementId) as TextElement)?.isBold)
                          ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-white text-slate-600'
                          }`}
                        title="Bold"
                      >
                        <Bold className="w-4 h-4" />
                      </button>
                      {/* Italic */}
                      <button
                        onClick={() => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, isItalic: !(el as TextElement).isItalic } as any : el));
                            saveToHistory(elements);
                          } else {
                            setTextItalic(!textItalic);
                          }
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${(tool === 'text' ? textItalic : (elements.find(e => e.id === selectedElementId) as TextElement)?.isItalic)
                          ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-white text-slate-600'
                          }`}
                        title="Italic"
                      >
                        <Italic className="w-4 h-4" />
                      </button>
                      {/* Underline */}
                      <button
                        onClick={() => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, isUnderline: !(el as TextElement).isUnderline } as any : el));
                            saveToHistory(elements);
                          } else {
                            setTextUnderline(!textUnderline);
                          }
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${(tool === 'text' ? textUnderline : (elements.find(e => e.id === selectedElementId) as TextElement)?.isUnderline)
                          ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-white text-slate-600'
                          }`}
                        title="Underline"
                      >
                        <Underline className="w-4 h-4" />
                      </button>

                      <div className="w-px h-6 bg-emerald-200 mx-1" />

                      {/* Font Family */}
                      <select
                        value={tool === 'text' ? textFontFamily : (elements.find(e => e.id === selectedElementId) as TextElement)?.fontFamily || 'Arial, sans-serif'}
                        onChange={(e) => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, fontFamily: e.target.value } as any : el));
                            saveToHistory(elements);
                          } else {
                            setTextFontFamily(e.target.value);
                          }
                        }}
                        className="px-2 py-1 bg-white border border-emerald-200 rounded-lg text-xs shadow-sm cursor-pointer focus:ring-2 focus:ring-emerald-300 outline-none max-w-[110px]"
                        title="Font Family"
                      >
                        {FONT_FAMILIES.map(f => (
                          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                        ))}
                      </select>

                      {/* Font Size */}
                      <select
                        value={tool === 'text' ? textFontSize : (elements.find(e => e.id === selectedElementId) as TextElement)?.fontSize || 20}
                        onChange={(e) => {
                          const size = Number(e.target.value);
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, fontSize: size } as any : el));
                            saveToHistory(elements);
                          } else {
                            setTextFontSize(size);
                          }
                        }}
                        className="px-2 py-1 bg-white border border-emerald-200 rounded-lg text-xs shadow-sm cursor-pointer focus:ring-2 focus:ring-emerald-300 outline-none w-16"
                        title="Font Size"
                      >
                        {FONT_SIZES.map(s => (
                          <option key={s} value={s}>{s}px</option>
                        ))}
                      </select>

                      <div className="w-px h-6 bg-emerald-200 mx-1" />

                      {/* Alignment */}
                      <button
                        onClick={() => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, alignment: 'left' } as any : el));
                            saveToHistory(elements);
                          } else setTextAlignment('left');
                        }}
                        className={`w-7 h-7 rounded flex items-center justify-center ${(tool === 'text' ? textAlignment : (elements.find(e => e.id === selectedElementId) as TextElement)?.alignment) === 'left'
                          ? 'bg-emerald-500 text-white' : 'hover:bg-white text-slate-500'
                          }`}
                        title="Align Left"
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, alignment: 'center' } as any : el));
                            saveToHistory(elements);
                          } else setTextAlignment('center');
                        }}
                        className={`w-7 h-7 rounded flex items-center justify-center ${(tool === 'text' ? textAlignment : (elements.find(e => e.id === selectedElementId) as TextElement)?.alignment) === 'center'
                          ? 'bg-emerald-500 text-white' : 'hover:bg-white text-slate-500'
                          }`}
                        title="Align Center"
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (tool === 'select' && selectedElementId) {
                            setElements(prev => prev.map(el => el.id === selectedElementId && 'text' in el ? { ...el, alignment: 'right' } as any : el));
                            saveToHistory(elements);
                          } else setTextAlignment('right');
                        }}
                        className={`w-7 h-7 rounded flex items-center justify-center ${(tool === 'text' ? textAlignment : (elements.find(e => e.id === selectedElementId) as TextElement)?.alignment) === 'right'
                          ? 'bg-emerald-500 text-white' : 'hover:bg-white text-slate-500'
                          }`}
                        title="Align Right"
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Instant Color Change for Selected Elements */}
                  {tool === 'select' && (selectedElementId || selectedElementIds.size > 0) && (
                    <div className="flex items-center gap-1 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-1.5 border border-amber-200 shadow-sm">
                      <Palette className="w-4 h-4 text-amber-600 mr-1" />
                      {colorPalette.slice(0, 10).map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            const idsToChange = selectedElementIds.size > 0 ? selectedElementIds : new Set([selectedElementId!]);
                            const newElements = elements.map(el => {
                              if (!idsToChange.has(el.id)) return el;
                              if ('points' in el) return { ...el, color: c };
                              if ('start' in el && 'end' in el) return { ...el, color: c };
                              if ('text' in el) return { ...el, color: c };
                              return el;
                            });
                            setElements(newElements);
                            saveToHistory(newElements);
                            setSelectedElementId(null);
                            setSelectedElementIds(new Set());
                            setTool('pen');
                          }}
                          className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 border-gray-300`}
                          style={{ backgroundColor: c }}
                          title={`Change color to ${c}`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Color Picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-100 border border-slate-200"
                      title="Color"
                    >
                      <div
                        className="w-6 h-6 rounded-full border-2 border-white shadow"
                        style={{ backgroundColor: color }}
                      ></div>
                    </button>
                    {showColorPicker && (
                      <div className="absolute top-full mt-2 left-0 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50">
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Colors</h4>
                        <div className="grid grid-cols-5 gap-2">
                          {colorPalette.map(c => (
                            <button
                              key={c}
                              onClick={() => {
                                setColor(c);
                                setShowColorPicker(false);
                              }}
                              className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Brush Size */}
                  <div className="relative">
                    <button
                      onClick={() => setShowBrushSettings(!showBrushSettings)}
                      className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600"
                      title="Brush Size"
                    >
                      <Settings2 className="w-5 h-5" />
                    </button>
                    {showBrushSettings && (
                      <div className="absolute top-full mt-2 left-0 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50">
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Brush Size</h4>
                        <div className="flex flex-wrap gap-2">
                          {brushSizes.map(size => (
                            <button
                              key={size}
                              onClick={() => setBrushSize(size)}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium ${brushSize === size ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-px h-8 bg-slate-200 mx-1"></div>

                  {/* Undo/Redo */}
                  <button onClick={undo} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600" title="Undo">
                    <Undo2 className="w-5 h-5" />
                  </button>
                  <button onClick={redo} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600" title="Redo">
                    <Redo2 className="w-5 h-5" />
                  </button>
                  <button onClick={clearCanvas} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-500" title="Clear">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  {/* Type Mode Toolbar */}
                  <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm">
                    <button
                      onMouseDown={e => { e.preventDefault(); applyFormat('bold'); }}
                      className="p-2 rounded-lg transition-all hover:bg-slate-100 font-bold text-slate-700"
                      title="Bold (only affects selected text)"
                    >
                      <Bold className="w-4 h-4" />
                    </button>
                    <button
                      onMouseDown={e => { e.preventDefault(); applyFormat('italic'); }}
                      className="p-2 rounded-lg transition-all hover:bg-slate-100 text-slate-700"
                      title="Italic (only affects selected text)"
                    >
                      <Italic className="w-4 h-4" />
                    </button>
                    <button
                      onMouseDown={e => { e.preventDefault(); applyFormat('underline'); }}
                      className="p-2 rounded-lg transition-all hover:bg-slate-100 text-slate-700"
                      title="Underline (only affects selected text)"
                    >
                      <Underline className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="w-px h-7 bg-slate-300 mx-1" />

                  {/* Typing Colors */}
                  <div className="flex items-center gap-1 mr-1">
                    {['#000000', '#dc2626', '#2563eb', '#16a34a', '#9333ea'].map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          setTypingColor(c);
                          applyFormat('foreColor', c);
                        }}
                        className={`w-6 h-6 rounded-full border-2 shrink-0 ${typingColor === c ? 'border-purple-500 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                        title="Font Color"
                      />
                    ))}
                  </div>

                  {/* Font Family */}
                  <select
                    value={typingFontFamily}
                    onChange={e => setTypingFontFamily(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm shadow-sm font-medium cursor-pointer focus:ring-2 focus:ring-purple-200 outline-none"
                    title="Font Family"
                  >
                    {FONT_FAMILIES.map(f => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                    ))}
                  </select>

                  {/* Font Size */}
                  <select
                    value={typingFontSize}
                    onChange={e => setTypingFontSize(Number(e.target.value))}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm shadow-sm font-medium cursor-pointer focus:ring-2 focus:ring-purple-200 outline-none w-16"
                    title="Font Size"
                  >
                    {FONT_SIZES.map(s => (
                      <option key={s} value={s}>{s}px</option>
                    ))}
                  </select>

                  <div className="w-px h-7 bg-slate-300 mx-1" />

                  {/* Alignment */}
                  <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm">
                    <button onClick={() => setTypingAlignment('left')} className={`p-2 rounded-lg ${typingAlignment === 'left' ? 'bg-purple-500 text-white' : 'hover:bg-slate-100'}`} title="Align Left">
                      <AlignLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setTypingAlignment('center')} className={`p-2 rounded-lg ${typingAlignment === 'center' ? 'bg-purple-500 text-white' : 'hover:bg-slate-100'}`} title="Align Center">
                      <AlignCenter className="w-4 h-4" />
                    </button>
                    <button onClick={() => setTypingAlignment('right')} className={`p-2 rounded-lg ${typingAlignment === 'right' ? 'bg-purple-500 text-white' : 'hover:bg-slate-100'}`} title="Align Right">
                      <AlignRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="w-px h-7 bg-slate-300 mx-1" />

                  <button
                    onClick={() => setShowFloatingKeyboard(!showFloatingKeyboard)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-semibold transition-all ${showFloatingKeyboard ? 'bg-purple-500 text-white' : 'bg-white hover:bg-slate-100 shadow-sm border border-slate-200 text-slate-700'}`}
                    title="Toggle Virtual Keyboard"
                  >
                    <Keyboard className="w-4 h-4" />
                    Keyboard
                  </button>

                  <button onClick={() => {
                    setTypedText('');
                    setTypedHtmlForDisplay('');
                    typedHtmlRef.current = '';
                    if (typingAreaRef.current) typingAreaRef.current.innerHTML = '';
                  }} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 text-sm font-medium">
                    <RotateCcw className="w-3.5 h-3.5" /> Clear
                  </button>
                </>
              )}
            </div>

            {/* Center: Canvas Controls */}
            <div className="flex flex-wrap items-center gap-2 justify-center">
              {[
                { type: 'blank', label: 'Blank', icon: <Layers className="w-4 h-4" /> },
                { type: 'ruled', label: 'Ruled', icon: <Minus className="w-4 h-4" /> },
                { type: 'grid', label: 'Grid', icon: <Grid3X3 className="w-4 h-4" /> },
              ].map(paper => (
                <button
                  key={paper.type}
                  onClick={() => setPaperType(paper.type as any)}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium ${paperType === paper.type ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {paper.icon}
                  <span>{paper.label}</span>
                </button>
              ))}
              <label className="flex items-center space-x-1 text-xs text-slate-600 ml-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMargin}
                  onChange={(e) => setShowMargin(e.target.checked)}
                  className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                />
                <span>Margin</span>
              </label>
            </div>

            {/* Right: Actions */}
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <div className="flex items-center bg-slate-100 rounded-lg">
                <button onClick={zoomOut} className="p-1.5 hover:bg-slate-200 rounded-l-lg">
                  <ZoomOut className="w-4 h-4 text-slate-600" />
                </button>
                <button onClick={resetZoom} className="px-2 text-xs font-medium text-slate-600">
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button onClick={zoomIn} className="p-1.5 hover:bg-slate-200 rounded-r-lg">
                  <ZoomIn className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageImport}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                title="Import Image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              <button onClick={saveCanvas} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Download">
                <Download className="w-5 h-5" />
              </button>

              {currentNoteId && (
                <button
                  onClick={() => handleSave(false)}
                  className="flex items-center space-x-1 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium shadow-sm hover:shadow-md transition-all"
                  title="Save Changes to Current Note"
                >
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </button>
              )}

              <button
                onClick={() => handleSave(true)}
                className="flex items-center space-x-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium shadow-sm hover:shadow-md transition-all"
                title="Save as new Class Note"
              >
                <BookOpen className="w-4 h-4" />
                <span>Save As</span>
              </button>

              <button onClick={toggleFullscreen} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Fullscreen">
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Canvas - Scrollable container with fixed page size */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 bg-slate-100 writing-canvas-scroll relative min-h-0 min-w-0"
          style={{ overflow: 'scroll' }}
        >
          <div
            className="p-5"
            style={{
              minWidth: `${Math.max(PAGE_WIDTH * zoomLevel + 100, 1900)}px`,
              minHeight: `${Math.max(PAGE_HEIGHT * zoomLevel + 100, 1300)}px`
            }}
          >
            <div
              className="relative shadow-2xl rounded-lg overflow-hidden mx-auto bg-white"
              style={{
                width: PAGE_WIDTH * zoomLevel,
                height: PAGE_HEIGHT * zoomLevel,
              }}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className={`block touch-none ${tool === 'select' ? (isDragging ? 'cursor-grabbing' : 'cursor-default') : ''}`}
                style={{
                  width: PAGE_WIDTH * zoomLevel,
                  height: PAGE_HEIGHT * zoomLevel,
                  cursor: tool === 'eraser'
                    ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${eraserSize}' height='${eraserSize}'%3E%3Ccircle cx='${eraserSize / 2}' cy='${eraserSize / 2}' r='${eraserSize / 2 - 1}' fill='white' stroke='%23999' stroke-width='1'/%3E%3C/svg%3E") ${eraserSize / 2} ${eraserSize / 2}, auto`
                    : tool === 'text' ? 'text'
                      : tool === 'select' ? undefined // Handled by className dynamic classes
                        : 'crosshair'
                }}
              />

              {/* Typed text read-only overlay — visible in WRITE mode so text doesn't disappear */}
              {inputMode === 'write' && typedHtmlForDisplay && (
                <div
                  className="absolute z-10 pointer-events-none select-none"
                  style={{
                    top: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    paddingTop: `${8 * zoomLevel}px`,
                    paddingLeft: `${110 * zoomLevel}px`,
                    paddingRight: `${40 * zoomLevel}px`,
                    paddingBottom: `${20 * zoomLevel}px`,
                    fontSize: `${typingFontSize * zoomLevel}px`,
                    fontFamily: typingFontFamily,
                    textAlign: typingAlignment,
                    lineHeight: `${45 * zoomLevel}px`,
                    color: typingColor,
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    opacity: 0.9,
                  }}
                  dangerouslySetInnerHTML={{ __html: typedHtmlForDisplay }}
                />
              )}

              {/* Typing contentEditable — always visible in TYPE mode */}
              {inputMode === 'type' && (
                <div
                  ref={typingAreaRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    const el = e.target as HTMLDivElement;
                    typedHtmlRef.current = el.innerHTML;
                    setTypedText(el.innerText || '');
                    setTypedHtmlForDisplay(el.innerHTML);
                  }}
                  onBlur={() => {
                    if (typingAreaRef.current) {
                      typedHtmlRef.current = typingAreaRef.current.innerHTML;
                      setTypedHtmlForDisplay(typingAreaRef.current.innerHTML);
                    }
                  }}
                  onClick={(e) => {
                    const el = typingAreaRef.current;
                    if (!el) return;

                    const rect = el.getBoundingClientRect();
                    const clickY = (e.clientY - rect.top) / zoomLevel;
                    const paddingTop = 8;
                    const lineHeight = 45;

                    const clickedLineIndex = Math.floor(Math.max(0, clickY - paddingTop) / lineHeight);
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    const rects = range.getClientRects();

                    let currentLastLineIndex = 0;
                    let hasTextRects = false;

                    if (rects.length > 0) {
                      let maxBottom = rect.top + (paddingTop * zoomLevel);
                      for (let i = 0; i < rects.length; i++) {
                        if (rects[i].bottom > maxBottom) {
                          maxBottom = rects[i].bottom;
                          hasTextRects = true;
                        }
                      }
                      if (hasTextRects) {
                        const textBottomY = (maxBottom - rect.top) / zoomLevel;
                        currentLastLineIndex = Math.floor(Math.max(0, textBottomY - paddingTop) / lineHeight);
                      }
                    }

                    if (!hasTextRects) {
                      const newlinesMatch = (el.innerText || '').match(/\n/g);
                      currentLastLineIndex = newlinesMatch ? newlinesMatch.length : 0;
                    }

                    if (clickedLineIndex > currentLastLineIndex) {
                      e.preventDefault();
                      const linesToAdd = clickedLineIndex - currentLastLineIndex;
                      const textNode = document.createTextNode('\n'.repeat(linesToAdd));
                      el.appendChild(textNode);

                      const sel = window.getSelection();
                      const newRange = document.createRange();
                      newRange.selectNodeContents(el);
                      newRange.collapse(false);
                      sel?.removeAllRanges();
                      sel?.addRange(newRange);

                      typedHtmlRef.current = el.innerHTML;
                      setTypedText(el.innerText || '');
                      setTypedHtmlForDisplay(el.innerHTML);
                    }
                  }}
                  data-placeholder="Start typing your document here... Text wraps to the page like Microsoft Word."
                  className="absolute inset-x-0 outline-none bg-transparent typing-area-editable"
                  style={{
                    top: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 20,
                    pointerEvents: 'auto',
                    cursor: 'text',
                    caretColor: typingColor,
                    paddingTop: `${8 * zoomLevel}px`,
                    paddingLeft: `${110 * zoomLevel}px`,
                    paddingRight: `${40 * zoomLevel}px`,
                    paddingBottom: `${20 * zoomLevel}px`,
                    fontSize: `${typingFontSize * zoomLevel}px`,
                    fontFamily: typingFontFamily,
                    textAlign: typingAlignment,
                    lineHeight: `${45 * zoomLevel}px`,
                    color: typingColor,
                    overflow: 'auto',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                />
              )}

              {/* Enhanced Text Input Overlay */}
              {showTextInput && textPosition && (
                <div
                  className="absolute z-20"
                  style={{ left: textPosition.x * zoomLevel, top: textPosition.y * zoomLevel }}
                >
                  <div className="bg-white rounded-lg shadow-xl border-2 border-emerald-400 overflow-hidden" style={{ minWidth: 250 }}>
                    <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 border-b border-emerald-200 text-xs">
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setTextBold(!textBold)}
                        className={`w-6 h-6 rounded flex items-center justify-center ${textBold ? 'bg-emerald-500 text-white' : 'hover:bg-emerald-100'}`}
                      >
                        <Bold className="w-3 h-3" />
                      </button>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setTextItalic(!textItalic)}
                        className={`w-6 h-6 rounded flex items-center justify-center ${textItalic ? 'bg-emerald-500 text-white' : 'hover:bg-emerald-100'}`}
                      >
                        <Italic className="w-3 h-3" />
                      </button>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setTextUnderline(!textUnderline)}
                        className={`w-6 h-6 rounded flex items-center justify-center ${textUnderline ? 'bg-emerald-500 text-white' : 'hover:bg-emerald-100'}`}
                      >
                        <Underline className="w-3 h-3" />
                      </button>
                      <select
                        onMouseDown={(e) => e.preventDefault()}
                        value={textFontSize}
                        onChange={e => {
                          setTextFontSize(Number(e.target.value));
                        }}
                        className="px-1 py-0.5 border border-emerald-200 rounded text-xs bg-white w-14"
                      >
                        {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                      </select>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { handleTextSubmit(); setTool('select'); }}
                        className="px-2 py-0.5 ml-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-medium transition-colors"
                        title="Save & Close"
                      >
                        Done
                      </button>
                    </div>
                    <textarea
                      ref={textInputRef}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleTextSubmit();
                          setTool('select'); // Automatically hop out to let user move it
                        }
                      }}
                      rows={3}
                      className="w-full px-3 py-2 outline-none resize-none"
                      style={{
                        color: color,
                        fontSize: textFontSize * zoomLevel * 0.8,
                        fontFamily: textFontFamily,
                        fontWeight: textBold ? 'bold' : 'normal',
                        fontStyle: textItalic ? 'italic' : 'normal',
                        textDecoration: textUnderline ? 'underline' : 'none',
                        minWidth: 250,
                      }}
                      placeholder="Type here... (Shift+Enter for new line)"
                    />
                  </div>
                </div>
              )}

              {/* Group Selection Rectangle Overlay */}
              {isGroupSelecting && groupSelectStart && groupSelectEnd && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: Math.min(groupSelectStart.x, groupSelectEnd.x) * zoomLevel,
                    top: Math.min(groupSelectStart.y, groupSelectEnd.y) * zoomLevel,
                    width: Math.abs(groupSelectEnd.x - groupSelectStart.x) * zoomLevel,
                    height: Math.abs(groupSelectEnd.y - groupSelectStart.y) * zoomLevel,
                    border: '2px dashed #8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: 4,
                  }}
                />
              )}

              {/* Selection Highlights for selected elements */}
              {(tool === 'select' || tool === 'move') && selectedElementIds.size > 0 && elements.filter(el => selectedElementIds.has(el.id)).map(el => {
                let bounds = { x: 0, y: 0, w: 0, h: 0 };
                if ('points' in el) {
                  const stroke = el as Stroke;
                  const xs = stroke.points.map(p => p.x);
                  const ys = stroke.points.map(p => p.y);
                  bounds = { x: Math.min(...xs) - 5, y: Math.min(...ys) - 5, w: Math.max(...xs) - Math.min(...xs) + 10, h: Math.max(...ys) - Math.min(...ys) + 10 };
                } else if ('start' in el && 'end' in el) {
                  const shape = el as Shape;
                  bounds = {
                    x: Math.min(shape.start.x, shape.end.x) - 3,
                    y: Math.min(shape.start.y, shape.end.y) - 3,
                    w: Math.abs(shape.end.x - shape.start.x) + 6,
                    h: Math.abs(shape.end.y - shape.start.y) + 6
                  };
                } else if ('text' in el) {
                  const txt = el as TextElement;
                  bounds = { x: txt.position.x - 3, y: txt.position.y - 3, w: (txt.width || 200) + 6, h: (txt.height || 30) + 6 };
                } else if ('imageData' in el) {
                  const img = el as ImageElement;
                  bounds = { x: img.position.x - 3, y: img.position.y - 3, w: img.width + 6, h: img.height + 6 };
                }
                return (
                  <div
                    key={`sel-${el.id}`}
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: bounds.x * zoomLevel,
                      top: bounds.y * zoomLevel,
                      width: bounds.w * zoomLevel,
                      height: bounds.h * zoomLevel,
                      border: '2px dashed #3B82F6',
                      borderRadius: 4,
                      backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    }}
                  >
                    {/* Resize handle */}
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white cursor-nwse-resize" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Save as Note Dialog */}
      {showSaveNoteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <BookOpen className="w-6 h-6 mr-2 text-green-500" />
              Save as Class Note
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note Title</label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder={`${currentSubject.name} Notes - ${new Date().toLocaleDateString()} `}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={noteTags}
                  onChange={(e) => setNoteTags(e.target.value)}
                  placeholder="e.g., chapter-5, homework, important"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                <p><strong>Subject:</strong> {currentSubject.name}</p>
                <p><strong>Class:</strong> {currentClass}</p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowSaveNoteDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveAsClassNote}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handwriting Converter Modal */}
      <HandwritingConverter
        isOpen={showHandwritingConverter}
        canvasRef={canvasRef}
        onClose={() => setShowHandwritingConverter(false)}
      />

      {/* Adaptive Quiz Modal */}
      <AdaptiveQuiz
        isOpen={showAdaptiveQuiz}
        onClose={() => setShowAdaptiveQuiz(false)}
      />

      {/* Click outside to close panels */}
      {(showColorPicker || showBrushSettings || showEraserSettings || showShapePanel || showClassSelector || showSubjectSelector) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowColorPicker(false);
            setShowBrushSettings(false);
            setShowEraserSettings(false);
            setShowShapePanel(false);
            setShowClassSelector(false);
            setShowSubjectSelector(false);
          }}
        />
      )}

      {/* Class Selector Modal */}
      {showClassSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-6 pointer-events-auto max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Select Class</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(c => (
                <button
                  key={c}
                  onClick={() => handleClassChange(c)}
                  className={`px-3 py-3 text-sm font-medium rounded-lg transition-colors border ${currentClass === c
                    ? 'bg-blue-500 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowClassSelector(false)}
              className="mt-4 w-full py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Subject Selector Modal */}
      {showSubjectSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-6 pointer-events-auto max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Select Subject</h3>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map(subj => (
                <button
                  key={subj.code}
                  onClick={() => handleSubjectChange(subj.code)}
                  className={`px-3 py-3 text-sm font-medium rounded-lg transition-colors text-left flex items-center space-x-2 border ${currentSubject.code === subj.code
                    ? 'text-white border-transparent'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  style={{
                    backgroundColor: currentSubject.code === subj.code ? subj.color : undefined
                  }}
                >
                  <div className={`w-3 h-3 rounded-full ${currentSubject.code === subj.code ? 'bg-white' : ''}`} style={{ backgroundColor: currentSubject.code !== subj.code ? subj.color : undefined }}></div>
                  <span>{subj.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSubjectSelector(false)}
              className="mt-4 w-full py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Floating Virtual Keyboard for Type Mode */}
      {inputMode === 'type' && showFloatingKeyboard && (
        <div
          className="fixed z-[9999] bg-gradient-to-b from-slate-200 to-slate-300 rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border-4 border-slate-400/50 backdrop-blur-md"
          style={{ left: keyboardPosition.x, top: keyboardPosition.y, width: keyboardSize.width }}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-700 to-slate-900 text-white cursor-move rounded-t-2xl shadow-sm"
            onMouseDown={handleKeyboardDragStart}
          >
            <div className="flex items-center gap-3">
              <GripHorizontal className="w-6 h-6 opacity-70" />
              <span className="font-bold flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-purple-400" /> Virtual Keyboard
                <span className="text-xs bg-slate-600 px-2 py-0.5 rounded-full ml-1 text-slate-300">
                  {keyboardLayoutType === 'math' ? 'Math & Science Mode' : 'Standard Mode'}
                </span>
              </span>
            </div>
            <button onClick={() => setShowFloatingKeyboard(false)} className="p-2 rounded-xl hover:bg-white/20 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-2.5 bg-slate-300/50 rounded-b-2xl">
            {KEYBOARD_LAYOUTS[keyboardLayoutType].map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-2">
                {row.map((key) => {
                  const isSpecialKey = ['⌫', '↵', '⇧', 'Space', 'Math', 'ABC'].includes(key);
                  const isActive = key === '⇧' && isShiftPressed;
                  const displayKey = isShiftPressed && key.length === 1 && /[a-z]/.test(key) ? key.toUpperCase() : key;

                  let bgColor = 'bg-white hover:bg-purple-50';
                  let textColor = 'text-slate-800';
                  if (isActive) { bgColor = 'bg-purple-500 hover:bg-purple-600'; textColor = 'text-white'; }
                  else if (['Math', 'ABC'].includes(key)) { bgColor = 'bg-indigo-100 hover:bg-indigo-200 border-indigo-300'; textColor = 'text-indigo-800'; }
                  else if (['⌫', '↵'].includes(key)) { bgColor = 'bg-slate-200 hover:bg-slate-300 border-slate-300'; }

                  return (
                    <button
                      key={key}
                      onClick={() => handleVirtualKeyPress(key)}
                      className={`rounded-xl font-bold shadow-sm border-b-4 border-2 border-slate-300 active:border-b-0 active:translate-y-1 ${bgColor} ${textColor} transition-all`}
                      style={{
                        width: key === 'Space' ? currentKeyDimensions.width * 6 : isSpecialKey ? currentKeyDimensions.width * 1.5 : currentKeyDimensions.width,
                        height: currentKeyDimensions.height,
                        fontSize: currentKeyDimensions.fontSize
                      }}
                    >
                      {key === 'Space' ? '━━ Space ━━' : displayKey}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div
            className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize flex items-center justify-center bg-slate-400 rounded-tl-xl hover:bg-slate-500 rounded-br-2xl"
            onMouseDown={handleKeyboardResizeStart}
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 22H18V18H22V22ZM22 16H16V22H22V16ZM14 22H10V18H14V22Z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}