/**
 * AlphaFold integration utilities
 * Helper functions for managing AlphaFold folding requests and results
 */

export interface AlphaFoldParameters {
  algorithm: 'mmseqs2' | 'jackhmmer';
  e_value: number;
  iterations: number;
  databases: string[];
  relax_prediction: boolean;
  skip_template_search: boolean;
}

export interface AlphaFoldResult {
  pdbContent: string;
  filename: string;
  sequence: string;
  parameters: AlphaFoldParameters;
  metadata?: {
    sequence_length: number;
    job_id: string;
    processing_time: string;
    confidence_scores: string;
  };
}

export interface AlphaFoldJobStatus {
  job_id: string;
  status: 'running' | 'completed' | 'error' | 'cancelled' | 'not_found';
  progress?: number;
  message?: string;
}

/**
 * Validate a protein sequence
 */
export function validateSequence(sequence: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const cleanSeq = sequence.replace(/\s/g, '').toUpperCase();
  
  if (!cleanSeq) {
    errors.push('Sequence cannot be empty');
    return { isValid: false, errors };
  }
  
  // Check for valid amino acids
  const validAA = /^[ACDEFGHIKLMNPQRSTVWY]+$/;
  if (!validAA.test(cleanSeq)) {
    const invalidChars = [...new Set(cleanSeq.split('').filter(c => !/[ACDEFGHIKLMNPQRSTVWY]/.test(c)))];
    errors.push(`Invalid amino acids: ${invalidChars.join(', ')}`);
  }
  
  // Check length constraints
  if (cleanSeq.length < 20) {
    errors.push(`Sequence too short (${cleanSeq.length} residues). Minimum: 20`);
  } else if (cleanSeq.length > 2000) {
    errors.push(`Sequence too long (${cleanSeq.length} residues). Maximum: 2000`);
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Estimate folding time based on sequence length and parameters
 */
export function estimateFoldingTime(sequence: string, parameters: AlphaFoldParameters): string {
  const seqLen = sequence.replace(/\s/g, '').length;
  
  let baseTime = '';
  if (seqLen < 100) baseTime = '2-5 minutes';
  else if (seqLen < 300) baseTime = '5-15 minutes';
  else if (seqLen < 600) baseTime = '15-30 minutes';
  else baseTime = '30-60 minutes';
  
  // Adjust for parameters
  if (parameters.relax_prediction) {
    baseTime = baseTime.replace('minutes', 'minutes (+relaxation)');
  }
  
  if (parameters.iterations > 1) {
    baseTime += ` (×${parameters.iterations})`;
  }
  
  return baseTime;
}

/**
 * Get default AlphaFold parameters
 */
export function getDefaultParameters(): AlphaFoldParameters {
  return {
    algorithm: 'mmseqs2',
    e_value: 0.0001,
    iterations: 1,
    databases: ['small_bfd'],
    relax_prediction: false,
    skip_template_search: true
  };
}

/**
 * Parse sequence from various input formats
 */
export function parseSequenceInput(input: string): { sequence: string; format: 'raw' | 'fasta' } {
  const trimmed = input.trim();
  
  if (trimmed.startsWith('>')) {
    // FASTA format
    const lines = trimmed.split('\n');
    const sequence = lines.slice(1).join('').replace(/\s/g, '').toUpperCase();
    return { sequence, format: 'fasta' };
  } else {
    // Raw sequence
    const sequence = trimmed.replace(/\s/g, '').toUpperCase();
    return { sequence, format: 'raw' };
  }
}

/**
 * Generate a mock PDB structure for testing
 */
export function generateMockPDB(sequence: string, jobId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  
  const header = `HEADER    ALPHAFOLD PREDICTION                    ${date}
TITLE     ALPHAFOLD2 STRUCTURE PREDICTION - JOB ${jobId}
MODEL        1`;
  
  const atoms = sequence.split('').map((aa, i) => {
    const residueNum = (i + 1).toString().padStart(4, ' ');
    const atomNum = (i * 4 + 1).toString().padStart(5, ' ');
    
    // Map amino acid to 3-letter code
    const aaMap: { [key: string]: string } = {
      'A': 'ALA', 'R': 'ARG', 'N': 'ASN', 'D': 'ASP', 'C': 'CYS',
      'Q': 'GLN', 'E': 'GLU', 'G': 'GLY', 'H': 'HIS', 'I': 'ILE',
      'L': 'LEU', 'K': 'LYS', 'M': 'MET', 'F': 'PHE', 'P': 'PRO',
      'S': 'SER', 'T': 'THR', 'W': 'TRP', 'Y': 'TYR', 'V': 'VAL'
    };
    
    const resName = aaMap[aa] || 'ALA';
    
    // Generate random coordinates (simplified)
    const x = (Math.random() * 50).toFixed(3).padStart(8, ' ');
    const y = (Math.random() * 50).toFixed(3).padStart(8, ' ');
    const z = (Math.random() * 50).toFixed(3).padStart(8, ' ');
    
    return `ATOM  ${atomNum}  CA  ${resName} A${residueNum}      ${x}${y}${z}  1.00 90.00           C`;
  }).join('\n');
  
  const footer = `ENDMDL
END`;
  
  return `${header}\n${atoms}\n${footer}`;
}

/**
 * Download a file from blob content
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format AlphaFold result metadata for display
 */
export function formatResultMetadata(result: AlphaFoldResult): string[] {
  const metadata: string[] = [];
  
  if (result.metadata) {
    metadata.push(`Length: ${result.metadata.sequence_length} residues`);
    metadata.push(`Algorithm: ${result.parameters.algorithm}`);
    metadata.push(`Databases: ${result.parameters.databases.join(', ')}`);
    metadata.push(`Processing time: ${result.metadata.processing_time}`);
    metadata.push(`Confidence: ${result.metadata.confidence_scores}`);
    
    if (result.parameters.relax_prediction) {
      metadata.push('Energy minimization: Yes');
    }
    
    if (result.parameters.iterations > 1) {
      metadata.push(`Iterations: ${result.parameters.iterations}`);
    }
  }
  
  return metadata;
}