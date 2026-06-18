import { useState, useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { 
    ChevronLeft, 
    ChevronRight, 
    ZoomIn, 
    ZoomOut, 
    Maximize2, 
    Download, 
    Loader2, 
    AlertCircle 
} from 'lucide-react';

// Configure the worker using local Vite URL resolver
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PDFViewerProps {
    url: string;
    title?: string;
}

export default function PDFViewer({ url, title = 'PDF Document' }: PDFViewerProps) {
    const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [renderingPage, setRenderingPage] = useState<boolean>(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const renderTaskRef = useRef<any>(null);

    // Fetch and load PDF
    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);
        setPageNumber(1);

        const loadPDF = async () => {
            try {
                // Fetch the PDF file as an array buffer to handle CORS/attachment configurations
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch PDF: ${response.statusText} (${response.status})`);
                }
                const buffer = await response.arrayBuffer();

                if (!isMounted) return;

                const loadingTask = pdfjs.getDocument({ data: buffer });
                const pdfDoc = await loadingTask.promise;

                if (isMounted) {
                    setPdf(pdfDoc);
                    setNumPages(pdfDoc.numPages);
                    setLoading(false);
                }
            } catch (err: any) {
                console.error('Error loading PDF via custom viewer:', err);
                if (isMounted) {
                    setError(err.message || 'Failed to load PDF document.');
                    setLoading(false);
                }
            }
        };

        loadPDF();

        return () => {
            isMounted = false;
        };
    }, [url]);

    // Automatically adapt scale to fit container width
    useEffect(() => {
        if (!pdf || !containerRef.current) return;

        const handleResize = (width: number) => {
            if (width <= 0) return;
            
            pdf.getPage(pageNumber).then(page => {
                const viewport = page.getViewport({ scale: 1.0 });
                // Padding is 48px total (24px left + 24px right)
                const targetScale = (width - 48) / viewport.width;
                
                // Avoid updating state if the change is negligible to prevent render loops
                setScale(prev => {
                    if (Math.abs(prev - targetScale) > 0.01) {
                        return Math.min(Math.max(0.4, targetScale), 2.0);
                    }
                    return prev;
                });
            }).catch(err => {
                console.error('Resize observer getPage error:', err);
            });
        };

        const observer = new ResizeObserver((entries) => {
            if (!entries || entries.length === 0) return;
            const width = entries[0].contentRect.width;
            handleResize(width);
        });

        observer.observe(containerRef.current);

        // Initial run to ensure it fits immediately on load
        const initialWidth = containerRef.current.clientWidth;
        if (initialWidth > 0) {
            handleResize(initialWidth);
        }

        return () => {
            observer.disconnect();
        };
    }, [pdf, pageNumber]);

    // Render page when pdf, pageNumber, or scale changes
    useEffect(() => {
        if (!pdf || !canvasRef.current) return;

        const renderPage = async () => {
            try {
                setRenderingPage(true);
                const page = await pdf.getPage(pageNumber);
                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                if (!context) return;

                // If there's an active render task, cancel it first
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                }

                const viewport = page.getViewport({ scale });
                
                // Set canvas display size and resolution
                const outputScale = window.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * outputScale);
                canvas.height = Math.floor(viewport.height * outputScale);
                canvas.style.width = Math.floor(viewport.width) + 'px';
                canvas.style.height = Math.floor(viewport.height) + 'px';

                const transform = outputScale !== 1
                    ? [outputScale, 0, 0, outputScale, 0, 0]
                    : null;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                    transform: transform || undefined,
                    canvas: null
                };

                const renderTask = page.render(renderContext);
                renderTaskRef.current = renderTask;

                await renderTask.promise;
                setRenderingPage(false);
            } catch (err: any) {
                if (err.name === 'RenderingCancelledException') {
                    // Ignore cancelled renders
                    return;
                }
                console.error('Error rendering PDF page:', err);
                setRenderingPage(false);
            }
        };

        renderPage();

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
        };
    }, [pdf, pageNumber, scale]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                changePage(-1);
            } else if (e.key === 'ArrowRight') {
                changePage(1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pdf, pageNumber, numPages]);

    const changePage = (offset: number) => {
        setPageNumber(prevPageNumber => {
            const newPage = prevPageNumber + offset;
            return Math.min(Math.max(1, newPage), numPages);
        });
    };

    const zoom = (factor: number) => {
        setScale(prevScale => {
            const newScale = prevScale + factor;
            return Math.min(Math.max(0.5, newScale), 2.5);
        });
    };

    const fitToWidth = () => {
        if (!containerRef.current || !pdf) return;
        const containerWidth = containerRef.current.clientWidth || 800;
        
        pdf.getPage(pageNumber).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            // Calculate scale to fit width minus padding
            const targetScale = (containerWidth - 48) / viewport.width;
            setScale(Math.min(Math.max(0.4, targetScale), 2.0));
        });
    };

    return (
        <div className="flex flex-col flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl min-h-[500px]">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-850 px-4 py-3 border-b border-slate-750 text-slate-200">
                <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-slate-100 line-clamp-1">{title}</span>
                </div>

                {/* Controls (Disabled during loading/error) */}
                {!loading && !error && (
                    <div className="flex items-center space-x-4">
                        {/* Page Navigation */}
                        <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
                            <button
                                onClick={() => changePage(-1)}
                                disabled={pageNumber <= 1}
                                className="p-1.5 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
                                title="Previous Page"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-medium px-3 text-slate-200 select-none">
                                Page {pageNumber} of {numPages}
                            </span>
                            <button
                                onClick={() => changePage(1)}
                                disabled={pageNumber >= numPages}
                                className="p-1.5 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
                                title="Next Page"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Zoom Controls */}
                        <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
                            <button
                                onClick={() => zoom(-0.2)}
                                disabled={scale <= 0.6}
                                className="p-1.5 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-semibold px-2 text-slate-200 w-12 text-center select-none">
                                {Math.round(scale * 100)}%
                            </span>
                            <button
                                onClick={() => zoom(0.2)}
                                disabled={scale >= 2.4}
                                className="p-1.5 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <div className="w-px h-4 bg-slate-700 mx-1" />
                            <button
                                onClick={fitToWidth}
                                className="p-1.5 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                                title="Fit to Width"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex items-center space-x-2">
                    <a
                        href={url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                    </a>
                </div>
            </div>

            {/* Canvas/Document Area */}
            <div ref={containerRef} className="flex-1 overflow-auto bg-slate-950 p-6 flex justify-center items-start min-h-[400px] relative">
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950/80 z-10 space-y-3">
                        <Loader2 className="w-10 h-10 animate-spin text-green-500" />
                        <span className="text-sm font-medium">Loading PDF document...</span>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950/95 z-10 p-6 text-center max-w-md mx-auto space-y-4">
                        <AlertCircle className="w-12 h-12 text-red-500" />
                        <h4 className="text-lg font-bold text-slate-200">Unable to display PDF</h4>
                        <p className="text-sm text-slate-400">{error}</p>
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-sm font-semibold transition-colors"
                        >
                            Open in New Tab / Download Directly
                        </a>
                    </div>
                )}

                {renderingPage && !loading && (
                    <div className="absolute top-4 right-4 bg-slate-900/80 border border-slate-750 text-slate-300 text-xs px-2.5 py-1 rounded-full flex items-center space-x-1.5 shadow-lg select-none z-10">
                        <Loader2 className="w-3 h-3 animate-spin text-green-500" />
                        <span>Rendering Page {pageNumber}...</span>
                    </div>
                )}

                {/* The rendering canvas */}
                <div className="shadow-2xl border border-slate-800 bg-white rounded-md overflow-hidden transition-all duration-200">
                    <canvas ref={canvasRef} />
                </div>
            </div>
        </div>
    );
}
