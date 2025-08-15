import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  position?: 'left' | 'right';
  onWidthChange?: (width: number) => void;
  className?: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  defaultWidth = 300,
  minWidth = 250,
  maxWidth = 600,
  position = 'left',
  onWidthChange,
  className = '',
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // Constrain width within bounds
  const constrainWidth = useCallback((newWidth: number) => {
    return Math.max(minWidth, Math.min(maxWidth, newWidth));
  }, [minWidth, maxWidth]);

  // Handle mouse down on resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(width);
    
    // Add global cursor style
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = position === 'left' ? e.clientX - startX : startX - e.clientX;
    const newWidth = constrainWidth(startWidth + deltaX);
    
    setWidth(newWidth);
    onWidthChange?.(newWidth);
  }, [isResizing, startX, startWidth, constrainWidth, onWidthChange, position]);

  // Handle mouse up to end resize
  const handleMouseUp = useCallback(() => {
    if (!isResizing) return;

    setIsResizing(false);
    
    // Remove global cursor style
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [isResizing]);

  // Handle double-click to reset to default width
  const handleDoubleClick = useCallback(() => {
    const newWidth = constrainWidth(defaultWidth);
    setWidth(newWidth);
    onWidthChange?.(newWidth);
    
    // Show feedback for reset action
    const handle = handleRef.current;
    if (handle) {
      handle.style.backgroundColor = '#10b981'; // green
      setTimeout(() => {
        handle.style.backgroundColor = '';
      }, 300);
    }
  }, [defaultWidth, constrainWidth, onWidthChange]);

  // Add global mouse event listeners during resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Handle keyboard shortcuts for resizing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!panelRef.current?.contains(document.activeElement)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        const newWidth = constrainWidth(width + 20);
        setWidth(newWidth);
        onWidthChange?.(newWidth);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        const newWidth = constrainWidth(width - 20);
        setWidth(newWidth);
        onWidthChange?.(newWidth);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        const newWidth = constrainWidth(defaultWidth);
        setWidth(newWidth);
        onWidthChange?.(newWidth);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [width, defaultWidth, constrainWidth, onWidthChange]);

  const handleStyle = position === 'left' 
    ? { right: -2 } 
    : { left: -2 };

  return (
    <div
      ref={panelRef}
      className={`relative flex-shrink-0 border-gray-200 ${
        position === 'left' ? 'border-r' : 'border-l'
      } ${className}`}
      style={{ 
        width: `${width}px`,
        transition: isResizing ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Panel Content */}
      <div className="h-full overflow-hidden">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        ref={handleRef}
        className={`absolute top-0 bottom-0 w-1 group cursor-col-resize z-10 ${
          position === 'left' ? 'right-0' : 'left-0'
        }`}
        style={handleStyle}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize | Double-click to reset | Ctrl+/- to adjust"
      >
        {/* Invisible hit area for easier grabbing */}
        <div className="absolute inset-0 w-4 -translate-x-1.5" />
        
        {/* Visual resize handle */}
        <div 
          className={`h-full w-1 bg-transparent group-hover:bg-blue-300 transition-colors ${
            isResizing ? 'bg-blue-500' : ''
          }`}
        />
        
        {/* Resize handle icon (visible on hover) */}
        <div 
          className={`absolute top-1/2 -translate-y-1/2 ${
            position === 'left' ? '-right-1' : '-left-1'
          } opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-300 rounded p-0.5 shadow-sm ${
            isResizing ? 'opacity-100' : ''
          }`}
        >
          <GripVertical className="w-3 h-3 text-gray-400" />
        </div>
      </div>

      {/* Resize overlay for visual feedback */}
      {isResizing && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black bg-opacity-5" />
          <div 
            className="absolute top-0 bottom-0 bg-blue-200 bg-opacity-30 border-2 border-blue-400 border-dashed"
            style={{
              [position === 'left' ? 'left' : 'right']: 0,
              width: `${width}px`
            }}
          />
          {/* Width indicator */}
          <div 
            className="absolute top-4 bg-blue-600 text-white px-2 py-1 rounded shadow-lg text-xs font-medium"
            style={{
              [position === 'left' ? 'left' : 'right']: `${width + 10}px`,
            }}
          >
            {width}px
          </div>
        </div>
      )}
    </div>
  );
};