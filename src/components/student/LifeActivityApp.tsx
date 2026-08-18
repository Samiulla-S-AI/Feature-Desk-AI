import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, RefreshCw, Brain } from 'lucide-react';
import { gemini20Flash } from '../../lib/gemini';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface Choice {
    id: string;
    text: string;
    type: 'good' | 'bad' | 'normal';
    label: string;
    outcome: string; // AI generated consequence
}

interface Scenario {
    title: string;
    story: string;
    question: string;
    choices: Choice[];
}

export default function LifeActivityApp() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [scenario, setScenario] = useState<Scenario | null>(null);
    const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);

    const generateNewScenario = async () => {
        setLoading(true);
        setSelectedChoice(null);
        try {
            const prompt = `Generate a "Life Activity" scenario for a student in class ${(user as any)?.current_class || '10'}.
      aspects: Ethics, Critical Thinking, Safety, Social Responsibility.
      
      Return ONLY valid JSON with this structure:
      {
        "title": "Short Title",
        "story": "2-3 sentence engaging scenario",
        "question": "What would you do?",
        "choices": [
          { "id": "a", "text": "Choice 1", "type": "bad", "label": "Risky/Foolish", "outcome": "Explanation of why this is bad" },
          { "id": "b", "text": "Choice 2", "type": "good", "label": "Smart/Ethical", "outcome": "Explanation of why this is good" },
          { "id": "c", "text": "Choice 3", "type": "normal", "label": "Neutral", "outcome": "Neutral consequence explanation" }
        ]
      }`;

            const result = await gemini20Flash.generateContent(prompt);
            const text = (await result.response).text();
            // Clean up markdown code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(jsonStr);
            setScenario(data);
        } catch (error) {
            console.error("AI Generation failed", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        generateNewScenario();
    }, []);

    return (
        <div className="min-h-screen bg-orange-50 p-6 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center">
                        <button
                            onClick={() => navigate('/')}
                            className="mr-4 p-2 rounded-full hover:bg-white bg-white/50 transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6 text-orange-800" />
                        </button>
                        <div className="flex items-center">
                            <Heart className="w-8 h-8 text-orange-600 mr-3" />
                            <div>
                                <h1 className="text-3xl font-bold text-orange-900">Life Skills AI</h1>
                                <p className="text-orange-700 text-sm">Real-world scenario training</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={generateNewScenario}
                        disabled={loading}
                        className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-all shadow-lg"
                    >
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5 mr-2" />}
                        {loading ? 'Thinking...' : 'New Scenario'}
                    </button>
                </div>

                {loading && !scenario ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-bounce flex space-x-2">
                            <div className="w-4 h-4 bg-orange-400 rounded-full"></div>
                            <div className="w-4 h-4 bg-orange-500 rounded-full" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-4 h-4 bg-orange-600 rounded-full" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                    </div>
                ) : scenario ? (
                    <div className="grid gap-6 animate-fade-in-up">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-orange-100">
                            <div className="p-8">
                                <h2 className="text-2xl font-bold text-gray-800 mb-4">{scenario.title}</h2>
                                <div className="bg-orange-50 p-6 rounded-xl mb-8 border-l-4 border-orange-500">
                                    <p className="text-lg text-gray-800 leading-relaxed italic font-medium">
                                        "{scenario.story}"
                                    </p>
                                </div>

                                <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                                    <Brain className="w-5 h-5 mr-2 text-indigo-500" />
                                    {scenario.question}
                                </h3>

                                <div className="grid md:grid-cols-3 gap-4">
                                    {scenario.choices.map((choice) => (
                                        <button
                                            key={choice.id}
                                            onClick={() => {
                                                setSelectedChoice(choice);
                                                if (user) {
                                                    addDoc(collection(db, 'life_activity_logs'), {
                                                        student_id: (user as any).id,
                                                        scenario_title: scenario.title,
                                                        choice_id: choice.id,
                                                        choice_type: choice.type,
                                                        outcome: choice.outcome,
                                                        timestamp: new Date()
                                                    }).catch(err => console.error('Error logging activity:', err));
                                                }
                                            }}
                                            disabled={!!selectedChoice}
                                            className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all group text-center h-full relative overflow-hidden ${selectedChoice?.id === choice.id
                                                ? choice.type === 'good' ? 'border-green-500 bg-green-50' : choice.type === 'bad' ? 'border-red-500 bg-red-50' : 'border-gray-500 bg-gray-50'
                                                : 'border-gray-100 hover:border-orange-500 hover:bg-orange-50'
                                                } ${selectedChoice && selectedChoice.id !== choice.id ? 'opacity-50' : 'opacity-100'}`}
                                        >
                                            <div className={`mb-3 p-3 rounded-full transition-colors ${selectedChoice?.id === choice.id ? 'bg-white' : 'bg-gray-100 group-hover:bg-white'
                                                }`}>
                                                {/* Icons hidden until selection or always shown? Let's show abstract icons first, reveal truth after? 
                             Actually, to teach, seeing the label beforehand is part of the test? 
                             The prompt says "Decision Point", usually you don't know the label "Risky" until you pick it.
                             But for UI clarity, I'll show generic icons first.
                         */}
                                                <div className="font-bold text-xl text-gray-400">
                                                    {choice.id.toUpperCase()}
                                                </div>
                                            </div>
                                            <span className="font-medium text-gray-800 text-lg mb-2">{choice.text}</span>

                                            {/* Reveal Outcome on Selection */}
                                            {selectedChoice?.id === choice.id && (
                                                <div className="mt-4 animate-fade-in">
                                                    <div className={`text-xs uppercase tracking-wider font-bold mb-1 ${choice.type === 'good' ? 'text-green-600' : choice.type === 'bad' ? 'text-red-600' : 'text-gray-600'
                                                        }`}>
                                                        {choice.label}
                                                    </div>
                                                    <p className="text-sm text-gray-700">{choice.outcome}</p>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {selectedChoice && (
                                <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={generateNewScenario}
                                        className="text-orange-600 font-medium hover:text-orange-700 flex items-center"
                                    >
                                        Next Scenario <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
