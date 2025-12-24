/**
 * Molstar Selection and Action Utilities
 * Provides Chimera-like selection queries and action handlers for the MolstarViewer
 * 
 * Key Features:
 * - Select → Chain → B (selects only Chain B)
 * - Actions → Color → cyan (colors ONLY the selection)
 * - Actions → Ribbon → hide (hides ribbon ONLY for selection)
 */

import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { StructureSelection, StructureElement, Structure } from 'molstar/lib/mol-model/structure';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { Color } from 'molstar/lib/mol-util/color';
import { QueryContext } from 'molstar/lib/mol-model/structure/query/context';
import { Bundle } from 'molstar/lib/mol-model/structure/structure/element/bundle';

// Standard amino acids (3-letter codes)
export const AMINO_ACIDS = [
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL'
] as const;

// Common elements in proteins
export const ELEMENTS = ['C', 'N', 'O', 'S', 'P', 'H', 'Fe', 'Zn', 'Ca', 'Mg', 'Mn', 'Cu'] as const;

// Structure categories
export const STRUCTURE_TYPES = ['protein', 'nucleic', 'water', 'ligand', 'ion'] as const;

// Named colors for the color picker
export const NAMED_COLORS: Record<string, number> = {
  'hot pink': 0xFF69B4,
  'cyan': 0x00FFFF,
  'tan': 0xD2B48C,
  'red': 0xFF0000,
  'blue': 0x0000FF,
  'green': 0x00FF00,
  'yellow': 0xFFFF00,
  'orange': 0xFFA500,
  'purple': 0x800080,
  'white': 0xFFFFFF,
  'gray': 0x808080,
  'black': 0x000000,
};

// Color scheme types
export const COLOR_SCHEMES = [
  'by element',
  'by chain',
  'by secondary structure',
  'by hydrophobicity',
  'uniform'
] as const;

// Representation types
export const REPRESENTATION_TYPES = [
  'cartoon',
  'ball-and-stick',
  'surface',
  'sphere',
  'stick',
  'spacefill'
] as const;

export type AminoAcid = typeof AMINO_ACIDS[number];
export type Element = typeof ELEMENTS[number];
export type StructureType = typeof STRUCTURE_TYPES[number];
export type ColorScheme = typeof COLOR_SCHEMES[number];
export type RepresentationType = typeof REPRESENTATION_TYPES[number];

/**
 * Get the current structure from the plugin
 */
export function getCurrentStructure(plugin: PluginUIContext): Structure | undefined {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return undefined;
  
  const cell = structures[0]?.cell;
  if (!cell?.obj) return undefined;
  
  return cell.obj.data;
}

/**
 * Get all chain IDs from the current structure
 */
export function getChainIds(plugin: PluginUIContext): string[] {
  const structure = getCurrentStructure(plugin);
  if (!structure) return [];
  
  const chainIds = new Set<string>();
  const { units } = structure;
  
  for (const unit of units) {
    if (unit.kind === 0) { // atomic unit
      const elements = unit.elements;
      const chainId = unit.model.atomicHierarchy.chains.label_asym_id;
      for (let i = 0; i < elements.length; i++) {
        const idx = unit.model.atomicHierarchy.chainAtomSegments.index[elements[i]];
        chainIds.add(chainId.value(idx));
      }
    }
  }
  
  return Array.from(chainIds).sort();
}

/**
 * Build a MolScript expression for selecting by residue name
 */
export function selectByResidue(residueName: string) {
  return MS.struct.generator.atomGroups({
    'residue-test': MS.core.rel.eq([
      MS.struct.atomProperty.macromolecular.label_comp_id(),
      residueName
    ])
  });
}

/**
 * Build a MolScript expression for selecting by chain ID
 */
export function selectByChain(chainId: string) {
  return MS.struct.generator.atomGroups({
    'chain-test': MS.core.rel.eq([
      MS.struct.atomProperty.macromolecular.label_asym_id(),
      chainId
    ])
  });
}

/**
 * Build a MolScript expression for selecting by element
 */
export function selectByElement(element: string) {
  return MS.struct.generator.atomGroups({
    'atom-test': MS.core.rel.eq([
      MS.struct.atomProperty.core.elementSymbol(),
      element
    ])
  });
}

/**
 * Build a MolScript expression for selecting by structure type
 */
export function selectByStructureType(structureType: StructureType): Expression {
  switch (structureType) {
    case 'protein':
      return MS.struct.generator.atomGroups({
        'residue-test': MS.core.set.has([
          MS.set(...AMINO_ACIDS),
          MS.struct.atomProperty.macromolecular.label_comp_id()
        ])
      });
    case 'nucleic':
      return MS.struct.generator.atomGroups({
        'residue-test': MS.core.set.has([
          MS.set('A', 'T', 'G', 'C', 'U', 'DA', 'DT', 'DG', 'DC', 'DU'),
          MS.struct.atomProperty.macromolecular.label_comp_id()
        ])
      });
    case 'water':
      return MS.struct.generator.atomGroups({
        'residue-test': MS.core.set.has([
          MS.set('HOH', 'WAT', 'H2O'),
          MS.struct.atomProperty.macromolecular.label_comp_id()
        ])
      });
    case 'ligand':
      // Ligands are typically not protein, nucleic, water, or ion
      return MS.struct.modifier.exceptBy({
        0: MS.struct.generator.all(),
        by: MS.struct.combinator.merge([
          selectByStructureType('protein'),
          selectByStructureType('nucleic'),
          selectByStructureType('water'),
          selectByStructureType('ion')
        ])
      });
    case 'ion':
      return MS.struct.generator.atomGroups({
        'residue-test': MS.core.set.has([
          MS.set('NA', 'CL', 'K', 'MG', 'CA', 'ZN', 'FE', 'MN', 'CU', 'CO'),
          MS.struct.atomProperty.macromolecular.label_comp_id()
        ])
      });
    default:
      return MS.struct.generator.all();
  }
}

/**
 * Apply a selection query to the plugin using Molstar's selection manager
 */
export async function applySelection(
  plugin: PluginUIContext,
  expression: any,
  mode: 'set' | 'add' | 'remove' = 'set'
) {
  console.log('[MolstarSelections] applySelection called with mode:', mode);
  
  const structures = plugin.managers.structure.hierarchy.current.structures;
  console.log('[MolstarSelections] Number of structures:', structures.length);
  
  if (structures.length === 0) {
    console.warn('[MolstarSelections] No structure loaded');
    return;
  }

  try {
    // Clear existing selection first if mode is 'set'
    if (mode === 'set') {
      console.log('[MolstarSelections] Clearing existing selection');
      plugin.managers.structure.selection.clear();
    }

    // For each structure, compile and apply the selection
    for (const structureRef of structures) {
      console.log('[MolstarSelections] Processing structure ref:', structureRef);
      const structure = structureRef.cell?.obj?.data;
      if (!structure) {
        console.warn('[MolstarSelections] No structure data in cell');
        continue;
      }
      console.log('[MolstarSelections] Structure found, unit count:', structure.units.length);

      // Compile the MolScript expression
      console.log('[MolstarSelections] Compiling expression...');
      const compiled = compile<StructureSelection>(expression);
      console.log('[MolstarSelections] Running query...');
      const selection = compiled(new QueryContext(structure));
      console.log('[MolstarSelections] Query result:', selection);
      
      // Convert to Loci with proper source units
      const loci = StructureSelection.toLociWithSourceUnits(selection);
      console.log('[MolstarSelections] Loci created:', loci);
      
      // Check if we actually selected anything
      if (StructureElement.Loci.isEmpty(loci)) {
        console.log('[MolstarSelections] No atoms matched the selection query');
        continue;
      }

      const atomCount = StructureElement.Loci.size(loci);
      console.log(`[MolstarSelections] Selected ${atomCount} atoms`);

      // Use the structure selection manager for persistent selections
      // This is what Chimera-style selection needs
      const selMgr = plugin.managers.structure.selection;
      console.log('[MolstarSelections] Selection manager:', selMgr);
      
      if (mode === 'remove') {
        console.log('[MolstarSelections] Removing from selection');
        selMgr.fromLoci('remove', loci);
      } else if (mode === 'add') {
        console.log('[MolstarSelections] Adding to selection');
        selMgr.fromLoci('add', loci);
      } else {
        // 'set' mode - replace the selection
        console.log('[MolstarSelections] Setting selection');
        selMgr.fromLoci('set', loci);
      }
      console.log('[MolstarSelections] Selection applied successfully');
    }
  } catch (error) {
    console.error('[MolstarSelections] Failed to apply selection:', error);
  }
}

/**
 * Clear the current selection
 */
export function clearSelection(plugin: PluginUIContext) {
  try {
    plugin.managers.structure.selection.clear();
    console.log('[MolstarSelections] Selection cleared');
  } catch (error) {
    console.error('[MolstarSelections] Failed to clear selection:', error);
  }
}

/**
 * Get the number of selected atoms
 */
export function getSelectionCount(plugin: PluginUIContext): number {
  const sel = plugin.managers.structure.selection;
  let count = 0;
  sel.entries.forEach((entry) => {
    count += StructureElement.Loci.size(entry.selection);
  });
  return count;
}

/**
 * Check if there's an active selection
 */
export function hasSelection(plugin: PluginUIContext): boolean {
  return getSelectionCount(plugin) > 0;
}

/**
 * Get the current selection as a Loci
 */
export function getSelectionLoci(plugin: PluginUIContext) {
  const entries = Array.from(plugin.managers.structure.selection.entries.values());
  if (entries.length === 0) return undefined;
  return entries[0]?.selection;
}

// ============================================
// ACTION HANDLERS
// ============================================

/**
 * Apply overpaint color to ONLY the current selection
 * This is the Chimera-like behavior: Select Chain B, then Color cyan → only Chain B becomes cyan
 */
export async function applyOverpaintToSelection(plugin: PluginUIContext, colorName: string) {
  const colorValue = NAMED_COLORS[colorName.toLowerCase()] ?? 0xFF69B4;
  const color = Color(colorValue);
  
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;

  // Get the current selection
  const selectionEntries = Array.from(plugin.managers.structure.selection.entries.values());
  if (selectionEntries.length === 0) {
    console.log('[MolstarSelections] No selection for overpaint, applying to all');
    await applyUniformColorToAll(plugin, colorName);
    return;
  }

  console.log('[MolstarSelections] Applying overpaint to selection with color:', colorName);

  for (const entry of selectionEntries) {
    const loci = entry.selection;
    if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) continue;

    // Create a bundle from the loci for overpaint
    const bundle = Bundle.fromLoci(loci);
    
    // Find the structure reference for this selection
    const structureRef = structures.find(s => {
      const structData = s.cell?.obj?.data;
      return structData && loci.structure === structData;
    });

    if (!structureRef) continue;

    // Apply overpaint to each representation in the structure
    for (const component of structureRef.components) {
      for (const repr of component.representations) {
        try {
          // Apply overpaint via state update
          await plugin.build().to(repr.cell)
            .apply(
              plugin.state.data.tree.transforms.get('ms-plugin.structure-representation-3d-overpaint')!.transformer,
              {
                layers: [{ bundle, color, clear: false }]
              } as any
            )
            .commit();
        } catch (e) {
          // Fallback: use the component manager approach
          console.log('[MolstarSelections] Overpaint transformer not available, using component approach');
          await applyColorViaComponent(plugin, structureRef, loci, color);
        }
      }
    }
  }
}

/**
 * Apply color to selection using component subdivision approach
 */
async function applyColorViaComponent(
  plugin: PluginUIContext, 
  structureRef: any, 
  loci: StructureElement.Loci, 
  color: Color
) {
  try {
    const structure = structureRef.cell;
    if (!structure?.obj) return;

    // Use the structure component manager to apply color to selection
    const params = {
      layers: [{
        loci,
        color,
        clear: false
      }]
    };

    // Apply color through the hierarchy manager
    // Note: Using type assertion as the exact API may vary by Molstar version
    await plugin.managers.structure.component.applyTheme(
      params as any,
      structureRef.components
    );
    
    console.log('[MolstarSelections] Applied color via component theme');
  } catch (e) {
    console.warn('[MolstarSelections] Component color application failed:', e);
  }
}

/**
 * Apply a uniform color to ALL atoms (no selection filter)
 */
export async function applyUniformColorToAll(plugin: PluginUIContext, colorName: string) {
  const colorValue = NAMED_COLORS[colorName.toLowerCase()] ?? 0xFF69B4;
  const color = Color(colorValue);
  
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;
  
  for (const structureRef of structures) {
    const components = structureRef.components;
    for (const component of components) {
      for (const repr of component.representations) {
        const update = plugin.state.data.build().to(repr.cell);
          update.update(
            repr.cell.transform.transformer,
            (old: any) => ({
              ...old,
              colorTheme: { name: 'uniform', params: { value: color } }
            })
          );
        await update.commit();
      }
    }
  }
}

/**
 * Apply a uniform color to the selection (or all if no selection)
 * This is the main entry point for coloring - it routes to the appropriate method
 */
export async function applyUniformColor(plugin: PluginUIContext, colorName: string) {
  const hasSelect = hasSelection(plugin);
  
  if (hasSelect) {
    // Apply color ONLY to the current selection (Chimera-like behavior)
    await applyOverpaintToSelection(plugin, colorName);
  } else {
    // No selection - apply to everything
    await applyUniformColorToAll(plugin, colorName);
  }
}

/**
 * Apply a color scheme to representations
 */
export async function applyColorScheme(plugin: PluginUIContext, scheme: ColorScheme) {
  let themeName: string;
  
  switch (scheme) {
    case 'by element':
      themeName = 'element-symbol';
      break;
    case 'by chain':
      themeName = 'chain-id';
      break;
    case 'by secondary structure':
      themeName = 'secondary-structure';
      break;
    case 'by hydrophobicity':
      themeName = 'hydrophobicity';
      break;
    case 'uniform':
    default:
      themeName = 'uniform';
      break;
  }

  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;

  for (const structureRef of structures) {
    const components = structureRef.components;
    for (const component of components) {
      for (const repr of component.representations) {
        const update = plugin.state.data.build().to(repr.cell);
        update.update(
          repr.cell.transform.transformer,
          (old: any) => ({
            ...old,
            colorTheme: { name: themeName }
          })
        );
        await update.commit();
      }
    }
  }
}

/**
 * Add a representation type
 */
export async function addRepresentation(plugin: PluginUIContext, type: RepresentationType) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;

  let reprType: string;
  switch (type) {
    case 'cartoon':
      reprType = 'cartoon';
      break;
    case 'ball-and-stick':
      reprType = 'ball-and-stick';
      break;
    case 'surface':
      reprType = 'molecular-surface';
      break;
    case 'sphere':
      reprType = 'spacefill';
      break;
    case 'stick':
      reprType = 'line';
      break;
    case 'spacefill':
      reprType = 'spacefill';
      break;
    default:
      reprType = 'cartoon';
  }

  for (const structureRef of structures) {
    const structure = structureRef.cell;
    if (structure?.obj) {
      await plugin.builders.structure.representation.addRepresentation(structure, {
        type: reprType as any,
      });
    }
  }
}

// Atom/bond representation types (not cartoon/ribbon)
const ATOM_BOND_REPR_TYPES = ['ball-and-stick', 'spacefill', 'point', 'line', 'orientation', 'gaussian-surface'];

/**
 * Hide atom/bond representations for ALL atoms
 * This specifically targets ball-and-stick, spacefill, point, line representations
 */
async function hideRepresentationsAll(plugin: PluginUIContext) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  console.log('[MolstarSelections] hideRepresentationsAll called, structures:', structures.length);
  
  for (const structureRef of structures) {
    const components = structureRef.components;
    for (const component of components) {
      for (const repr of component.representations) {
        const reprType = repr.cell.obj?.type?.name;
        console.log('[MolstarSelections] Checking repr type:', reprType);
        
        // Only hide atom/bond representations, not cartoon/ribbon
        if (reprType && ATOM_BOND_REPR_TYPES.includes(reprType)) {
          console.log('[MolstarSelections] Hiding representation:', reprType);
          try {
            // Use build API to update representation visibility
            // Note: Using type assertion as isHidden may not be in the type definition
            await (plugin.build().to(repr.cell).update({ isHidden: true } as any).commit());
            console.log('[MolstarSelections] Successfully hid:', reprType);
          } catch (e) {
            console.warn('[MolstarSelections] Failed to hide representation:', e);
            // Fallback: try to delete the representation
            try {
              await plugin.state.data.build().delete(repr.cell).commit();
            } catch (e2) {
              console.warn('[MolstarSelections] Fallback delete also failed:', e2);
            }
          }
        }
      }
    }
  }
}

/**
 * Show atom/bond representations for ALL atoms
 * This specifically targets ball-and-stick, spacefill, point, line representations
 */
async function showRepresentationsAll(plugin: PluginUIContext) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  console.log('[MolstarSelections] showRepresentationsAll called, structures:', structures.length);
  
  let foundHiddenRepr = false;
  
  for (const structureRef of structures) {
    const components = structureRef.components;
    for (const component of components) {
      for (const repr of component.representations) {
        const reprType = repr.cell.obj?.type?.name;
        
        // Only show atom/bond representations
        if (reprType && ATOM_BOND_REPR_TYPES.includes(reprType)) {
          console.log('[MolstarSelections] Showing representation:', reprType);
          try {
            // Use build API to update representation visibility
            // Note: Using type assertion as isHidden may not be in the type definition
            await (plugin.build().to(repr.cell).update({ isHidden: false } as any).commit());
            foundHiddenRepr = true;
            console.log('[MolstarSelections] Successfully showed:', reprType);
          } catch (e) {
            console.warn('[MolstarSelections] Failed to show representation:', e);
          }
        }
      }
    }
    
    // If no atom/bond representations exist, add ball-and-stick
    if (!foundHiddenRepr) {
      console.log('[MolstarSelections] No atom/bond representations found, adding ball-and-stick');
      const structure = structureRef.cell;
      if (structure?.obj) {
        try {
          await plugin.builders.structure.representation.addRepresentation(structure, {
            type: 'ball-and-stick',
          });
          console.log('[MolstarSelections] Added ball-and-stick representation');
        } catch (e) {
          console.warn('[MolstarSelections] Failed to add ball-and-stick:', e);
        }
      }
    }
  }
}

/**
 * Hide atoms/bonds representations - selection-aware
 * If selection exists, hides ONLY the selected atoms using transparency
 * Otherwise hides all atom/bond representations
 */
export async function hideRepresentations(plugin: PluginUIContext) {
  console.log('[MolstarSelections] hideRepresentations called');
  const hasSelect = hasSelection(plugin);
  console.log('[MolstarSelections] Has selection:', hasSelect);
  
  if (hasSelect) {
    console.log('[MolstarSelections] Applying transparency to selection');
    await applyTransparencyToSelection(plugin, 0);
  } else {
    console.log('[MolstarSelections] Hiding all atom/bond representations');
    await hideRepresentationsAll(plugin);
  }
}

/**
 * Show atoms/bonds representations - selection-aware
 * If selection exists, shows ONLY the selected atoms using transparency
 * Otherwise shows all atom/bond representations (or adds ball-and-stick if none exist)
 */
export async function showRepresentations(plugin: PluginUIContext) {
  console.log('[MolstarSelections] showRepresentations called');
  const hasSelect = hasSelection(plugin);
  console.log('[MolstarSelections] Has selection:', hasSelect);
  
  if (hasSelect) {
    console.log('[MolstarSelections] Applying transparency to selection (show)');
    await applyTransparencyToSelection(plugin, 1);
  } else {
    console.log('[MolstarSelections] Showing all atom/bond representations');
    await showRepresentationsAll(plugin);
  }
}

/**
 * Toggle atom/bond visibility - SELECTION-AWARE
 * If a selection exists (e.g., Chain B), hide/show atoms/bonds ONLY for that selection
 * If no selection, hide/show all atoms/bonds
 */
export async function toggleAtomsBondsVisibility(plugin: PluginUIContext, visible: boolean) {
  const hasSelect = hasSelection(plugin);
  console.log('[MolstarSelections] toggleAtomsBondsVisibility:', visible, 'hasSelection:', hasSelect);
  
  if (hasSelect) {
    // Apply transparency ONLY to the current selection
    // visible=true means alpha=1 (opaque), visible=false means alpha=0 (transparent/hidden)
    console.log('[MolstarSelections] Applying atom/bond visibility to SELECTION ONLY');
    await applyTransparencyToSelection(plugin, visible ? 1 : 0);
  } else {
    // No selection - toggle all atom/bond representations
    console.log('[MolstarSelections] No selection, toggling ALL atom/bond representations');
    const structures = plugin.managers.structure.hierarchy.current.structures;
    
    let foundAtomBondRepr = false;
    
    for (const structureRef of structures) {
      const components = structureRef.components;
      for (const component of components) {
        for (const repr of component.representations) {
          const reprType = repr.cell.obj?.type?.name;
          
          // Check if this is an atom/bond representation
          if (reprType && ATOM_BOND_REPR_TYPES.includes(reprType)) {
            foundAtomBondRepr = true;
            try {
              // Note: Using type assertion as isHidden may not be in the type definition
              await (plugin.build().to(repr.cell).update({ isHidden: !visible } as any).commit());
              console.log(`[MolstarSelections] Toggled ${reprType} visibility to:`, visible);
            } catch (e) {
              console.warn('[MolstarSelections] Failed to toggle visibility:', e);
            }
          }
        }
      }
      
      // If showing but no atom/bond representations exist, add ball-and-stick
      if (visible && !foundAtomBondRepr) {
        const structure = structureRef.cell;
        if (structure?.obj) {
          try {
            await plugin.builders.structure.representation.addRepresentation(structure, {
              type: 'ball-and-stick',
            });
            console.log('[MolstarSelections] Added ball-and-stick representation');
          } catch (e) {
            console.warn('[MolstarSelections] Failed to add ball-and-stick:', e);
          }
        }
      }
    }
  }
}

/**
 * Apply transparency to ONLY the current selection
 * This allows hiding parts of the structure (like atoms/bonds or ribbon for Chain B only)
 * 
 * Usage:
 * - Select Chain B
 * - Actions → Atoms/Bonds → Hide (alpha=0, makes Chain B atoms transparent)
 * - Actions → Atoms/Bonds → Show (alpha=1, makes Chain B atoms visible)
 */
export async function applyTransparencyToSelection(plugin: PluginUIContext, alpha: number) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) {
    console.log('[MolstarSelections] No structures loaded');
    return;
  }

  // Get the current selection
  const selectionEntries = Array.from(plugin.managers.structure.selection.entries.values());
  if (selectionEntries.length === 0) {
    console.log('[MolstarSelections] No selection for transparency');
    return;
  }

  console.log('[MolstarSelections] Applying transparency to selection, alpha:', alpha, 'entries:', selectionEntries.length);

  for (const entry of selectionEntries) {
    const loci = entry.selection;
    if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
      console.log('[MolstarSelections] Empty or invalid loci, skipping');
      continue;
    }

    const atomCount = StructureElement.Loci.size(loci);
    console.log('[MolstarSelections] Selection has', atomCount, 'atoms');

    // Find the structure reference for this selection
    const structureRef = structures.find(s => {
      const structData = s.cell?.obj?.data;
      return structData && loci.structure === structData;
    });

    if (!structureRef) {
      console.log('[MolstarSelections] Could not find structure reference for selection');
      continue;
    }

    console.log('[MolstarSelections] Found structure ref, components:', structureRef.components.length);

    // Method 1: Try using the component manager's applyTheme
    try {
      const transparencyValue = 1 - alpha; // Transparency is inverse of alpha (0=opaque, 1=fully transparent)
      console.log('[MolstarSelections] Applying transparency value:', transparencyValue);
      
      const params = {
        layers: [{
          loci,
          value: transparencyValue,
          clear: alpha === 1 // Clear transparency when showing (alpha=1)
        }]
      };

      // Note: transparency theme may not be available in all Molstar versions
      // Using type assertion and applying to structure references instead of components
      const structureRefs = [structureRef];
      await plugin.managers.structure.component.applyTheme(
        params as any,
        structureRefs as any
      );
      
      console.log('[MolstarSelections] Successfully applied transparency via component theme');
    } catch (e) {
      console.warn('[MolstarSelections] Component theme transparency failed:', e);
      
      // Method 2: Fallback - try applying to each representation individually
      try {
        console.log('[MolstarSelections] Trying fallback method...');
        for (const component of structureRef.components) {
          for (const repr of component.representations) {
            const reprType = repr.cell.obj?.type?.name;
            console.log('[MolstarSelections] Processing representation:', reprType);
            
            // Apply transparency to this representation using the state builder
            const transparencyValue = 1 - alpha;
            await plugin.build().to(repr.cell)
              .apply(
                plugin.state.data.tree.transforms.get('ms-plugin.structure-representation-3d-transparency')?.transformer,
                {
                  layers: [{ 
                    loci, 
                    value: transparencyValue,
                    clear: alpha === 1
                  }]
                } as any
              )
          .commit();
            console.log('[MolstarSelections] Applied transparency to:', reprType);
          }
        }
      } catch (e2) {
        console.warn('[MolstarSelections] Fallback transparency also failed:', e2);
      }
    }
  }
}

/**
 * Toggle ribbon/cartoon visibility for the entire structure
 */
async function toggleRibbonAll(plugin: PluginUIContext, visible: boolean) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  
  for (const structureRef of structures) {
    const components = structureRef.components;
    for (const component of components) {
      for (const repr of component.representations) {
        const reprType = repr.cell.obj?.type?.name;
        if (reprType === 'cartoon' || reprType === 'ribbon') {
          await plugin.state.data.build()
            .to(repr.cell)
            .update(repr.cell.transform.transformer, (old: any) => ({
              ...old,
              type: { ...old.type, params: { ...old.type?.params, alpha: visible ? 1 : 0 } }
            }))
            .commit();
        }
      }
    }
  }
}

/**
 * Toggle ribbon/cartoon visibility - selection-aware
 * If a selection is active, applies ONLY to that selection
 * Otherwise applies to the entire structure
 */
export async function toggleRibbon(plugin: PluginUIContext, visible: boolean) {
  const hasSelect = hasSelection(plugin);
  
  if (hasSelect) {
    // Apply transparency ONLY to the current selection (Chimera-like behavior)
    // For hiding ribbon: make selection transparent
    // For showing ribbon: make selection opaque
    await applyTransparencyToSelection(plugin, visible ? 1 : 0);
  } else {
    // No selection - apply to everything
    await toggleRibbonAll(plugin, visible);
  }
}

/**
 * Add labels to the selection
 */
export async function addLabels(plugin: PluginUIContext, labelType: 'residue' | 'atom' | 'off') {
  if (labelType === 'off') {
    // Remove all label representations
    const structures = plugin.managers.structure.hierarchy.current.structures;
    for (const structureRef of structures) {
      const components = structureRef.components;
      for (const component of components) {
        for (const repr of component.representations) {
          const reprType = repr.cell.obj?.type?.name;
          if (reprType === 'label') {
            await plugin.state.data.build().delete(repr.cell).commit();
          }
        }
      }
    }
    return;
  }

  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;

  for (const structureRef of structures) {
    const structure = structureRef.cell;
    if (structure?.obj) {
      await plugin.builders.structure.representation.addRepresentation(structure, {
        type: 'label',
        typeParams: {
          level: labelType === 'residue' ? 'residue' : 'element'
        }
      });
    }
  }
}

/**
 * Broaden the selection to include entire residues
 */
export function broadenSelectionToResidues(_plugin: PluginUIContext) {
  // This would require more complex implementation
  // For now, log the action
  console.log('[MolstarSelections] Broaden selection to residues - not yet implemented');
}

/**
 * Subscribe to selection changes
 */
export function subscribeToSelectionChanges(
  plugin: PluginUIContext,
  callback: (count: number) => void
): () => void {
  const subscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
    const count = getSelectionCount(plugin);
    callback(count);
  });
  
  return () => subscription.unsubscribe();
}

