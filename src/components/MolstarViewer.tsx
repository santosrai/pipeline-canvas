import React, { useEffect, useRef, useState } from 'react';
import 'molstar/build/viewer/molstar.css';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { MolViewSpec } from 'molstar/lib/extensions/mvs/behavior';
import { Camera, FullscreenIcon, RotateCw } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
// OrderedSet no longer needed after switching to getFirstLocation
import { CodeExecutor } from '../utils/codeExecutor';

export const MolstarViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastExecutedCodeRef = useRef<string>('');
  const [plugin, setPlugin] = useState<PluginUIContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { setPlugin: setStorePlugin, pendingCodeToRun, setPendingCodeToRun, setActivePane, setIsExecuting, currentCode } = useAppStore();
  const setSelection = useAppStore(state => state.setSelection);
  const lastLoadedPdb = useAppStore(state => state.lastLoadedPdb);

  useEffect(() => {
    const initViewer = async () => {
      if (!containerRef.current || isInitialized) return;

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

              setSelection({
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

        // Priority 2: If there is existing code in the editor, execute it
        if (currentCode && currentCode.trim()) {
          try {
            setIsExecuting(true);
            const exec = new CodeExecutor(pluginInstance);
            await exec.executeCode(currentCode);
            setActivePane('viewer');
          } catch (e) {
            console.error('[Molstar] execute currentCode on mount failed', e);
          } finally {
            setIsExecuting(false);
          }
          return;
        }

        // Fallback: load default only when no code is present
        await loadDefaultStructure(pluginInstance);
        console.log('[Molstar] initViewer: default structure loaded');
        
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
  }, []);

  const loadDefaultStructure = async (pluginInstance: PluginUIContext) => {
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
        const setLastLoadedPdb = useAppStore.getState?.().setLastLoadedPdb;
        if (typeof setLastLoadedPdb === 'function') setLastLoadedPdb('1CBS');
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
      const code = currentCode?.trim();
      if (!code) return;
      if (lastExecutedCodeRef.current === code) return;
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
  }, [plugin, isInitialized, currentCode]);

  const handleScreenshot = async () => {
    if (!plugin) return;
    
    try {
      const canvas = plugin.canvas3d?.webgl.gl.canvas;
      if (canvas && 'toDataURL' in canvas) {
        const imageData = (canvas as HTMLCanvasElement).toDataURL('image/png');
        if (imageData) {
          const link = document.createElement('a');
          link.download = 'molstar-screenshot.png';
          link.href = imageData;
          link.click();
        }
      }
    } catch (error) {
      console.error('[Molstar] screenshot failed', error);
    }
  };

  const handleReset = () => {
    if (!plugin) return;
    try {
      plugin.managers.camera.reset();
      console.log('[Molstar] camera reset');
    } catch (e) {
      console.warn('[Molstar] camera reset failed', e);
    }
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current.requestFullscreen();
    }
  };

  return (
    <div className="h-full relative bg-gray-900 overflow-hidden">
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

      {isInitialized && (
        <div className="absolute top-4 right-4 flex space-x-2 z-20">
          <button
            onClick={handleScreenshot}
            className="p-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
            title="Take screenshot"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
            title="Reset camera"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
            title="Toggle fullscreen"
          >
            <FullscreenIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {!isLoading && !isInitialized && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="text-red-400 mb-2">Failed to initialize Molstar viewer</div>
            <div className="text-sm text-gray-400">Please refresh the page to try again</div>
          </div>
        </div>
      )}
    </div>
  );
};