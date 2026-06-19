import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings, LogOut, Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import WritingCanvas from './WritingCanvas';
import CentralHub from './CentralHub';
import { StudentMonitoringPanel } from '../cv';

// Inspiring quotes for students
const inspiringQuotes = [
    "Every expert was once a beginner. Keep learning!",
    "Your potential is limitless. Dream big!",
    "Small steps lead to big achievements!",
    "Today's effort is tomorrow's success!",
    "Curiosity is the spark of discovery!",
    "You're doing amazing - keep it up!",
    "Knowledge is your superpower!",
    "Every question brings you closer to wisdom!"
];

// Greeting based on time of day
const getGreeting = (hour: number): { text: string, emoji: string } => {
    if (hour >= 5 && hour < 12) {
        return { text: "Good Morning", emoji: "🌅" };
    } else if (hour >= 12 && hour < 17) {
        return { text: "Good Afternoon", emoji: "☀️" };
    } else if (hour >= 17 && hour < 21) {
        return { text: "Good Evening", emoji: "🌆" };
    } else {
        return { text: "Good Night", emoji: "🌙" };
    }
};

export default function StudentDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [quote] = useState(() => inspiringQuotes[Math.floor(Math.random() * inspiringQuotes.length)]);

    // Update time every second (no animation)
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const greeting = getGreeting(currentTime.getHours());
    const studentName = (user as any)?.student_name || 'Student';
    const firstName = studentName.split(' ')[0];

    // Format date parts
    const weekday = currentTime.toLocaleDateString('en-US', { weekday: 'short' });
    const month = currentTime.toLocaleDateString('en-US', { month: 'short' });
    const day = currentTime.getDate();
    const year = currentTime.getFullYear();

    // Format time
    const timeString = currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 overflow-y-auto">
            {/* Clean White Header Bar */}
            <header className="bg-white border-b border-slate-200 shadow-sm z-50">
                <div className="px-5 py-2.5">
                    <div className="flex items-center justify-between">
                        {/* Left Section - Welcome */}
                        <div className="flex items-center space-x-3">
                            <span className="text-xl">{greeting.emoji}</span>
                            <div>
                                <h1 className="text-base text-slate-800">
                                    {greeting.text}, <span className="font-semibold text-slate-900">{firstName}!</span>
                                </h1>
                                <p className="text-[11px] text-slate-500 flex items-center space-x-1">
                                    <Sparkles className="w-3 h-3 text-amber-500" />
                                    <span className="italic">{quote}</span>
                                </p>
                            </div>
                        </div>

                        {/* Right Section - Date, Time & Actions */}
                        <div className="flex items-center space-x-3">
                            {/* Compact Date Display */}
                            <div className="hidden sm:flex items-center space-x-2 text-slate-600">
                                {/* Mini Calendar */}
                                <div className="flex items-center rounded border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="bg-rose-500 text-white px-1.5 py-0.5">
                                        <span className="text-[9px] font-bold uppercase">{month}</span>
                                    </div>
                                    <div className="bg-white px-1.5 py-0.5">
                                        <span className="text-sm font-bold text-slate-800">{day}</span>
                                    </div>
                                </div>
                                <span className="text-xs text-slate-500">{weekday}, {year}</span>
                            </div>

                            {/* Divider */}
                            <div className="hidden sm:block w-px h-5 bg-slate-200" />

                            {/* Compact Time Display */}
                            <div className="hidden sm:flex items-center">
                                <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                    {timeString}
                                </span>
                            </div>

                            {/* Divider */}
                            <div className="hidden sm:block w-px h-5 bg-slate-200" />

                            {/* Settings */}
                            <button
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                title="Settings"
                            >
                                <Settings className="w-4 h-4" />
                            </button>

                            {/* Logout */}
                            <button
                                onClick={handleLogout}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                title="Logout"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Date/Time Display */}
            <div className="sm:hidden bg-white border-b border-slate-200 px-4 py-1.5 flex items-center justify-center space-x-3 text-xs">
                <div className="flex items-center space-x-1.5">
                    <div className="flex items-center rounded border border-slate-200 overflow-hidden">
                        <div className="bg-rose-500 text-white px-1 py-0.5 text-[8px] font-bold">{month}</div>
                        <div className="bg-white px-1 py-0.5 text-xs font-bold">{day}</div>
                    </div>
                    <span className="text-slate-500">{weekday}, {year}</span>
                </div>
                <div className="w-px h-3 bg-slate-300" />
                <span className="font-mono text-slate-600">{timeString}</span>
            </div>

            {/* Main Content - Writing Canvas */}
            <main className="flex-1 relative">
                <WritingCanvas />

                {/* Central Hub - Floating circular menu */}
                <CentralHub />

                {/* AI CV microservice — monitoring_range. Self-hides on web host
                    and when no student is logged in; floats so it never shifts layout. */}
                <div className="fixed bottom-4 left-4 z-40 w-80 max-w-[90vw]">
                    <StudentMonitoringPanel />
                </div>

            </main>
        </div>
    );
}
