/**
 * MolstarToolbar - Chimera-like Select/Actions menus for MolstarViewer
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Palette, 
  Eye, 
  EyeOff, 
  Tag,
  Atom,
  Link2,
  Circle
} from 'lucide-react';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import {
  AMINO_ACIDS,
  ELEMENTS,
  STRUCTURE_TYPES,
  NAMED_COLORS,
  COLOR_SCHEMES,
  REPRESENTATION_TYPES,
  selectByResidue,
  selectByChain,
  selectByElement,
  selectByStructureType,
  applySelection,
  clearSelection,
  getChainIds,
  getSelectionCount,
  applyUniformColor,
  applyColorScheme,
  addRepresentation,
  hideRepresentations,
  showRepresentations,
  toggleRibbon,
  addLabels,
  subscribeToSelectionChanges,
  toggleAtomsBondsVisibility,
  type ColorScheme,
  type RepresentationType,
} from '../utils/molstarSelections';
import { useAppStore } from '../stores/appStore';

interface MolstarToolbarProps {
  plugin: PluginUIContext | null;
}

interface MenuItemProps {
  label: string;
  onClick?: () => void;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

// Submenu component for nested menus
const MenuItem: React.FC<MenuItemProps> = ({ label, onClick, children, icon, disabled }) => {
  const [isHovered, setIsHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  
  const hasSubmenu = !!children;
  
  return (
    <div
      ref={itemRef}
      data-submenu={hasSubmenu ? 'true' : undefined}
      className={`relative ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex items-center justify-between px-3 py-1.5 text-sm ${
          disabled ? '' : 'hover:bg-blue-50'
        }`}
        onClick={() => {
          if (!disabled && !hasSubmenu) {
            onClick?.();
          }
        }}
      >
        <span className="flex items-center gap-2">
          {icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>}
          {label}
        </span>
        {hasSubmenu && <ChevronRight className="w-3 h-3 ml-2" />}
      </div>
      
      {hasSubmenu && isHovered && (
        <div className="absolute left-full top-0 ml-0.5 min-w-[160px] bg-white border border-gray-200 rounded shadow-lg z-[9999] max-h-[300px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
};

// Dropdown menu component
interface DropdownMenuProps {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ label, children, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      // Use setTimeout to prevent the same click from closing the menu
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };
  
  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={handleToggle}
        disabled={disabled}
        className={`flex items-center gap-1 px-3 py-1 text-sm font-medium rounded transition-colors ${
          disabled 
            ? 'text-gray-400 cursor-not-allowed' 
            : isOpen 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-1 min-w-[180px] bg-white border border-gray-200 rounded shadow-xl z-[9999]"
          onClick={(e) => {
            // Only close if clicking on a leaf item (not a submenu trigger)
            const target = e.target as HTMLElement;
            if (!target.closest('[data-submenu]')) {
              setIsOpen(false);
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// Selection indicator component
interface SelectionIndicatorProps {
  hasSelection: boolean;
  count: number;
  selectionLabel?: string;
}

const SelectionIndicator: React.FC<SelectionIndicatorProps> = ({ hasSelection: hasSel, count, selectionLabel }) => {
  return (
    <div 
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
        hasSel 
          ? 'bg-green-100 text-green-700 border border-green-300' 
          : 'bg-gray-100 text-gray-500 border border-gray-200'
      }`}
      title={hasSel ? `${count} atoms selected${selectionLabel ? ` (${selectionLabel})` : ''}` : 'No selection - actions will apply to all'}
    >
      <Search className={`w-3.5 h-3.5 ${hasSel ? 'text-green-600' : 'text-gray-400'}`} />
      {hasSel ? (
        <span className="flex items-center gap-1">
          <span>{count}</span>
          {selectionLabel && <span className="text-green-600">• {selectionLabel}</span>}
        </span>
      ) : (
        <span className="text-gray-400 italic">All</span>
      )}
    </div>
  );
};

export const MolstarToolbar: React.FC<MolstarToolbarProps> = ({ plugin }) => {
  const [selectionCount, setSelectionCount] = useState(0);
  const [chainIds, setChainIds] = useState<string[]>([]);
  const [selectionLabel, setSelectionLabel] = useState<string>('');
  const { setMolstarSelectionCount, recordMolstarAction } = useAppStore();
  
  // Subscribe to selection changes
  useEffect(() => {
    if (!plugin) return;
    
    // Initial check
    const initialCount = getSelectionCount(plugin);
    setSelectionCount(initialCount);
    setMolstarSelectionCount(initialCount);
    setChainIds(getChainIds(plugin));
    if (initialCount === 0) {
      setSelectionLabel('');
    }
    
    // Subscribe to changes
    const unsubscribe = subscribeToSelectionChanges(plugin, (count) => {
      setSelectionCount(count);
      setMolstarSelectionCount(count);
      // Clear label when selection is cleared from elsewhere
      if (count === 0) {
        setSelectionLabel('');
      }
    });
    
    // Also update chain IDs when structure changes
    const structureSub = plugin.state.data.events.changed.subscribe(() => {
      setChainIds(getChainIds(plugin));
    });
    
    return () => {
      unsubscribe();
      structureSub.unsubscribe();
    };
  }, [plugin, setMolstarSelectionCount]);
  
  const isDisabled = !plugin;
  const hasSel = selectionCount > 0;
  
  // Selection handlers
  const handleSelectResidue = (residue: string) => {
    console.log('[MolstarToolbar] handleSelectResidue called:', residue);
    if (!plugin) {
      console.warn('[MolstarToolbar] No plugin available');
      return;
    }
    const expr = selectByResidue(residue);
    console.log('[MolstarToolbar] Applying selection for residue:', residue);
    applySelection(plugin, expr);
    setSelectionLabel(`Residue ${residue}`);
    recordMolstarAction({ type: 'select', target: `residue:${residue}`, timestamp: Date.now() });
  };
  
  const handleSelectChain = (chain: string) => {
    if (!plugin) return;
    const expr = selectByChain(chain);
    applySelection(plugin, expr);
    setSelectionLabel(`Chain ${chain}`);
    recordMolstarAction({ type: 'select', target: `chain:${chain}`, timestamp: Date.now() });
  };
  
  const handleSelectElement = (element: string) => {
    if (!plugin) return;
    const expr = selectByElement(element);
    applySelection(plugin, expr);
    setSelectionLabel(`Element ${element}`);
    recordMolstarAction({ type: 'select', target: `element:${element}`, timestamp: Date.now() });
  };
  
  const handleSelectStructure = (type: typeof STRUCTURE_TYPES[number]) => {
    if (!plugin) return;
    const expr = selectByStructureType(type);
    applySelection(plugin, expr);
    setSelectionLabel(type.charAt(0).toUpperCase() + type.slice(1));
    recordMolstarAction({ type: 'select', target: `structure:${type}`, timestamp: Date.now() });
  };
  
  const handleClearSelection = () => {
    if (!plugin) return;
    clearSelection(plugin);
    setSelectionLabel('');
    recordMolstarAction({ type: 'select', target: 'clear', timestamp: Date.now() });
  };
  
  // Action handlers
  const handleColorUniform = (color: string) => {
    if (!plugin) return;
    applyUniformColor(plugin, color);
    recordMolstarAction({ type: 'color', target: color, timestamp: Date.now() });
  };
  
  const handleColorScheme = (scheme: ColorScheme) => {
    if (!plugin) return;
    applyColorScheme(plugin, scheme);
    recordMolstarAction({ type: 'color', target: scheme, timestamp: Date.now() });
  };
  
  const handleRepresentation = (type: RepresentationType) => {
    if (!plugin) return;
    addRepresentation(plugin, type);
    recordMolstarAction({ type: 'representation', target: type, timestamp: Date.now() });
  };
  
  const handleVisibility = (action: 'show' | 'hide') => {
    if (!plugin) return;
    const visible = action === 'show';
    console.log('[MolstarToolbar] handleVisibility called:', action, 'selection count:', selectionCount);
    console.log('[MolstarToolbar] Will', visible ? 'SHOW' : 'HIDE', 'atoms/bonds', selectionCount > 0 ? 'for SELECTION ONLY' : 'for ALL');
    // Use the selection-aware toggle function for atoms/bonds visibility
    toggleAtomsBondsVisibility(plugin, visible);
    recordMolstarAction({ type: 'visibility', target: `atoms-bonds:${action}`, timestamp: Date.now() });
  };
  
  const handleRibbon = (visible: boolean) => {
    if (!plugin) return;
    toggleRibbon(plugin, visible);
    recordMolstarAction({ type: 'visibility', target: `ribbon:${visible ? 'show' : 'hide'}`, timestamp: Date.now() });
  };
  
  const handleLabels = (type: 'residue' | 'atom' | 'off') => {
    if (!plugin) return;
    addLabels(plugin, type);
    recordMolstarAction({ type: 'label', target: type, timestamp: Date.now() });
  };
  
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-b border-gray-200">
      {/* Select Menu */}
      <DropdownMenu label="Select" disabled={isDisabled}>
        <MenuItem label="Residue" icon={<Atom className="w-3 h-3" />}>
          <div className="py-1 grid grid-cols-2 gap-0.5 px-1">
            {AMINO_ACIDS.map((aa) => (
              <div
                key={aa}
                className="px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer rounded"
                onClick={() => handleSelectResidue(aa)}
              >
                {aa}
              </div>
            ))}
          </div>
        </MenuItem>
        
        <MenuItem label="Chain" icon={<Link2 className="w-3 h-3" />}>
          {chainIds.length > 0 ? (
            chainIds.map((chain) => (
              <MenuItem
                key={chain}
                label={`Chain ${chain}`}
                onClick={() => handleSelectChain(chain)}
              />
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-gray-400 italic">
              No chains found
            </div>
          )}
        </MenuItem>
        
        <MenuItem label="Element" icon={<Circle className="w-3 h-3" />}>
          <div className="py-1 grid grid-cols-2 gap-0.5 px-1">
            {ELEMENTS.map((el) => (
              <div
                key={el}
                className="px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer rounded"
                onClick={() => handleSelectElement(el)}
              >
                {el}
              </div>
            ))}
          </div>
        </MenuItem>
        
        <MenuItem label="Structure">
          {STRUCTURE_TYPES.map((type) => (
            <MenuItem
              key={type}
              label={type.charAt(0).toUpperCase() + type.slice(1)}
              onClick={() => handleSelectStructure(type)}
            />
          ))}
        </MenuItem>
        
        <div className="border-t border-gray-200 my-1" />
        
        <MenuItem
          label="Clear Selection"
          onClick={handleClearSelection}
          disabled={!hasSel}
        />
      </DropdownMenu>
      
      {/* Actions Menu */}
      <DropdownMenu label="Actions" disabled={isDisabled}>
        <MenuItem label="Color" icon={<Palette className="w-3 h-3" />}>
          <div className="py-1">
            <div className="px-3 py-1 text-xs text-gray-500 font-medium">Named Colors</div>
            <div className="grid grid-cols-3 gap-1 px-2 py-1">
              {Object.entries(NAMED_COLORS).map(([name, hex]) => (
                <div
                  key={name}
                  className="flex items-center gap-1 px-1.5 py-1 text-xs hover:bg-blue-50 cursor-pointer rounded"
                  onClick={() => handleColorUniform(name)}
                  title={name}
                >
                  <div 
                    className="w-3 h-3 rounded-sm border border-gray-300"
                    style={{ backgroundColor: `#${hex.toString(16).padStart(6, '0')}` }}
                  />
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 my-1" />
            <div className="px-3 py-1 text-xs text-gray-500 font-medium">Color Schemes</div>
            {COLOR_SCHEMES.map((scheme) => (
              <MenuItem
                key={scheme}
                label={scheme}
                onClick={() => handleColorScheme(scheme)}
              />
            ))}
          </div>
        </MenuItem>
        
        <MenuItem label="Representation" icon={<Circle className="w-3 h-3" />}>
          {REPRESENTATION_TYPES.map((type) => (
            <MenuItem
              key={type}
              label={type}
              onClick={() => handleRepresentation(type)}
            />
          ))}
        </MenuItem>
        
        <MenuItem label="Ribbon">
          <MenuItem label="Show" icon={<Eye className="w-3 h-3" />} onClick={() => handleRibbon(true)} />
          <MenuItem label="Hide" icon={<EyeOff className="w-3 h-3" />} onClick={() => handleRibbon(false)} />
        </MenuItem>
        
        <MenuItem label="Atoms/Bonds">
          <MenuItem label="Show" icon={<Eye className="w-3 h-3" />} onClick={() => handleVisibility('show')} />
          <MenuItem label="Hide" icon={<EyeOff className="w-3 h-3" />} onClick={() => handleVisibility('hide')} />
          <div className="border-t border-gray-200 my-1" />
          <MenuItem label="Ball and Stick" onClick={() => handleRepresentation('ball-and-stick')} />
          <MenuItem label="Stick" onClick={() => handleRepresentation('stick')} />
          <MenuItem label="Sphere" onClick={() => handleRepresentation('sphere')} />
        </MenuItem>
        
        <MenuItem label="Label" icon={<Tag className="w-3 h-3" />}>
          <MenuItem label="Residue Name" onClick={() => handleLabels('residue')} />
          <MenuItem label="Atom Name" onClick={() => handleLabels('atom')} />
          <div className="border-t border-gray-200 my-1" />
          <MenuItem label="Off" onClick={() => handleLabels('off')} />
        </MenuItem>
      </DropdownMenu>
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Selection Indicator */}
      <SelectionIndicator 
        hasSelection={hasSel} 
        count={selectionCount} 
        selectionLabel={selectionLabel}
      />
    </div>
  );
};

export default MolstarToolbar;

