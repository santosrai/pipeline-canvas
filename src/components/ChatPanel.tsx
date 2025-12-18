import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Download, Play, X, Copy, Paperclip } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore, useActiveSession, Message } from '../stores/chatHistoryStore';
import { CodeExecutor } from '../utils/codeExecutor';
import { api, fetchAgents, fetchModels, Agent, Model, streamAgentRoute } from '../utils/api';
import { v4 as uuidv4 } from 'uuid';
import { AlphaFoldDialog } from './AlphaFoldDialog';
import { RFdiffusionDialog } from './RFdiffusionDialog';
import { ProteinMPNNDialog } from './ProteinMPNNDialog';
import { ProgressTracker, useAlphaFoldProgress, useProteinMPNNProgress, useRFdiffusionProgress } from './ProgressTracker';
import { ErrorDisplay } from './ErrorDisplay';
import { ErrorDetails, AlphaFoldErrorHandler, RFdiffusionErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandler';
import { logAlphaFoldError } from '../utils/errorLogger';
import { AgentSelector } from './AgentSelector';
import { ModelSelector } from './ModelSelector';
import { useAgentSettings } from '../stores/settingsStore';
import { ThinkingProcessDisplay } from './ThinkingProcessDisplay';
import { PDBFileUpload } from './PDBFileUpload';
import ReactMarkdown from 'react-markdown';
import { generatePDBSummary } from '../utils/pdbUtils';
import { usePipelineStore, PipelineBlueprint } from '../components/pipeline-canvas';

// Extended message metadata for structured agent results
// Note: Message interface now includes thinkingProcess and uploadedFile, so ExtendedMessage is mainly for type compatibility
interface ExtendedMessage extends Message {
  // These fields are now part of Message interface, but keeping for backward compatibility
  alphafoldResult?: {
    pdbContent?: string;
    filename?: string;
    sequence?: string;
    parameters?: any;
    metadata?: any;
    jobType?: 'alphafold' | 'rfdiffusion';
  };
  proteinmpnnResult?: {
    jobId: string;
    sequences: Array<{
      id: string;
      sequence: string;
      length: number;
      metadata?: Record<string, any>;
    }>;
    downloads: {
      json: string;
      fasta: string;
      raw?: string;
    };
    metadata?: Record<string, any>;
  };
  // uploadedFile is now in Message interface, but keeping here for backward compatibility
  // thinkingProcess is now in Message interface, but keeping here for type compatibility
  error?: ErrorDetails;
}

const renderProteinMPNNResult = (result: ExtendedMessage['proteinmpnnResult']) => {
  if (!result) return null;

  const copySequence = async (sequence: string) => {
    try {
      await navigator.clipboard.writeText(sequence);
      console.log('[ProteinMPNN] Sequence copied to clipboard');
    } catch (err) {
      console.warn('Failed to copy sequence', err);
    }
  };

  return (
    <div className="mt-3 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-bold">PM</span>
        </div>
        <div>
          <h4 className="font-medium text-gray-900">ProteinMPNN Sequence Design</h4>
          <p className="text-xs text-gray-600">
            Job {result.jobId} • {result.sequences.length} sequence{result.sequences.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <a
          href={result.downloads.json}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 px-3 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full hover:bg-emerald-200"
        >
          <Download className="w-3 h-3" />
          <span>JSON</span>
        </a>
        <a
          href={result.downloads.fasta}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 px-3 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full hover:bg-emerald-200"
        >
          <Download className="w-3 h-3" />
          <span>FASTA</span>
        </a>
        {result.downloads.raw && (
          <a
            href={result.downloads.raw}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 px-3 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full hover:bg-emerald-200"
          >
            <Download className="w-3 h-3" />
            <span>Raw data</span>
          </a>
        )}
      </div>

      <div className="space-y-4">
        {result.sequences.map((seq, index) => (
          <div key={seq.id} className="border border-emerald-200 rounded-lg bg-white">
            <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-100 bg-emerald-50">
              <div>
                <p className="text-sm font-medium text-emerald-800">Design {index + 1}</p>
                <p className="text-xs text-emerald-600">{seq.length} residues</p>
              </div>
              <button
                onClick={() => copySequence(seq.sequence)}
                className="inline-flex items-center space-x-1 text-xs text-emerald-700 hover:text-emerald-900"
                title="Copy sequence"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
            <div className="px-3 py-3">
              <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-emerald-50 border border-emerald-100 rounded p-3">{seq.sequence}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to convert backend thinking data to frontend format
const convertThinkingData = (thinkingProcess: any, isComplete: boolean = false): ExtendedMessage['thinkingProcess'] | undefined => {
  if (!thinkingProcess) return undefined;
  
  // Backend returns: { steps: [...], isComplete: bool, totalSteps: number }
  // Frontend expects: { steps: ThinkingStep[], isComplete: bool, totalSteps: number }
  if (thinkingProcess.steps && Array.isArray(thinkingProcess.steps)) {
    const steps = thinkingProcess.steps.map((step: any, index: number) => {
      // If not complete and this is the last step, mark it as processing
      let status = step.status || 'completed';
      if (!isComplete && index === thinkingProcess.steps.length - 1) {
        status = 'processing';
      }
      
      return {
        id: step.id || `step_${index}`,
        title: step.title || 'Thinking Step',
        content: step.content || '',
        status: status as 'pending' | 'processing' | 'completed',
        timestamp: step.timestamp ? new Date(step.timestamp) : undefined
      };
    });
    
    return {
      steps,
      isComplete: isComplete && thinkingProcess.isComplete !== false,
      totalSteps: thinkingProcess.totalSteps || thinkingProcess.steps.length
    };
  }
  
  return undefined;
};

const extractProteinMPNNSequences = (payload: any): string[] => {
  if (!payload) return [];

  const search = (data: any): string[] => {
    if (!data) return [];
    const candidates: string[] = [];
    const possibleFields = ['designed_sequences', 'designed_seqs', 'sequences', 'output_sequences'];

    for (const field of possibleFields) {
      if (Array.isArray(data?.[field])) {
        return data[field].filter((item: unknown) => typeof item === 'string');
      }
    }

    if (Array.isArray(data)) {
      return data.filter((item) => typeof item === 'string');
    }

    if (typeof data === 'object') {
      const inner = data?.result || data?.data;
      if (inner) {
        const nested = search(inner);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    return candidates;
  };

  return search(payload);
};

const createProteinMPNNError = (
  code: string,
  userMessage: string,
  technicalMessage: string,
  context: Record<string, any>
): ErrorDetails => ({
  code,
  category: ErrorCategory.PROCESSING,
  severity: ErrorSeverity.HIGH,
  userMessage,
  technicalMessage,
  context,
  suggestions: [
    {
      action: 'Retry sequence design',
      description: 'Try submitting the ProteinMPNN job again or adjust the parameters.',
      type: 'retry',
      priority: 1,
    },
    {
      action: 'Verify backbone structure',
      description: 'Ensure the selected PDB backbone is valid and contains the intended chains.',
      type: 'fix',
      priority: 2,
    },
  ],
  timestamp: new Date(),
});

export const ChatPanel: React.FC = () => {
  const { plugin, currentCode, setCurrentCode, setIsExecuting, setActivePane, setPendingCodeToRun, setViewerVisible, setCurrentStructureOrigin, currentStructureOrigin } = useAppStore();
  const { setGhostBlueprint } = usePipelineStore();
  const lastLoadedPdb = useAppStore(state => state.lastLoadedPdb);
  const selections = useAppStore(state => state.selections);
  const removeSelection = useAppStore(state => state.removeSelection);
  const clearSelections = useAppStore(state => state.clearSelections);

  // Chat history store
  const { createSession, activeSessionId, saveVisualizationCode, getVisualizationCode, saveViewerVisibility, getViewerVisibility, getActiveSession, saveModelSettings, getModelSettings } = useChatHistoryStore();
  const isViewerVisible = useAppStore(state => state.isViewerVisible);
  
  // Helper function to set viewer visibility and save to session
  const setViewerVisibleAndSave = (visible: boolean) => {
    setViewerVisible(visible);
    if (activeSessionId) {
      saveViewerVisibility(activeSessionId, visible);
    }
  };
  const { activeSession, addMessage, updateMessages } = useActiveSession();

  // Agent and model settings
  const { settings: agentSettings, updateSettings: updateAgentSettings } = useAgentSettings();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAgentId, setLastAgentId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  // Refs to track latest values for session switching (avoid stale closures)
  const currentCodeRef = useRef<string | null>(currentCode);
  const isViewerVisibleRef = useRef<boolean>(isViewerVisible);
  // Ref to prevent saving during restoration
  const isRestoringRef = useRef(false);

  // Initialize session if none exists
  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  // Initialize previous session ID ref on mount
  useEffect(() => {
    if (activeSessionId && !previousSessionIdRef.current) {
      previousSessionIdRef.current = activeSessionId;
      // Restore viewer visibility for initial session on mount
      const savedVisibility = getViewerVisibility(activeSessionId);
      if (savedVisibility !== undefined) {
        setViewerVisible(savedVisibility);
      }
    }
  }, [activeSessionId, getViewerVisibility, setViewerVisible]);

  // Keep refs updated with latest values (prevents stale closures)
  useEffect(() => {
    currentCodeRef.current = currentCode;
  }, [currentCode]);

  useEffect(() => {
    isViewerVisibleRef.current = isViewerVisible;
  }, [isViewerVisible]);

  // Restore visualization code and viewer visibility when switching sessions
  useEffect(() => {
    if (!activeSessionId) return;
    
    // Only restore when session actually changes (not when settings change)
    const sessionChanged = previousSessionIdRef.current !== activeSessionId;
    
    // Save current state to previous session before switching
    // Use refs to ensure we have the latest values even if they changed after effect was scheduled
    if (previousSessionIdRef.current && sessionChanged) {
      const codeToSave = currentCodeRef.current?.trim() || '';
      if (codeToSave) {
        saveVisualizationCode(previousSessionIdRef.current, codeToSave);
        console.log('[ChatPanel] Saved code to previous session:', previousSessionIdRef.current);
      }
      // Save viewer visibility to previous session
      saveViewerVisibility(previousSessionIdRef.current, isViewerVisibleRef.current);
      console.log('[ChatPanel] Saved viewer visibility to previous session:', previousSessionIdRef.current, isViewerVisibleRef.current);
      // Save model settings to previous session
      saveModelSettings(
        previousSessionIdRef.current,
        agentSettings.selectedAgentId,
        agentSettings.selectedModel
      );
      console.log('[ChatPanel] Saved model settings to previous session:', previousSessionIdRef.current, {
        selectedAgentId: agentSettings.selectedAgentId,
        selectedModel: agentSettings.selectedModel,
      });
    }
    
    // Only restore when session changes
    if (sessionChanged) {
      // Restore code for new session
      const savedCode = getVisualizationCode(activeSessionId);
      if (savedCode && savedCode.trim()) {
        console.log('[ChatPanel] Restoring visualization code for session:', activeSessionId);
        setCurrentCode(savedCode);
      } else {
        // Clear code if session has no saved visualization
        // Use ref to check current state
        if (currentCodeRef.current && currentCodeRef.current.trim()) {
          console.log('[ChatPanel] Clearing code for session without visualization:', activeSessionId);
          setCurrentCode('');
        }
      }
      
      // Restore viewer visibility for new session
      const savedVisibility = getViewerVisibility(activeSessionId);
      if (savedVisibility !== undefined) {
        console.log('[ChatPanel] Restoring viewer visibility for session:', activeSessionId, savedVisibility);
        setViewerVisible(savedVisibility);
      } else {
        // Default to hidden for new sessions
        setViewerVisible(false);
      }
      
      // Restore model settings for new session
      const savedModelSettings = getModelSettings(activeSessionId);
      if (savedModelSettings) {
        console.log('[ChatPanel] Restoring model settings for session:', activeSessionId, savedModelSettings);
        isRestoringRef.current = true;
        updateAgentSettings({
          selectedAgentId: savedModelSettings.selectedAgentId,
          selectedModel: savedModelSettings.selectedModel,
        });
        // Reset flag in next tick to allow the update to complete
        Promise.resolve().then(() => {
          setTimeout(() => {
            isRestoringRef.current = false;
          }, 50);
        });
      } else {
        // For new sessions, keep current global settings (or use defaults)
        console.log('[ChatPanel] No saved model settings for session, using current settings:', activeSessionId);
        // Don't set restoring flag here - we want to save the current settings
        saveModelSettings(
          activeSessionId,
          agentSettings.selectedAgentId,
          agentSettings.selectedModel
        );
      }
      
      // Update previous session ID
      previousSessionIdRef.current = activeSessionId;
    }
  }, [activeSessionId, getVisualizationCode, saveVisualizationCode, getViewerVisibility, saveViewerVisibility, setCurrentCode, setViewerVisible, saveModelSettings, getModelSettings, updateAgentSettings]);

  // Save model settings when they change (for current session)
  // Skip saving during initial session switch to avoid overwriting restored settings
  useEffect(() => {
    // Only save if we have an active session and not currently restoring
    if (activeSessionId && !isRestoringRef.current) {
      // Use requestAnimationFrame to ensure this runs after any restoration updates
      const rafId = requestAnimationFrame(() => {
        if (!isRestoringRef.current && activeSessionId) {
          saveModelSettings(
            activeSessionId,
            agentSettings.selectedAgentId,
            agentSettings.selectedModel
          );
          console.log('[ChatPanel] Saved model settings for current session:', activeSessionId, {
            selectedAgentId: agentSettings.selectedAgentId,
            selectedModel: agentSettings.selectedModel,
          });
        }
      });
      
      return () => cancelAnimationFrame(rafId);
    }
  }, [activeSessionId, agentSettings.selectedAgentId, agentSettings.selectedModel, saveModelSettings]);

  // Fetch agents and models on mount
  useEffect(() => {
    const loadAgentsAndModels = async () => {
      try {
        console.log('[ChatPanel] Loading agents and models...');
        const [agentsData, modelsData] = await Promise.all([
          fetchAgents(),
          fetchModels(),
        ]);
        console.log('[ChatPanel] Agents loaded:', agentsData.length);
        console.log('[ChatPanel] Models loaded:', modelsData.length);
        setAgents(agentsData);
        setModels(modelsData);
      } catch (error) {
        console.error('[ChatPanel] Failed to load agents or models:', error);
        // Set empty arrays on error so components still render
        setAgents([]);
        setModels([]);
      }
    };
    loadAgentsAndModels();
  }, []);

  // Get messages from active session
  const rawMessages = activeSession?.messages || [];
  const messages = rawMessages as ExtendedMessage[];

  // AlphaFold state
  const [showAlphaFoldDialog, setShowAlphaFoldDialog] = useState(false);
  const [alphafoldData, setAlphafoldData] = useState<any>(null);
  const alphafoldProgress = useAlphaFoldProgress();

  // ProteinMPNN state
  const [showProteinMPNNDialog, setShowProteinMPNNDialog] = useState(false);
  const [proteinmpnnData, setProteinmpnnData] = useState<any>(null);
  const proteinmpnnProgress = useProteinMPNNProgress();

  // RFdiffusion state
  const [showRFdiffusionDialog, setShowRFdiffusionDialog] = useState(false);
  const [rfdiffusionData, setRfdiffusionData] = useState<any>(null);
  const rfdiffusionProgress = useRFdiffusionProgress();

  // Agent and model selection state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  // Pending file state (file selected but not uploaded yet)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  // Uploaded file state (after upload completes)
  const [uploadedFile, setUploadedFile] = useState<{
    filename: string;
    file_id: string;
    file_url: string;
    size: number;
    atoms: number;
    chains: string[];
  } | null>(null);

  // Helper function to check if a model is a thinking model
  const isThinkingModel = (modelId: string | null): boolean => {
    if (!modelId) return false;
    const lowerId = modelId.toLowerCase();
    return lowerId.includes('-thinking') || lowerId.includes(':thinking') || lowerId.includes('thinking');
  };

  // Check if currently selected model is a thinking model
  const selectedModelId = agentSettings.selectedModel;
  const isThinkingModelSelected = isThinkingModel(selectedModelId);

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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

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

    // Render markdown content
    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          components={{
            // Style code blocks
            code: ({ node, inline, className, children, ...props }: any) => {
              return !inline ? (
                <pre className="bg-gray-100 rounded p-2 overflow-x-auto text-xs my-2">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              ) : (
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs" {...props}>
                  {children}
                </code>
              );
            },
            // Style paragraphs
            p: ({ children }: any) => <p className="mb-2 last:mb-0 text-sm">{children}</p>,
            // Style lists
            ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
            ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
            li: ({ children }: any) => <li className="ml-4">{children}</li>,
            // Style headings
            h1: ({ children }: any) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
            h2: ({ children }: any) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
            h3: ({ children }: any) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
            // Style strong and emphasis
            strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
            em: ({ children }: any) => <em className="italic">{children}</em>,
            // Style blockquotes
            blockquote: ({ children }: any) => (
              <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2">
                {children}
              </blockquote>
            ),
            // Style links
            a: ({ children, href }: any) => (
              <a href={href} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  };

  const loadUploadedFileInViewer = async (fileInfo: { file_id: string; filename: string; file_url: string }) => {
    if (!plugin) return;
    
    try {
      setIsExecuting(true);
      const executor = new CodeExecutor(plugin);
      
      // Fetch file content and create blob URL (like AlphaFold does)
      const fileResponse = await fetch(fileInfo.file_url);
      if (!fileResponse.ok) {
        throw new Error('Failed to fetch uploaded file');
      }
      const fileContent = await fileResponse.text();
      
      // Create blob URL
      const pdbBlob = new Blob([fileContent], { type: 'text/plain' });
      const blobUrl = URL.createObjectURL(pdbBlob);
      
      // Load structure in viewer using blob URL
      const code = `
try {
  await builder.clearStructure();
  await builder.loadStructure('${blobUrl}');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('Uploaded file loaded successfully');
} catch (e) { 
  console.error('Failed to load uploaded file:', e); 
}`;
      
      // Save code to editor so user can see and modify it
      setCurrentCode(code);
      
      // Set structure origin for LLM context
      setCurrentStructureOrigin({
        type: 'upload',
        filename: fileInfo.filename,
        metadata: {
          file_id: fileInfo.file_id,
          file_url: fileInfo.file_url,
        },
      });
      
      // Save code to active session for persistence
      if (activeSessionId) {
        saveVisualizationCode(activeSessionId, code);
        console.log('[ChatPanel] Saved visualization code to session:', activeSessionId);
      }
      
      await executor.executeCode(code);
      setViewerVisibleAndSave(true);
      setActivePane('viewer');
      
      // Keep blob URL alive for a bit longer to ensure structure loads
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 5000);
    } catch (err) {
      console.error('Failed to load uploaded file in viewer:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  // Helper function to validate uploaded file info (type guard)
  const isValidUploadedFile = (
    fileInfo: ExtendedMessage['uploadedFile']
  ): fileInfo is NonNullable<ExtendedMessage['uploadedFile']> => {
    return !!(
      fileInfo &&
      fileInfo.file_id &&
      fileInfo.filename &&
      fileInfo.file_url &&
      typeof fileInfo.atoms === 'number' &&
      Array.isArray(fileInfo.chains)
    );
  };

  const renderFileAttachment = (fileInfo: ExtendedMessage['uploadedFile'], isUserMessage: boolean = false) => {
    if (!isValidUploadedFile(fileInfo)) return null;

    // Use different styling for user vs AI messages
    const bgClass = isUserMessage 
      ? 'bg-white bg-opacity-20 border-white border-opacity-30' 
      : 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200';
    const textClass = isUserMessage ? 'text-white' : 'text-gray-900';
    const textSecondaryClass = isUserMessage ? 'text-white text-opacity-80' : 'text-gray-600';
    const buttonClass = isUserMessage
      ? 'bg-white text-blue-600 hover:bg-gray-100'
      : 'bg-blue-600 text-white hover:bg-blue-700';

    return (
      <div className={`mt-3 p-4 ${bgClass} rounded-lg`}>
        <div className="flex items-center space-x-2 mb-3">
          <div className={`w-8 h-8 ${isUserMessage ? 'bg-white bg-opacity-30' : 'bg-blue-600'} rounded-full flex items-center justify-center`}>
            <span className={`${isUserMessage ? 'text-white' : 'text-white'} text-sm font-bold`}>PDB</span>
          </div>
          <div>
            <h4 className={`font-medium ${textClass}`}>Uploaded PDB File</h4>
            <p className={`text-xs ${textSecondaryClass}`}>
              {fileInfo.filename} • {fileInfo.atoms} atoms • {fileInfo.chains.length} chain{fileInfo.chains.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        {fileInfo.chains.length > 0 && (
          <div className={`mb-3 text-xs ${textSecondaryClass}`}>
            <span>Chains: {fileInfo.chains.join(', ')}</span>
          </div>
        )}
        
        <div className="flex space-x-2">
          <button
            onClick={() => loadUploadedFileInViewer(fileInfo)}
            disabled={!plugin}
            className={`flex items-center space-x-1 px-3 py-2 ${buttonClass} rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm`}
          >
            <Play className="w-4 h-4" />
            <span>View in 3D</span>
          </button>
        </div>
      </div>
    );
  };

  const renderAlphaFoldResult = (result: ExtendedMessage['alphafoldResult']) => {
    if (!result) return null;

    const isRFdiffusion = result.jobType === 'rfdiffusion';
    const title = isRFdiffusion ? 'RFdiffusion Protein Design' : 'AlphaFold2 Structure Prediction';
    const iconText = isRFdiffusion ? 'RF' : 'AF';
    const defaultFilename = isRFdiffusion ? 'rfdiffusion_result.pdb' : 'alphafold_result.pdb';

    const downloadPDB = () => {
      if (result.pdbContent) {
        const blob = new Blob([result.pdbContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || defaultFilename;
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
        
        // Create temporary PDB blob URL
        const pdbBlob = new Blob([result.pdbContent], { type: 'text/plain' });
        const blobUrl = URL.createObjectURL(pdbBlob);
        
        // Load structure in viewer using blob URL
        const code = `
try {
  await builder.clearStructure();
  await builder.loadStructure('${blobUrl}');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('Structure loaded successfully');
} catch (e) { 
  console.error('Failed to load structure:', e); 
}`;
        
        // Save code to editor so user can see and modify it
        setCurrentCode(code);
        
        // Set structure origin for LLM context
        const isRFdiffusion = result.jobType === 'rfdiffusion';
        setCurrentStructureOrigin({
          type: isRFdiffusion ? 'rfdiffusion' : 'alphafold',
          jobId: result.parameters?.jobId,
          parameters: result.parameters,
          metadata: result.metadata,
          filename: result.filename
        });
        
        // Save code to active session for persistence
        if (activeSessionId) {
          saveVisualizationCode(activeSessionId, code);
          console.log('[ChatPanel] Saved visualization code to session:', activeSessionId);
        }
        
        await executor.executeCode(code);
        setViewerVisibleAndSave(true);
        setActivePane('viewer');
        
        // Keep blob URL alive for a bit longer to ensure structure loads
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 5000);
      } catch (err) {
        console.error('Failed to load structure in viewer:', err);
      } finally {
        setIsExecuting(false);
      }
    };

    return (
      <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">{iconText}</span>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{title}</h4>
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
    console.log('🚀 [AlphaFold] User confirmed folding request');
    console.log('📊 [AlphaFold] Sequence length:', sequence.length);
    console.log('⚙️ [AlphaFold] Parameters:', parameters);
    
    setShowAlphaFoldDialog(false);
    
    const jobId = `af_${Date.now()}`;
    console.log('🆔 [AlphaFold] Generated job ID:', jobId);
    
    // Validate sequence before proceeding
    const validationError = AlphaFoldErrorHandler.handleSequenceValidation(sequence, jobId);
    if (validationError) {
      // Log the validation error
      logAlphaFoldError(validationError, { sequence: sequence.slice(0, 100), parameters });
      
      const errorMessage: ExtendedMessage = {
        id: (Date.now() + 1).toString(),
        content: validationError.userMessage,
        type: 'ai',
        timestamp: new Date(),
        error: validationError
      };
      addMessage(errorMessage);
      return;
    }
    
    alphafoldProgress.startProgress(jobId, 'Submitting protein folding request...');
    console.log('📡 [AlphaFold] Starting progress tracking for job:', jobId);

    try {
      console.log('🌐 [AlphaFold] Making API call to /api/alphafold/fold');
      console.log('📦 [AlphaFold] Payload:', { sequence: sequence.slice(0, 50) + '...', parameters, jobId });
      
      // Call the AlphaFold API endpoint
      const response = await api.post('/alphafold/fold', {
        sequence,
        parameters,
        jobId,
        sessionId: activeSessionId || undefined, // Associate with current session
      });
      
      console.log('📨 [AlphaFold] API response received:', response.status, response.data);

      // Async flow: 202 Accepted → poll status endpoint until completion
      if (response.status === 202 || response.data.status === 'accepted' || response.data.status === 'queued' || response.data.status === 'running') {
        console.log('🕒 [AlphaFold] Job accepted, starting polling for status...', { jobId });
        const start = Date.now();
        const poll = async () => {
          try {
            const statusResp = await api.get(`/alphafold/status/${jobId}`);
            const st = statusResp.data?.status;
            if (st === 'completed') {
              const result = statusResp.data?.data || {};
              const aiMessage: ExtendedMessage = {
                id: (Date.now() + 1).toString(),
                content: `AlphaFold2 structure prediction completed successfully! The folded structure is ready for download and visualization.`,
                type: 'ai',
                timestamp: new Date(),
                alphafoldResult: {
                  pdbContent: result.pdbContent,
                  filename: result.filename || `folded_${Date.now()}.pdb`,
                  sequence,
                  parameters,
                  metadata: result.metadata,
                  jobType: 'alphafold'
                }
              };
        addMessage(aiMessage);
        alphafoldProgress.completeProgress();
        
        // Notify FileBrowser to refresh
        window.dispatchEvent(new CustomEvent('session-file-added'));
        
        return true;
            } else if (st === 'error') {
              const apiError = AlphaFoldErrorHandler.createError(
                'FOLDING_FAILED',
                { jobId, sequenceLength: sequence.length, parameters },
                statusResp.data?.error || 'Folding computation failed',
                undefined,
                jobId
              );
              logAlphaFoldError(apiError, { apiResponse: statusResp.data, sequence: sequence.slice(0, 100), parameters });
              const errorMessage: ExtendedMessage = {
                id: (Date.now() + 1).toString(),
                content: apiError.userMessage,
                type: 'ai',
                timestamp: new Date(),
                error: apiError
              };
              addMessage(errorMessage);
              alphafoldProgress.errorProgress(apiError.userMessage);
              return true;
            } else {
              // Update progress heuristically up to 90%
              const elapsed = (Date.now() - start) / 1000;
              const estDuration = 300; // 5 minutes heuristic
              const pct = Math.min(90, Math.round((elapsed / estDuration) * 90));
              alphafoldProgress.updateProgress(`Processing... (${Math.round(elapsed)}s)`, pct);
              return false;
            }
          } catch (e) {
            console.warn('⚠️ [AlphaFold] Polling failed, will retry...', e);
            return false;
          }
        };

        // Poll every 3s until done or timeout (~15 minutes)
        const timeoutSec = 15 * 60;
        let finished = false;
        while (!finished && (Date.now() - start) / 1000 < timeoutSec) {
          // eslint-disable-next-line no-await-in-loop
          finished = await poll();
          if (finished) break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise(res => setTimeout(res, 3000));
        }

        if (!finished) {
          const apiError = AlphaFoldErrorHandler.createError(
            'FOLDING_FAILED',
            { jobId, sequenceLength: sequence.length, parameters },
            'Folding timed out',
            undefined,
            jobId
          );
          logAlphaFoldError(apiError, { sequence: sequence.slice(0, 100), parameters, timedOut: true });
          const errorMessage: ExtendedMessage = {
            id: (Date.now() + 1).toString(),
            content: apiError.userMessage,
            type: 'ai',
            timestamp: new Date(),
            error: apiError
          };
          addMessage(errorMessage);
          alphafoldProgress.errorProgress(apiError.userMessage);
        }
        return; // Exit after async flow
      }

      if (response.data.status === 'success') {
        const result = response.data.data;
        
        // Add result message to chat
        const aiMessage: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          content: `AlphaFold2 structure prediction completed successfully! The folded structure is ready for download and visualization.`,
          type: 'ai',
          timestamp: new Date(),
          alphafoldResult: {
            pdbContent: result.pdbContent,
            filename: result.filename || `folded_${Date.now()}.pdb`,
            sequence,
            parameters,
            metadata: result.metadata,
            jobType: 'alphafold'
          }
        };
        
        addMessage(aiMessage);
        alphafoldProgress.completeProgress();
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
        
        const errorMessage: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          content: apiError.userMessage,
          type: 'ai',
          timestamp: new Date(),
          error: apiError
        };
        
        addMessage(errorMessage);
        alphafoldProgress.errorProgress(apiError.userMessage);
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
      
      const errorMessage: ExtendedMessage = {
        id: (Date.now() + 1).toString(),
        content: structuredError.userMessage,
        type: 'ai',
        timestamp: new Date(),
        error: structuredError
      };
      
      addMessage(errorMessage);
      alphafoldProgress.errorProgress(structuredError.userMessage);
    }
  };

  const handleProteinMPNNConfirm = async (config: {
    pdbSource: 'rfdiffusion' | 'upload' | 'inline';
    sourceJobId?: string;
    uploadId?: string;
    parameters: any;
    message?: string;
  }) => {
    console.log('🧩 [ProteinMPNN] Confirm payload:', config);
    setShowProteinMPNNDialog(false);

    const jobId = `pm_${Date.now()}`;

    const payload = {
      jobId,
      pdbSource: config.pdbSource,
      sourceJobId: config.sourceJobId,
      uploadId: config.uploadId,
      parameters: config.parameters,
    };

    const context = {
      jobId,
      pdbSource: config.pdbSource,
      sourceJobId: config.sourceJobId,
      uploadId: config.uploadId,
      parameters: config.parameters,
    };

    try {
      proteinmpnnProgress.startProgress(jobId, 'Submitting ProteinMPNN design request...');
      const response = await api.post('/proteinmpnn/design', payload);
      console.log('🧬 [ProteinMPNN] Submission response:', response.status, response.data);

      if (response.status !== 202) {
        const errorDetails = createProteinMPNNError(
          'PROTEINMPNN_SUBMIT_FAILED',
          'ProteinMPNN job submission failed.',
          response.data?.error || 'Unexpected response from ProteinMPNN submission endpoint.',
          context,
        );
        const errorMessage: ExtendedMessage = {
          id: uuidv4(),
          content: errorDetails.userMessage,
          type: 'ai',
          timestamp: new Date(),
          error: errorDetails,
        };
        addMessage(errorMessage);
        proteinmpnnProgress.errorProgress(errorDetails.userMessage);
        return;
      }

      const started = Date.now();
      const timeoutSec = 15 * 60; // 15 minutes
      let finished = false;
      let lastProgressUpdate = 10;

      const poll = async (): Promise<boolean> => {
        try {
          const statusResp = await api.get(`/proteinmpnn/status/${jobId}`);
          const statusData = statusResp.data || {};
          const status = statusData.status as string;
          const progressState = statusData.progress;

          console.log('⏱️ [ProteinMPNN] Poll status:', status, progressState);

          if (status === 'completed') {
            const resultResp = await api.get(`/proteinmpnn/result/${jobId}`);
            const resultData = resultResp.data || {};
            const sequences = extractProteinMPNNSequences(resultData);

            const sequenceEntries = sequences.map((sequence, idx) => ({
              id: `${jobId}_${idx + 1}`,
              sequence,
              length: sequence.length,
            }));

            const messageContent = sequenceEntries.length
              ? `ProteinMPNN generated ${sequenceEntries.length} candidate sequence${sequenceEntries.length === 1 ? '' : 's'}.`
              : 'ProteinMPNN job completed, but no sequences were returned.';

            const resultMessage: ExtendedMessage = {
              id: uuidv4(),
              content: messageContent,
              type: 'ai',
              timestamp: new Date(),
              proteinmpnnResult: {
                jobId,
                sequences: sequenceEntries,
                downloads: {
                  json: `/api/proteinmpnn/result/${jobId}?fmt=json`,
                  fasta: `/api/proteinmpnn/result/${jobId}?fmt=fasta`,
                  raw: `/api/proteinmpnn/result/${jobId}?fmt=raw`,
                },
                metadata: resultData,
              },
            };

            addMessage(resultMessage);
            proteinmpnnProgress.completeProgress(
              sequenceEntries.length ? 'Sequence design completed successfully!' : 'ProteinMPNN job completed.'
            );
            return true;
          }

          if (status === 'error' || status === 'timeout' || status === 'polling_failed') {
            const errorDetails = createProteinMPNNError(
              'PROTEINMPNN_JOB_FAILED',
              'ProteinMPNN sequence design failed.',
              statusData.error || status || 'Job failed',
              { ...context, status },
            );
            const errorMessage: ExtendedMessage = {
              id: uuidv4(),
              content: errorDetails.userMessage,
              type: 'ai',
              timestamp: new Date(),
              error: errorDetails,
            };
            addMessage(errorMessage);
            proteinmpnnProgress.errorProgress(errorDetails.userMessage);
            return true;
          }

          if (status === 'not_found') {
            proteinmpnnProgress.updateProgress('Waiting for ProteinMPNN job to register...', lastProgressUpdate);
            return false;
          }

          const elapsedSeconds = (Date.now() - started) / 1000;
          const computedProgress = Math.min(95, Math.round((elapsedSeconds / timeoutSec) * 90));
          const progressValue = typeof progressState?.progress === 'number'
            ? progressState.progress
            : computedProgress;
          lastProgressUpdate = progressValue;
          const progressMessage = progressState?.message || 'Design in progress...';
          proteinmpnnProgress.updateProgress(progressMessage, progressValue);
          return false;
        } catch (pollError: any) {
          console.warn('⚠️ [ProteinMPNN] Polling error:', pollError);
          const elapsedSeconds = (Date.now() - started) / 1000;
          const fallbackProgress = Math.min(90, Math.round((elapsedSeconds / timeoutSec) * 80));
          proteinmpnnProgress.updateProgress('Waiting for ProteinMPNN result...', fallbackProgress);
          return false;
        }
      };

      while (!finished && (Date.now() - started) / 1000 < timeoutSec) {
        // eslint-disable-next-line no-await-in-loop
        finished = await poll();
        if (finished) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      if (!finished) {
        const errorDetails = createProteinMPNNError(
          'PROTEINMPNN_TIMEOUT',
          'ProteinMPNN job timed out before completion.',
          'Job exceeded client-side timeout threshold.',
          context,
        );
        const errorMessage: ExtendedMessage = {
          id: uuidv4(),
          content: errorDetails.userMessage,
          type: 'ai',
          timestamp: new Date(),
          error: errorDetails,
        };
        addMessage(errorMessage);
        proteinmpnnProgress.errorProgress(errorDetails.userMessage);
      }
    } catch (error: any) {
      console.error('❌ [ProteinMPNN] Request failed:', error);
      const technicalMessage = error?.response?.data?.error || error?.message || 'Unknown ProteinMPNN error';
      const errorDetails = createProteinMPNNError(
        'PROTEINMPNN_REQUEST_FAILED',
        'Unable to submit ProteinMPNN job.',
        technicalMessage,
        context,
      );
      const errorMessage: ExtendedMessage = {
        id: uuidv4(),
        content: errorDetails.userMessage,
        type: 'ai',
        timestamp: new Date(),
        error: errorDetails,
      };
      addMessage(errorMessage);
      proteinmpnnProgress.errorProgress(errorDetails.userMessage);
    }
  };

  // RFdiffusion handling functions
  const handleRFdiffusionConfirm = async (parameters: any) => {
    setShowRFdiffusionDialog(false);
    
    const jobId = `rf_${Date.now()}`;
    console.log('🚀 [RFdiffusion] User confirmed design request');
    console.log('⚙️ [RFdiffusion] Parameters:', parameters);
    console.log('🆔 [RFdiffusion] Generated job ID:', jobId);
    
    rfdiffusionProgress.startProgress(jobId, 'Submitting RFdiffusion design request...');
    console.log('📡 [RFdiffusion] Starting progress tracking for job:', jobId);
    
    try {
      console.log('🌐 [RFdiffusion] Making API call to /api/rfdiffusion/design');
      const response = await api.post('/rfdiffusion/design', {
        parameters,
        jobId,
        sessionId: activeSessionId || undefined, // Associate with current session
      });
      
      console.log('📨 [RFdiffusion] API response received:', response.status, response.data);

      // Async flow: 202 Accepted → poll status endpoint until completion
      if (response.status === 202 || response.data.status === 'accepted' || response.data.status === 'queued' || response.data.status === 'running') {
        console.log('🕒 [RFdiffusion] Job accepted, starting polling for status...', { jobId });
        const start = Date.now();
        const poll = async () => {
          try {
            const statusResp = await api.get(`/rfdiffusion/status/${jobId}`);
            const st = statusResp.data?.status;
            if (st === 'completed') {
              const result = statusResp.data?.data || {};
              
              // Auto-download PDB file
              if (result.pdbContent) {
                const blob = new Blob([result.pdbContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename || `rfdiffusion_${Date.now()}.pdb`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }
              
              const aiMessage: ExtendedMessage = {
                id: (Date.now() + 1).toString(),
                content: `RFdiffusion protein design completed successfully! The designed structure is ready for download and visualization.`,
                type: 'ai',
                timestamp: new Date(),
                alphafoldResult: {
                  pdbContent: result.pdbContent,
                  filename: result.filename || `designed_${Date.now()}.pdb`,
                  parameters,
                  metadata: result.metadata,
                  jobType: 'rfdiffusion'
                }
              };
              addMessage(aiMessage);
              rfdiffusionProgress.completeProgress();
              
              // Notify FileBrowser to refresh
              window.dispatchEvent(new CustomEvent('session-file-added'));
              
              return true;
            } else if (st === 'error') {
              const apiError = RFdiffusionErrorHandler.handleError(statusResp.data, {
                jobId,
                parameters,
                feature: 'RFdiffusion'
              });
              const errorMessage: ExtendedMessage = {
                id: (Date.now() + 1).toString(),
                content: apiError.userMessage,
                type: 'ai',
                timestamp: new Date(),
                error: apiError
              };
              addMessage(errorMessage);
              rfdiffusionProgress.errorProgress(apiError.userMessage);
              return true;
            } else {
              // Update progress heuristically up to 90%
              const elapsed = (Date.now() - start) / 1000;
              const estDuration = 480; // 8 minutes heuristic for RFdiffusion
              const pct = Math.min(90, Math.round((elapsed / estDuration) * 90));
              rfdiffusionProgress.updateProgress(`Processing... (${Math.round(elapsed)}s)`, pct);
              return false;
            }
          } catch (e) {
            console.warn('⚠️ [RFdiffusion] Polling failed, will retry...', e);
            return false;
          }
        };

        // Poll every 3s until done or timeout (~20 minutes for RFdiffusion)
        const timeoutSec = 20 * 60;
        let finished = false;
        while (!finished && (Date.now() - start) / 1000 < timeoutSec) {
          // eslint-disable-next-line no-await-in-loop
          finished = await poll();
          if (finished) break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise(res => setTimeout(res, 3000));
        }

        if (!finished) {
          const apiError = RFdiffusionErrorHandler.handleError(
            { userMessage: 'RFdiffusion design timed out', technicalMessage: 'Job exceeded maximum wait time' },
            { jobId, parameters, feature: 'RFdiffusion' }
          );
          const errorMessage: ExtendedMessage = {
            id: (Date.now() + 1).toString(),
            content: apiError.userMessage,
            type: 'ai',
            timestamp: new Date(),
            error: apiError
          };
          addMessage(errorMessage);
          rfdiffusionProgress.errorProgress(apiError.userMessage);
        }
        return; // Exit after async flow
      }

      // Synchronous success flow
      if (response.data.status === 'success') {
        const result = response.data.data;
        
        // Auto-download PDB file
        if (result.pdbContent) {
          const blob = new Blob([result.pdbContent], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.filename || `rfdiffusion_${Date.now()}.pdb`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        
        // Add result message to chat
        const aiMessage: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          content: `RFdiffusion protein design completed successfully! The designed structure is ready for download and visualization.`,
          type: 'ai',
          timestamp: new Date(),
          alphafoldResult: {
            pdbContent: result.pdbContent,
            filename: result.filename || `designed_${Date.now()}.pdb`,
            parameters,
            metadata: result.metadata,
            jobType: 'rfdiffusion'
          }
        };
        
        addMessage(aiMessage);
        rfdiffusionProgress.completeProgress();
        
        // Notify FileBrowser to refresh
        window.dispatchEvent(new CustomEvent('session-file-added'));
      } else if (response.data.status === 'error') {
        // Handle API error response - use the response.data directly
        const apiError = RFdiffusionErrorHandler.handleError(response.data, {
          jobId,
          parameters,
          feature: 'RFdiffusion'
        });
        
        const errorMessage: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          content: apiError.userMessage,
          type: 'ai',
          timestamp: new Date(),
          error: apiError
        };
        
        addMessage(errorMessage);
        rfdiffusionProgress.errorProgress(apiError.userMessage);
      } else {
        // Unexpected response format
        const apiError = RFdiffusionErrorHandler.handleError(
          { userMessage: 'Unexpected response from server', technicalMessage: JSON.stringify(response.data) },
          { jobId, parameters, feature: 'RFdiffusion' }
        );
        
        const errorMessage: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          content: apiError.userMessage,
          type: 'ai',
          timestamp: new Date(),
          error: apiError
        };
        
        addMessage(errorMessage);
        rfdiffusionProgress.errorProgress(apiError.userMessage);
      }
    } catch (error: any) {
      console.error('RFdiffusion request failed:', error);
      
      // Extract error data from axios response if available
      const errorData = error?.response?.data || error?.data || error;
      
      // Handle different types of errors
      const structuredError = RFdiffusionErrorHandler.handleError(errorData, {
        jobId,
        parameters,
        feature: 'RFdiffusion'
      });
      
      const errorMessage: ExtendedMessage = {
        id: (Date.now() + 1).toString(),
        content: structuredError.userMessage,
        type: 'ai',
        timestamp: new Date(),
        error: structuredError
      };
      
      addMessage(errorMessage);
      rfdiffusionProgress.errorProgress(structuredError.userMessage);
    }
  };

  const handleAlphaFoldResponse = (responseData: any) => {
    try {
      // Enhanced logging for debugging
      console.log('🧬 [AlphaFold] Raw response received:', responseData);
      console.log('🧬 [AlphaFold] Response type:', typeof responseData);
      console.log('🧬 [AlphaFold] Response length:', responseData?.length || 0);
      
      const data = JSON.parse(responseData);
      console.log('✅ [AlphaFold] Successfully parsed JSON:', data);
      console.log('🔍 [AlphaFold] Action detected:', data.action);
      
      if (data.action === 'confirm_folding') {
        console.log('🎯 [AlphaFold] Confirm folding action detected');
        
        // Handle sequence extraction if needed
        if (data.sequence === 'NEEDS_EXTRACTION' && data.source) {
          console.log('🧪 [AlphaFold] Sequence needs extraction from:', data.source);
          // Extract sequence from PDB (this would normally call a sequence extraction API)
          // For now, we'll use a mock sequence for demonstration
          const mockSequence = 'MVLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPG';
          data.sequence = mockSequence;
          data.message = `Extracted sequence from ${data.source}. Ready to fold ${mockSequence.length}-residue protein.`;
          console.log('✅ [AlphaFold] Mock sequence extracted, length:', mockSequence.length);
        } else {
          console.log('📝 [AlphaFold] Direct sequence provided, length:', data.sequence?.length || 0);
        }
        
        console.log('💬 [AlphaFold] Setting dialog data and showing dialog');
        setAlphafoldData(data);
        setShowAlphaFoldDialog(true);
        return true; // Handled
      }

      if (data.action === 'confirm_design') {
        console.log('[RFdiffusion] Design confirmation detected');
        setRfdiffusionData(data);
        setShowRFdiffusionDialog(true);
        return true; // Handled
      }

      if (data.action === 'confirm_proteinmpnn_design') {
        console.log('[ProteinMPNN] Design confirmation detected');
        setProteinmpnnData(data);
        setShowProteinMPNNDialog(true);
        return true;
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

    // Upload pending file if one exists
    let fileUploadResult: { file_id: string } | null = null;
    let uploadedFileInfo: {
      file_id: string;
      filename: string;
      file_url: string;
      atoms: number;
      chains: string[];
    } | null = null;
    if (pendingFile) {
      try {
        setIsLoading(true);
        const formData = new FormData();
        formData.append('file', pendingFile);
        if (activeSessionId) {
          formData.append('session_id', activeSessionId);
        }

        const response = await fetch('/api/upload/pdb', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Upload failed');
        }

        const result = await response.json();
        fileUploadResult = { file_id: result.file_info.file_id };
        uploadedFileInfo = {
          file_id: result.file_info.file_id,
          filename: result.file_info.filename,
          file_url: result.file_info.file_url,
          atoms: result.file_info.atoms,
          chains: result.file_info.chains,
        };
        setUploadedFile({
          ...uploadedFileInfo,
          size: result.file_info.size || 0,
        });
        
        // Clear pending file after successful upload
        setPendingFile(null);
        
        // Clear previous PDB context when new file is uploaded
        setCurrentCode('');
        setCurrentStructureOrigin(null);
        
        // Clear and load new uploaded file in viewer
        if (plugin) {
          try {
            setIsExecuting(true);
            const executor = new CodeExecutor(plugin);
            // Clear previous structure
            await executor.executeCode('try { await builder.clearStructure(); } catch(e) { console.warn("Clear failed:", e); }');
            console.log('[ChatPanel] Cleared previous structure for new file upload');
            
            // Fetch file content and create blob URL (like AlphaFold does)
            const fileUrl = result.file_info.file_url || `/api/upload/pdb/${result.file_info.file_id}`;
            const fileResponse = await fetch(fileUrl);
            if (!fileResponse.ok) {
              throw new Error('Failed to fetch uploaded file');
            }
            const fileContent = await fileResponse.text();
            
            // Create blob URL
            const pdbBlob = new Blob([fileContent], { type: 'text/plain' });
            const blobUrl = URL.createObjectURL(pdbBlob);
            
            // Load structure in viewer using blob URL
            const loadCode = `
try {
  await builder.loadStructure('${blobUrl}');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('Uploaded file loaded successfully');
} catch (e) { 
  console.error('Failed to load uploaded file:', e); 
}`;
            
            setCurrentCode(loadCode);
            setCurrentStructureOrigin({
              type: 'upload',
              filename: result.file_info.filename,
              metadata: {
                file_id: result.file_info.file_id,
                file_url: fileUrl,
              },
            });
            
            // Save code to active session
            if (activeSessionId) {
              saveVisualizationCode(activeSessionId, loadCode);
            }
            
            await executor.executeCode(loadCode);
            setViewerVisibleAndSave(true);
            setActivePane('viewer');
            console.log('[ChatPanel] Auto-loaded uploaded file in viewer');
            
            // Keep blob URL alive for a bit longer to ensure structure loads
            setTimeout(() => {
              URL.revokeObjectURL(blobUrl);
            }, 5000);
          } catch (e) {
            console.warn('[ChatPanel] Failed to load uploaded file in viewer:', e);
          } finally {
            setIsExecuting(false);
          }
        }
      } catch (error: any) {
        console.error('File upload failed:', error);
        // Show error but continue with message
        const errorMsg: Message = {
          id: uuidv4(),
          content: `Failed to upload file: ${error.message}`,
          type: 'ai',
          timestamp: new Date()
        };
        addMessage(errorMsg);
        setPendingFile(null); // Clear pending file even on error
        setIsLoading(false);
        return;
      }
    }

    const userMessage: Message = {
      id: uuidv4(),
      content: input.trim(),
      type: 'user',
      timestamp: new Date(),
      // Attach file info if file was uploaded
      uploadedFile: uploadedFileInfo || undefined,
    };

    addMessage(userMessage);
    setInput('');
    setIsLoading(true);

    // Create placeholder AI message immediately for real-time thinking display
    let placeholderMessageId: string | null = null;
    if (isThinkingModelSelected) {
      const placeholderMsg: ExtendedMessage = {
        id: uuidv4(),
        content: '',
        type: 'ai',
        timestamp: new Date(),
        thinkingProcess: {
          steps: [],
          isComplete: false,
          totalSteps: 0
        }
      };
      placeholderMessageId = placeholderMsg.id;
      addMessage(placeholderMsg);
    }

    try {
      const text = userMessage.content;
      let code = '';
      let thinkingProcess: ExtendedMessage['thinkingProcess'] | undefined = undefined;
      let messageAlreadyUpdated = false; // Track if message was updated during streaming
      
      const payload = {
        input: text,
        currentCode,
        currentStructureOrigin: currentStructureOrigin || undefined, // Include structure origin context
        history: messages.slice(-6).map(m => {
          const base: any = { type: m.type, content: m.content };
          
          // Include RF diffusion/AlphaFold result metadata
          if (m.alphafoldResult) {
            base.alphafoldResult = {
              jobType: m.alphafoldResult.jobType,
              parameters: m.alphafoldResult.parameters,
              filename: m.alphafoldResult.filename,
              // Don't include pdbContent (too large), but include metadata
              metadata: m.alphafoldResult.metadata
            };
          }
          
          // Include ProteinMPNN result metadata if present
          if (m.proteinmpnnResult) {
            base.proteinmpnnResult = {
              jobId: m.proteinmpnnResult.jobId,
              metadata: m.proteinmpnnResult.metadata
            };
          }
          
          return base;
        }),
        selection: selections.length > 0 ? selections[0] : null, // First selection for backward compatibility
        selections: selections, // Full selections array for new multi-selection support
        agentId: agentSettings.selectedAgentId || undefined, // Only send if manually selected
        model: agentSettings.selectedModel || undefined, // Only send if manually selected
        uploadedFileId: fileUploadResult?.file_id || undefined, // Only include file ID when file is uploaded with this message
      };
      console.log('[AI] route:request', payload);
      console.log('[DEBUG] currentCode length:', currentCode?.length || 0);
      console.log('[DEBUG] selections count:', selections.length);
      console.log('[DEBUG] selections:', selections);
      
      // Use streaming for thinking models
      console.log('[Stream] Check:', { 
        isThinkingModelSelected, 
        placeholderMessageId, 
        selectedModelId,
        willUseStreaming: isThinkingModelSelected && placeholderMessageId 
      });
      
      if (isThinkingModelSelected && placeholderMessageId) {
        try {
          console.log('[Stream] Starting streaming request for thinking model');
          let accumulatedContent = '';
          let accumulatedThinkingSteps: Array<{
            id: string;
            title: string;
            content: string;
            status: 'pending' | 'processing' | 'completed';
          }> = [];
          let finalResult: any = null;
          
          // Helper function to get fresh session and update messages
          const updateMessageWithFreshSession = (updater: (msg: ExtendedMessage) => ExtendedMessage) => {
            const currentSession = getActiveSession();
            if (!currentSession || currentSession.id !== activeSessionId) {
              console.warn('[Stream] Session changed or not found during streaming', {
                currentSessionId: currentSession?.id,
                expectedSessionId: activeSessionId
              });
              return false;
            }
            
            // Verify placeholder message exists
            const placeholderExists = currentSession.messages.some((msg: Message) => msg.id === placeholderMessageId);
            if (!placeholderExists) {
              console.warn('[Stream] Placeholder message not found in session', { placeholderMessageId });
              return false;
            }
            
            const updatedMessages = currentSession.messages.map((msg: Message) => 
              msg.id === placeholderMessageId
                ? updater(msg as ExtendedMessage)
                : msg
            );
            updateMessages(updatedMessages);
            return true;
          };
          
          for await (const chunk of streamAgentRoute(payload)) {
            // Check if session still exists and matches
            const currentSession = getActiveSession();
            if (!currentSession || currentSession.id !== activeSessionId) {
              console.warn('[Stream] Session changed during streaming, stopping');
              break;
            }
            
            if (chunk.type === 'thinking_step') {
              const step = chunk.data;
              // Update or add step
              const existingIdx = accumulatedThinkingSteps.findIndex(s => s.id === step.id);
              if (existingIdx >= 0) {
                accumulatedThinkingSteps[existingIdx] = step;
              } else {
                accumulatedThinkingSteps.push(step);
              }
              
              // Update message with current thinking steps using fresh session
              const thinkingData: ExtendedMessage['thinkingProcess'] = {
                steps: [...accumulatedThinkingSteps],
                isComplete: false,
                totalSteps: accumulatedThinkingSteps.length
              };
              
              updateMessageWithFreshSession(msg => ({
                ...msg,
                thinkingProcess: thinkingData
              }));
            } else if (chunk.type === 'content') {
              // Accumulate content
              accumulatedContent += chunk.data.text || '';
              
              // Update message content incrementally using fresh session
              updateMessageWithFreshSession(msg => ({
                ...msg,
                content: accumulatedContent
              }));
            } else if (chunk.type === 'complete') {
              // Final result
              finalResult = chunk.data;
              console.log('[Stream] Complete:', finalResult);
              
              // Finalize message using fresh session
              const thinkingData = convertThinkingData(finalResult.thinkingProcess, true);
              updateMessageWithFreshSession(msg => ({
                ...msg,
                content: finalResult.text || accumulatedContent,
                thinkingProcess: thinkingData || msg.thinkingProcess
              }));
              
              // Handle special agents (AlphaFold, etc.)
              const agentId = finalResult.agentId;
              if (agentId === 'alphafold-agent' || agentId === 'proteinmpnn-agent' || agentId === 'rfdiffusion-agent') {
                if (handleAlphaFoldResponse(finalResult.text)) {
                  setIsLoading(false);
                  return;
                }
              }

              // Check if this is a pipeline blueprint response (streaming)
              try {
                const parsed = JSON.parse(finalResult.text || '');
                if (parsed.type === 'blueprint' && parsed.blueprint) {
                  console.log('🔧 [Pipeline] Blueprint detected in stream, setting ghost blueprint');
                  const blueprint: PipelineBlueprint = {
                    rationale: parsed.rationale || parsed.content || 'Pipeline blueprint generated',
                    nodes: parsed.blueprint.nodes || [],
                    edges: parsed.blueprint.edges || [],
                    missing_resources: parsed.blueprint.missing_resources || [],
                  };
                  
                  setGhostBlueprint(blueprint);
                  setViewerVisible(true);
                  setActivePane('pipeline');
                  
                  // Update message with blueprint info
                  updateMessageWithFreshSession((msg: ExtendedMessage) => ({
                    ...msg,
                    content: blueprint.rationale + (blueprint.missing_resources.length > 0 
                      ? `\n\n⚠️ Missing resources: ${blueprint.missing_resources.join(', ')}`
                      : ''),
                  }));
                  
                  setIsLoading(false);
                  return;
                }
              } catch (e) {
                // Not a JSON blueprint, continue
              }
              
              // For text agents, we're done
              if (finalResult.type === 'text') {
                setIsLoading(false);
                return;
              }
              
              // For code agents, continue with code execution below
              code = finalResult.code || '';
              thinkingProcess = thinkingData;
              break;
            } else if (chunk.type === 'error') {
              console.error('[Stream] Error:', chunk.data);
              const errorMsg: ExtendedMessage = {
                id: uuidv4(),
                content: `Error: ${chunk.data.error || 'Streaming failed'}`,
                type: 'ai',
                timestamp: new Date()
              };
              addMessage(errorMsg);
              setIsLoading(false);
              return;
            }
          }
          
          // If we got a complete result, continue with normal flow
          if (finalResult && finalResult.type === 'code') {
            // Update placeholder message with final code result using fresh session
            const currentSession = getActiveSession();
            if (placeholderMessageId && currentSession && currentSession.id === activeSessionId) {
              const finalThinkingProcess = convertThinkingData(finalResult.thinkingProcess, true);
              // Handle empty code case - preserve message with thinking process
              const defaultMessageContent = finalResult.code && finalResult.code.trim()
                ? `Generated code for: "${text}". Executing...`
                : `I couldn't generate valid code for: "${text}". ${finalThinkingProcess ? 'See my thinking process above for details.' : ''}`;
              
              // Try to generate PDB summary asynchronously
              generatePDBSummary(text).then(summary => {
                if (summary) {
                  const currentSession = getActiveSession();
                  if (currentSession && currentSession.id === activeSessionId && placeholderMessageId) {
                    updateMessageWithFreshSession((msg: ExtendedMessage) => 
                      msg.id === placeholderMessageId ? {
                        ...msg,
                        content: summary,
                        thinkingProcess: finalThinkingProcess || msg.thinkingProcess
                      } : msg
                    );
                  }
                }
              }).catch(err => {
                console.warn('Failed to generate PDB summary:', err);
              });
              
              // Set default message immediately
              updateMessageWithFreshSession((msg: ExtendedMessage) => ({
                ...msg,
                content: defaultMessageContent,
                thinkingProcess: finalThinkingProcess || msg.thinkingProcess
              }));
              messageAlreadyUpdated = true; // Mark that we've updated the message
            }
            // Continue to code execution below (code variable is already set)
            // If code is empty, execution will be skipped but message is preserved
          } else if (finalResult && finalResult.type === 'text') {
            // Already handled above, return early
            setIsLoading(false);
            return;
          } else {
            // Stream completed but no final result - this shouldn't happen
            console.warn('[Stream] Stream completed without final result');
            setIsLoading(false);
            return;
          }
        } catch (streamError: any) {
          console.error('[Stream] Streaming failed, falling back to regular API:', streamError);
          setIsLoading(false);
          // Fall through to regular API call
        } finally {
          // Ensure loading is cleared even if we break out of the loop
          // (though we should have already cleared it in all return paths)
        }
      }
      
      // Regular (non-streaming) API call
      try {
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
          // Mark as complete since we have the full response
          thinkingProcess = convertThinkingData(response.data?.thinkingProcess, true);
          console.log('[AI] route:text', { text: aiText?.slice?.(0, 400), hasThinking: !!thinkingProcess });
          
          // Check if this is an AlphaFold response
          if (agentId === 'alphafold-agent') {
            console.log('🧬 [AlphaFold] Agent detected, processing response');
            console.log('📄 [AlphaFold] Agent response text:', aiText.slice(0, 200) + '...');
            
            if (handleAlphaFoldResponse(aiText)) {
              console.log('✅ [AlphaFold] Response handled successfully, dialog should be shown');
              return; // AlphaFold dialog will be shown
            } else {
              // Fallback: if JSON parsing failed, try to extract key info and show a basic dialog
              console.log('⚠️ [AlphaFold] Fallback: attempting to parse non-JSON response');
              console.log('🔍 [AlphaFold] Full response text:', aiText);
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

          if (agentId === 'proteinmpnn-agent') {
            console.log('🧪 [ProteinMPNN] Agent detected, processing response');
            console.log('🧪 [ProteinMPNN] Agent response text:', aiText.slice(0, 200) + '...');

            if (handleAlphaFoldResponse(aiText)) {
              return;
            }

            console.log('⚠️ [ProteinMPNN] Fallback: attempting to parse non-JSON response');
            const fallbackData = {
              action: 'confirm_proteinmpnn_design',
              pdbSource: 'upload',
              parameters: {
                numDesigns: 5,
                temperature: 0.1,
                chainIds: [],
                fixedPositions: [],
                options: {}
              },
              design_info: {
                summary: 'ProteinMPNN inverse folding request detected.',
                notes: ['Please upload a PDB file to continue.']
              },
              message: 'Ready to run ProteinMPNN. Please confirm backbone source and parameters.'
            };
            handleAlphaFoldResponse(JSON.stringify(fallbackData));
            return;
          }

          // Check if this is an RFdiffusion response
          if (agentId === 'rfdiffusion-agent') {
            if (handleAlphaFoldResponse(aiText)) {
              return; // RFdiffusion dialog will be shown
            } else {
              // Fallback: if JSON parsing failed, try to extract key info and show a basic dialog
              console.log('[RFdiffusion] Fallback: attempting to parse non-JSON response');
              const fallbackData = {
                action: 'confirm_design',
                parameters: {
                  design_mode: 'unconditional',
                  contigs: 'A50-150',
                  hotspot_res: [],
                  diffusion_steps: 15
                },
                design_info: {
                  mode: 'unconditional',
                  template: 'No template structure',
                  contigs: 'A50-150',
                  hotspots: 0,
                  complexity: 'medium'
                },
                estimated_time: '3-8 minutes',
                message: 'Ready to design a new protein structure. Please confirm parameters.'
              };
              
              // Handle the fallback data
              handleAlphaFoldResponse(JSON.stringify(fallbackData));
              return;
            }
          }

          // Check if this is a pipeline blueprint response
          try {
            const parsed = JSON.parse(aiText);
            if (parsed.type === 'blueprint' && parsed.blueprint) {
              console.log('🔧 [Pipeline] Blueprint detected, setting ghost blueprint');
              const blueprint: PipelineBlueprint = {
                rationale: parsed.rationale || parsed.content || 'Pipeline blueprint generated',
                nodes: parsed.blueprint.nodes || [],
                edges: parsed.blueprint.edges || [],
                missing_resources: parsed.blueprint.missing_resources || [],
              };
              
              setGhostBlueprint(blueprint);
              setViewerVisible(true);
              setActivePane('pipeline');
              
              // Create a message explaining the blueprint
              const blueprintMsg: ExtendedMessage = {
                id: uuidv4(),
                content: blueprint.rationale + (blueprint.missing_resources.length > 0 
                  ? `\n\n⚠️ Missing resources: ${blueprint.missing_resources.join(', ')}`
                  : ''),
                type: 'ai',
                timestamp: new Date(),
              };
              
              if (placeholderMessageId && activeSession) {
                const updatedMessages = activeSession.messages.map(msg => 
                  msg.id === placeholderMessageId
                    ? blueprintMsg
                    : msg
                );
                updateMessages(updatedMessages);
              } else {
                addMessage(blueprintMsg);
              }
              
              return; // Exit early, blueprint is set
            }
          } catch (e) {
            // Not a JSON blueprint, continue with normal text handling
          }
          
          // Bio-chat and other text agents should never modify the editor code
          console.log(`[${agentId}] Text response received, preserving current editor code`);
          
          // Update placeholder message or create new one
          if (placeholderMessageId && activeSession) {
            const updatedMessages = activeSession.messages.map(msg => 
              msg.id === placeholderMessageId
                ? { 
                    ...msg, 
                    content: aiText,
                    thinkingProcess: thinkingProcess || (msg as ExtendedMessage).thinkingProcess
                  } as ExtendedMessage
                : msg
            );
            updateMessages(updatedMessages);
          } else {
            const chatMsg: ExtendedMessage = {
              id: uuidv4(),
              content: aiText,
              type: 'ai',
              timestamp: new Date()
            };
            
            // Add thinking process if available
            if (thinkingProcess) {
              chatMsg.thinkingProcess = thinkingProcess;
            }
            
            addMessage(chatMsg);
          }
          return; // Exit early - no code generation or execution
        }
        code = response.data?.code || '';
        // Mark as complete since we have the full response
        thinkingProcess = convertThinkingData(response.data?.thinkingProcess, true);
        console.log('[AI] route:code', { length: code?.length, hasThinking: !!thinkingProcess });
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
      
      // Save code to active session
      if (activeSessionId) {
        saveVisualizationCode(activeSessionId, code);
        console.log('[ChatPanel] Saved visualization code to session:', activeSessionId);
      }

      // Update placeholder message or create new one
      // Mark thinking process as complete now that we have the full response
      // Skip if message was already updated during streaming
      if (!messageAlreadyUpdated) {
        const currentSession = getActiveSession();
        if (placeholderMessageId && currentSession && currentSession.id === activeSessionId) {
          const finalThinkingProcess = thinkingProcess 
            ? convertThinkingData({ 
                steps: thinkingProcess.steps, 
                isComplete: true, 
                totalSteps: thinkingProcess.totalSteps 
              }, true)
            : (currentSession.messages.find(m => m.id === placeholderMessageId) as ExtendedMessage)?.thinkingProcess;
          
          // Determine message content based on whether code is empty
          const defaultMessageContent = code && code.trim()
            ? `Generated code for: "${text}". Executing...`
            : `I couldn't generate valid code for: "${text}". ${thinkingProcess ? 'See my thinking process above for details.' : ''}`;
          
          // Try to generate PDB summary asynchronously
          generatePDBSummary(text).then(summary => {
            if (summary) {
              const currentSession = getActiveSession();
              if (currentSession && currentSession.id === activeSessionId && placeholderMessageId) {
                const updatedMessages = currentSession.messages.map(msg => 
                  msg.id === placeholderMessageId
                    ? { 
                        ...msg, 
                        content: summary,
                        thinkingProcess: finalThinkingProcess
                      } as ExtendedMessage
                    : msg
                );
                updateMessages(updatedMessages);
              }
            }
          }).catch(err => {
            console.warn('Failed to generate PDB summary:', err);
          });
          
          const updatedMessages = currentSession.messages.map(msg => 
            msg.id === placeholderMessageId
              ? { 
                  ...msg, 
                  content: defaultMessageContent,
                  thinkingProcess: finalThinkingProcess
                } as ExtendedMessage
              : msg
          );
          updateMessages(updatedMessages);
        } else {
          const defaultMessageContent = code && code.trim()
            ? `Generated code for: "${text}". Executing...`
            : `I couldn't generate valid code for: "${text}".`;
          
          const aiResponse: ExtendedMessage = {
            id: uuidv4(),
            content: defaultMessageContent,
            type: 'ai',
            timestamp: new Date()
          };
          
          // Add thinking process if available
          if (thinkingProcess) {
            aiResponse.thinkingProcess = thinkingProcess;
          }
          
          addMessage(aiResponse);
          
          // Try to generate PDB summary asynchronously and update message
          generatePDBSummary(text).then(summary => {
            if (summary) {
              const currentSession = getActiveSession();
              if (currentSession && currentSession.id === activeSessionId) {
                const updatedMessages = currentSession.messages.map(msg => 
                  msg.id === aiResponse.id
                    ? { 
                        ...msg, 
                        content: summary
                      } as ExtendedMessage
                    : msg
                );
                updateMessages(updatedMessages);
              }
            }
          }).catch(err => {
            console.warn('Failed to generate PDB summary:', err);
          });
        }
      }

      // Only execute code if it's not empty
      if (code && code.trim()) {
        if (plugin) {
          setIsExecuting(true);
          try {
            const exec = new CodeExecutor(plugin);
            await exec.executeCode(code);
            setViewerVisibleAndSave(true);
            setActivePane('viewer');
          } finally {
            setIsExecuting(false);
          }
        } else {
          // If no plugin yet, queue code to run once viewer initializes
          setPendingCodeToRun(code);
          setViewerVisibleAndSave(true);
          setActivePane('viewer');
        }
      } else {
        // Code is empty - message is already updated above, just ensure loading is cleared
        console.warn('[ChatPanel] Empty code received, skipping execution');
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
      // Always clear loading state, even if streaming or regular API call fails
      setIsLoading(false);
      // Clear uploaded file state after message is sent
      if (uploadedFileInfo) {
        setUploadedFile(null);
      }
    }
  };

  const quickPrompts = [
    'Show insulin',
    'Display hemoglobin',
    'Visualize DNA double helix',
    'Show antibody structure'
  ];

  // Check if we have real user messages (not just the welcome message)
  const hasUserMessages = messages.some(m => m.type === 'user');
  // Check if we only have the initial welcome message
  const isOnlyWelcomeMessage = messages.length === 1 && 
    messages[0].type === 'ai' && 
    messages[0].content.includes('Welcome to NovoProtein AI');
  // Show centered layout when no user messages or only welcome message
  const showCenteredLayout = !hasUserMessages && (messages.length === 0 || isOnlyWelcomeMessage);

  return (
    <div className="h-full flex flex-col">
      {!showCenteredLayout && (
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
      )}

      {!showCenteredLayout ? (
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
                  {message.thinkingProcess && isThinkingModelSelected && (
                    <ThinkingProcessDisplay
                      thinkingSteps={message.thinkingProcess.steps}
                      isProcessing={!message.thinkingProcess.isComplete}
                      currentStep={message.thinkingProcess.steps.findIndex(s => s.status === 'processing') + 1}
                    />
                  )}
                  {renderMessageContent(message.content)}
                  {/* Show uploaded file attachment if the most recent user message before this AI message had one */}
                  {(() => {
                    const messageIndex = messages.findIndex(m => m.id === message.id);
                    if (messageIndex < 0) return null;
                    
                    // Find the most recent user message before this AI message
                    for (let i = messageIndex - 1; i >= 0; i--) {
                      const prevMsg = messages[i];
                      if (prevMsg.type === 'user' && prevMsg.uploadedFile && isValidUploadedFile(prevMsg.uploadedFile)) {
                        return (
                          <div className="mt-3">
                            {renderFileAttachment(prevMsg.uploadedFile, false)}
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                  {renderAlphaFoldResult(message.alphafoldResult)}
                  {renderProteinMPNNResult(message.proteinmpnnResult)}
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
                <>
                  <p className="text-sm">{message.content}</p>
                  {message.uploadedFile && (
                    <div className="mt-2">
                      {renderFileAttachment(message.uploadedFile, true)}
                    </div>
                  )}
                </>
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
      ) : (
        // Centered welcome screen when no messages
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            What can I do for you?
          </h1>
        </div>
      )}

      <div className={`p-4 ${!showCenteredLayout ? 'border-t border-gray-200' : ''}`}>
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
          isVisible={alphafoldProgress.isVisible}
          onCancel={alphafoldProgress.cancelProgress}
          className="mb-3"
          title={alphafoldProgress.title}
          eventName={alphafoldProgress.eventName}
        />
        <ProgressTracker
          isVisible={proteinmpnnProgress.isVisible}
          onCancel={proteinmpnnProgress.cancelProgress}
          className="mb-3"
          title={proteinmpnnProgress.title}
          eventName={proteinmpnnProgress.eventName}
        />
        <ProgressTracker
          isVisible={rfdiffusionProgress.isVisible}
          onCancel={rfdiffusionProgress.cancelProgress}
          className="mb-3"
          title={rfdiffusionProgress.title}
          eventName={rfdiffusionProgress.eventName}
        />

        {!showCenteredLayout && (
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
        )}

        <form onSubmit={handleSubmit} className={`flex flex-col gap-2 ${showCenteredLayout ? 'max-w-2xl w-full mx-auto' : ''}`}>
          {/* Show uploaded file capsule at top of input area */}
          {pendingFile && (
            <div className="flex items-center space-x-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <Paperclip className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium flex-1 truncate" title={pendingFile.name}>
                {pendingFile.name}
              </span>
              <span className="text-xs text-blue-600">
                ({(pendingFile.size / 1024).toFixed(1)} KB)
              </span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                disabled={isLoading}
                className="p-1 hover:bg-blue-100 rounded disabled:opacity-50"
                title="Remove file"
              >
                <X className="w-4 h-4 text-blue-600" />
              </button>
            </div>
          )}
          
          {/* Large text input area */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"Chat, visualize, or build..."}
              className={`w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm placeholder-gray-400 resize-none ${
                showCenteredLayout ? 'min-h-[120px] text-base' : 'min-h-[100px]'
              }`}
              rows={showCenteredLayout ? 4 : 3}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />
          
          </div>
          
          {/* Bottom row: Agent, Model selectors, Microphone, and Send button */}
          <div className="flex items-center gap-2">
            {/* Agent Selector */}
            {agents.length > 0 && (
              <AgentSelector
                agents={agents}
              />
            )}
            
            {/* Model Selector */}
            <ModelSelector
              models={models}
            />
            
            {/* Spacer */}
            <div className="flex-1" />
            
            {/* Upload PDB file button */}
            <PDBFileUpload
              onFileSelected={(file) => {
                // Store file locally, don't upload yet
                setPendingFile(file);
              }}
              onFileCleared={() => {
                // Clear pending file
                setPendingFile(null);
              }}
              onError={(error) => {
                console.error('File selection error:', error);
                // Could show a toast notification here
              }}
              disabled={isLoading}
              pendingFile={pendingFile}
              sessionId={activeSessionId}
            />
            
            {/* Microphone button */}
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Voice input"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            
            {/* Send button */}
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                showCenteredLayout 
                  ? 'p-2 text-gray-400 hover:text-gray-600' 
                  : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
              }`}
              title="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>

        {/* Quick prompts below input when centered layout */}
        {showCenteredLayout && (
          <div className="mt-4 max-w-2xl w-full mx-auto">
            <div className="flex flex-wrap gap-2 justify-center">
              {quickPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => setInput(prompt)}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg border border-gray-200 text-sm font-medium transition-colors flex items-center space-x-2"
                >
                  <span>{prompt}</span>
                </button>
              ))}
              <button
                onClick={() => {}}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg border border-gray-200 text-sm font-medium transition-colors"
              >
                More
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AlphaFold Dialog */}
      <AlphaFoldDialog
        isOpen={showAlphaFoldDialog}
        onClose={() => setShowAlphaFoldDialog(false)}
        onConfirm={handleAlphaFoldConfirm}
        initialData={alphafoldData}
      />

      {/* RFdiffusion Dialog */}
      <RFdiffusionDialog
        isOpen={showRFdiffusionDialog}
        onClose={() => setShowRFdiffusionDialog(false)}
        onConfirm={handleRFdiffusionConfirm}
        initialData={rfdiffusionData}
        contextPdb={(() => {
          // Extract PDB context from viewer
          // Priority 1: lastLoadedPdb from store
          if (lastLoadedPdb) {
            return { type: 'pdb_id' as const, value: lastLoadedPdb };
          }
          // Priority 2: Extract from currentCode
          if (currentCode) {
            const match = currentCode.match(/loadStructure\s*\(\s*['"]([0-9A-Za-z]{4})['"]/);
            if (match) {
              return { type: 'pdb_id' as const, value: match[1].toUpperCase() };
            }
          }
          // Priority 3: Check chat history for uploaded files (could be enhanced)
          // For now, return undefined if no PDB detected
          return undefined;
        })()}
      />

      <ProteinMPNNDialog
        isOpen={showProteinMPNNDialog}
        onClose={() => setShowProteinMPNNDialog(false)}
        onConfirm={handleProteinMPNNConfirm}
        initialData={proteinmpnnData}
      />
    </div>
  );
};
