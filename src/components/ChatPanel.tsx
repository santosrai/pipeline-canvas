import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { CodeExecutor } from '../utils/codeExecutor';
import { api } from '../utils/api';

interface Message {
  id: string;
  content: string;
  type: 'user' | 'ai';
  timestamp: Date;
}

export const ChatPanel: React.FC = () => {
  const { plugin, currentCode, setCurrentCode, setIsExecuting, setActivePane, setPendingCodeToRun } = useAppStore();
  const selection = useAppStore(state => state.selection);
  const setSelection = useAppStore(state => state.setSelection);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Welcome to NovoProtein AI! Ask me to "show insulin" or "display hemoglobin".',
      type: 'ai',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const renderMessageContent = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      return (
        <pre className="text-xs whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 overflow-x-auto">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      // not JSON
    }

    const lines = content.trim().split(/\r?\n/).filter(Boolean);
    const looksLikeTable =
      lines.length >= 2 &&
      lines[0].includes("|") &&
      (/^-+\|(-+\|?)+$/.test(lines[1].replace(/\s+/g, "")) || lines[1].includes("|"));

    if (looksLikeTable) {
      const header = lines[0].split("|").map(s => s.trim());
      const dataRows = lines.slice(2).map(l => l.split("|").map(s => s.trim()));
      return (
        <div className="overflow-x-auto">
          <table className="text-xs w-full border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {header.map((h, i) => (
                  <th key={i} className="text-left px-2 py-1 border-b border-gray-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((r, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-gray-50' : ''}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 align-top border-b border-gray-100">{c || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return <p className="text-sm">{content}</p>;
  };

  const isLikelyVisualization = (text: string): boolean => {
    const p = String(text || '').toLowerCase();
    const keywords = [
      'show ', 'display ', 'visualize', 'render', 'color', 'colour', 'cartoon', 'surface', 'ball-and-stick', 'water', 'ligand', 'focus', 'zoom', 'load', 'pdb', 'highlight', 'chain', 'view', 'representation'
    ];
    return keywords.some(k => p.includes(k));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      type: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const text = userMessage.content;
      let code = '';
      try {
        const payload = {
          input: text,
          currentCode,
          history: messages.slice(-6).map(m => ({ type: m.type, content: m.content })),
          selection,
        };
        console.log('[AI] route:request', payload);
        const response = await api.post('/agents/route', payload);
        console.log('[AI] route:response', response?.data);
        const agentType = response.data?.type as 'code' | 'text' | undefined;
        if (agentType === 'text') {
          const aiText = response.data?.text || 'Okay.';
          console.log('[AI] route:text', { text: aiText?.slice?.(0, 400) });
          const chatMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: aiText,
            type: 'ai',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, chatMsg]);
          return;
        }
        code = response.data?.code || '';
        console.log('[AI] route:code', { length: code?.length });
      } catch (apiErr) {
        console.warn('AI generation failed (backend unavailable or error).', apiErr);
        const likelyVis = isLikelyVisualization(text);
        if (likelyVis) {
          if (plugin) {
            const exec = new CodeExecutor(plugin);
            code = exec.generateCodeFromPrompt(text);
          } else {
            // Fallback code if plugin not initialized yet
            code = `// Fallback: Hemoglobin cartoon
try {
  await builder.loadStructure('1HHO');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
} catch (e) { console.error(e); }`;
          }
        } else {
          const chatMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: 'AI backend is unavailable. Please start the server and try again.',
            type: 'ai',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, chatMsg]);
          return;
        }
      }

      // Sync code into editor
      setCurrentCode(code);

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: `Generated code for: "${text}". Executing...`,
        type: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);

      if (plugin) {
        setIsExecuting(true);
        try {
          const exec = new CodeExecutor(plugin);
          await exec.executeCode(code);
          setActivePane('viewer');
        } finally {
          setIsExecuting(false);
        }
      } else {
        // If no plugin yet, queue code to run once viewer initializes
        setPendingCodeToRun(code);
        setActivePane('viewer');
      }
    } catch (err) {
      console.error('[Molstar] chat flow failed', err);
      const aiError: Message = {
        id: (Date.now() + 2).toString(),
        content: 'Sorry, I could not visualize that just now.',
        type: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiError]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'Show insulin',
    'Display hemoglobin',
    'Visualize DNA double helix',
    'Show antibody structure'
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <span>AI Assistant</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.type === 'ai' ? (
                renderMessageContent(message.content)
              ) : (
                <p className="text-sm">{message.content}</p>
              )}
              <div className="text-xs mt-1 opacity-70">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-lg">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200">
        {/* Selection pill */}
        {selection && (
          <div className="mb-3 flex items-center justify-between bg-blue-50 text-blue-800 border border-blue-200 rounded px-3 py-2 gap-2">
            <div className="text-xs font-medium truncate">
              {(() => {
                const chain = selection.labelAsymId ?? selection.authAsymId ?? '';
                const seq =
                  selection.labelSeqId != null && selection.labelSeqId !== ''
                    ? selection.labelSeqId
                    : selection.authSeqId != null
                      ? selection.authSeqId
                      : '';
                const pdb = selection.pdbId ? ` • ${selection.pdbId}` : '';
                const mut = selection.mutation?.toCompId ? ` → ${selection.mutation.toCompId}` : '';
                const chainText = chain ? ` (Chain ${chain})` : '';
                return `Selected: ${selection.compId || '?'}${seq !== '' ? ` ${seq}` : ''}${chainText}${pdb}${mut}`;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Replace with (e.g., ALA)"
                maxLength={3}
                className="w-36 text-xs px-2 py-1 border border-blue-200 rounded bg-white text-blue-900 placeholder-blue-400"
                onChange={(e) => {
                  const to = e.target.value.toUpperCase();
                  if (!to) {
                    setSelection({ ...selection, mutation: null });
                  } else {
                    setSelection({ ...selection, mutation: { toCompId: to } });
                  }
                }}
                value={selection.mutation?.toCompId || ''}
              />
              <button
                onClick={() => setSelection(null)}
                className="text-xs text-blue-700 hover:text-blue-900"
              >
                Clear
              </button>
            </div>
          </div>
        )}
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-2">Quick start:</div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => setInput(prompt)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me to visualize a protein..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};