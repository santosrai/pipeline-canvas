/**
 * Comprehensive Error Handling System for AlphaFold & RFdiffusion Integration
 * Provides user-friendly error messages with detailed technical information
 */

export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network', 
  API = 'api',
  PROCESSING = 'processing',
  SYSTEM = 'system',
  AUTH = 'auth',
  TIMEOUT = 'timeout',
  QUOTA = 'quota'
}

export enum ErrorSeverity {
  LOW = 'low',       // Minor issues, user can continue
  MEDIUM = 'medium', // Significant issues, some features affected
  HIGH = 'high',     // Major issues, primary functionality blocked
  CRITICAL = 'critical' // System-wide issues, requires immediate attention
}

export interface ErrorDetails {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  userMessage: string;
  technicalMessage: string;
  context: Record<string, any>;
  suggestions: ErrorSuggestion[];
  timestamp: Date;
  requestId?: string;
  stack?: string;
}

export interface ErrorSuggestion {
  action: string;
  description: string;
  type: 'retry' | 'fix' | 'alternative' | 'contact';
  autoFixable?: boolean;
  priority: number; // 1 = highest priority
}

export class AlphaFoldErrorHandler {
  private static errorCatalog: Record<string, Partial<ErrorDetails>> = {
    // Validation Errors
    'SEQUENCE_EMPTY': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'No protein sequence provided',
      technicalMessage: 'Sequence input is empty or contains only whitespace',
      suggestions: [
        {
          action: 'Enter a protein sequence',
          description: 'Provide a valid amino acid sequence (20-2000 residues)',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Extract from PDB',
          description: 'Use "fold PDB:1ABC" to extract sequence from a PDB structure',
          type: 'alternative',
          priority: 2
        }
      ]
    },

    'SEQUENCE_TOO_SHORT': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Protein sequence is too short for folding',
      technicalMessage: 'Sequence length is below minimum threshold of 20 residues',
      suggestions: [
        {
          action: 'Use longer sequence',
          description: 'AlphaFold requires at least 20 amino acids for reliable predictions',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Check sequence format',
          description: 'Ensure you\'re using the full protein sequence, not a fragment',
          type: 'fix',
          priority: 2
        }
      ]
    },

    'SEQUENCE_TOO_LONG': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      userMessage: 'Protein sequence exceeds maximum length',
      technicalMessage: 'Sequence length exceeds maximum threshold of 2000 residues',
      suggestions: [
        {
          action: 'Use domain-specific sequence',
          description: 'Try folding individual protein domains (100-400 residues)',
          type: 'alternative',
          priority: 1
        },
        {
          action: 'Split into fragments',
          description: 'Divide the sequence into smaller, functionally relevant segments',
          type: 'alternative',
          priority: 2
        }
      ]
    },

    'INVALID_AMINO_ACIDS': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      userMessage: 'Sequence contains invalid characters',
      technicalMessage: 'Non-standard amino acid codes detected in sequence',
      suggestions: [
        {
          action: 'Use standard amino acids only',
          description: 'Replace invalid characters with standard 20 amino acids (A-Z excluding B,J,O,U,X,Z)',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Remove non-amino acid characters',
          description: 'Clean sequence by removing spaces, numbers, and special characters',
          type: 'fix',
          autoFixable: true,
          priority: 2
        }
      ]
    },

    // Network/API Errors
    'API_UNAVAILABLE': {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      userMessage: 'AlphaFold service is currently unavailable',
      technicalMessage: 'Unable to connect to NVIDIA NIMS API endpoint',
      suggestions: [
        {
          action: 'Try again in a few minutes',
          description: 'The service may be temporarily down for maintenance',
          type: 'retry',
          priority: 1
        },
        {
          action: 'Check your internet connection',
          description: 'Ensure you have a stable internet connection',
          type: 'fix',
          priority: 2
        },
        {
          action: 'Contact support',
          description: 'If the issue persists, report the outage to our support team',
          type: 'contact',
          priority: 3
        }
      ]
    },

    'API_KEY_INVALID': {
      category: ErrorCategory.AUTH,
      severity: ErrorSeverity.CRITICAL,
      userMessage: 'Authentication failed',
      technicalMessage: 'NVIDIA NIMS API key is invalid or expired',
      suggestions: [
        {
          action: 'Check API key configuration',
          description: 'Verify that NVCF_RUN_KEY environment variable is set correctly',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Renew API key',
          description: 'Generate a new API key from NVIDIA NGC console',
          type: 'fix',
          priority: 2
        },
        {
          action: 'Contact administrator',
          description: 'Ask your system administrator to update the API credentials',
          type: 'contact',
          priority: 3
        }
      ]
    },

    'QUOTA_EXCEEDED': {
      category: ErrorCategory.QUOTA,
      severity: ErrorSeverity.HIGH,
      userMessage: 'Daily folding limit reached',
      technicalMessage: 'API quota exceeded for current billing period',
      suggestions: [
        {
          action: 'Wait for quota reset',
          description: 'Your quota will reset at midnight UTC',
          type: 'retry',
          priority: 1
        },
        {
          action: 'Upgrade plan',
          description: 'Consider upgrading to a higher-tier plan for more folding capacity',
          type: 'alternative',
          priority: 2
        },
        {
          action: 'Prioritize important sequences',
          description: 'Use your remaining quota for the most critical protein structures',
          type: 'alternative',
          priority: 3
        }
      ]
    },

    // Processing Errors
    'FOLDING_FAILED': {
      category: ErrorCategory.PROCESSING,
      severity: ErrorSeverity.HIGH,
      userMessage: 'Protein folding computation failed',
      technicalMessage: 'AlphaFold2 model failed to converge during structure prediction',
      suggestions: [
        {
          action: 'Try different parameters',
          description: 'Experiment with different MSA databases or algorithms',
          type: 'alternative',
          priority: 1
        },
        {
          action: 'Check sequence quality',
          description: 'Ensure the sequence is from a real protein, not synthetic',
          type: 'fix',
          priority: 2
        },
        {
          action: 'Retry with relaxation',
          description: 'Enable energy minimization for potentially better results',
          type: 'retry',
          priority: 3
        }
      ]
    },

    'TIMEOUT': {
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Folding request timed out',
      technicalMessage: 'Request exceeded maximum processing time limit',
      suggestions: [
        {
          action: 'Try a shorter sequence',
          description: 'Longer proteins take more time to fold - consider using domains',
          type: 'alternative',
          priority: 1
        },
        {
          action: 'Reduce iterations',
          description: 'Lower the iteration count to speed up processing',
          type: 'fix',
          priority: 2
        },
        {
          action: 'Retry during off-peak hours',
          description: 'Try again when the service is less busy',
          type: 'retry',
          priority: 3
        }
      ]
    },

    // System Errors
    'PDB_NOT_FOUND': {
      category: ErrorCategory.API,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'PDB structure not found',
      technicalMessage: 'Specified PDB ID does not exist in the database',
      suggestions: [
        {
          action: 'Check PDB ID format',
          description: 'Ensure the PDB ID is 4 characters (e.g., 1ABC, 2XYZ)',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Search PDB database',
          description: 'Verify the PDB ID exists at rcsb.org',
          type: 'fix',
          priority: 2
        },
        {
          action: 'Provide sequence directly',
          description: 'Instead of PDB ID, paste the amino acid sequence directly',
          type: 'alternative',
          priority: 3
        }
      ]
    },

    'CHAIN_NOT_FOUND': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Specified chain not found in structure',
      technicalMessage: 'Requested chain identifier does not exist in the PDB structure',
      suggestions: [
        {
          action: 'Check available chains',
          description: 'View the PDB structure to see which chains are available',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Use all chains',
          description: 'Omit chain specification to fold the entire structure',
          type: 'alternative',
          priority: 2
        },
        {
          action: 'Try different chain ID',
          description: 'Common chain IDs are A, B, C, etc.',
          type: 'fix',
          priority: 3
        }
      ]
    }
  };

  static createError(
    code: string, 
    context: Record<string, any> = {},
    technicalDetails?: string,
    stack?: string,
    requestId?: string
  ): ErrorDetails {
    const template = this.errorCatalog[code];
    
    if (!template) {
      // Fallback for unknown errors
      return {
        code: 'UNKNOWN_ERROR',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        userMessage: 'An unexpected error occurred',
        technicalMessage: technicalDetails || 'Unknown error occurred during processing',
        context,
        suggestions: [
          {
            action: 'Try again',
            description: 'The error might be temporary',
            type: 'retry',
            priority: 1
          },
          {
            action: 'Contact support',
            description: 'Report this issue with the error details',
            type: 'contact',
            priority: 2
          }
        ],
        timestamp: new Date(),
        requestId,
        stack
      };
    }

    // Customize error message with context
    let userMessage = template.userMessage!;
    let technicalMessage = template.technicalMessage!;

    // Inject context into messages
    if (context.sequenceLength) {
      userMessage = userMessage.replace(/\d+-\d+ residues/, `${context.sequenceLength} residues`);
      technicalMessage += ` (sequence length: ${context.sequenceLength})`;
    }

    if (context.invalidCharacters) {
      technicalMessage += ` Invalid characters: ${context.invalidCharacters.join(', ')}`;
    }

    if (context.pdbId) {
      userMessage = userMessage.replace(/PDB structure/, `PDB structure ${context.pdbId}`);
      technicalMessage += ` (PDB ID: ${context.pdbId})`;
    }

    return {
      code,
      category: template.category!,
      severity: template.severity!,
      userMessage,
      technicalMessage: technicalDetails || technicalMessage,
      context,
      suggestions: template.suggestions!,
      timestamp: new Date(),
      requestId,
      stack
    };
  }

  static handleSequenceValidation(sequence: string, requestId?: string): ErrorDetails | null {
    const cleanSeq = sequence.replace(/\s/g, '').toUpperCase();
    
    if (!cleanSeq) {
      return this.createError('SEQUENCE_EMPTY', { originalInput: sequence }, undefined, undefined, requestId);
    }

    if (cleanSeq.length < 20) {
      return this.createError('SEQUENCE_TOO_SHORT', { 
        sequenceLength: cleanSeq.length,
        sequence: cleanSeq.slice(0, 50) + (cleanSeq.length > 50 ? '...' : '')
      }, undefined, undefined, requestId);
    }

    if (cleanSeq.length > 2000) {
      return this.createError('SEQUENCE_TOO_LONG', {
        sequenceLength: cleanSeq.length,
        sequence: cleanSeq.slice(0, 50) + '...'
      }, undefined, undefined, requestId);
    }

    const validAA = /^[ACDEFGHIKLMNPQRSTVWY]+$/;
    if (!validAA.test(cleanSeq)) {
      const invalidCharacters = [...new Set(cleanSeq.split('').filter(c => !/[ACDEFGHIKLMNPQRSTVWY]/.test(c)))];
      return this.createError('INVALID_AMINO_ACIDS', {
        invalidCharacters,
        sequenceLength: cleanSeq.length,
        sequence: cleanSeq.slice(0, 50) + (cleanSeq.length > 50 ? '...' : '')
      }, undefined, undefined, requestId);
    }

    return null; // No errors
  }

  static handleAPIError(error: any, requestId?: string): ErrorDetails {
    if (error.response?.status === 401) {
      return this.createError('API_KEY_INVALID', {
        statusCode: 401,
        endpoint: error.config?.url
      }, error.message, error.stack, requestId);
    }

    if (error.response?.status === 429) {
      return this.createError('QUOTA_EXCEEDED', {
        statusCode: 429,
        retryAfter: error.response?.headers['retry-after']
      }, error.message, error.stack, requestId);
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return this.createError('API_UNAVAILABLE', {
        errorCode: error.code,
        endpoint: error.config?.url
      }, error.message, error.stack, requestId);
    }

    if (error.code === 'ETIMEDOUT') {
      return this.createError('TIMEOUT', {
        timeout: error.config?.timeout,
        endpoint: error.config?.url
      }, error.message, error.stack, requestId);
    }

    // Generic API error
    return this.createError('UNKNOWN_ERROR', {
      apiError: true,
      statusCode: error.response?.status,
      endpoint: error.config?.url
    }, error.message, error.stack, requestId);
  }

  static handlePDBError(pdbId: string, chain?: string, requestId?: string): ErrorDetails {
    if (chain) {
      return this.createError('CHAIN_NOT_FOUND', {
        pdbId,
        chain,
        availableChains: [] // Would be populated from actual PDB data
      }, undefined, undefined, requestId);
    } else {
      return this.createError('PDB_NOT_FOUND', {
        pdbId,
        searchUrl: `https://www.rcsb.org/search?request=${pdbId}`
      }, undefined, undefined, requestId);
    }
  }

  static getSeverityColor(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.LOW: return 'text-yellow-700';
      case ErrorSeverity.MEDIUM: return 'text-orange-700';
      case ErrorSeverity.HIGH: return 'text-red-700';
      case ErrorSeverity.CRITICAL: return 'text-red-900';
      default: return 'text-gray-700';
    }
  }

  static getSeverityIcon(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.LOW: return '⚠️';
      case ErrorSeverity.MEDIUM: return '🔶';
      case ErrorSeverity.HIGH: return '🔴';
      case ErrorSeverity.CRITICAL: return '💥';
      default: return 'ℹ️';
    }
  }
}

export class RFdiffusionErrorHandler {
  private static errorCatalog: Record<string, Partial<ErrorDetails>> = {
    // Validation Errors
    'CONTIGS_EMPTY': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Contigs specification is required',
      technicalMessage: 'Contigs parameter cannot be empty for protein design',
      suggestions: [
        {
          action: 'Specify contigs',
          description: 'Enter a valid contigs specification like "A50-150" or "A20-60/0 50-100"',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Use default',
          description: 'Use default unconditional design contigs',
          type: 'alternative',
          priority: 2
        }
      ]
    },

    'CONTIGS_INVALID': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Invalid contigs format',
      technicalMessage: 'Contigs specification does not match expected format',
      suggestions: [
        {
          action: 'Fix format',
          description: 'Use formats like "A50-150", "A20-60/0 50-100", or "100-200"',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Check examples',
          description: 'Review contigs format examples in the documentation',
          type: 'fix',
          priority: 2
        }
      ]
    },

    'DIFFUSION_STEPS_INVALID': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Invalid diffusion steps value',
      technicalMessage: 'Diffusion steps must be between 1 and 100',
      suggestions: [
        {
          action: 'Use valid range',
          description: 'Enter a number between 1 and 100 for diffusion steps',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Use preset',
          description: 'Choose a complexity preset (Simple=10, Medium=15, Complex=25)',
          type: 'alternative',
          priority: 2
        }
      ]
    },

    'PDB_INVALID': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Invalid PDB structure',
      technicalMessage: 'Provided PDB content or ID is not valid for design',
      suggestions: [
        {
          action: 'Check PDB ID',
          description: 'Ensure PDB ID is 4 characters (e.g., 1R42)',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Validate PDB content',
          description: 'Ensure PDB contains ATOM records',
          type: 'fix',
          priority: 2
        }
      ]
    },

    // API Errors
    'RFDIFFUSION_API_NOT_CONFIGURED': {
      category: ErrorCategory.AUTH,
      severity: ErrorSeverity.HIGH,
      userMessage: 'RFdiffusion service not available',
      technicalMessage: 'NVIDIA API key not configured for RFdiffusion',
      suggestions: [
        {
          action: 'Contact administrator',
          description: 'Request NVIDIA API key configuration',
          type: 'contact',
          priority: 1
        }
      ]
    },

    'DESIGN_FAILED': {
      category: ErrorCategory.PROCESSING,
      severity: ErrorSeverity.HIGH,
      userMessage: 'Protein design failed',
      technicalMessage: 'RFdiffusion computation could not complete',
      suggestions: [
        {
          action: 'Try different parameters',
          description: 'Adjust diffusion steps, contigs, or design mode',
          type: 'alternative',
          priority: 1
        },
        {
          action: 'Simplify design',
          description: 'Use fewer diffusion steps or simpler contigs',
          type: 'fix',
          priority: 2
        },
        {
          action: 'Retry with relaxation',
          description: 'Enable energy minimization for better results',
          type: 'retry',
          priority: 3
        }
      ]
    },

    'DESIGN_TIMEOUT': {
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Design process timed out',
      technicalMessage: 'RFdiffusion request exceeded maximum processing time',
      suggestions: [
        {
          action: 'Reduce complexity',
          description: 'Use fewer diffusion steps for faster processing',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Try again later',
          description: 'Server may be experiencing high load',
          type: 'retry',
          priority: 2
        }
      ]
    },

    'HOTSPOTS_INVALID': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Invalid hotspot residues',
      technicalMessage: 'Hotspot residue specification is malformed',
      suggestions: [
        {
          action: 'Fix format',
          description: 'Use format like "A50, A51, A52" for hotspot residues',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Remove hotspots',
          description: 'Design without hotspot constraints',
          type: 'alternative',
          priority: 2
        }
      ]
    },

    'TEMPLATE_NOT_FOUND': {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Template structure not found',
      technicalMessage: 'Specified PDB template could not be retrieved',
      suggestions: [
        {
          action: 'Check PDB ID',
          description: 'Verify the PDB ID exists and is accessible',
          type: 'fix',
          priority: 1
        },
        {
          action: 'Use unconditional design',
          description: 'Design without a template structure',
          type: 'alternative',
          priority: 2
        }
      ]
    }
  };

  static createError(
    code: string, 
    context: Record<string, any> = {},
    technicalDetails?: string,
    stack?: string,
    requestId?: string
  ): ErrorDetails {
    const template = this.errorCatalog[code];
    
    if (!template) {
      // Fallback for unknown errors
      return {
        code: 'UNKNOWN_ERROR',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        userMessage: 'An unexpected error occurred',
        technicalMessage: technicalDetails || 'Unknown error occurred during protein design',
        context,
        suggestions: [
          {
            action: 'Try again',
            description: 'The error might be temporary',
            type: 'retry',
            priority: 1
          },
          {
            action: 'Contact support',
            description: 'Report this issue with the error details',
            type: 'contact',
            priority: 2
          }
        ],
        timestamp: new Date(),
        requestId,
        stack
      };
    }

    return {
      code,
      category: template.category!,
      severity: template.severity!,
      userMessage: template.userMessage!,
      technicalMessage: technicalDetails || template.technicalMessage!,
      context,
      suggestions: template.suggestions!,
      timestamp: new Date(),
      requestId,
      stack
    };
  }

  static createValidationError(message: string, context: Record<string, any> = {}): ErrorDetails {
    return this.createError('VALIDATION_GENERIC', context, message);
  }

  static createNetworkError(message: string, context: Record<string, any> = {}): ErrorDetails {
    return this.createError('NETWORK_ERROR', context, message);
  }

  static handleError(error: any, context: Record<string, any> = {}): ErrorDetails {
    if (error?.code && this.errorCatalog[error.code]) {
      return this.createError(error.code, { ...context, originalError: error }, error.message);
    }

    // Try to categorize unknown errors
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return this.createNetworkError(errorMessage, context);
    }

    if (lowerMessage.includes('timeout')) {
      return this.createError('DESIGN_TIMEOUT', context, errorMessage);
    }

    if (lowerMessage.includes('api key') || lowerMessage.includes('unauthorized')) {
      return this.createError('RFDIFFUSION_API_NOT_CONFIGURED', context, errorMessage);
    }

    if (lowerMessage.includes('contigs')) {
      return this.createError('CONTIGS_INVALID', context, errorMessage);
    }

    // Generic error fallback
    return this.createError('UNKNOWN_ERROR', context, errorMessage, error?.stack);
  }
}