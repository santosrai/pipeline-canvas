import React from 'react';
import { Position } from 'reactflow';
import { Globe } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { ErrorDisplay } from './ErrorDisplay';

const HttpRequestNode: React.FC<{ data: any }> = ({ data }) => {
  const urlPreview = data.config?.url
    ? data.config.url.length > 30
      ? data.config.url.substring(0, 30) + '...'
      : data.config.url
    : 'No URL';

  const content = (
    <div className="text-xs text-[hsl(var(--pc-text-muted))] space-y-1 pl-10">
      <div className="flex items-center gap-2">
        <span className="font-medium">{data.config?.method || 'GET'}</span>
        <span className="text-[hsl(var(--pc-text-secondary))]">•</span>
        <span className="truncate">{urlPreview}</span>
      </div>
      {data.error && <ErrorDisplay error={data.error} />}
    </div>
  );

  return (
    <BaseNode
      data={data}
      icon={Globe}
      label="HTTP Request"
      defaultLabel="HTTP Request"
      handles={[
        { type: 'target', position: Position.Left },
        { type: 'source', position: Position.Right },
      ]}
      content={content}
      defaultIconBg="bg-blue-100"
      defaultIconColor="text-blue-600"
    />
  );
};

export default HttpRequestNode;
