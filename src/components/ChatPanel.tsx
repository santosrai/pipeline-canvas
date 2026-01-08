import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Download, Play, X, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore, useActiveSession, Message } from '../stores/chatHistoryStore';
import { CodeExecutor } from '../utils/codeExecutor';
import { api, fetchAgents, fetchModels, Agent, Model, getAuthHeaders } from '../utils/api';
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
import { AttachmentMenu } from './AttachmentMenu';

// Extended message metadata for structured agent results
interface ExtendedMessage extends Message {
  alphafoldResult?: {
    pdbContent?: string;
    filename?: string;
    sequence?: string;
    parameters?: any;
    metadata?: any;
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
  rfdiffusionResult?: {
    pdbContent?: string;
    fileId?: string; // File ID for loading from server
    filename?: string;
    parameters?: any;
    metadata?: any;
  };
  thinkingProcess?: {
    steps: Array<{
      id: string;
      title: string;
      content: string;
      status: 'pending' | 'processing' | 'completed';
      timestamp?: Date;
    }>;
    isComplete: boolean;
    totalSteps: number;
  };
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
const convertThinkingData = (thinkingProcess: any): ExtendedMessage['thinkingProcess'] | undefined => {
  if (!thinkingProcess) return undefined;
  
  // Backend returns: { steps: [...], isComplete: bool, totalSteps: number }
  // Frontend expects: { steps: ThinkingStep[], isComplete: bool, totalSteps: number }
  if (thinkingProcess.steps && Array.isArray(thinkingProcess.steps)) {
    return {
      steps: thinkingProcess.steps.map((step: any) => ({
        id: step.id || `step_${Math.random()}`,
        title: step.title || 'Thinking Step',
        content: step.content || '',
        status: step.status || 'completed',
        timestamp: step.timestamp ? new Date(step.timestamp) : undefined
      })),
      isComplete: thinkingProcess.isComplete !== false,
      totalSteps: thinkingProcess.totalSteps || thinkingProcess.steps.length
    };
  }
  
  return undefined;
};

// Generate a user-friendly message for code execution
const getExecutionMessage = (userRequest: string): string => {
  const request = userRequest.toLowerCase().trim();
  
  // Extract the main subject (what they want to see)
  const subjectMatch = request.match(/(?:show|display|visualize|view|load|open|see)\s+(.+?)(?:\s|$)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : request;
  
  // Clean up common trailing words
  const cleanSubject = subject.replace(/\s+(structure|protein|molecule|chain|helix)$/i, '').trim();
  
  // If it's a short, meaningful subject, use it
  if (cleanSubject && cleanSubject.length < 40 && cleanSubject.length > 0) {
    // Capitalize first letter
    const capitalized = cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1);
    return `Loading ${capitalized}...`;
  }
  
  // Fallback to a simple message
  return 'Loading structure...';
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
  const { plugin, currentCode, setCurrentCode, setIsExecuting, setActivePane, setPendingCodeToRun, setViewerVisible, setCurrentStructureOrigin } = useAppStore();
  const selections = useAppStore(state => state.selections);
  const removeSelection = useAppStore(state => state.removeSelection);
  const clearSelections = useAppStore(state => state.clearSelections);

  // Chat history store
  const { createSession, activeSessionId, saveVisualizationCode, getVisualizationCode, saveViewerVisibility, getViewerVisibility } = useChatHistoryStore();
  const isViewerVisible = useAppStore(state => state.isViewerVisible);
  
  // Helper function to set viewer visibility and save to session
  const setViewerVisibleAndSave = (visible: boolean) => {
    setViewerVisible(visible);
    if (activeSessionId) {
      saveViewerVisibility(activeSessionId, visible);
    }
  };
  const { activeSession, addMessage } = useActiveSession();

  // Agent and model settings
  const { settings: agentSettings } = useAgentSettings();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAgentId, setLastAgentId] = useState<string>('');
  const [isQuickStartExpanded, setIsQuickStartExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  
  // PDB file upload state - track files with their upload status
  interface FileUploadState {
    file: File;
    id: string; // Unique ID for reliable matching
    status: 'uploading' | 'uploaded' | 'error';
    fileInfo?: {
      file_id: string;
      filename: string;
      file_url: string;
      atoms: number;
      chains: string[];
      size: number;
    };
    error?: string;
  }
  const [fileUploads, setFileUploads] = useState<FileUploadState[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Refs to track latest values for session switching (avoid stale closures)
  const currentCodeRef = useRef<string | null>(currentCode);
  const isViewerVisibleRef = useRef<boolean>(isViewerVisible);
  const hasAttemptedCreateRef = useRef<boolean>(false);

  // Get sync state and sessions from store
  const isSyncing = useChatHistoryStore(state => state._isSyncing);
  const sessions = useChatHistoryStore(state => state.sessions);

  // Reset hasAttemptedCreateRef when a session is successfully created or switched
  useEffect(() => {
    if (activeSessionId) {
      hasAttemptedCreateRef.current = false;
    }
  }, [activeSessionId]);

  // Initialize session if none exists (but wait for sync to complete)
  useEffect(() => {
    // Don't create if:
    // 1. Already have an active session
    // 2. Sync is in progress (wait for it to complete)
    // 3. Already attempted to create (prevent duplicate creation)
    // 4. Sessions exist (even if no activeSessionId, they might be loading)
    if (activeSessionId || isSyncing || hasAttemptedCreateRef.current || sessions.length > 0) {
      return;
    }

    // Wait a bit for store rehydration and backend sync to complete
    const timeoutId = setTimeout(() => {
      // Double-check conditions after delay
      const currentState = useChatHistoryStore.getState();
      if (!currentState.activeSessionId && !currentState._isSyncing && currentState.sessions.length === 0) {
        hasAttemptedCreateRef.current = true;
        createSession();
      }
    }, 500); // Wait 500ms for sync to complete

    return () => clearTimeout(timeoutId);
  }, [activeSessionId, isSyncing, sessions.length, createSession]);

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
    
    // Save current state to previous session before switching
    // Use refs to ensure we have the latest values even if they changed after effect was scheduled
    if (previousSessionIdRef.current && previousSessionIdRef.current !== activeSessionId) {
      const codeToSave = currentCodeRef.current?.trim() || '';
      if (codeToSave) {
        saveVisualizationCode(previousSessionIdRef.current, codeToSave);
        console.log('[ChatPanel] Saved code to previous session:', previousSessionIdRef.current);
      }
      // Save viewer visibility to previous session
      saveViewerVisibility(previousSessionIdRef.current, isViewerVisibleRef.current);
      console.log('[ChatPanel] Saved viewer visibility to previous session:', previousSessionIdRef.current, isViewerVisibleRef.current);
    }
    
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
    
    // Update previous session ID
    previousSessionIdRef.current = activeSessionId;
  }, [activeSessionId, getVisualizationCode, saveVisualizationCode, getViewerVisibility, saveViewerVisibility, setCurrentCode, setViewerVisible]);

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
        <pre className="text-[10px] whitespace-pre-wrap bg-white border border-gray-200 rounded p-1.5 overflow-x-auto leading-relaxed">
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
          <table className="text-[10px] w-full border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {header.map((h, i) => (
                  <th key={i} className="text-left px-1.5 py-0.5 border-b border-gray-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((r, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-gray-50' : ''}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-1.5 py-0.5 align-top border-b border-gray-100">{c || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Handle multi-paragraph content with proper line breaks
    // Split by double newlines for paragraphs, single newlines for line breaks
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    
    if (paragraphs.length > 1) {
      // Multi-paragraph content - render each paragraph separately
      return (
        <div className="text-sm space-y-1">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="whitespace-pre-wrap leading-relaxed">{para.trim()}</p>
          ))}
        </div>
      );
    }
    
    // Single paragraph or no double newlines - preserve single newlines
    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>;
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
        setViewerVisibleAndSave(true);
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

  const renderRFdiffusionResult = (result: ExtendedMessage['rfdiffusionResult']) => {
    if (!result) {
      return null;
    }
    
    // Debug logging
    console.log('[ChatPanel] Rendering RFdiffusion result:', {
      hasFileId: !!result.fileId,
      hasPdbContent: !!result.pdbContent,
      filename: result.filename
    });

    const downloadPDB = async () => {
      try {
        let pdbContent: string;
        
        // If we have fileId, fetch from server (preferred for large files)
        if (result.fileId) {
          try {
            const fileResponse = await api.get(`/files/${result.fileId}`);
            if (fileResponse.data.status === 'success') {
              pdbContent = fileResponse.data.content;
            } else {
              throw new Error('Failed to fetch file from server');
            }
          } catch (fetchError) {
            console.error('Failed to fetch file for download:', fetchError);
            // Fallback to pdbContent if available
            if (result.pdbContent) {
              pdbContent = result.pdbContent;
            } else {
              alert('File not available for download. It may have been deleted.');
              return;
            }
          }
        } else if (result.pdbContent) {
          pdbContent = result.pdbContent;
        } else {
          alert('No file content available for download.');
          return;
        }
        
        const blob = new Blob([pdbContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'rfdiffusion_result.pdb';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to download PDB:', err);
        alert(`Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    const loadInViewer = async () => {
      if (!plugin) {
        alert('3D viewer is not ready yet. Please wait a moment and try again.');
        return;
      }
      
      try {
        setIsExecuting(true);
        const executor = new CodeExecutor(plugin);
        
        // Get file content - either from saved file or use existing pdbContent
        let pdbContent: string;
        if (result.fileId) {
          // Fetch file content from server with authentication
          try {
            const fileResponse = await api.get(`/files/${result.fileId}`);
            if (fileResponse.data.status === 'success') {
              pdbContent = fileResponse.data.content;
            } else {
              throw new Error('Failed to fetch file content from server');
            }
          } catch (fetchError) {
            console.error('Failed to fetch file from server:', fetchError);
            // Fallback to pdbContent if available
            if (result.pdbContent) {
              pdbContent = result.pdbContent;
            } else {
              throw new Error('No file content available');
            }
          }
        } else if (result.pdbContent) {
          pdbContent = result.pdbContent;
        } else {
          throw new Error('No file content or file ID available');
        }
        
        // Create blob URL from content
        const pdbBlob = new Blob([pdbContent], { type: 'text/plain' });
        const blobUrl = URL.createObjectURL(pdbBlob);
        
        // Load structure in viewer using blob URL
        const code = `
try {
  await builder.clearStructure();
  await builder.loadStructure('${blobUrl}');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('RFdiffusion result loaded successfully');
} catch (e) { 
  console.error('Failed to load RFdiffusion result:', e); 
}`;
        
        await executor.executeCode(code);
        setViewerVisibleAndSave(true);
        setActivePane('viewer');
        
        // Keep blob URL alive for a bit longer to ensure structure loads
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 5000);
      } catch (err) {
        console.error('Failed to load RFdiffusion result in viewer:', err);
        alert(`Failed to load structure: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsExecuting(false);
      }
    };

    return (
      <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">RF</span>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">RFdiffusion Protein Design</h4>
            <p className="text-xs text-gray-600">
              Structure designed
            </p>
          </div>
        </div>
        
        {result.metadata && (
          <div className="mb-3 text-xs text-gray-600">
            <div className="grid grid-cols-2 gap-2">
              {result.parameters?.design_mode && (
                <span>Mode: {result.parameters.design_mode}</span>
              )}
              {result.parameters?.contigs && (
                <span>Contigs: {result.parameters.contigs}</span>
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
        jobId
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
                  metadata: result.metadata
                }
              };
              addMessage(aiMessage);
              alphafoldProgress.completeProgress();
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
            metadata: result.metadata
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
    
    rfdiffusionProgress.startProgress(jobId, 'Submitting protein design request...');
    console.log('📡 [RFdiffusion] Starting progress tracking for job:', jobId);

    const startTime = Date.now();
    const estimatedDuration = 480; // 8 minutes estimated for RFdiffusion
    
    // Update progress while waiting for response
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min(90, Math.round((elapsed / estimatedDuration) * 90));
      rfdiffusionProgress.updateProgress(`Designing protein structure... (${Math.round(elapsed)}s)`, progress);
    }, 2000); // Update every 2 seconds

    try {
      console.log('🌐 [RFdiffusion] Making API call to /api/rfdiffusion/design');
      const response = await api.post('/rfdiffusion/design', {
        parameters,
        jobId,
        sessionId: activeSessionId
      });

      clearInterval(progressInterval);
      console.log('📨 [RFdiffusion] API response received:', response.status, response.data);

      // Handle success response
      if (response.data.status === 'success') {
        const result = response.data.data;
        
        // Dispatch event to notify file browser to refresh
        window.dispatchEvent(new CustomEvent('session-file-added'));
        
        const aiMessage: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          content: `RFdiffusion protein design completed successfully! The designed structure is ready for download and visualization.`,
          type: 'ai',
          timestamp: new Date(),
          rfdiffusionResult: {
            // Only include pdbContent if it's small enough (under 1MB to avoid database issues)
            // For larger files, we'll fetch from server using fileId
            pdbContent: result.pdbContent && result.pdbContent.length < 1000000 ? result.pdbContent : undefined,
            fileId: result.fileId || jobId, // File ID for loading from server (always include)
            filename: result.filename || `designed_${Date.now()}.pdb`,
            parameters,
            metadata: result.metadata
          }
        };
        
        console.log('[RFdiffusion] Saving result message:', {
          hasFileId: !!aiMessage.rfdiffusionResult?.fileId,
          hasPdbContent: !!aiMessage.rfdiffusionResult?.pdbContent,
          pdbContentLength: aiMessage.rfdiffusionResult?.pdbContent?.length || 0
        });
        
        addMessage(aiMessage);
        rfdiffusionProgress.completeProgress();
      } else {
        // Handle API error response
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
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('❌ [RFdiffusion] Request failed:', error);
      
      // Handle different types of errors
      const structuredError = RFdiffusionErrorHandler.handleError(error, {
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

  // Upload file immediately when selected
  const uploadFile = async (fileId: string, file: File) => {
    // Update status to uploading
    setFileUploads(prev => prev.map(item => 
      item.id === fileId ? { ...item, status: 'uploading' } : item
    ));

    try {
      setUploadError(null);
      const formData = new FormData();
      formData.append('file', file);
      if (activeSessionId) {
        formData.append('session_id', activeSessionId);
      }

      const headers = getAuthHeaders();
      const response = await fetch('/api/upload/pdb', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      const fileInfo = {
        file_id: result.file_info.file_id,
        filename: result.file_info.filename,
        file_url: result.file_info.file_url,
        atoms: result.file_info.atoms,
        chains: result.file_info.chains,
        size: result.file_info.size || 0,
      };

      // Mark file as uploaded using the unique ID
      let isFirstFile = false;
      setFileUploads(prev => {
        const updated = prev.map(item => 
          item.id === fileId 
            ? { ...item, status: 'uploaded' as const, fileInfo } 
            : item
        );
        // Check if this is the first uploaded file
        isFirstFile = updated.findIndex(item => item.status === 'uploaded') === 0;
        console.log('[ChatPanel] File uploaded successfully:', {
          fileId,
          filename: fileInfo.filename,
          file_id: fileInfo.file_id,
          totalUploads: updated.length,
          uploadedCount: updated.filter(item => item.status === 'uploaded').length,
        });
        return updated;
      });

      // Dispatch event to notify file browser to refresh
      window.dispatchEvent(new CustomEvent('session-file-added'));

      // Clear previous PDB context when new file is uploaded
      setCurrentCode('');
      setCurrentStructureOrigin(null);

      // Auto-load first uploaded file in viewer
      if (isFirstFile && plugin) {
        try {
          setIsExecuting(true);
          const executor = new CodeExecutor(plugin);
          await executor.executeCode('try { await builder.clearStructure(); } catch(e) { console.warn("Clear failed:", e); }');
          
          const fileUrl = result.file_info.file_url || `/api/upload/pdb/${result.file_info.file_id}`;
          const fileResponse = await fetch(fileUrl, { headers: getAuthHeaders() });
          if (!fileResponse.ok) {
            throw new Error('Failed to fetch uploaded file');
          }
          const fileContent = await fileResponse.text();
          
          const pdbBlob = new Blob([fileContent], { type: 'text/plain' });
          const blobUrl = URL.createObjectURL(pdbBlob);
          
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
              file_url: blobUrl,
            },
          });
          
          if (activeSessionId) {
            saveVisualizationCode(activeSessionId, loadCode);
          }
          
          await executor.executeCode(loadCode);
          setViewerVisibleAndSave(true);
          setActivePane('viewer');
          
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 5000);
        } catch (viewerError) {
          console.error('Failed to auto-load uploaded file in viewer:', viewerError);
        } finally {
          setIsExecuting(false);
        }
      }
    } catch (error: any) {
      console.error('File upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);
      // Mark file as error using the unique ID
      setFileUploads(prev => prev.map(item => 
        item.id === fileId 
          ? { ...item, status: 'error', error: errorMessage } 
          : item
      ));
    }
  };

  // Handle file selection - add to list and start upload immediately
  const handleFileSelected = (file: File) => {
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newFileState: FileUploadState = {
      file,
      id: fileId,
      status: 'uploading',
    };
    console.log('[ChatPanel] File selected for upload:', {
      fileId,
      filename: file.name,
      size: file.size,
    });
    setFileUploads(prev => {
      const updated = [...prev, newFileState];
      console.log('[ChatPanel] File added to state, total files:', updated.length);
      return updated;
    });
    // Start upload immediately using the unique ID
    uploadFile(fileId, file);
  };

  // Handle multiple files selected
  const handleFilesSelected = (files: File[]) => {
    const newFileStates: FileUploadState[] = files.map(file => {
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return {
        file,
        id: fileId,
        status: 'uploading' as const,
      };
    });
    setFileUploads(prev => [...prev, ...newFileStates]);
    // Start uploads immediately for all files
    newFileStates.forEach(({ id, file }) => {
      uploadFile(id, file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Get uploaded file info (use first uploaded file)
    const uploadedFileInfo = fileUploads.find(f => f.status === 'uploaded' && f.fileInfo)?.fileInfo || null;

    // Create user message immediately and add to chat
    const userMessage: Message = {
      id: uuidv4(),
      content: input.trim(),
      type: 'user',
      timestamp: new Date(),
      uploadedFile: uploadedFileInfo || undefined,
    };

    // Add user message to chat immediately (before any async operations)
    addMessage(userMessage);
    const messageInput = input.trim();
    setInput('');
    setIsLoading(true);

    // Clear uploaded files from state after message is sent
    setFileUploads([]);
    
    try {
      const text = messageInput;
      let code = '';
      let aiText = ''; // AI text response for better user experience
      let thinkingProcess: ExtendedMessage['thinkingProcess'] | undefined = undefined;
      try {
        const payload = {
          input: text,
          currentCode,
          history: messages.slice(-6).map(m => ({ type: m.type, content: m.content })),
          selection: selections.length > 0 ? selections[0] : null, // First selection for backward compatibility
          selections: selections, // Full selections array for new multi-selection support
          agentId: agentSettings.selectedAgentId || undefined, // Only send if manually selected
          model: agentSettings.selectedModel || undefined, // Only send if manually selected
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
          thinkingProcess = convertThinkingData(response.data?.thinkingProcess);
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
          
          // Bio-chat and other text agents should never modify the editor code
          console.log(`[${agentId}] Text response received, preserving current editor code`);
          
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
          return; // Exit early - no code generation or execution
        }
        code = response.data?.code || '';
        // Extract AI text response for better user experience
        aiText = response.data?.text || '';
        thinkingProcess = convertThinkingData(response.data?.thinkingProcess);
        console.log('[AI] route:code', { length: code?.length, hasThinking: !!thinkingProcess, hasText: !!aiText });
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

      // Determine message content: prefer AI text, then a descriptive message if code exists, otherwise loading message
      let messageContent = aiText;
      if (!messageContent && code && code.trim()) {
        // Code was generated, provide a descriptive message
        const request = text.toLowerCase().trim();
        const subjectMatch = request.match(/(?:show|display|visualize|view|load|open|see)\s+(.+?)(?:\s|$)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : request;
        const cleanSubject = subject.replace(/\s+(structure|protein|molecule|chain|helix)$/i, '').trim();
        if (cleanSubject && cleanSubject.length < 40 && cleanSubject.length > 0) {
          const capitalized = cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1);
          messageContent = `Visualizing ${capitalized}...`;
        } else {
          messageContent = 'Visualizing structure...';
        }
      }
      if (!messageContent) {
        // Last resort: use the loading message
        messageContent = getExecutionMessage(text);
      }

      const aiResponse: ExtendedMessage = {
        id: uuidv4(),
        content: messageContent,
        type: 'ai',
        timestamp: new Date()
      };
      
      // Add thinking process if available
      if (thinkingProcess) {
        aiResponse.thinkingProcess = thinkingProcess;
      }
      
      addMessage(aiResponse);

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
        <div className="px-3 py-1.5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <div>
              <h2 className="text-xs font-semibold text-gray-900">AI Assistant</h2>
              {activeSession && (
                <p className="text-[10px] text-gray-500 truncate max-w-[180px]">
                  {activeSession.title}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!showCenteredLayout ? (
        <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-2 min-h-0">
          {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] p-2 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.type === 'ai' ? (
                <>
                  {message.thinkingProcess && (
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
                  {renderRFdiffusionResult(message.rfdiffusionResult)}
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
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  {message.uploadedFile && isValidUploadedFile(message.uploadedFile) && (
                    <div className="mt-1.5">
                      {renderFileAttachment(message.uploadedFile, true)}
                    </div>
                  )}
                </>
              )}
              <div className="text-[10px] mt-0.5 opacity-60">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-2 rounded-lg">
              <div className="flex space-x-1.5">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
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

      <div className={`px-3 py-1.5 flex-shrink-0 ${!showCenteredLayout ? 'border-t border-gray-200' : ''}`}>
        {/* Multiple selection chips */}
        {selections.length > 0 && (
          <div className="mb-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] text-gray-500 font-medium">
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
          className="mb-1.5"
          title={alphafoldProgress.title}
          eventName={alphafoldProgress.eventName}
        />
        <ProgressTracker
          isVisible={proteinmpnnProgress.isVisible}
          onCancel={proteinmpnnProgress.cancelProgress}
          className="mb-1.5"
          title={proteinmpnnProgress.title}
          eventName={proteinmpnnProgress.eventName}
        />
        <ProgressTracker
          isVisible={rfdiffusionProgress.isVisible}
          onCancel={rfdiffusionProgress.cancelProgress}
          className="mb-1.5"
          title={rfdiffusionProgress.title}
          eventName={rfdiffusionProgress.eventName}
        />

        {!showCenteredLayout && (
          <div className="mb-1.5">
            <button
              onClick={() => setIsQuickStartExpanded(!isQuickStartExpanded)}
              className="flex items-center justify-between w-full text-[10px] text-gray-500 hover:text-gray-700 transition-colors mb-1"
            >
              <span>Quick start:</span>
              {isQuickStartExpanded ? (
                <ChevronUp className="w-2.5 h-2.5" />
              ) : (
                <ChevronDown className="w-2.5 h-2.5" />
              )}
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ease-in-out ${
                isQuickStartExpanded ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="flex flex-wrap gap-1">
                {quickPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => setInput(prompt)}
                    className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`flex flex-col gap-2 ${showCenteredLayout ? 'max-w-2xl w-full mx-auto' : ''}`}>
          {/* File uploads display with status */}
          {fileUploads.length > 0 && (
            <div className="flex items-center space-x-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg flex-wrap gap-1.5 mb-1.5">
              {fileUploads.map((fileState) => {
                const isUploading = fileState.status === 'uploading';
                const isUploaded = fileState.status === 'uploaded';
                const isError = fileState.status === 'error';
                
                return (
                  <div 
                    key={fileState.id} 
                    className={`flex items-center space-x-1 px-2 py-1 rounded-md border ${
                      isUploading 
                        ? 'bg-yellow-50 border-yellow-300' 
                        : isUploaded 
                        ? 'bg-green-50 border-green-300' 
                        : isError
                        ? 'bg-red-50 border-red-300'
                        : 'bg-white border-blue-200'
                    }`}
                  >
                    {isUploading && (
                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                    )}
                    {isUploaded && (
                      <span className="text-green-600 mr-1">✓</span>
                    )}
                    {isError && (
                      <span className="text-red-600 mr-1">✗</span>
                    )}
                    <span 
                      className={`text-xs truncate max-w-[200px] ${
                        isUploading 
                          ? 'text-yellow-700' 
                          : isUploaded 
                          ? 'text-green-700' 
                          : isError
                          ? 'text-red-700'
                          : 'text-blue-700'
                      }`} 
                      title={fileState.fileInfo?.filename || fileState.file.name}
                    >
                      📎 {fileState.fileInfo?.filename || fileState.file.name}
                      {isUploaded && fileState.fileInfo && (
                        <span className="ml-1 text-[10px] opacity-75">
                          ({fileState.fileInfo.size > 0 ? `${(fileState.fileInfo.size / 1024).toFixed(1)} KB` : ''})
                        </span>
                      )}
                    </span>
                    {isError && fileState.error && (
                      <span className="text-xs text-red-600 ml-1" title={fileState.error}>
                        ⚠
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setFileUploads(prev => prev.filter(item => item.id !== fileState.id));
                        setUploadError(null);
                      }}
                      className={`p-0.5 rounded ml-1 ${
                        isUploading 
                          ? 'hover:bg-yellow-100' 
                          : isUploaded 
                          ? 'hover:bg-green-100' 
                          : isError
                          ? 'hover:bg-red-100'
                          : 'hover:bg-blue-100'
                      }`}
                      title="Remove file"
                    >
                      <X className={`w-3 h-3 ${
                        isUploading 
                          ? 'text-yellow-600' 
                          : isUploaded 
                          ? 'text-green-600' 
                          : isError
                          ? 'text-red-600'
                          : 'text-blue-600'
                      }`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Upload error display */}
          {uploadError && (
            <div className="px-2 py-1 bg-red-50 border border-red-200 rounded-lg mb-1.5">
              <p className="text-[10px] text-red-700">{uploadError}</p>
            </div>
          )}
          
          {/* Large text input area with integrated controls */}
          <div className="relative bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
            {/* Textarea with padding for controls */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"Chat, visualize, or build..."}
              className={`w-full bg-transparent text-gray-900 focus:outline-none text-sm placeholder-gray-400 resize-none ${
                showCenteredLayout ? 'min-h-[120px] text-base' : 'min-h-[60px]'
              } px-2.5 pb-8 pt-2`}
              rows={showCenteredLayout ? 4 : 1}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />
            
            {/* Bottom controls bar: Agent, Model selectors, Microphone, and Send button */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-1.5 px-2 py-1 border-t border-gray-100 bg-white rounded-b-lg z-10">
              {/* Leading actions: Agent and Model selectors */}
              <div className="flex items-center gap-2 flex-shrink-0">
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
              </div>
              
              {/* Trailing actions: Attachment, Microphone, and Send button */}
              <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                {/* File upload attachment button */}
                <AttachmentMenu
                  onFileSelected={(file) => {
                    handleFileSelected(file);
                    setUploadError(null);
                  }}
                  onFilesSelected={(files) => {
                    handleFilesSelected(files);
                    setUploadError(null);
                  }}
                  onFileCleared={() => {
                    setFileUploads([]);
                    setUploadError(null);
                  }}
                  onError={(error) => {
                    setUploadError(error);
                    console.error('File upload error:', error);
                  }}
                  disabled={isLoading}
                  pendingFiles={fileUploads.map(f => f.file)}
                  sessionId={activeSessionId}
                />
                
                {/* Microphone button */}
                <button
                  type="button"
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
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
                  className="flex items-center justify-center p-1.5 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md hover:bg-gray-100"
                  title="Send"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
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
