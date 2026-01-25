import React from 'react';
import { Position } from 'reactflow';
import { Sparkles } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { ErrorDisplay } from './ErrorDisplay';

const RFdiffusionNode: React.FC<{ data: any }> = ({ data }) => {
  const content = (
    <div className="text-xs text-[hsl(var(--pc-text-muted))] space-y-1 pl-10">
      <div>Contigs: {data.config?.contigs || 'N/A'}</div>
      {data.error && <ErrorDisplay error={data.error} />}
    </div>
  );

  return (
    <BaseNode
      data={data}
      icon={Sparkles}
      label="RFdiffusion"
      defaultLabel="RFdiffusion"
      handles={[
        { type: 'target', position: Position.Left },
        { type: 'source', position: Position.Right },
      ]}
      content={content}
      defaultIconBg="bg-purple-100"
      defaultIconColor="text-purple-600"
    />
  );
};

export default RFdiffusionNode;
