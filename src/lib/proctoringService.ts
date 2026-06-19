// ===================================================================
// Proctoring Service - Exam Security & Screenshot Capture
// ===================================================================

import { supabase } from './supabase';

export interface ProctoringEvent {
    id: string;
    exam_id: string;
    student_id: string;
    event_type: 'tab_switch' | 'fullscreen_exit' | 'copy_paste' | 'right_click' | 'screenshot' | 'blur' | 'focus' | 'exam_start' | 'exam_end';
    timestamp: string;
    details?: string;
    screenshot_data?: string;
}

export interface ProctoringSession {
    id: string;
    exam_id: string;
    student_id: string;
    started_at: string;
    status: 'active' | 'completed' | 'flagged';
    total_violations: number;
    screenshots: string[];
    events: ProctoringEvent[];
    settings?: ProctoringSettings;
}

export interface ProctoringSettings {
    enableScreenshots: boolean;
    screenshotInterval: number;
    enableAntiCheat: boolean;
    enableOfflineMode: boolean;
}

// In-memory storage for demo purposes (in production, use MongoDB)
const proctoringStore: {
    sessions: Map<string, ProctoringSession>;
    events: ProctoringEvent[];
} = {
    sessions: new Map(),
    events: []
};

// Screenshot capture utility
export const captureScreenshot = async (): Promise<string | null> => {
    try {
        // Dynamic import for html2canvas - will work if installed
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(document.body, {
                logging: false,
                useCORS: true,
                scale: 0.5, // Reduce quality for smaller file size
                width: window.innerWidth,
                height: window.innerHeight
            });
            return canvas.toDataURL('image/webp', 0.5);
        } catch {
            // Fallback - return null if html2canvas is not available
            console.warn('html2canvas not available, skipping screenshot');
            return null;
        }
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        return null;
    }
};

// Log proctoring event
export const logProctoringEvent = async (
    examId: string,
    studentId: string,
    eventType: ProctoringEvent['event_type'],
    details?: string,
    captureScreen: boolean = false
): Promise<void> => {
    try {
        let screenshotData: string | null = null;

        if (captureScreen && eventType !== 'screenshot') {
            screenshotData = await captureScreenshot();
        }

        const event: ProctoringEvent = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            exam_id: examId,
            student_id: studentId,
            event_type: eventType,
            timestamp: new Date().toISOString(),
            details,
            screenshot_data: screenshotData || undefined
        };

        // Store in memory (in production, use MongoDB)
        proctoringStore.events.push(event);

        // Update session if exists
        const sessionKey = `${examId}_${studentId}`;
        const session = proctoringStore.sessions.get(sessionKey);
        if (session) {
            session.events.push(event);
            if (screenshotData) {
                session.screenshots.push(screenshotData);
            }
        }

        console.log('Proctoring event logged:', eventType, details);
    } catch (error) {
        console.error('Failed to log proctoring event:', error);
    }
};

// Periodic screenshot capture
export const startPeriodicScreenshots = (
    examId: string,
    studentId: string,
    intervalMs: number = 120000,
    onCapture?: (count: number) => void
): (() => void) => {
    let screenshotCount = 0;

    const intervalId = setInterval(async () => {
        const screenshot = await captureScreenshot();
        if (screenshot) {
            screenshotCount++;
            await logProctoringEvent(examId, studentId, 'screenshot', 'Periodic capture');
            onCapture?.(screenshotCount);
        }
    }, intervalMs);

    // Return cleanup function
    return () => {
        clearInterval(intervalId);
    };
};

// Initialize proctoring session
export const initializeProctoringSession = async (
    examId: string,
    studentId: string,
    settings?: ProctoringSettings
): Promise<string> => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: ProctoringSession = {
        id: sessionId,
        exam_id: examId,
        student_id: studentId,
        started_at: new Date().toISOString(),
        status: 'active',
        total_violations: 0,
        screenshots: [],
        events: [],
        settings
    };

    // Store session
    const sessionKey = `${examId}_${studentId}`;
    proctoringStore.sessions.set(sessionKey, session);

    console.log('Proctoring session initialized:', sessionId);
    return sessionId;
};

// Increment violation count
export const incrementViolationCount = async (
    examId: string,
    studentId: string
): Promise<number> => {
    const sessionKey = `${examId}_${studentId}`;
    const session = proctoringStore.sessions.get(sessionKey);

    if (session) {
        session.total_violations++;
        return session.total_violations;
    }
    return 0;
};

// Complete proctoring session
export const completeProctoringSession = async (
    examId: string,
    studentId: string,
    flagged: boolean = false
): Promise<void> => {
    const sessionKey = `${examId}_${studentId}`;
    const session = proctoringStore.sessions.get(sessionKey);

    if (session) {
        session.status = flagged ? 'flagged' : 'completed';
        console.log('Proctoring session completed:', session.id, { flagged });
    }
};

// Get proctoring report
export const getProctoringReport = async (
    examId: string,
    studentId?: string
): Promise<ProctoringSession[]> => {
    const sessions: ProctoringSession[] = [];

    proctoringStore.sessions.forEach(session => {
        if (session.exam_id === examId) {
            if (!studentId || session.student_id === studentId) {
                sessions.push(session);
            }
        }
    });

    return sessions;
};

// Anti-copy/paste detection
export const setupAntiCheating = (
    examId: string,
    studentId: string,
    onViolation: (type: string, count: number) => void
): (() => void) => {
    let violationCount = 0;

    const handleCopy = async (e: Event) => {
        e.preventDefault();
        violationCount++;
        await logProctoringEvent(examId, studentId, 'copy_paste', 'Attempted to copy', true);
        onViolation('copy', violationCount);
    };

    const handlePaste = async (e: Event) => {
        e.preventDefault();
        violationCount++;
        await logProctoringEvent(examId, studentId, 'copy_paste', 'Attempted to paste', true);
        onViolation('paste', violationCount);
    };

    const handleContextMenu = async (e: Event) => {
        e.preventDefault();
        violationCount++;
        await logProctoringEvent(examId, studentId, 'right_click', 'Right-click attempted', true);
        onViolation('right_click', violationCount);
    };

    const handleKeydown = (e: KeyboardEvent) => {
        // Block Ctrl+C, Ctrl+V, Ctrl+P, F12, etc.
        if (
            (e.ctrlKey && ['c', 'v', 'p', 'a', 's'].includes(e.key.toLowerCase())) ||
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && e.key === 'I')
        ) {
            e.preventDefault();
            violationCount++;
            logProctoringEvent(examId, studentId, 'copy_paste', `Blocked key: ${e.key}`, true);
            onViolation('keyblock', violationCount);
        }
    };

    // Add all event listeners
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeydown);

    // Return cleanup function
    return () => {
        document.removeEventListener('copy', handleCopy);
        document.removeEventListener('paste', handlePaste);
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('keydown', handleKeydown);
    };
};

// Check if offline exam mode is available
export const isOfflineModeAvailable = (): boolean => {
    return 'indexedDB' in window && 'serviceWorker' in navigator;
};

// Open IndexedDB for offline storage
const openOfflineDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('FeatureDeskOffline', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains('offline_exams')) {
                db.createObjectStore('offline_exams', { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains('offline_answers')) {
                db.createObjectStore('offline_answers', { keyPath: 'exam_id' });
            }

            if (!db.objectStoreNames.contains('pending_sync')) {
                db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
};

// Save exam data for offline use
export const saveExamForOffline = async (examData: any): Promise<void> => {
    if (!isOfflineModeAvailable()) return;

    try {
        const db = await openOfflineDb();
        const tx = db.transaction('offline_exams', 'readwrite');
        const store = tx.objectStore('offline_exams');

        return new Promise((resolve, reject) => {
            const request = store.put({
                ...examData,
                cached_at: new Date().toISOString()
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to save exam for offline:', error);
    }
};

// Save answers offline
export const saveAnswersOffline = async (
    examId: string,
    studentId: string,
    answers: Record<string, any>
): Promise<void> => {
    if (!isOfflineModeAvailable()) return;

    try {
        const db = await openOfflineDb();
        const tx = db.transaction('offline_answers', 'readwrite');
        const store = tx.objectStore('offline_answers');

        return new Promise((resolve, reject) => {
            const request = store.put({
                exam_id: examId,
                student_id: studentId,
                answers,
                saved_at: new Date().toISOString()
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to save answers offline:', error);
    }
};

// Sync offline data when online
export const syncOfflineData = async (): Promise<void> => {
    if (!navigator.onLine) return;

    try {
        const db = await openOfflineDb();
        const tx = db.transaction('pending_sync', 'readwrite');
        const store = tx.objectStore('pending_sync');

        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = async () => {
            const pending = getAllRequest.result;

            for (const item of pending) {
                try {
                    await supabase.from('exam_submissions').insert(item.data);
                    store.delete(item.id);
                } catch (error) {
                    console.error('Failed to sync item:', item.id, error);
                }
            }
        };
    } catch (error) {
        console.error('Failed to sync offline data:', error);
    }
};

export default {
    captureScreenshot,
    logProctoringEvent,
    startPeriodicScreenshots,
    initializeProctoringSession,
    completeProctoringSession,
    getProctoringReport,
    setupAntiCheating,
    isOfflineModeAvailable,
    saveExamForOffline,
    saveAnswersOffline,
    syncOfflineData
};
