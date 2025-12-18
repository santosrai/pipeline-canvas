import React from 'react';
import { Handle, Position } from 'reactflow';

interface CustomHandleProps {
  type: 'source' | 'target';
  position: Position;
}

export const CustomHandle: React.FC<CustomHandleProps> = ({ type, position }) => {
  const isLeft = position === Position.Left;
  return (
    <Handle
      type={type}
      position={position}
      className="custom-handle"
      style={isLeft ? { left: -6 } : { right: -6 }}
    />
  );
};

