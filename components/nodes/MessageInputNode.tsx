import React from 'react';
import { Position } from 'reactflow';
import { MessageSquare } from 'lucide-react';
import { BaseNode } from './BaseNode';

const MessageInputNode: React.FC<{ data: any }> = ({ data }) => {
  const codePreview = data.config?.code
    ? data.config.code.length > 40
      ? data.config.code.substring(0, 40).replace(/\n/g, ' ') + '...'
      : data.config.code.replace(/\n/g, ' ')
    : 'No code';

  const content = (
    <div className="text-xs text-gray-500 pl-10 font-mono">{codePreview}</div>
  );

  return (
    <BaseNode
      data={data}
      icon={MessageSquare}
      label="Code Execution"
      defaultLabel="Code Execution"
      handles={[{ type: 'source', position: Position.Right }]}
      content={content}
      defaultIconBg="bg-green-100"
      defaultIconColor="text-green-600"
    />
  );
};

export default MessageInputNode;
