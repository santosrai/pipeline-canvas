import React from 'react';
import { Position } from 'reactflow';
import { FileInput } from 'lucide-react';
import { BaseNode } from './BaseNode';

const InputNode: React.FC<{ data: any }> = ({ data }) => {
  // Allow clicks to propagate to React Flow so node selection works
  // Both single and double clicks will open the settings panel

  const content = (
    <div className="text-xs text-gray-500 pl-10">
      {data.config?.filename || 'No file selected'}
    </div>
  );

  return (
    <BaseNode
      data={data}
      icon={FileInput}
      label="Input"
      defaultLabel="Input"
      handles={[{ type: 'source', position: Position.Right }]}
      content={content}
      defaultIconBg="bg-blue-100"
      defaultIconColor="text-blue-600"
    />
  );
};

export default InputNode;
