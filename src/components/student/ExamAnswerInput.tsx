// ═══════════════════════════════════════════════════════════════════════
// ExamAnswerInput.tsx — Unified Canvas, Write + Type on Same Background
// Background layer: ruled lines (NOT erasable)
// Drawing layer: student strokes (erasable)
// Typing layer: contentEditable overlay aligned to ruled lines
// Toggle only swaps toolbar tools — content is preserved
// ═══════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    PenTool,
    Keyboard,
    Eraser,
    RotateCcw,
    Maximize2,
    Minimize2,
    X,
    GripHorizontal,
    Circle,
    Square,
    Minus,
    ArrowRight,
    Triangle,
    Undo2,
    Redo2,
    Highlighter,
    Star,
    Heart,
    Hexagon,
    ZoomIn,
    ZoomOut,
    Lock,
    Plus,
    Type,
    MousePointer,
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Trash2,
    ArrowLeft
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════
// TYPES & INTERFACE
// ═══════════════════════════════════════════════════════════════════════

interface ExamAnswerInputProps {
    questionId: string;
    marks: number;
    questionText?: string;
    onAnswerChange: (questionId: string, answer: string) => void;
    currentAnswer?: string;
    answerMode?: 'write' | 'type';
    onModeChange?: (questionId: string, mode: 'write' | 'type') => void;
}

type DrawTool = 'pen' | 'highlighter' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'arrow' | 'triangle' | 'star' | 'heart' | 'hexagon' | 'text' | 'select';

interface FloatingText {
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    isBold: boolean;
    color: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const VIRTUAL_WIDTH = 900;
const COLORS = ['#000000', '#374151', '#EF4444', '#F97316', '#22C55E', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

export default function ExamAnswerInput({
    questionId,
    marks,
    questionText,
    onAnswerChange,
    currentAnswer = '',
    answerMode: externalMode,
    onModeChange
}: ExamAnswerInputProps) {

    // ═══════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════

    // Answer mode: exclusive — write OR type, default write
    const [answerMode, setAnswerMode] = useState<'write' | 'type'>(() => {
        if (externalMode) return externalMode;
        if (currentAnswer && !currentAnswer.startsWith('[DRAWING]:') && currentAnswer.trim()) return 'type';
        return 'write';
    });
    // Track if content exists (used for mode switch warning)

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState(1.0);
    const previousZoomRef = useRef(1.0); // saved zoom before fullscreen
    const [pageCount, setPageCount] = useState(1); // multi-page support
    const [currentPage, setCurrentPage] = useState(1);

    // Dual-layer canvas refs
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawTool, setDrawTool] = useState<DrawTool>('pen');
    const [penColor, setPenColor] = useState('#000000');
    const [penSize, setPenSize] = useState(3);
    const [paperType, _setPaperType] = useState<'blank' | 'ruled' | 'grid' | 'dotted'>('ruled');

    // Shape drawing state
    const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
    const [canvasSnapshot, setCanvasSnapshot] = useState<ImageData | null>(null);

    // Text Overlay Support and Tools
    const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const overlayDragRef = useRef<{ id: string; startX: number; startY: number; objX: number; objY: number; action: 'move' | 'resize' } | null>(null);
    const [eraserSize, setEraserSize] = useState(24);

    // History for undo/redo (drawing canvas only)
    const [history, setHistory] = useState<ImageData[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Typing state
    const [typedText, setTypedText] = useState(() => {
        if (!currentAnswer) return '';
        // Plain text answer (no drawing prefix)
        if (!currentAnswer.startsWith('[DRAWING]:')) return currentAnswer;
        return '';
    });
    const typedTextRef = useRef(typedText);
    useEffect(() => { typedTextRef.current = typedText; }, [typedText]);

    // Typing formatting state (MS Word-like)
    const [typingFontSize, setTypingFontSize] = useState(18);
    const [typingFontFamily, setTypingFontFamily] = useState<string>('sans-serif');
    const [typingAlignment, setTypingAlignment] = useState<'left' | 'center' | 'right'>('left');
    const typingAreaRef = useRef<HTMLDivElement>(null);
    const typedHtmlRef = useRef<string>(''); // stores rich HTML content
    const [typedHtmlForDisplay, setTypedHtmlForDisplay] = useState(''); // for read-only overlay in Write mode

    // Apply formatting via document.execCommand (Word-like: only affects selection)
    const applyFormat = useCallback((command: string, value?: string) => {
        // Re-focus the contentEditable so the command applies to the right context
        typingAreaRef.current?.focus();
        document.execCommand(command, false, value);
        // Capture updated HTML
        if (typingAreaRef.current) {
            typedHtmlRef.current = typingAreaRef.current.innerHTML;
            setTypedText(typingAreaRef.current.innerText || '');
            setTypedHtmlForDisplay(typingAreaRef.current.innerHTML);
        }
    }, []);

    const FONT_FAMILIES = [
        { label: 'Sans Serif', value: 'sans-serif' },
        { label: 'Serif', value: 'serif' },
        { label: 'Monospace', value: 'monospace' },
        { label: 'Cursive', value: 'cursive' },
    ];
    const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];

    // Track if canvas has been initialized
    const [isCanvasReady, setIsCanvasReady] = useState(false);
    const canvasHeightRef = useRef(0);

    // Removed floating virtual keyboard logic as per user request

    // ═══════════════════════════════════════════════════════════════════
    // CANVAS DIMENSIONS
    // ═══════════════════════════════════════════════════════════════════

    // Base height per page — scales by number of pages. Make base page height larger to avoid half split
    const BASE_PAGE_HEIGHT = 1000;

    const getVirtualHeight = useCallback(() => {
        // Canvas height = base page height × number of pages (ensure it covers screen height to prevent half page splits)
        return Math.max(BASE_PAGE_HEIGHT * pageCount, scrollContainerRef.current?.clientHeight || 0);
    }, [BASE_PAGE_HEIGHT, pageCount]);

    // Handle scroll to sync current page
    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const s = scrollContainerRef.current.scrollTop;
        const page = Math.floor(s / (BASE_PAGE_HEIGHT * zoom)) + 1;
        if (page !== currentPage) setCurrentPage(page);
    };

    // Overlay Move/Resize Listener
    useEffect(() => {
        const handleOverlayMove = (e: MouseEvent) => {
            if (!overlayDragRef.current) return;
            const { id, startX, startY, objX, objY, action } = overlayDragRef.current;
            const dx = (e.clientX - startX) / zoom;
            const dy = (e.clientY - startY) / zoom;

            setFloatingTexts(prev => prev.map(txt => {
                if (txt.id !== id) return txt;
                if (action === 'move') {
                    return { ...txt, x: objX + dx, y: objY + dy };
                } else {
                    return { ...txt, width: Math.max(50, objX + dx), height: Math.max(30, objY + dy) };
                }
            }));
        };
        const handleOverlayUp = () => {
            if (overlayDragRef.current) {
                overlayDragRef.current = null;
                // Since triggerSave depends on current render, calling it directly here might use stale closure.
                // We let auto-save catch it or the user closing it.
            }
        };
        window.addEventListener('mousemove', handleOverlayMove);
        window.addEventListener('mouseup', handleOverlayUp);
        return () => {
            window.removeEventListener('mousemove', handleOverlayMove);
            window.removeEventListener('mouseup', handleOverlayUp);
        };
    }, [zoom]);

    // ═══════════════════════════════════════════════════════════════════
    // PAPER BACKGROUND (drawn on bgCanvas — NOT erasable)
    // ═══════════════════════════════════════════════════════════════════

    const drawPaper = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        if (paperType === 'ruled') {
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            for (let y = 45; y < height; y += 45) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
            // Red margin
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(80, 0);
            ctx.lineTo(80, height);
            ctx.stroke();
        } else if (paperType === 'grid') {
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 0.5;
            const gridSize = 20;
            for (let x = 0; x < width; x += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            }
            for (let y = 0; y < height; y += gridSize) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
        } else if (paperType === 'dotted') {
            ctx.fillStyle = '#d1d5db';
            const dotSize = 20;
            for (let x = dotSize; x < width; x += dotSize) {
                for (let y = dotSize; y < height; y += dotSize) {
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }, [paperType]);

    // Load existing drawing from currentAnswer
    useEffect(() => {
        setIsCanvasReady(false);
        setHistory([]);
        setHistoryIndex(-1);
        setShapeStart(null);
        setCanvasSnapshot(null);
        setPageCount(1); // reset to single page for new question
        setCurrentPage(1);
        setFloatingTexts([]);
        setSelectedTextId(null);

        // Short timeout to ensure DOM has rendered
        const timeout = setTimeout(() => {
            const bgCanvas = bgCanvasRef.current;
            const drawCanvas = drawCanvasRef.current;
            if (!bgCanvas || !drawCanvas) return;

            const bgCtx = bgCanvas.getContext('2d');
            const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
            if (!bgCtx || !drawCtx) return;

            const vHeight = getVirtualHeight();
            canvasHeightRef.current = vHeight;

            bgCanvas.width = VIRTUAL_WIDTH;
            bgCanvas.height = vHeight;
            drawCanvas.width = VIRTUAL_WIDTH;
            drawCanvas.height = vHeight;

            // Draw paper background
            drawPaper(bgCtx, VIRTUAL_WIDTH, vHeight);

            // Clear drawing canvas
            drawCtx.clearRect(0, 0, VIRTUAL_WIDTH, vHeight);

            // Load existing drawing
            if (currentAnswer?.startsWith('[DRAWING]:')) {
                let src = currentAnswer;
                if (src.includes('|||[TEXT]:')) {
                    src = src.split('|||[TEXT]:')[0];
                }
                src = src.replace('[DRAWING]:', '');

                const img = new Image();
                img.onload = () => {
                    const requiredPages = Math.max(1, Math.ceil(img.height / BASE_PAGE_HEIGHT));
                    if (requiredPages > 1) {
                        setPageCount(requiredPages);
                        const newHeight = requiredPages * BASE_PAGE_HEIGHT;
                        bgCanvas.height = newHeight;
                        drawCanvas.height = newHeight;
                        canvasHeightRef.current = newHeight;
                        drawPaper(bgCtx, VIRTUAL_WIDTH, newHeight);
                        drawCtx.clearRect(0, 0, VIRTUAL_WIDTH, newHeight);
                    }
                    // Draw the saved composite on a temp canvas, then extract
                    // just the drawing portion by drawing on draw canvas
                    // Since the saved image includes background, we draw it on draw canvas
                    // The background canvas already has its own background, so there will be
                    // visual overlap, but for saved images this is acceptable
                    drawCtx.drawImage(img, 0, 0, VIRTUAL_WIDTH, img.height);
                    saveToHistory();
                    setIsCanvasReady(true);
                };
                img.onerror = () => {
                    console.error('Failed to load existing drawing');
                    saveToHistory();
                    setIsCanvasReady(true);
                };
                img.src = src;
            } else {
                // No drawing — start fresh
                saveToHistory();
                setIsCanvasReady(true);
            }
        }, 50);

        return () => clearTimeout(timeout);
    }, [questionId]); // Only on question change (component remounts via key anyway)

    // Re-initialize on paper type change
    useEffect(() => {
        if (!isCanvasReady) return;
        const bgCanvas = bgCanvasRef.current;
        if (!bgCanvas) return;
        const bgCtx = bgCanvas.getContext('2d');
        if (!bgCtx) return;
        drawPaper(bgCtx, bgCanvas.width, bgCanvas.height);
    }, [paperType, drawPaper, isCanvasReady]);

    // Adaptive zoom effect to fit available parent/screen width
    useEffect(() => {
        const handleResize = () => {
            let availableWidth = 0;
            if (isFullscreen) {
                // In fullscreen, fit to window width with small margin
                availableWidth = window.innerWidth - 32;
            } else {
                // Otherwise fit to parent element client width
                const parent = scrollContainerRef.current?.parentElement;
                if (parent) {
                    availableWidth = parent.clientWidth - 16;
                }
            }
            
            if (availableWidth > 0) {
                const fitZoom = Math.min(Math.max(availableWidth / VIRTUAL_WIDTH, MIN_ZOOM), MAX_ZOOM);
                setZoom(fitZoom);
            }
        };

        // Run initially
        handleResize();

        // Listen for window resize
        window.addEventListener('resize', handleResize);
        
        // Also run after a tiny timeout to ensure DOM layout is complete
        const t = setTimeout(handleResize, 100);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(t);
        };
    }, [isFullscreen, questionId]);

    // ═══════════════════════════════════════════════════════════════════
    // UNDO / REDO (drawing canvas only)
    // ═══════════════════════════════════════════════════════════════════

    const saveToHistory = () => {
        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return;
        const ctx = drawCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(imageData);
        // Keep max 30 history states
        if (newHistory.length > 30) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const undo = () => {
        if (historyIndex <= 0) return;
        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return;
        const ctx = drawCanvas.getContext('2d');
        if (!ctx) return;

        const newIndex = historyIndex - 1;
        ctx.putImageData(history[newIndex], 0, 0);
        setHistoryIndex(newIndex);
        triggerSave();
    };

    const redo = () => {
        if (historyIndex >= history.length - 1) return;
        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return;
        const ctx = drawCanvas.getContext('2d');
        if (!ctx) return;

        const newIndex = historyIndex + 1;
        ctx.putImageData(history[newIndex], 0, 0);
        setHistoryIndex(newIndex);
        triggerSave();
    };

    // ═══════════════════════════════════════════════════════════════════
    // COORDINATE HANDLING (accounts for zoom + CSS scaling)
    // ═══════════════════════════════════════════════════════════════════

    const getPosition = (e: React.MouseEvent | React.TouchEvent) => {
        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return { x: 0, y: 0 };

        const rect = drawCanvas.getBoundingClientRect();
        const scaleX = drawCanvas.width / rect.width;
        const scaleY = drawCanvas.height / rect.height;

        if ('touches' in e) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    // ═══════════════════════════════════════════════════════════════════
    // DRAWING LOGIC (on drawCanvas only)
    // ═══════════════════════════════════════════════════════════════════

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (answerMode !== 'write') return;
        e.preventDefault();

        const pos = getPosition(e);

        if (drawTool === 'text') {
            const newId = Math.random().toString(36).substr(2, 9);
            setFloatingTexts(prev => [...prev, {
                id: newId,
                text: '',
                x: pos.x,
                y: pos.y,
                width: 200,
                height: 50,
                fontSize: 20,
                isBold: false,
                color: penColor
            }]);
            setSelectedTextId(newId);
            setDrawTool('select');
            return;
        } else if (drawTool === 'select') {
            setSelectedTextId(null);
            return;
        }

        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return;
        const ctx = drawCanvas.getContext('2d');
        if (!ctx) return;

        setIsDrawing(true);

        if (['line', 'rectangle', 'circle', 'arrow', 'triangle', 'star', 'heart', 'hexagon'].includes(drawTool)) {
            setShapeStart(pos);
            setCanvasSnapshot(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
        } else {
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || answerMode !== 'write') return;
        e.preventDefault();

        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return;
        const ctx = drawCanvas.getContext('2d');
        if (!ctx) return;

        const pos = getPosition(e);

        if (['line', 'rectangle', 'circle', 'arrow', 'triangle', 'star', 'heart', 'hexagon'].includes(drawTool) && shapeStart && canvasSnapshot) {
            ctx.putImageData(canvasSnapshot, 0, 0);
            drawShape(ctx, shapeStart, pos);
        } else {
            // Eraser uses destination-out — makes pixels transparent
            // revealing background canvas underneath
            if (drawTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.lineWidth = eraserSize;
            } else if (drawTool === 'highlighter') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = penColor;
                ctx.lineWidth = penSize * 4;
                ctx.globalAlpha = 0.3;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = penColor;
                ctx.lineWidth = penSize;
                ctx.globalAlpha = 1;
            }
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();

            // Reset
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    };

    const stopDrawing = () => {
        if (isDrawing) {
            setIsDrawing(false);
            setShapeStart(null);
            setCanvasSnapshot(null);
            saveToHistory();
            triggerSave();
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // SHAPE DRAWING
    // ═══════════════════════════════════════════════════════════════════

    const drawShape = (ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }) => {
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const width = end.x - start.x;
        const height = end.y - start.y;

        ctx.beginPath();

        switch (drawTool) {
            case 'line':
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                break;
            case 'rectangle':
                ctx.strokeRect(start.x, start.y, width, height);
                break;
            case 'circle': {
                const radiusX = Math.abs(width) / 2;
                const radiusY = Math.abs(height) / 2;
                ctx.ellipse(start.x + width / 2, start.y + height / 2, radiusX, radiusY, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'arrow': {
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
                ctx.stroke();
                break;
            }
            case 'triangle':
                ctx.moveTo(start.x + width / 2, start.y);
                ctx.lineTo(start.x + width, start.y + height);
                ctx.lineTo(start.x, start.y + height);
                ctx.closePath();
                ctx.stroke();
                break;
            case 'star': {
                const outerR = Math.min(Math.abs(width), Math.abs(height)) / 2;
                const innerR = outerR / 2;
                const cx = start.x + width / 2;
                const cy = start.y + height / 2;
                const spikes = 5;
                let rot = Math.PI / 2 * 3;
                const step = Math.PI / spikes;
                ctx.moveTo(cx, cy - outerR);
                for (let i = 0; i < spikes; i++) {
                    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
                    rot += step;
                    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
                    rot += step;
                }
                ctx.lineTo(cx, cy - outerR);
                ctx.closePath();
                ctx.stroke();
                break;
            }
            case 'heart': {
                const hx = start.x + width / 2;
                const hy = start.y + height / 3;
                const sz = Math.min(Math.abs(width), Math.abs(height)) / 2;
                ctx.moveTo(hx, hy + sz / 4);
                ctx.bezierCurveTo(hx, hy, hx - sz, hy, hx - sz, hy + sz / 2);
                ctx.bezierCurveTo(hx - sz, hy + sz, hx, hy + sz * 1.5, hx, hy + sz * 1.5);
                ctx.bezierCurveTo(hx, hy + sz * 1.5, hx + sz, hy + sz, hx + sz, hy + sz / 2);
                ctx.bezierCurveTo(hx + sz, hy, hx, hy, hx, hy + sz / 4);
                ctx.stroke();
                break;
            }
            case 'hexagon': {
                const hexR = Math.min(Math.abs(width), Math.abs(height)) / 2;
                const hexCx = start.x + width / 2;
                const hexCy = start.y + height / 2;
                for (let i = 0; i < 6; i++) {
                    const a = (i * Math.PI) / 3 - Math.PI / 6;
                    if (i === 0) ctx.moveTo(hexCx + hexR * Math.cos(a), hexCy + hexR * Math.sin(a));
                    else ctx.lineTo(hexCx + hexR * Math.cos(a), hexCy + hexR * Math.sin(a));
                }
                ctx.closePath();
                ctx.stroke();
                break;
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // SAVE / COMPOSITE (merge bg + drawing → single image)
    // ═══════════════════════════════════════════════════════════════════

    const saveComposite = useCallback((): string => {
        const bgCanvas = bgCanvasRef.current;
        const drawCanvas = drawCanvasRef.current;
        if (!bgCanvas || !drawCanvas) return '';

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bgCanvas.width;
        tempCanvas.height = bgCanvas.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return '';

        // Draw background layer first
        ctx.drawImage(bgCanvas, 0, 0);
        // Draw student's strokes on top
        ctx.drawImage(drawCanvas, 0, 0);

        // Draw floating texts
        floatingTexts.forEach(txt => {
            ctx.save();
            ctx.font = `${txt.isBold ? 'bold ' : ''}${txt.fontSize}px sans-serif`;
            ctx.fillStyle = txt.color;
            ctx.textBaseline = 'top';
            const lines = txt.text.split('\n');
            lines.forEach((line, index) => {
                ctx.fillText(line, txt.x + 8, txt.y + 8 + (index * txt.fontSize * 1.2));
            });
            ctx.restore();
        });

        // Draw typed text (render plain text lines on canvas for export)
        if (typedTextRef.current) {
            ctx.save();
            ctx.font = `${typingFontSize}px ${typingFontFamily}`;
            ctx.fillStyle = penColor;
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = typingAlignment as CanvasTextAlign;
            const maxWidth = VIRTUAL_WIDTH - 90 - 40; // leftPad - rightPad
            const lineHeight = 45;
            const startX = typingAlignment === 'center' ? 90 + maxWidth / 2 : typingAlignment === 'right' ? 90 + maxWidth : 90;
            const startY = 45; // First ruled line — text baseline sits ON this line
            const plainText = typedTextRef.current;
            const paragraphs = plainText.split('\n');
            let y = startY;

            paragraphs.forEach(paragraph => {
                if (!paragraph) {
                    y += lineHeight;
                    return;
                }
                const words = paragraph.split(' ');
                let currentLine = '';
                words.forEach(word => {
                    const testLine = currentLine ? currentLine + ' ' + word : word;
                    const measured = ctx.measureText(testLine).width;
                    if (measured > maxWidth && currentLine) {
                        ctx.fillText(currentLine, startX, y);
                        currentLine = word;
                        y += lineHeight;
                    } else {
                        currentLine = testLine;
                    }
                });
                if (currentLine) {
                    ctx.fillText(currentLine, startX, y);
                    y += lineHeight;
                }
            });
            ctx.restore();
        }

        return tempCanvas.toDataURL('image/png');
    }, [floatingTexts, typingFontSize, typingFontFamily, typingAlignment, penColor]);

    /** Check if drawing canvas has any actual content (non-transparent pixels) */
    const hasDrawingContent = useCallback((): boolean => {
        if (floatingTexts.length > 0) return true;
        if (typedTextRef.current?.trim()) return true; // typed text is also content
        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return false;
        const ctx = drawCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return false;

        const sampleSize = 40;
        const stepX = Math.max(1, Math.floor(drawCanvas.width / sampleSize));
        const stepY = Math.max(1, Math.floor(drawCanvas.height / sampleSize));

        for (let x = 0; x < drawCanvas.width; x += stepX) {
            for (let y = 0; y < drawCanvas.height; y += stepY) {
                const pixel = ctx.getImageData(x, y, 1, 1).data;
                // Check alpha channel — if > 0, there's drawn content
                if (pixel[3] > 10) return true;
            }
        }
        return false;
    }, []);

    /** Trigger save based on current mode */
    const triggerSave = useCallback(() => {
        // Always save as ONE unified canvas image — both drawing + typed text combined
        if (hasDrawingContent()) {
            const dataUrl = saveComposite();
            if (dataUrl) {
                onAnswerChange(questionId, `[DRAWING]:${dataUrl}`);
            }
        } else {
            // No content at all — save empty
            onAnswerChange(questionId, '');
        }
    }, [questionId, onAnswerChange, saveComposite, hasDrawingContent]);

    const clearCanvas = () => {
        const drawCanvas = drawCanvasRef.current;
        if (!drawCanvas) return;
        const ctx = drawCanvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        saveToHistory();
        onAnswerChange(questionId, '');
    };

    /** Add a new page — extends canvas height while preserving content */
    const addPage = useCallback(() => {
        const bgCanvas = bgCanvasRef.current;
        const drawCanvas = drawCanvasRef.current;
        if (!bgCanvas || !drawCanvas) return;

        const bgCtx = bgCanvas.getContext('2d');
        const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
        if (!bgCtx || !drawCtx) return;

        // Save existing drawing to a temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = drawCanvas.width;
        tempCanvas.height = drawCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.drawImage(drawCanvas, 0, 0);
        }

        // Increment page count → triggers getVirtualHeight to return larger value
        const newPageCount = pageCount + 1;
        const newHeight = BASE_PAGE_HEIGHT * newPageCount;

        // Resize canvases (clears them)
        bgCanvas.width = VIRTUAL_WIDTH;
        bgCanvas.height = newHeight;
        drawCanvas.width = VIRTUAL_WIDTH;
        drawCanvas.height = newHeight;

        // Redraw paper background for the full new height
        drawPaper(bgCtx, VIRTUAL_WIDTH, newHeight);

        // Restore existing drawing
        drawCtx.clearRect(0, 0, VIRTUAL_WIDTH, newHeight);
        if (tempCtx) {
            drawCtx.drawImage(tempCanvas, 0, 0);
        }

        // Update canvas height ref
        canvasHeightRef.current = newHeight;

        // Update page count state (this will re-render with correct dimensions)
        setPageCount(newPageCount);

        // Save to history
        saveToHistory();

        // Scroll to the new page area
        setTimeout(() => {
            scrollContainerRef.current?.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }, [pageCount, BASE_PAGE_HEIGHT, drawPaper, saveToHistory]);

    // Auto-adjust page count when typing exceeds current height
    useEffect(() => {
        if (answerMode === 'type' && typingAreaRef.current && isCanvasReady) {
            const el = typingAreaRef.current;
            if (el.scrollHeight > el.clientHeight && canvasHeightRef.current > 0) {
                const requiredPages = Math.ceil(el.scrollHeight / (BASE_PAGE_HEIGHT * zoom));
                if (requiredPages > pageCount) {
                    const bgCanvas = bgCanvasRef.current;
                    const drawCanvas = drawCanvasRef.current;
                    if (!bgCanvas || !drawCanvas) return;

                    const bgCtx = bgCanvas.getContext('2d');
                    const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
                    if (!bgCtx || !drawCtx) return;

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = drawCanvas.width;
                    tempCanvas.height = drawCanvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    if (tempCtx) {
                        tempCtx.drawImage(drawCanvas, 0, 0);
                    }

                    const newHeight = BASE_PAGE_HEIGHT * requiredPages;
                    bgCanvas.width = VIRTUAL_WIDTH;
                    bgCanvas.height = newHeight;
                    drawCanvas.width = VIRTUAL_WIDTH;
                    drawCanvas.height = newHeight;

                    drawPaper(bgCtx, VIRTUAL_WIDTH, newHeight);
                    drawCtx.clearRect(0, 0, VIRTUAL_WIDTH, newHeight);
                    if (tempCtx) {
                        drawCtx.drawImage(tempCanvas, 0, 0);
                    }

                    canvasHeightRef.current = newHeight;
                    setPageCount(requiredPages);
                    saveToHistory();
                }
            }
        }
    }, [typedText, zoom, pageCount, answerMode, isCanvasReady, BASE_PAGE_HEIGHT, drawPaper]);

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-SAVE (debounced + visibility change + unmount)
    // ═══════════════════════════════════════════════════════════════════

    // Debounced save for typing — saves as composite image (same as writing)
    useEffect(() => {
        if (!isCanvasReady || answerMode !== 'type') return;

        const timeout = setTimeout(() => {
            // Save as composite canvas image so typed text is part of the answer sheet
            if (hasDrawingContent()) {
                const dataUrl = saveComposite();
                if (dataUrl) onAnswerChange(questionId, `[DRAWING]:${dataUrl}`);
            }
        }, 600);

        return () => clearTimeout(timeout);
    }, [typedText, isCanvasReady, answerMode, questionId, saveComposite, hasDrawingContent]);

    // Save on visibility change (prevents null on tab switch auto-submit)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Page is being hidden — save unified canvas immediately
                if (hasDrawingContent()) {
                    const dataUrl = saveComposite();
                    if (dataUrl) onAnswerChange(questionId, `[DRAWING]:${dataUrl}`);
                }
            }
        };

        const handleBeforeUnload = () => {
            // Always save as ONE unified image — both drawing + typed text
            if (hasDrawingContent()) {
                const dataUrl = saveComposite();
                if (dataUrl) onAnswerChange(questionId, `[DRAWING]:${dataUrl}`);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Save on unmount (question switch)
            handleBeforeUnload();
        };
    }, [questionId]);

    // ═══════════════════════════════════════════════════════════════════
    // MODE SWITCHING — NO DATA CLEARING, only toolbar changes
    // Both write and type content coexist on the same canvas
    // ═══════════════════════════════════════════════════════════════════

    const switchMode = (newMode: 'write' | 'type') => {
        if (newMode === answerMode) return;

        // Capture HTML content before switching away from type mode
        if (answerMode === 'type' && typingAreaRef.current) {
            typedHtmlRef.current = typingAreaRef.current.innerHTML;
            setTypedHtmlForDisplay(typedHtmlRef.current);
            setTypedText(typingAreaRef.current.innerText || '');
        }

        setAnswerMode(newMode);
        onModeChange?.(questionId, newMode);

        if (newMode === 'type') {
            // Reset draw tool so shape tools don't block typing
            setDrawTool('pen');
            // Restore HTML content and focus
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

    // ═══════════════════════════════════════════════════════════════════
    // ZOOM CONTROLS
    // ═══════════════════════════════════════════════════════════════════

    const handleZoomIn = () => setZoom(prev => Math.min(MAX_ZOOM, +(prev + ZOOM_STEP).toFixed(1)));
    const handleZoomOut = () => setZoom(prev => Math.max(MIN_ZOOM, +(prev - ZOOM_STEP).toFixed(1)));

    // ═══════════════════════════════════════════════════════════════════
    // PAPER TYPE CHANGE
    // ═══════════════════════════════════════════════════════════════════

    // const handlePaperChange = (type: 'blank' | 'ruled' | 'grid' | 'dotted') => {
    //     if (type === paperType) return;
    //     if (hasDrawingContent()) {
    //         if (!window.confirm('Changing paper will not affect your drawing. Continue?')) return;
    //     }
    //     setPaperType(type);
    // };

    const goToNextPage = () => {
        if (currentPage < pageCount) {
            scrollContainerRef.current?.scrollTo({ top: currentPage * BASE_PAGE_HEIGHT * zoom, behavior: 'smooth' });
            setCurrentPage(prev => prev + 1);
        }
    };

    const goToPrevPage = () => {
        if (currentPage > 1) {
            scrollContainerRef.current?.scrollTo({ top: (currentPage - 2) * BASE_PAGE_HEIGHT * zoom, behavior: 'smooth' });
            setCurrentPage(prev => prev - 1);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // RENDER: PAGINATION
    // ═══════════════════════════════════════════════════════════════════

    const renderPagination = (isDark: boolean = false) => (
        <div className={`flex items-center gap-2 ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-gray-100 text-gray-800 border-gray-300'} rounded-lg p-1 shadow-sm border`}>
            <button onClick={goToPrevPage} disabled={currentPage <= 1} className={`p-1.5 rounded ${isDark ? 'hover:bg-white/20' : 'hover:bg-gray-200'} disabled:opacity-40 transition-colors`} title="Previous Page">
                <ArrowLeft className="w-4 h-4" />
            </button>
            <span className={`text-sm font-bold min-w-[70px] text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>Pg {currentPage} / {pageCount}</span>
            <button onClick={goToNextPage} disabled={currentPage >= pageCount} className={`p-1.5 rounded ${isDark ? 'hover:bg-white/20' : 'hover:bg-gray-200'} disabled:opacity-40 transition-colors`} title="Next Page">
                <ArrowRight className="w-4 h-4" />
            </button>

            <div className={`w-px h-5 mx-1 ${isDark ? 'bg-white/30' : 'bg-gray-300'}`} />

            <button
                onClick={() => { addPage(); setCurrentPage(pageCount + 1); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 ${isDark ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'} rounded-md text-sm font-bold transition-all`}
                title="Add a new page for more writing space"
            >
                <Plus className="w-4 h-4" />
                Add Page
            </button>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    // RENDER: TOOLBAR (shared between normal + fullscreen)
    // ═══════════════════════════════════════════════════════════════════

    const renderToolbar = (compact: boolean = false) => (
        <div className={`flex items-center gap-2 md:gap-3 ${compact ? 'p-2' : 'p-3'} bg-gray-100 border-b flex-wrap select-none w-full`}>
            {/* Mode Toggle Group */}
            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                <button
                    onClick={() => switchMode('write')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${answerMode === 'write' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <PenTool className="w-4 h-4" /> Write
                </button>
                <div className="w-px h-5 bg-gray-200 mx-1 self-center" />
                <button
                    onClick={() => switchMode('type')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${answerMode === 'type' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Keyboard className="w-4 h-4" /> Type
                </button>
            </div>

            {answerMode === 'write' && (
                <>
                    {/* Drawing Tools Group */}
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <button onClick={() => setDrawTool('select')} className={`p-2 rounded-lg ${drawTool === 'select' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`} title="Select & Move">
                            <MousePointer className="w-4 h-4" />
                        </button>
                        <div className="w-px h-5 bg-gray-200 mx-1" />
                        <button onClick={() => setDrawTool('pen')} className={`p-2 rounded-lg ${drawTool === 'pen' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`} title="Pen">
                            <PenTool className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDrawTool('highlighter')} className={`p-2 rounded-lg ${drawTool === 'highlighter' ? 'bg-yellow-400 text-black' : 'hover:bg-gray-100'}`} title="Highlighter">
                            <Highlighter className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setDrawTool('eraser')} className={`p-2 rounded-lg ${drawTool === 'eraser' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`} title="Eraser">
                                <Eraser className="w-4 h-4" />
                            </button>
                            {drawTool === 'eraser' && (
                                <input type="range" min="10" max="60" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} className="w-16 accent-blue-500" title="Eraser Size" />
                            )}
                        </div>
                        <div className="w-px h-5 bg-gray-200 mx-1" />
                        <button onClick={() => setDrawTool('text')} className={`p-2 rounded-lg ${drawTool === 'text' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`} title="Canvas Text">
                            <Type className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Shapes Group */}
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 flex-wrap">
                        {([['line', Minus], ['arrow', ArrowRight], ['rectangle', Square], ['circle', Circle], ['triangle', Triangle], ['star', Star], ['heart', Heart], ['hexagon', Hexagon]] as const).map(([tool, Icon]) => (
                            <button key={tool} onClick={() => setDrawTool(tool as DrawTool)} className={`p-2 rounded-lg ${drawTool === tool ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`} title={tool}>
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>

                    {/* Text Formatting Tools (Visible only when text is selected) */}
                    {drawTool === 'select' && selectedTextId && (
                        <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-xl p-1 shadow-sm shrink-0">
                            <button onClick={() => {
                                setFloatingTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, isBold: !t.isBold } : t));
                                triggerSave();
                            }} className={`p-1.5 rounded-lg ${floatingTexts.find(t => t.id === selectedTextId)?.isBold ? 'bg-blue-500 text-white' : 'hover:bg-white text-gray-700'}`} title="Bold">
                                <Bold className="w-4 h-4" />
                            </button>
                            <input type="range" min="12" max="72" value={floatingTexts.find(t => t.id === selectedTextId)?.fontSize || 20}
                                onChange={e => {
                                    setFloatingTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, fontSize: Number(e.target.value) } : t));
                                }}
                                onMouseUp={triggerSave}
                                onTouchEnd={triggerSave}
                                className="w-20 mx-2 accent-blue-600" title="Font Size" />
                            <button onClick={() => {
                                setFloatingTexts(prev => prev.filter(t => t.id !== selectedTextId));
                                setSelectedTextId(null);
                                triggerSave();
                            }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete Text">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Colors Group */}
                    <div className="flex items-center gap-1.5 bg-white rounded-xl p-1.5 shadow-sm border border-gray-200 flex-wrap max-w-xs md:max-w-none">
                        {COLORS.map(color => (
                            <button
                                key={color}
                                onClick={() => {
                                    setPenColor(color);
                                    if (drawTool === 'eraser') setDrawTool('pen');
                                    if (drawTool === 'select' && selectedTextId) {
                                        setFloatingTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, color } : t));
                                        triggerSave();
                                    }
                                }}
                                className={`w-6 h-6 rounded-full border-2 ${penColor === color ? 'border-blue-500 ring-2 ring-blue-200 scale-110' : 'border-gray-300'} transition-transform`}
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>

                    {/* Pen Sizes Group */}
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        {[2, 4, 6].map(size => (
                            <button key={size} onClick={() => setPenSize(size)} className={`p-2 rounded-lg ${penSize === size ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
                                <div className="rounded-full bg-gray-800 mx-auto" style={{ width: size * 2.5, height: size * 2.5 }} />
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ═══ TYPE MODE TOOLS ═══ */}
            {answerMode === 'type' && (
                <>
                    {/* Text Formatting Group */}
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <button
                            onMouseDown={e => { e.preventDefault(); applyFormat('bold'); }}
                            className="p-2 rounded-lg transition-all hover:bg-gray-100 font-bold text-gray-700"
                            title="Bold (only affects selected text)"
                        >
                            <Bold className="w-4 h-4" />
                        </button>
                        <button
                            onMouseDown={e => { e.preventDefault(); applyFormat('italic'); }}
                            className="p-2 rounded-lg transition-all hover:bg-gray-100 text-gray-700"
                            title="Italic (only affects selected text)"
                        >
                            <Italic className="w-4 h-4" />
                        </button>
                        <button
                            onMouseDown={e => { e.preventDefault(); applyFormat('underline'); }}
                            className="p-2 rounded-lg transition-all hover:bg-gray-100 text-gray-700"
                            title="Underline (only affects selected text)"
                        >
                            <Underline className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Font Selections Group */}
                    <div className="flex items-center gap-1.5 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <select
                            value={typingFontFamily}
                            onChange={e => setTypingFontFamily(e.target.value)}
                            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-purple-500"
                            title="Font Family"
                        >
                            {FONT_FAMILIES.map(f => (
                                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                            ))}
                        </select>

                        <select
                            value={typingFontSize}
                            onChange={e => setTypingFontSize(Number(e.target.value))}
                            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold cursor-pointer outline-none w-16 focus:ring-1 focus:ring-purple-500"
                            title="Font Size"
                        >
                            {FONT_SIZES.map(s => (
                                <option key={s} value={s}>{s}px</option>
                            ))}
                        </select>
                    </div>

                    {/* Alignment Group */}
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <button onClick={() => setTypingAlignment('left')} className={`p-2 rounded-lg ${typingAlignment === 'left' ? 'bg-purple-500 text-white' : 'hover:bg-gray-100'}`} title="Align Left">
                            <AlignLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setTypingAlignment('center')} className={`p-2 rounded-lg ${typingAlignment === 'center' ? 'bg-purple-500 text-white' : 'hover:bg-gray-100'}`} title="Align Center">
                            <AlignCenter className="w-4 h-4" />
                        </button>
                        <button onClick={() => setTypingAlignment('right')} className={`p-2 rounded-lg ${typingAlignment === 'right' ? 'bg-purple-500 text-white' : 'hover:bg-gray-100'}`} title="Align Right">
                            <AlignRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Typing Colors Group */}
                    <div className="flex items-center gap-1.5 bg-white rounded-xl p-1.5 shadow-sm border border-gray-200 flex-wrap max-w-xs md:max-w-none">
                        {COLORS.map(color => (
                            <button
                                key={color}
                                onClick={() => setPenColor(color)}
                                className={`w-6 h-6 rounded-full border-2 ${penColor === color ? 'border-purple-500 ring-2 ring-purple-200 scale-110' : 'border-gray-300'} transition-transform`}
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>

                    {/* Clear Group */}
                    <div className="flex items-center gap-1.5 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <button onClick={() => {
                            setTypedText('');
                            setTypedHtmlForDisplay('');
                            typedHtmlRef.current = '';
                            if (typingAreaRef.current) typingAreaRef.current.innerHTML = '';
                        }} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-semibold transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" /> Clear
                        </button>
                    </div>
                </>
            )}

            {/* Spacer */}
            <div className="flex-grow min-w-[8px] hidden md:block" />

            {/* Right Group: Count, Pagination, Zoom, Undo/Redo, Fullscreen */}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
                {/* Count for typing */}
                {answerMode === 'type' && typedText.length > 0 && (
                    <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1.5 rounded-lg border border-gray-200 shadow-sm shrink-0">
                        {typedText.split(/\s+/).filter(Boolean).length} words • {typedText.length} chars
                    </span>
                )}

                {/* Pagination */}
                {renderPagination(false)}

                {/* Zoom Control */}
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                    <button onClick={handleZoomOut} className="p-1.5 rounded-lg hover:bg-gray-100" title="Zoom Out">
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-gray-700 min-w-[42px] text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1.5 rounded-lg hover:bg-gray-100" title="Zoom In">
                        <ZoomIn className="w-4 h-4" />
                    </button>
                </div>

                {/* Write Mode Undo/Redo/Clear */}
                {answerMode === 'write' && (
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <button onClick={undo} disabled={historyIndex <= 0} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors" title="Undo">
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors" title="Redo">
                            <Redo2 className="w-4 h-4" />
                        </button>
                        <button onClick={clearCanvas} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-semibold transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" /> Clear Canvas
                        </button>
                    </div>
                )}

                {/* Fullscreen Button */}
                {!isFullscreen && (
                    <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-gray-200 shrink-0">
                        <button
                            onClick={() => setIsFullscreen(true)}
                            className="p-1.5 px-3 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all font-semibold flex items-center gap-1 text-sm"
                            title="Fullscreen for comfortable writing"
                        >
                            <Maximize2 className="w-4 h-4" /> Fullscreen
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    // RENDER: SINGLE UNIFIED TREE (canvas never recreated)
    // Fullscreen is purely CSS — canvas elements stay alive in DOM
    // ═══════════════════════════════════════════════════════════════════

    return (
        <div className="exam-answer-input bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* ─── UNIFIED CANVAS AREA (same canvas elements for both views) ─── */}
            <div
                className={
                    isFullscreen
                        ? 'fixed inset-0 z-50 bg-white flex flex-col'
                        : 'p-4 bg-gray-50'
                }
            >
                {/* Fullscreen Header (only visible in fullscreen) */}
                {isFullscreen && (
                    <div className="flex items-center gap-4 p-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
                        <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                            <Minimize2 className="w-5 h-5" />
                        </button>
                        <div className="flex-1">
                            <div className="text-base font-bold">Question • {marks} marks</div>
                            {questionText && <div className="text-sm opacity-90 mt-0.5 line-clamp-1">{questionText}</div>}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 opacity-60" />
                                <span className="text-sm font-semibold opacity-90">
                                    {answerMode === 'write' ? '✍️ Writing Mode' : '⌨️ Typing Mode'}
                                </span>
                            </div>
                            <span className="px-3 py-1.5 bg-white/20 rounded-lg font-bold text-sm block ml-2">{marks} marks</span>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                {renderToolbar(isFullscreen ? false : true)}

                {/* Dual-Layer Canvas — SAME elements, never recreated */}
                <div className={isFullscreen ? 'flex-1 p-4 overflow-hidden' : 'mt-3 flex justify-center'}>
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="overflow-auto border-2 border-gray-300 rounded-xl bg-gray-200 shadow-inner relative"
                        style={{
                            height: isFullscreen
                                ? 'calc(100vh - 180px)'
                                : 'clamp(250px, 45vh, 500px)',
                            width: '100%',
                            maxWidth: `${VIRTUAL_WIDTH * zoom}px`,
                            margin: '0 auto'
                        }}
                    >
                        <div
                            ref={containerRef}
                            className="relative"
                            style={{
                                width: VIRTUAL_WIDTH * zoom,
                                height: getVirtualHeight() * zoom,
                                transformOrigin: 'top left',
                            }}
                        >
                            {/* Background Canvas (paper lines — NOT interactive, NOT erasable) */}
                            <canvas
                                ref={bgCanvasRef}
                                className="absolute inset-0 pointer-events-none"
                                style={{ width: '100%', height: '100%' }}
                            />

                            {/* Drawing Canvas (student strokes — interactive in WRITE mode only) */}
                            <canvas
                                ref={drawCanvasRef}
                                className={`absolute inset-0 ${answerMode === 'write' ? (drawTool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair') : ''} touch-none`}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    pointerEvents: answerMode === 'write' ? 'auto' : 'none'
                                }}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawing}
                                onTouchMove={draw}
                                onTouchEnd={stopDrawing}
                            />

                            {/* Typed text read-only overlay — visible in WRITE mode so text doesn't disappear */}
                            {answerMode === 'write' && typedHtmlForDisplay && (
                                <div
                                    className="absolute inset-x-0 pointer-events-none select-none"
                                    style={{
                                        top: 0,
                                        bottom: 0,
                                        width: '100%',
                                        height: '100%',
                                        zIndex: 15,
                                        paddingTop: `${8 * zoom}px`,
                                        paddingLeft: `${90 * zoom}px`,
                                        paddingRight: `${40 * zoom}px`,
                                        paddingBottom: `${20 * zoom}px`,
                                        fontSize: `${typingFontSize * zoom}px`,
                                        fontFamily: typingFontFamily,
                                        textAlign: typingAlignment,
                                        color: penColor,
                                        lineHeight: `${45 * zoom}px`,
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
                            {answerMode === 'type' && (
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
                                        // Capture final state on blur
                                        if (typingAreaRef.current) {
                                            typedHtmlRef.current = typingAreaRef.current.innerHTML;
                                            setTypedHtmlForDisplay(typingAreaRef.current.innerHTML);
                                        }
                                    }}
                                    onClick={(e) => {
                                        const el = typingAreaRef.current;
                                        if (!el) return;

                                        const rect = el.getBoundingClientRect();
                                        const clickY = (e.clientY - rect.top) / zoom;
                                        const paddingTop = 8;
                                        const lineHeight = 45;

                                        const clickedLineIndex = Math.floor(Math.max(0, clickY - paddingTop) / lineHeight);

                                        const range = document.createRange();
                                        range.selectNodeContents(el);
                                        const rects = range.getClientRects();

                                        let currentLastLineIndex = 0;
                                        let hasTextRects = false;

                                        if (rects.length > 0) {
                                            let maxBottom = rect.top + (paddingTop * zoom);
                                            for (let i = 0; i < rects.length; i++) {
                                                if (rects[i].bottom > maxBottom) {
                                                    maxBottom = rects[i].bottom;
                                                    hasTextRects = true;
                                                }
                                            }
                                            if (hasTextRects) {
                                                const textBottomY = (maxBottom - rect.top) / zoom;
                                                currentLastLineIndex = Math.floor(Math.max(0, textBottomY - paddingTop) / lineHeight);
                                            }
                                        }

                                        // If no visible text rects, count newlines
                                        if (!hasTextRects) {
                                            const newlinesMatch = (el.innerText || '').match(/\n/g);
                                            currentLastLineIndex = newlinesMatch ? newlinesMatch.length : 0;
                                        }

                                        if (clickedLineIndex > currentLastLineIndex) {
                                            // Focus to ensure system keyboard triggers, instead of preventing default
                                            el.focus();
                                            const linesToAdd = clickedLineIndex - currentLastLineIndex;
                                            const textNode = document.createTextNode('\n'.repeat(linesToAdd));
                                            el.appendChild(textNode);

                                            // Adjust cursor
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
                                    data-placeholder="Start typing your answer here... Text wraps on the ruled lines like Microsoft Word."
                                    className="absolute inset-x-0 outline-none bg-transparent typing-area-editable"
                                    style={{
                                        top: 0,
                                        bottom: 0,
                                        width: '100%',
                                        height: '100%',
                                        zIndex: 20,
                                        pointerEvents: 'auto',
                                        cursor: 'text',
                                        caretColor: penColor,
                                        paddingTop: `${8 * zoom}px`,
                                        paddingLeft: `${90 * zoom}px`,
                                        paddingRight: `${40 * zoom}px`,
                                        paddingBottom: `${20 * zoom}px`,
                                        fontSize: `${typingFontSize * zoom}px`,
                                        fontFamily: typingFontFamily,
                                        textAlign: typingAlignment,
                                        color: penColor,
                                        lineHeight: `${45 * zoom}px`,
                                        overflow: 'auto',
                                        wordWrap: 'break-word',
                                        overflowWrap: 'break-word',
                                        whiteSpace: 'pre-wrap',
                                    }}
                                />
                            )}

                            {/* Overlay Text Elements */}
                            {floatingTexts.map(txt => {
                                const isSelected = selectedTextId === txt.id && drawTool === 'select';
                                return (
                                    <div
                                        key={txt.id}
                                        style={{
                                            position: 'absolute',
                                            left: txt.x * zoom,
                                            top: txt.y * zoom,
                                            width: txt.width * zoom,
                                            height: txt.height * zoom,
                                            border: isSelected ? '2px dashed #3b82f6' : '1px solid transparent',
                                            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                                            pointerEvents: drawTool === 'select' || drawTool === 'text' ? 'auto' : 'none',
                                            zIndex: 10
                                        }}
                                        onMouseDown={(e) => {
                                            if (drawTool !== 'select') return;
                                            e.stopPropagation();
                                            setSelectedTextId(txt.id);
                                            overlayDragRef.current = { id: txt.id, startX: e.clientX, startY: e.clientY, objX: txt.x, objY: txt.y, action: 'move' };
                                        }}
                                        onTouchStart={(e) => {
                                            if (drawTool !== 'select') return;
                                            e.stopPropagation();
                                            setSelectedTextId(txt.id);
                                            overlayDragRef.current = { id: txt.id, startX: e.touches[0].clientX, startY: e.touches[0].clientY, objX: txt.x, objY: txt.y, action: 'move' };
                                        }}
                                    >
                                        {isSelected && (
                                            <div
                                                style={{
                                                    position: 'absolute', bottom: -5, right: -5, width: 14, height: 14, backgroundColor: '#3b82f6', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid white'
                                                }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    overlayDragRef.current = { id: txt.id, startX: e.clientX, startY: e.clientY, objX: txt.width, objY: txt.height, action: 'resize' };
                                                }}
                                                onTouchStart={(e) => {
                                                    e.stopPropagation();
                                                    overlayDragRef.current = { id: txt.id, startX: e.touches[0].clientX, startY: e.touches[0].clientY, objX: txt.width, objY: txt.height, action: 'resize' };
                                                }}
                                            />
                                        )}
                                        <textarea
                                            value={txt.text}
                                            onChange={(e) => {
                                                setFloatingTexts(prev => prev.map(t => t.id === txt.id ? { ...t, text: e.target.value } : t));
                                            }}
                                            onBlur={triggerSave}
                                            style={{
                                                width: '100%', height: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none',
                                                color: txt.color,
                                                fontSize: `${txt.fontSize * zoom}px`,
                                                fontWeight: txt.isBold ? 'bold' : 'normal',
                                                fontFamily: 'sans-serif',
                                                padding: '8px',
                                                lineHeight: 1.2
                                            }}
                                            placeholder={isSelected ? "Type text..." : ""}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Help text */}
                {!isFullscreen && (
                    <p className="text-sm text-gray-500 text-center mt-2 pb-2">
                        ✍️ {answerMode === 'write' ? 'Write your answer • Eraser only erases your strokes, not ruled lines •' : 'Type your answer cleanly on the paper •'}
                        Click <Maximize2 className="w-3.5 h-3.5 inline" /> for fullscreen
                    </p>
                )}
            </div>

        </div>
    );
}