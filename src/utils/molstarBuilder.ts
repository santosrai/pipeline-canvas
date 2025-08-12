import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { getPDBUrl, validatePDBId } from './pdbUtils';

export interface ResidueSelector {
  label_asym_id?: string;
  label_seq_id?: number;
  auth_asym_id?: string;
  auth_seq_id?: number;
}

export interface MolstarBuilder {
  loadStructure: (pdbId: string) => Promise<void>;
  addCartoonRepresentation: (options?: any) => Promise<void>;
  addBallAndStickRepresentation: (options?: any) => Promise<void>;
  addSurfaceRepresentation: (options?: any) => Promise<void>;
  addWaterRepresentation: (options?: any) => Promise<void>;
  highlightLigands: (options?: any) => Promise<void>;
  focusView: () => void;
  clearStructure: () => Promise<void>;
  // New selector-based methods
  highlightResidue: (selector: ResidueSelector, options?: { color?: string }) => Promise<void>;
  labelResidue: (selector: ResidueSelector, text: string) => Promise<void>;
  focusResidue: (selector: ResidueSelector) => Promise<void>;
}

export const createMolstarBuilder = (
  plugin: PluginUIContext,
  onPdbLoaded?: (pdbId: string) => void
): MolstarBuilder => {
  let currentStructure: any = null;

  return {
    async loadStructure(pdbId: string) {
      if (!validatePDBId(pdbId)) {
        throw new Error(`Invalid PDB ID: ${pdbId}`);
      }

      try {
        // Always clear any existing structures in the scene before loading a new one.
        // This avoids having multiple proteins displayed at once if a default or
        // previous structure was loaded outside of this builder's lifecycle.
        await this.clearStructure();
        
        const url = getPDBUrl(pdbId);
        
        const data = await plugin.builders.data.download({
          url,
          isBinary: false,
        });

        const trajectory = await plugin.builders.structure.parseTrajectory(data, 'pdb');
        const model = await plugin.builders.structure.createModel(trajectory);
        currentStructure = await plugin.builders.structure.createStructure(model);
        if (onPdbLoaded) onPdbLoaded(pdbId);

        return currentStructure;
      } catch (error) {
        throw new Error(`Failed to load structure ${pdbId}: ${error}`);
      }
    },

    async addCartoonRepresentation(options = {}) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      const defaultOptions = {
        type: 'cartoon' as const,
        color: 'secondary-structure' as const,
        ...options
      };

      await plugin.builders.structure.representation.addRepresentation(
        currentStructure,
        defaultOptions
      );
    },

    async addBallAndStickRepresentation(options = {}) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      const defaultOptions = {
        type: 'ball-and-stick' as const,
        color: 'element' as const,
        ...options
      };

      await plugin.builders.structure.representation.addRepresentation(
        currentStructure,
        defaultOptions
      );
    },

    async addSurfaceRepresentation(options = {}) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      const defaultOptions = {
        type: 'surface' as const,
        color: 'hydrophobicity' as const,
        alpha: 0.7,
        ...options
      };

      await plugin.builders.structure.representation.addRepresentation(
        currentStructure,
        defaultOptions
      );
    },

    async addWaterRepresentation(options = {}) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      // Minimal water selection using label_resname = 'HOH' which is common for water in PDB
      const defaultOptions = {
        type: 'ball-and-stick' as const,
        color: 'element' as const,
        query: { kind: 'expression', expression: "label_resname = 'HOH'" },
        ...options
      };

      await plugin.builders.structure.representation.addRepresentation(
        currentStructure,
        defaultOptions
      );
    },

    async highlightLigands() {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      // This is a simplified implementation
      // In a real application, you would use proper selection queries
      await plugin.builders.structure.representation.addRepresentation(
        currentStructure,
        {
          type: 'ball-and-stick',
          color: 'element-symbol'
        }
      );
    },

    focusView() {
      if (currentStructure) {
        plugin.managers.camera.focusLoci(currentStructure);
      }
    },

    async clearStructure() {
      try {
        // Remove any known current structure first
        if (currentStructure) {
          await plugin.managers.structure.hierarchy.remove([currentStructure]);
          currentStructure = null;
        }

        // Additionally, ensure all existing root structures are removed
        const hierarchy = plugin.managers.structure.hierarchy;
        const existing = (hierarchy as any)?.current?.structures ?? [];
        if (Array.isArray(existing) && existing.length > 0) {
          await hierarchy.remove(existing as any);
        }
      } catch (e) {
        // Swallow errors to keep UX smooth; subsequent loads will overwrite
        console.warn('[Molstar] clearStructure failed, continuing', e);
      }
    },

    async highlightResidue(selector: ResidueSelector, options: { color?: string } = {}) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      const { color = 'red' } = options;
      
      try {
        // Add ball-and-stick representation with color for the specific residue
        // Note: Full residue-specific selection would require more complex query implementation
        await plugin.builders.structure.representation.addRepresentation(currentStructure, {
          type: 'ball-and-stick',
          colorTheme: { name: 'uniform', params: { value: color } },
          sizeTheme: { name: 'uniform', params: { value: 1 } }
        });
        
        console.log(`Highlighted residue ${selector.label_asym_id}:${selector.label_seq_id}`);
      } catch (error) {
        console.warn('Failed to highlight residue:', error);
      }
    },

    async labelResidue(selector: ResidueSelector, text: string) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      try {
        // For now, log the label request - proper label implementation requires more complex setup
        console.log(`Label request for ${selector.label_asym_id}:${selector.label_seq_id} - "${text}"`);
        
        // Note: Proper label implementation would require creating a custom label provider
        // This is a placeholder that demonstrates the interface
      } catch (error) {
        console.warn('Failed to label residue:', error);
      }
    },

    async focusResidue(selector: ResidueSelector) {
      if (!currentStructure) {
        throw new Error('No structure loaded');
      }

      try {
        // Focus on the entire structure for now - specific residue focusing requires
        // more complex implementation with proper structure queries
        plugin.managers.camera.focusLoci(currentStructure);
        console.log(`Focus request for residue ${selector.label_asym_id}:${selector.label_seq_id}`);
      } catch (error) {
        console.warn('Failed to focus residue:', error);
      }
    }
  };
};

export const generateVisualizationCode = (
  proteinName: string,
  pdbId: string,
  options: {
    representation?: 'cartoon' | 'surface' | 'ball-and-stick';
    colorScheme?: string;
    showLigands?: boolean;
  } = {}
): string => {
  const { representation = 'cartoon', colorScheme = 'secondary-structure', showLigands = true } = options;

  return `// Visualizing ${proteinName} (${pdbId})
async function visualizeProtein() {
  try {
    // Load the structure
    await builder.loadStructure('${pdbId}');
    
    // Add ${representation} representation
    await builder.add${representation.charAt(0).toUpperCase() + representation.slice(1)}Representation({
      color: '${colorScheme}'
    });
    
    ${showLigands ? '// Highlight ligands\n    await builder.highlightLigands();' : ''}
    
    // Focus the view
    builder.focusView();
    
    console.log('Successfully loaded ${proteinName}');
  } catch (error) {
    console.error('Failed to visualize protein:', error);
  }
}

// Execute the visualization
visualizeProtein();`;
};