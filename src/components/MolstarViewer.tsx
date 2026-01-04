import React, { useEffect, useRef, useState } from 'react';
import 'molstar/build/viewer/molstar.css';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { MolViewSpec } from 'molstar/lib/extensions/mvs/behavior';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
// OrderedSet no longer needed after switching to getFirstLocation
import { CodeExecutor } from '../utils/codeExecutor';
import { MolstarToolbar } from './MolstarToolbar';

export const MolstarViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastExecutedCodeRef = useRef<string>('');
  const [plugin, setPlugin] = useState<PluginUIContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasCheckedPersistedCode, setHasCheckedPersistedCode] = useState(false);
  const { setPlugin: setStorePlugin, pendingCodeToRun, setPendingCodeToRun, setActivePane, setIsExecuting, currentCode, setCurrentCode } = useAppStore();
  const addSelection = useAppStore(state => state.addSelection);
  const lastLoadedPdb = useAppStore(state => state.lastLoadedPdb);
  const { activeSessionId, getActiveSession } = useChatHistoryStore();

  // Helper function to get the code to execute (prioritizes message code over global code)
  const getCodeToExecute = (): string | null => {
    // First check latest message's code from active session
    if (activeSessionId) {
      const activeSession = getActiveSession();
      const lastAiMessageWithCode = activeSession?.messages
        .filter(m => m.type === 'ai' && m.threeDCanvas?.sceneData)
        .sort((a, b) => {
          const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return bTime - aTime;
        })[0];
      
      if (lastAiMessageWithCode?.threeDCanvas?.sceneData) {
        return lastAiMessageWithCode.threeDCanvas.sceneData;
      }
    }
    
    // Fallback to global currentCode
    if (currentCode && currentCode.trim()) {
      return currentCode;
    }
    
    return null;
  };

  // Check for persisted code on mount (after stores have hydrated)
  useEffect(() => {
    // Give stores a moment to hydrate from localStorage
    const checkPersistedCode = () => {
      const code = getCodeToExecute();
      if (code) {
        // If we found persisted code, update the store so it's available
        if (!currentCode || currentCode.trim() === '') {
          setCurrentCode(code);
          console.log('[Molstar] Restored persisted visualization code');
        }
      }
      setHasCheckedPersistedCode(true);
    };

    // Small delay to ensure Zustand persistence has hydrated
    const timer = setTimeout(checkPersistedCode, 150);
    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  useEffect(() => {
    const initViewer = async () => {
      if (!containerRef.current || isInitialized) return;
      
      // Wait for persisted code check to complete before initializing
      if (!hasCheckedPersistedCode) {
        console.log('[Molstar] Waiting for persisted code check...');
        return;
      }

      try {
        setIsLoading(true);
        console.log('[Molstar] initViewer: start');
        console.log('[Molstar] initViewer: containerRef set?', !!containerRef.current);

        const spec = DefaultPluginUISpec();
        const pluginInstance = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec: {
            ...spec,
            layout: {
              initial: {
                isExpanded: true,
                showControls: true,
                controlsDisplay: 'reactive',
                regionState: {
                  top: 'full',      // Sequence panel
                  left: 'hidden',
                  right: 'hidden', 
                  bottom: 'hidden',
                }
              }
            },
            behaviors: [
              ...spec.behaviors,
              PluginSpec.Behavior(MolViewSpec)
            ]
          },
        });
        console.log('[Molstar] createPluginUI: success');

        setPlugin(pluginInstance);
        setStorePlugin(pluginInstance);
        setIsInitialized(true);
        console.log('[Molstar] initViewer: plugin stored and initialized');

        // Double-click detection built on top of the click event
        let lastClickAt = 0;
        pluginInstance.behaviors.interaction.click.subscribe((e: any) => {
          const now = Date.now();
          const isDouble = now - lastClickAt < 350; // ms threshold
          lastClickAt = now;
          if (!isDouble) return;
          try {
            const loci = e?.current?.loci;
            if (!loci) return;
            if (StructureElement.Loci.is(loci) && loci.elements.length > 0) {
              // Resolve the exact picked location from the loci
              const first = StructureElement.Loci.getFirstLocation(loci);
              if (!first) return;
              const loc = first;

              // Prefer label (canonical) identifiers for stable display
              const compId = StructureProperties.atom.label_comp_id(loc);
              const labelSeqId = StructureProperties.residue.label_seq_id(loc);
              const authSeqId = StructureProperties.residue.auth_seq_id(loc);
              const insCode = StructureProperties.residue.pdbx_PDB_ins_code(loc) || null;
              const labelAsymId = StructureProperties.chain.label_asym_id(loc) || null;
              const authAsymId = StructureProperties.chain.auth_asym_id(loc) || null;

              addSelection({
                kind: 'residue',
                pdbId: lastLoadedPdb || undefined,
                compId,
                labelSeqId: labelSeqId ?? null,
                authSeqId: insCode ? `${authSeqId}${insCode}` : authSeqId,
                insCode,
                labelAsymId,
                authAsymId,
              });
            }
          } catch (err) {
            console.warn('[Molstar] selection capture failed', err);
          }
        });

        // Priority 1: Run any queued code
        if (pendingCodeToRun && pendingCodeToRun.trim()) {
          try {
            setIsExecuting(true);
            const exec = new CodeExecutor(pluginInstance);
            await exec.executeCode(pendingCodeToRun);
            setActivePane('viewer');
          } catch (e) {
            console.error('[Molstar] pending code execution failed', e);
          } finally {
            setIsExecuting(false);
            setPendingCodeToRun(null);
          }
          return;
        }

        // Priority 2: Get code to execute (prioritizes message code)
        const codeToExecute = getCodeToExecute();
        if (codeToExecute) {
          try {
            setIsExecuting(true);
            const exec = new CodeExecutor(pluginInstance);
            await exec.executeCode(codeToExecute);
            // Sync to store if it came from message
            if (!currentCode || currentCode.trim() === '') {
              setCurrentCode(codeToExecute);
            }
            setActivePane('viewer');
            lastExecutedCodeRef.current = codeToExecute;
          } catch (e) {
            console.error('[Molstar] execute persisted code on mount failed', e);
          } finally {
            setIsExecuting(false);
          }
          return;
        }

        // Viewer initialized empty - no default structure loaded
        // await loadDefaultStructure(pluginInstance);
        console.log('[Molstar] initViewer: viewer initialized (no default structure)');
        
      } catch (error) {
        console.error('[Molstar] initViewer: failed', error);
      } finally {
        setIsLoading(false);
        console.log('[Molstar] initViewer: end (loading=false)');
      }
    };

    void initViewer();

    return () => {
      console.log('[Molstar] cleanup: start');
      if (plugin) {
        try {
          plugin.dispose();
          console.log('[Molstar] cleanup: plugin disposed');
        } catch (e) {
          console.warn('[Molstar] cleanup: dispose failed', e);
        }
        setStorePlugin(null);
      }
      console.log('[Molstar] cleanup: end');
    };
  }, [hasCheckedPersistedCode, activeSessionId]);

  // Unused function - kept for potential future use
  // @ts-ignore - intentionally unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _loadDefaultStructure = async (pluginInstance: PluginUIContext) => {
    try {
      console.log('[Molstar] loadDefaultStructure: start');
      console.time('[Molstar] download');
      const data = await pluginInstance.builders.data.download({
        url: 'https://files.rcsb.org/view/1CBS.pdb',
        isBinary: false,
      });
      console.timeEnd('[Molstar] download');

      console.time('[Molstar] parseTrajectory');
      const trajectory = await pluginInstance.builders.structure.parseTrajectory(data, 'pdb');
      console.timeEnd('[Molstar] parseTrajectory');

      console.time('[Molstar] createModel');
      const model = await pluginInstance.builders.structure.createModel(trajectory);
      console.timeEnd('[Molstar] createModel');

      console.time('[Molstar] createStructure');
      const structure = await pluginInstance.builders.structure.createStructure(model);
      console.timeEnd('[Molstar] createStructure');

      console.time('[Molstar] addRepresentation');
      await pluginInstance.builders.structure.representation.addRepresentation(structure, {
        type: 'cartoon',
        color: 'secondary-structure'
      });
      console.timeEnd('[Molstar] addRepresentation');

      // Record default PDB in store so SelectionContext has a PDB
      try {
        const state = useAppStore.getState?.();
        if (state?.setLastLoadedPdb) state.setLastLoadedPdb('1CBS');
        
        // Also set the current code so the backend knows what structure is loaded
        if (state?.setCurrentCode && (!state.currentCode || state.currentCode.trim() === '')) {
          const defaultCode = `try {
  await builder.loadStructure('1CBS');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
} catch (e) { console.error(e); }`;
          state.setCurrentCode(defaultCode);
        }
      } catch {}

      console.log('[Molstar] loadDefaultStructure: done');
    } catch (error) {
      console.error('[Molstar] loadDefaultStructure: failed', error);
    }
  };

  // Re-run current editor code whenever viewer is mounted/ready and code changes
  useEffect(() => {
    const run = async () => {
      if (!plugin || !isInitialized) return;
      
      // Get code to execute (prioritizes message code over global code)
      let code = getCodeToExecute();
      
      if (!code) return;
      if (lastExecutedCodeRef.current === code) return;
      
      // Sync to store if it came from message
      if (code !== currentCode) {
        setCurrentCode(code);
      }
      
      try {
        setIsExecuting(true);
        const exec = new CodeExecutor(plugin);
        await exec.executeCode(code);
        lastExecutedCodeRef.current = code;
      } catch (e) {
        console.error('[Molstar] re-execute currentCode failed', e);
      } finally {
        setIsExecuting(false);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, isInitialized, currentCode, activeSessionId]);

  return (
    <div className="h-full w-full flex flex-col bg-gray-900">
      {/* Chimera-style Select/Actions Toolbar */}
      <MolstarToolbar plugin={plugin} />
      
      {/* Molstar Viewer Container */}
      <div className="flex-1 relative molstar-container">
        <style>{`
          .molstar-container .msp-plugin {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
          }
          .molstar-container .msp-layout-expanded {
            position: absolute !important;
            inset: 0 !important;
          }
        `}</style>
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-10">
            <div className="text-white text-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <div>Initializing Molstar Viewer...</div>
            </div>
          </div>
        )}

        <div 
          ref={containerRef} 
          className="absolute inset-0 h-full w-full"
        />

        {!isLoading && !isInitialized && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="text-red-400 mb-2">Failed to initialize Molstar viewer</div>
              <div className="text-sm text-gray-400">Please refresh the page to try again</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};