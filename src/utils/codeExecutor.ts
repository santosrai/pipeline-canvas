import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { createMolstarBuilder, MolstarBuilder } from './molstarBuilder';
import { useAppStore } from '../stores/appStore';

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

  async executeCode(code: string): Promise<ExecutionResult> {
    try {
      // Create a safe execution context
      const sandbox = this.createSandbox();
      
      // Wrap the code in an async function
      const wrappedCode = `
        (async function() {
          ${code}
        })();
      `;

      // Execute with timeout
      await this.executeWithTimeout(wrappedCode, sandbox, 10000);
      
      return {
        success: true,
        message: 'Code executed successfully'
      };

    } catch (error) {
      return {
        success: false,
        message: 'Execution failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private createSandbox() {
    return {
      // Molstar builder API
      builder: this.builder,
      plugin: this.plugin,
      
      // Safe console
      console: {
        log: (...args: any[]) => console.log('[Molstar]', ...args),
        error: (...args: any[]) => console.error('[Molstar]', ...args),
        warn: (...args: any[]) => console.warn('[Molstar]', ...args),
      },

      // Common utilities
      setTimeout: (fn: Function, delay: number) => {
        if (delay > 5000) throw new Error('Timeout too long');
        return setTimeout(fn, delay);
      },

      // Restricted globals (no access to dangerous APIs)
      window: undefined,
      document: undefined,
      fetch: undefined,
      XMLHttpRequest: undefined,
    };
  }

  private async executeWithTimeout(
    code: string, 
    sandbox: any, 
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, timeout);

      try {
        // Create function with sandbox scope
        const func = new Function(
          ...Object.keys(sandbox),
          code
        );

        // Execute with sandbox values
        const result = func(...Object.values(sandbox));
        
        // Handle promises
        if (result && typeof result.then === 'function') {
          result
            .then(resolve)
            .catch(reject)
            .finally(() => clearTimeout(timer));
        } else {
          clearTimeout(timer);
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
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