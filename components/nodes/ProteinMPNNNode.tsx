import React from 'react';
import { Position } from 'reactflow';
import { Dna } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { ErrorDisplay } from './ErrorDisplay';

const ProteinMPNNNode: React.FC<{ data: any }> = ({ data }) => {
  const content = (
    <div className="text-xs text-[hsl(var(--pc-text-muted))] space-y-1 pl-10">
      <div>Sequences: {data.config?.num_sequences || 'N/A'}</div>
      {data.error && <ErrorDisplay error={data.error} />}
    </div>
  );

  return (
    <BaseNode
      data={data}
      icon={Dna}
      label="ProteinMPNN"
      defaultLabel="ProteinMPNN"
      handles={[
        { type: 'target', position: Position.Left },
        { type: 'source', position: Position.Right },
      ]}
      content={content}
      defaultIconBg="bg-green-100"
      defaultIconColor="text-green-600"
    />
  );
};

export default ProteinMPNNNode;
