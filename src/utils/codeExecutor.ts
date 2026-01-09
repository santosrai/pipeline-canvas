import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { createMolstarBuilder, MolstarBuilder } from './molstarBuilder';
import { useAppStore } from '../stores/appStore';
import { SandboxExecutor } from './codeExecutorSandbox';

// Cache a single builder per plugin instance so that the currentStructure
// is preserved across multiple executions (e.g., when AI code modifies
// the existing view without calling loadStructure again).
const BUILDER_KEY: symbol = Symbol.for('novoprotein.molstarBuilder');

export interface ExecutionResult {
  success: boolean;
  message: string;
  error?: string;
}

export class CodeExecutor {
  private plugin: PluginUIContext;
  private builder: MolstarBuilder;
  private sandboxExecutor: SandboxExecutor | null = null;

  constructor(plugin: PluginUIContext) {
    this.plugin = plugin;
    const setLastLoadedPdb = useAppStore.getState?.().setLastLoadedPdb;

    // Reuse an existing builder attached to the plugin if present
    const pluginAny = plugin as unknown as Record<string | symbol, any>;
    if (!pluginAny[BUILDER_KEY]) {
      pluginAny[BUILDER_KEY] = createMolstarBuilder(plugin, (pdbId: string) => {
        try {
          if (typeof setLastLoadedPdb === 'function') setLastLoadedPdb(pdbId);
        } catch {
          // ignore
        }
      });
    }

    this.builder = pluginAny[BUILDER_KEY] as MolstarBuilder;
  }

  /**
   * Extract structure information from code for AI context.
   * This helps the AI understand what structure is being loaded even when
   * execution happens in the sandbox.
   */
  private extractStructureInfo(code: string): { pdbId?: string; url?: string } | null {
    if (!code || !code.trim()) return null;

    // Extract PDB ID (4-character code)
    const pdbIdMatch = code.match(/loadStructure\s*\(\s*['"]([0-9A-Za-z]{4})['"]/);
    if (pdbIdMatch) {
      return { pdbId: pdbIdMatch[1].toUpperCase() };
    }

    // Extract URL (blob, http, https, /api/)
    const urlMatch = code.match(/loadStructure\s*\(\s*['"](blob:|https?:\/\/|\/api\/[^'"]+)['"]/);
    if (urlMatch) {
      return { url: urlMatch[1] };
    }

    return null;
  }

  async executeCode(code: string): Promise<ExecutionResult> {
    try {
      // Extract structure info from code for AI context
      const structureInfo = this.extractStructureInfo(code);
      const setLastLoadedPdb = useAppStore.getState?.().setLastLoadedPdb;
      
      // Create callback to track structure loads
      const onStructureLoaded = (pdbIdOrUrl: string) => {
        try {
          // Check if it's a PDB ID (4 characters, alphanumeric)
          if (pdbIdOrUrl.length === 4 && /^[0-9A-Za-z]{4}$/.test(pdbIdOrUrl)) {
            if (typeof setLastLoadedPdb === 'function') {
              setLastLoadedPdb(pdbIdOrUrl.toUpperCase());
            }
          }
          // For URLs, we could extract file_id from /api/upload/pdb/{file_id} if needed
        } catch (e) {
          // Ignore errors
        }
      };

      // Create or reuse sandbox executor with structure tracking
      if (!this.sandboxExecutor) {
        this.sandboxExecutor = new SandboxExecutor(this.plugin, this.builder, onStructureLoaded);
      } else {
        // Update callback if executor already exists
        (this.sandboxExecutor as any).onStructureLoaded = onStructureLoaded;
      }

      // Execute code in secure sandbox
      const result = await this.sandboxExecutor.executeCode(code, 10000);
      
      // Also set structure info immediately if we extracted it from code
      // This ensures AI context is available even before execution completes
      if (structureInfo?.pdbId && typeof setLastLoadedPdb === 'function') {
        try {
          setLastLoadedPdb(structureInfo.pdbId);
        } catch {
          // ignore
        }
      }
      
      return result;

    } catch (error) {
      return {
        success: false,
        message: 'Execution failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Cleanup method for when executor is no longer needed
  cleanup(): void {
    if (this.sandboxExecutor) {
      this.sandboxExecutor.cleanup();
      this.sandboxExecutor = null;
    }
  }

  // Generate code from natural language
  generateCodeFromPrompt(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();

    // Simple pattern matching for demo purposes
    // Note: In production, AI generation is used via /api/generate. This is a local fallback.
    if (/(enable|show|display|add).*water/.test(lowerPrompt) || lowerPrompt.includes('water')) {
      return this.generateEnableWater();
    }
    if (lowerPrompt.includes('insulin')) {
      return this.generateInsulinVisualization();
    } else if (lowerPrompt.includes('hemoglobin')) {
      return this.generateHemoglobinVisualization();
    } else if (lowerPrompt.includes('dna')) {
      return this.generateDNAVisualization();
    } else if (lowerPrompt.includes('antibody')) {
      return this.generateAntibodyVisualization();
    }

    return this.generateGenericVisualization(prompt);
  }

  private generateEnableWater(): string {
    return `// Enable water molecules on current structure
try {
  await builder.addWaterRepresentation();
  builder.focusView();
  console.log('Water enabled');
} catch (error) {
  console.error('Failed to enable water:', error);
}`;
  }

  private generateInsulinVisualization(): string {
    return `// Insulin Structure Visualization
try {
  // Load insulin structure
  await builder.loadStructure('1ZNI');
  
  // Show protein chains as cartoon
  await builder.addCartoonRepresentation({
    color: 'chain-id'
  });
  
  // Focus on the structure
  builder.focusView();
  
  console.log('Insulin structure loaded successfully');
} catch (error) {
  console.error('Failed to load insulin:', error);
}`;
  }

  private generateHemoglobinVisualization(): string {
    return `// Hemoglobin Structure Visualization
try {
  // Load hemoglobin structure
  await builder.loadStructure('1HHO');
  
  // Show protein as cartoon
  await builder.addCartoonRepresentation({
    color: 'secondary-structure'
  });
  
  // Highlight heme groups
  await builder.highlightLigands();
  
  // Focus on the structure
  builder.focusView();
  
  console.log('Hemoglobin structure loaded successfully');
} catch (error) {
  console.error('Failed to load hemoglobin:', error);
}`;
  }

  private generateDNAVisualization(): string {
    return `// DNA Double Helix Visualization
try {
  // Load DNA structure
  await builder.loadStructure('1BNA');
  
  // Show DNA as cartoon with nucleotide coloring
  await builder.addCartoonRepresentation({
    color: 'nucleotide'
  });
  
  // Focus on the structure
  builder.focusView();
  
  console.log('DNA structure loaded successfully');
} catch (error) {
  console.error('Failed to load DNA:', error);
}`;
  }

  private generateAntibodyVisualization(): string {
    return `// Antibody Structure Visualization
try {
  // Load antibody structure
  await builder.loadStructure('1IGT');
  
  // Show heavy and light chains
  await builder.addCartoonRepresentation({
    color: 'chain-id'
  });
  
  // Focus on the structure
  builder.focusView();
  
  console.log('Antibody structure loaded successfully');
} catch (error) {
  console.error('Failed to load antibody:', error);
}`;
  }

  private generateGenericVisualization(prompt: string): string {
    return `// Generic Protein Visualization
// Based on prompt: "${prompt}"
try {
  // Note: Replace 'XXXX' with actual PDB ID
  await builder.loadStructure('1CBS');
  
  // Add cartoon representation
  await builder.addCartoonRepresentation({
    color: 'secondary-structure'
  });
  
  // Focus on the structure
  builder.focusView();
  
  console.log('Structure loaded successfully');
} catch (error) {
  console.error('Failed to load structure:', error);
}`;
  }
}