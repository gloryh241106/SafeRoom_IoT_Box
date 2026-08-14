/**
 * Conversation UI for the backend's deterministic keyword/intent router.
 * It does not call an external LLM: the backend owns supported intents and
 * returns Markdown plus optional structured context for each response.
 */
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { apiFetch } from '../api';

export default function Chatbot() {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! I am your **Safebox Assistant**. Ask me full questions about room telemetry, actuators, or anomaly alerts.\n\nTry asking: *"What is the current room status?"* or *"Check for any gas leaks"*',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const promptPills = [
    'What is the system status?',
    'Check gas and smoke levels',
    'Has motion been detected?',
    'What is the current temperature?',
    'Are there any unresolved anomalies?',
    'Help'
  ];

  /** Send either a suggestion pill or the current input as one router query. */
  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || loading) return;

    const userMsg = { sender: 'user', text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/v1/chatbot/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const json = await res.json();

      if (json.success) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'bot',
            text: json.reply,
            intent: json.detectedIntent,
            data: json.data,
            timestamp: new Date()
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { sender: 'bot', text: 'Sorry, I could not process your query.', timestamp: new Date() }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Connection error. Backend query failed.', timestamp: new Date() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-950 tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <span>Safebox Intent & Command Assistant</span>
        </h2>
        <p className="text-sm text-slate-500">Natural language sentence query router for room safety & metrics</p>
      </div>

      {/* Prompts mirror backend-supported intents and double as discoverability. */}
      <div className="flex flex-wrap gap-2">
        {promptPills.map((pill, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(pill)}
            className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-300 transition-colors"
          >
            {pill}
          </button>
        ))}
      </div>

      <div className="glass-card rounded-lg flex flex-col h-[520px]">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-white'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-4 rounded-lg max-w-[80%] space-y-2 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none'
                }`}
              >
                <div className="prose max-w-none text-sm leading-relaxed">
                  {/* ReactMarkdown escapes raw HTML by default while preserving formatting. */}
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>

                {msg.timestamp && (
                  <span className={`block text-[10px] text-right mt-1 ${msg.sender === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-slate-500 text-xs flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]"></div>
                <span>Parsing sentence intent...</span>
              </div>
            </div>
          )}
        </div>

        {/* Enter and the send button share the same guarded submission path. */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3 rounded-b-lg">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a full question (e.g. 'What is the current gas level?')..."
            className="flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || loading}
            title="Send message"
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
