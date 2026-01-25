import React from 'react';
import { AlertCircle } from 'lucide-react';

export const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => (
  <div className="text-red-600 flex items-center gap-1">
    <AlertCircle className="w-3 h-3" />
    {error}
  </div>
);
