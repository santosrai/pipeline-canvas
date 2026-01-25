import React from 'react';
import { Position } from 'reactflow';
import { Atom } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { ErrorDisplay } from './ErrorDisplay';

const AlphaFoldNode: React.FC<{ data: any }> = ({ data }) => {
  const content = (
    <div className="text-xs text-gray-500 space-y-1 pl-10">
      <div>Recycles: {data.config?.recycle_count || 'N/A'}</div>
      {data.error && <ErrorDisplay error={data.error} />}
    </div>
  );

  return (
    <BaseNode
      data={data}
      icon={Atom}
      label="AlphaFold"
      defaultLabel="AlphaFold"
      handles={[
        { type: 'target', position: Position.Left },
        { type: 'source', position: Position.Right },
      ]}
      content={content}
      defaultIconBg="bg-orange-100"
      defaultIconColor="text-orange-600"
    />
  );
};

export default AlphaFoldNode;
