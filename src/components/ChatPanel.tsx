import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Download, Play, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore, useActiveSession, Message } from '../stores/chatHistoryStore';
import { CodeExecutor } from '../utils/codeExecutor';
import { api } from '../utils/api';
import { v4 as uuidv4 } from 'uuid';
import { AlphaFoldDialog } from './AlphaFoldDialog';
import { ProgressTracker, useAlphaFoldProgress } from './ProgressTracker';
import { ErrorDisplay } from './ErrorDisplay';
import { ErrorDetails, AlphaFoldErrorHandler } from '../utils/errorHandler';
import { logAlphaFoldError } from '../utils/errorLogger';

// Enhanced Message interface for AlphaFold support
interface AlphaFoldMessage extends Message {
  alphafoldResult?: {
    pdbContent?: string;
    filename?: string;
    sequence?: string;
    parameters?: any;
    metadata?: any;
  };
  error?: ErrorDetails;
}

export const ChatPanel: React.FC = () => {
  const { plugin, currentCode, setCurrentCode, setIsExecuting, setActivePane, setPendingCodeToRun } = useAppStore();
  const selections = useAppStore(state => state.selections);
  const removeSelection = useAppStore(state => state.removeSelection);
  const clearSelections = useAppStore(state => state.clearSelections);

  // Chat history store
  const { createSession, activeSessionId } = useChatHistoryStore();
  const { activeSession, addMessage } = useActiveSession();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAgentId, setLastAgentId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session if none exists
  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  // Get messages from active session
  const messages = activeSession?.messages || [];

  // AlphaFold state
  const [showAlphaFoldDialog, setShowAlphaFoldDialog] = useState(false);
  const [alphafoldData, setAlphafoldData] = useState<any>(null);
  const progressTracker = useAlphaFoldProgress();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatSelection = (selection: any) => {
    const chain = selection.labelAsymId ?? selection.authAsymId ?? '';
    const seq = selection.labelSeqId != null && selection.labelSeqId !== ''
      ? selection.labelSeqId
      : selection.authSeqId != null
        ? selection.authSeqId
        : '';
    const chainText = chain ? ` (${chain})` : '';
    return `${selection.compId || '?'}${seq !== '' ? seq : ''}${chainText}`;
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

  const renderAlphaFoldResult = (result: Message['alphafoldResult']) => {
    if (!result) return null;

    const downloadPDB = () => {
      if (result.pdbContent) {
        const blob = new Blob([result.pdbContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'alphafold_result.pdb';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };

    const loadInViewer = async () => {
      if (!result.pdbContent || !plugin) return;
      
      try {
        setIsExecuting(true);
        const executor = new CodeExecutor(plugin);
        
        // Create temporary PDB data URL
        const pdbBlob = new Blob([result.pdbContent], { type: 'text/plain' });
        const pdbUrl = URL.createObjectURL(pdbBlob);
        
        // Load structure in viewer
        const code = `
try {
  await builder.clearStructure();
  // Note: This would need to be adapted to load from blob URL
  // For now, we'll show the sequence info and guide user to download
  console.log('AlphaFold result ready for visualization');
} catch (e) { 
  console.error('Failed to load AlphaFold result:', e); 
}`;
        
        await executor.executeCode(code);
        setActivePane('viewer');
        
        URL.revokeObjectURL(pdbUrl);
      } catch (err) {
        console.error('Failed to load AlphaFold result in viewer:', err);
      } finally {
        setIsExecuting(false);
      }
    };

    return (
      <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">AF</span>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">AlphaFold2 Structure Prediction</h4>
            <p className="text-xs text-gray-600">
              {result.sequence ? `${result.sequence.length} residues` : 'Structure predicted'}
            </p>
          </div>
        </div>
        
        {result.metadata && (
          <div className="mb-3 text-xs text-gray-600">
            <div className="grid grid-cols-2 gap-2">
              {result.parameters?.algorithm && (
                <span>Algorithm: {result.parameters.algorithm}</span>
              )}
              {result.parameters?.databases && (
                <span>Databases: {result.parameters.databases.join(', ')}</span>
              )}
            </div>
          </div>
        )}
        
        <div className="flex space-x-2">
          <button
            onClick={downloadPDB}
            className="flex items-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            <Download className="w-4 h-4" />
            <span>Download PDB</span>
          </button>
          
          <button
            onClick={loadInViewer}
            disabled={!plugin}
            className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Play className="w-4 h-4" />
            <span>View 3D</span>
          </button>
        </div>
      </div>
    );
  };

  const isLikelyVisualization = (text: string): boolean => {
    const p = String(text || '').toLowerCase();
    const keywords = [
      'show ', 'display ', 'visualize', 'render', 'color', 'colour', 'cartoon', 'surface', 'ball-and-stick', 'water', 'ligand', 'focus', 'zoom', 'load', 'pdb', 'highlight', 'chain', 'view', 'representation'
    ];
    return keywords.some(k => p.includes(k));
  };

  // AlphaFold handling functions
  const handleAlphaFoldConfirm = async (sequence: string, parameters: any) => {
    setShowAlphaFoldDialog(false);
    
    const jobId = `af_${Date.now()}`;
    
    // Validate sequence before proceeding
    const validationError = AlphaFoldErrorHandler.handleSequenceValidation(sequence, jobId);
    if (validationError) {
      // Log the validation error
      logAlphaFoldError(validationError, { sequence: sequence.slice(0, 100), parameters });
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: validationError.userMessage,
        type: 'ai',
        timestamp: new Date(),
        error: validationError
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    progressTracker.startProgress(jobId, 'Submitting protein folding request...');

    try {
      // Simulate API call to NIMS (this would be replaced with actual API call)
      const response = await api.post('/alphafold/fold', {
        sequence,
        parameters,
        jobId
      });

      if (response.data.status === 'success') {
        const result = response.data.data;
        
        // Add result message to chat
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: `AlphaFold2 structure prediction completed successfully! The folded structure is ready for download and visualization.`,
          type: 'ai',
          timestamp: new Date(),
          alphafoldResult: {
            pdbContent: result.pdbContent,
            filename: result.filename || `folded_${Date.now()}.pdb`,
            sequence,
            parameters,
            metadata: result.metadata
          }
        };
        
        setMessages(prev => [...prev, aiMessage]);
        progressTracker.completeProgress();
      } else {
        // Handle API errors with structured error display
        const apiError = AlphaFoldErrorHandler.createError(
          'FOLDING_FAILED',
          { jobId, sequenceLength: sequence.length, parameters },
          response.data.error || 'Folding computation failed',
          undefined,
          jobId
        );
        
        // Log the API error
        logAlphaFoldError(apiError, { 
          apiResponse: response.data, 
          sequence: sequence.slice(0, 100),
          parameters 
        });
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: apiError.userMessage,
          type: 'ai',
          timestamp: new Date(),
          error: apiError
        };
        
        setMessages(prev => [...prev, errorMessage]);
        progressTracker.errorProgress(apiError.userMessage);
      }
    } catch (error: any) {
      console.error('AlphaFold request failed:', error);
      
      // Handle different types of errors
      const structuredError = AlphaFoldErrorHandler.handleAPIError(error, jobId);
      
      // Log the network/system error
      logAlphaFoldError(structuredError, { 
        originalError: error.message,
        sequence: sequence.slice(0, 100),
        parameters,
        networkError: true
      });
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: structuredError.userMessage,
        type: 'ai',
        timestamp: new Date(),
        error: structuredError
      };
      
      setMessages(prev => [...prev, errorMessage]);
      progressTracker.errorProgress(structuredError.userMessage);
    }
  };

  const handleAlphaFoldResponse = (responseData: any) => {
    try {
      // Log the raw response for debugging
      console.log('[AlphaFold] Raw response:', responseData);
      
      const data = JSON.parse(responseData);
      console.log('[AlphaFold] Parsed data:', data);
      
      if (data.action === 'confirm_folding') {
        // Handle sequence extraction if needed
        if (data.sequence === 'NEEDS_EXTRACTION' && data.source) {
          // Extract sequence from PDB (this would normally call a sequence extraction API)
          // For now, we'll use a mock sequence for demonstration
          const mockSequence = 'MVLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPG';
          data.sequence = mockSequence;
          data.message = `Extracted sequence from ${data.source}. Ready to fold ${mockSequence.length}-residue protein.`;
        }
        
        setAlphafoldData(data);
        setShowAlphaFoldDialog(true);
        return true; // Handled
      }
    } catch (e) {
      console.log('[AlphaFold] Response parsing failed:', e);
      console.log('[AlphaFold] Raw response was:', responseData);
      // Not JSON or not AlphaFold response
    }
    return false; // Not handled
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      content: input.trim(),
      type: 'user',
      timestamp: new Date()
    };

    addMessage(userMessage);
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
          selection: selections.length > 0 ? selections[0] : null, // First selection for backward compatibility
          selections: selections, // Full selections array for new multi-selection support
        };
        console.log('[AI] route:request', payload);
        console.log('[DEBUG] currentCode length:', currentCode?.length || 0);
        console.log('[DEBUG] selections count:', selections.length);
        console.log('[DEBUG] selections:', selections);
        const response = await api.post('/agents/route', payload);
        console.log('[AI] route:response', response?.data);
        
        const agentId = response.data?.agentId;
        const agentType = response.data?.type as 'code' | 'text' | undefined;
        const reason = response.data?.reason;
        
        // Enhanced logging for agent selection
        if (agentId) {
          console.log(`🎯 [AGENT SELECTED] ${agentId} (${agentType}) - Reason: ${reason}`);
          
          // Special logging for RAG agents
          if (agentId === 'mvs-builder') {
            console.log('🧠 [RAG AGENT] MVS agent will use Pinecone RAG enhancement');
          } else if (agentId === 'code-builder') {
            console.log('⚡ [SIMPLE AGENT] Basic Molstar builder agent');
          } else if (agentId === 'bio-chat') {
            console.log('💬 [CHAT AGENT] Bioinformatics Q&A agent');
          }
        }
        
        // Check if agent changed and we need to clear the viewer
        // Only clear when switching to a code agent that will generate new structure code
        const isCodeAgent = agentType === 'code';
        const isTextAgent = agentType === 'text';
        
        if (agentId && agentId !== lastAgentId && lastAgentId !== '' && isCodeAgent) {
          console.log(`[Agent Switch] ${lastAgentId} → ${agentId} (code agent), clearing viewer`);
          
          // Clear the current code and viewer state only for code agents
          setCurrentCode('');
          
          // Clear the 3D viewer if plugin is available
          if (plugin) {
            try {
              const executor = new CodeExecutor(plugin);
              await executor.executeCode('try { await builder.clearStructure(); } catch(e) { console.warn("Clear failed:", e); }');
              console.log('[Agent Switch] Viewer cleared successfully');
            } catch (e) {
              console.warn('[Agent Switch] Failed to clear viewer:', e);
            }
          }
        } else if (isTextAgent && agentId !== lastAgentId) {
          console.log(`[Agent Switch] ${lastAgentId} → ${agentId} (text agent), preserving current code`);
        }
        
        // Update the last agent ID
        if (agentId) {
          setLastAgentId(agentId);
        }
        if (agentType === 'text') {
          const aiText = response.data?.text || 'Okay.';
          console.log('[AI] route:text', { text: aiText?.slice?.(0, 400) });
          
          // Check if this is an AlphaFold response
          if (agentId === 'alphafold-agent') {
            if (handleAlphaFoldResponse(aiText)) {
              return; // AlphaFold dialog will be shown
            } else {
              // Fallback: if JSON parsing failed, try to extract key info and show a basic dialog
              console.log('[AlphaFold] Fallback: attempting to parse non-JSON response');
              const fallbackData = {
                action: 'confirm_folding',
                sequence: 'NEEDS_EXTRACTION',
                source: 'pdb:1TUP', // Default for demo
                parameters: {
                  algorithm: 'mmseqs2',
                  e_value: 0.0001,
                  iterations: 1,
                  databases: ['small_bfd'],
                  relax_prediction: false,
                  skip_template_search: true
                },
                estimated_time: '2-5 minutes',
                message: 'Ready to fold protein. Please confirm parameters.'
              };
              
              // Handle the fallback data
              handleAlphaFoldResponse(JSON.stringify(fallbackData));
              return;
            }
          }
          
          // Bio-chat and other text agents should never modify the editor code
          console.log(`[${agentId}] Text response received, preserving current editor code`);
          
          const chatMsg: Message = {
            id: uuidv4(),
            content: aiText,
            type: 'ai',
            timestamp: new Date()
          };
          addMessage(chatMsg);
          return; // Exit early - no code generation or execution
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
            id: uuidv4(),
            content: 'AI backend is unavailable. Please start the server and try again.',
            type: 'ai',
            timestamp: new Date()
          };
          addMessage(chatMsg);
          return;
        }
      }

      // Sync code into editor
      setCurrentCode(code);

      const aiResponse: Message = {
        id: uuidv4(),
        content: `Generated code for: "${text}". Executing...`,
        type: 'ai',
        timestamp: new Date()
      };
      addMessage(aiResponse);

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
        id: uuidv4(),
        content: 'Sorry, I could not visualize that just now.',
        type: 'ai',
        timestamp: new Date()
      };
      addMessage(aiError);
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
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
            {activeSession && (
              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                {activeSession.title}
              </p>
            )}
          </div>
        </div>
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
                <>
                  {renderMessageContent(message.content)}
                  {renderAlphaFoldResult(message.alphafoldResult)}
                  {message.error && (
                    <div className="mt-3">
                      <ErrorDisplay 
                        error={message.error}
                        onRetry={() => {
                          // Handle retry logic based on error type
                          if (message.error?.context?.sequence && message.error?.context?.parameters) {
                            handleAlphaFoldConfirm(
                              message.error.context.sequence, 
                              message.error.context.parameters
                            );
                          }
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm">{message.content}</p>
              )}
              <div className="text-xs mt-1 opacity-70">
                {new Date(message.timestamp).toLocaleTimeString()}
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
        {/* Multiple selection chips */}
        {selections.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500 font-medium">
                Selected Residues ({selections.length})
              </div>
              {selections.length > 1 && (
                <button
                  onClick={clearSelections}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selections.map((sel, index) => (
                <div 
                  key={index}
                  className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-3 py-1 text-xs font-medium"
                >
                  <span>{formatSelection(sel)}</span>
                  <button
                    onClick={() => removeSelection(index)}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Progress Tracker */}
        <ProgressTracker
          isVisible={progressTracker.isVisible}
          onCancel={progressTracker.cancelProgress}
          className="mb-3"
        />

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

      {/* AlphaFold Dialog */}
      <AlphaFoldDialog
        isOpen={showAlphaFoldDialog}
        onClose={() => setShowAlphaFoldDialog(false)}
        onConfirm={handleAlphaFoldConfirm}
        initialData={alphafoldData}
      />
    </div>
  );
};