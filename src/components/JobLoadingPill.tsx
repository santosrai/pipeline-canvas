import React, { useState, useEffect, useRef } from 'react';
import { X, Clock } from 'lucide-react';
import { api } from '../utils/api';
import { Message } from '../stores/chatHistoryStore';
import { JobPoller, JobStatus } from '../utils/jobPoller';

interface JobLoadingPillProps {
  message: Message;
  onJobComplete: (pdbData: any) => void;
  onJobError: (error: string) => void;
  onCancel?: () => void;
}

export const JobLoadingPill: React.FC<JobLoadingPillProps> = ({
  message,
  onJobComplete,
  onJobError,
  onCancel
}) => {
  const [status, setStatus] = useState<'running' | 'completed' | 'error'>('running');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const pollerRef = useRef<JobPoller | null>(null);

  // Initialize job poller
  useEffect(() => {
    if (!message.jobId || status !== 'running') return;

    const poller = new JobPoller({
      jobId: message.jobId,
      jobType: (message.jobType === 'proteinmpnn' ? 'alphafold' : message.jobType) || 'alphafold',
      enableWebSocket: true,
      maxPollTime: 7200, // 2 hours
      onUpdate: (jobStatus: JobStatus) => {
        setProgress(jobStatus.progress || 0);
        if (jobStatus.progress_message) {
          setProgressMessage(jobStatus.progress_message);
        }
        if (jobStatus.status === 'error') {
          setStatus('error');
        }
      },
      onComplete: (data: any) => {
        setStatus('completed');
        setProgress(100);
        onJobComplete(data);
      },
      onError: (error: string) => {
        setStatus('error');
        onJobError(error);
      }
    });

    pollerRef.current = poller;
    poller.start();

    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [message.jobId, message.jobType, status, onJobComplete, onJobError]);

  // Elapsed time counter
  useEffect(() => {
    if (status !== 'running') return;
    
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getJobDisplayName = () => {
    return message.jobType === 'rfdiffusion' ? 'Protein Design' : 'Protein Folding';
  };

  const getEstimatedTime = () => {
    return message.jobType === 'rfdiffusion' ? '2-8 min' : '2-5 min';
  };

  const handleCancel = async () => {
    if (!message.jobId) return;
    
    try {
      const endpoint = message.jobType === 'rfdiffusion' 
        ? `/api/rfdiffusion/cancel/${message.jobId}`
        : `/api/alphafold/cancel/${message.jobId}`;
        
      await api.post(endpoint);
      
      // Stop poller
      if (pollerRef.current) {
        pollerRef.current.stop();
      }
      
      setStatus('error');
      onCancel?.();
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  if (status === 'completed') {
    return null; // Don't show pill when completed, PDB data will be shown instead
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 my-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Animated Icon */}
          <div className="relative">
            {message.jobType === 'rfdiffusion' ? (
              <div className="w-6 h-6 text-blue-600 animate-spin">🧬</div>
            ) : (
              <div className="w-6 h-6 text-blue-600 animate-pulse">🔬</div>
            )}
          </div>
          
          {/* Status and Progress */}
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-blue-800">
                {getJobDisplayName()} in progress...
              </span>
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-2 flex items-center space-x-2">
              <div className="flex-1 bg-blue-100 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="text-xs text-blue-600 font-mono min-w-[3rem]">
                {Math.round(progress)}%
              </span>
            </div>
            
            {/* Progress Message */}
            {progressMessage && (
              <div className="mt-1 text-xs text-blue-600 italic">
                {progressMessage}
              </div>
            )}
            
            {/* Time Info */}
            <div className="mt-1 flex items-center space-x-4 text-xs text-blue-600">
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Elapsed: {formatTime(elapsedTime)}</span>
              </div>
              <span>Est. {getEstimatedTime()}</span>
              <span>Job: {message.jobId?.slice(-6)}</span>
            </div>
          </div>
        </div>
        
        {/* Cancel Button */}
        {onCancel && (
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-blue-100 rounded-full transition-colors"
            title="Cancel job"
          >
            <X className="w-4 h-4 text-blue-600" />
          </button>
        )}
      </div>
      
      {/* Status Messages */}
      {status === 'error' && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          Job failed or was cancelled
        </div>
      )}
    </div>
  );
};