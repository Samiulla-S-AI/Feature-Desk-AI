import React, { useState, useEffect, useRef } from 'react';
import { 
    RefreshCw, 
    AlertTriangle, 
    AlertCircle, 
    Wifi, 
    WifiOff, 
    CheckCircle2, 
    Clock, 
    FileText, 
    BookOpen, 
    Check, 
    ChevronDown
} from 'lucide-react';
import { offlineSyncEngine, SyncEngineStats, SyncStatus } from '../../lib/offlineSyncEngine';

interface SyncStatusIndicatorProps {
    compact?: boolean;
    itemStatus?: SyncStatus;
    itemType?: 'note' | 'exam' | 'quiz';
    customLabel?: string;
    showDetailsPopup?: boolean;
}

export default function SyncStatusIndicator({
    compact = false,
    itemStatus,
    customLabel,
    showDetailsPopup = true
}: SyncStatusIndicatorProps) {
    const [stats, setStats] = useState<SyncEngineStats>(offlineSyncEngine.getStats());
    const [isOpen, setIsOpen] = useState(false);
    const [isTriggering, setIsTriggering] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = offlineSyncEngine.subscribe((newStats) => {
            setStats({ ...newStats });
        });
        return () => unsubscribe();
    }, []);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSyncNow = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!stats.isOnline) return;
        setIsTriggering(true);
        await offlineSyncEngine.processSyncQueue();
        setTimeout(() => setIsTriggering(false), 600);
    };

    // Determine current effective status
    const effectiveStatus: SyncStatus = itemStatus || (
        stats.isSyncing || isTriggering
            ? 'syncing'
            : !stats.isOnline && stats.pendingCount > 0
            ? 'pending'
            : stats.pendingCount > 0
            ? 'pending'
            : 'synced'
    );

    // Format last synced relative time
    const formatLastSynced = (iso: string | null) => {
        if (!iso) return 'Just now';
        const diffMs = Date.now() - new Date(iso).getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 10) return 'Just now';
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Status styling configurations
    const getStatusConfig = () => {
        if (effectiveStatus === 'syncing') {
            return {
                bg: 'bg-blue-50/90 hover:bg-blue-100/90 border-blue-200 text-blue-700',
                dot: 'bg-blue-500 animate-pulse',
                icon: <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />,
                text: 'Syncing to Cloud...',
                subtext: 'Uploading changes safely'
            };
        }
        if (!stats.isOnline) {
            return {
                bg: 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-200 text-amber-800',
                dot: 'bg-amber-500',
                icon: <WifiOff className="w-3.5 h-3.5 text-amber-600" />,
                text: stats.pendingCount > 0 ? `Saved Locally (${stats.pendingCount} pending)` : 'Saved Locally • Offline',
                subtext: 'Will auto-sync when online'
            };
        }
        if (effectiveStatus === 'pending' || stats.pendingCount > 0) {
            return {
                bg: 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-200 text-amber-800',
                dot: 'bg-amber-500 animate-pulse',
                icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
                text: stats.pendingCount > 0 ? `${stats.pendingCount} Saved Locally` : 'Saved Locally',
                subtext: 'Ready to sync'
            };
        }
        if (effectiveStatus === 'conflict') {
            return {
                bg: 'bg-purple-50/90 hover:bg-purple-100/90 border-purple-200 text-purple-800',
                dot: 'bg-purple-500',
                icon: <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />,
                text: 'Safe Conflict Fork',
                subtext: 'Saved as separate copy'
            };
        }
        if (effectiveStatus === 'error') {
            return {
                bg: 'bg-rose-50/90 hover:bg-rose-100/90 border-rose-200 text-rose-800',
                dot: 'bg-rose-500',
                icon: <AlertCircle className="w-3.5 h-3.5 text-rose-600" />,
                text: 'Sync Paused',
                subtext: 'Click to retry'
            };
        }
        // Default: Synced
        return {
            bg: 'bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-200 text-emerald-800',
            dot: 'bg-emerald-500',
            icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
            text: 'All Saved to Cloud',
            subtext: 'Cloud sync verified'
        };
    };

    const config = getStatusConfig();
    const label = customLabel || config.text;

    return (
        <div className="relative inline-block text-left" ref={popoverRef}>
            {/* Main Interactive Pill Button */}
            <button
                type="button"
                onClick={() => showDetailsPopup && setIsOpen(!isOpen)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-xs transition-all duration-200 backdrop-blur-xs select-none ${config.bg} ${showDetailsPopup ? 'cursor-pointer hover:shadow-sm active:scale-98' : 'cursor-default'}`}
                title={config.subtext}
            >
                <div className="flex items-center space-x-1">
                    {config.icon}
                </div>
                {!compact && (
                    <span className="font-semibold tracking-tight">{label}</span>
                )}
                {showDetailsPopup && (
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 opacity-60 ${isOpen ? 'rotate-180' : ''}`} />
                )}
            </button>

            {/* Dropdown Popover */}
            {isOpen && showDetailsPopup && (
                <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center space-x-2">
                            <div className={`p-1.5 rounded-lg ${stats.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {stats.isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-900">
                                    {stats.isOnline ? 'Online • Auto-Sync Active' : 'Offline • Local Cache Active'}
                                </h4>
                                <p className="text-[11px] text-slate-500">
                                    {stats.isOnline ? 'Continuous cloud sync protection' : 'Zero data loss — stored in local cache'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Status & Stats Section */}
                    <div className="py-3 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-600 flex items-center space-x-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Last Synced:</span>
                            </span>
                            <span className="font-semibold text-slate-800">
                                {formatLastSynced(stats.lastSyncedAt)}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center space-x-2">
                                <FileText className="w-4 h-4 text-blue-500" />
                                <div>
                                    <div className="text-[10px] text-slate-500">Cached Notes</div>
                                    <div className="font-bold text-slate-800">{stats.totalCachedNotes}</div>
                                </div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center space-x-2">
                                <BookOpen className="w-4 h-4 text-indigo-500" />
                                <div>
                                    <div className="text-[10px] text-slate-500">Cached Exams</div>
                                    <div className="font-bold text-slate-800">{stats.totalCachedExams}</div>
                                </div>
                            </div>
                        </div>

                        {stats.pendingCount > 0 && (
                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-[11px] leading-tight">
                                    <span className="font-bold">{stats.pendingCount} pending change{stats.pendingCount > 1 ? 's' : ''}</span> stored in local cache. Will sync automatically once internet reconnects.
                                </div>
                            </div>
                        )}

                        <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100 text-[11px] text-emerald-800 flex items-center space-x-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span><strong>Zero Overwrite Algorithm:</strong> Safe forking & field merging enabled.</span>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={handleSyncNow}
                            disabled={!stats.isOnline || stats.isSyncing || isTriggering}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                                !stats.isOnline 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm shadow-blue-500/20 active:scale-98'
                            }`}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${stats.isSyncing || isTriggering ? 'animate-spin' : ''}`} />
                            <span>{stats.isSyncing || isTriggering ? 'Syncing with Cloud...' : 'Sync Cloud Now'}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
