#!/usr/bin/env python3
"""
Sequence extraction utilities for AlphaFold integration.
Handles extraction from PDB IDs, files, and sequence processing.
"""

import re
import requests
from typing import Dict, List, Optional, Tuple
from io import StringIO
import logging

logger = logging.getLogger(__name__)

class SequenceExtractor:
    """Utility class for extracting protein sequences from various sources"""
    
    def __init__(self):
        self.pdb_base_url = "https://files.rcsb.org/download"
        self.rcsb_api_url = "https://data.rcsb.org/rest/v1/core/entry"
    
    def extract_from_pdb_id(self, pdb_id: str, chain: Optional[str] = None) -> Dict[str, str]:
        """
        Extract sequence(s) from a PDB ID
        
        Args:
            pdb_id: 4-letter PDB identifier
            chain: Optional chain identifier (e.g., 'A')
            
        Returns:
            Dictionary with chain IDs as keys and sequences as values
        """
        try:
            # Clean PDB ID
            pdb_id = pdb_id.upper().strip()
            if not re.match(r'^[0-9A-Z]{4}$', pdb_id):
                raise ValueError(f"Invalid PDB ID format: {pdb_id}")
            
            # Fetch PDB file
            pdb_url = f"{self.pdb_base_url}/{pdb_id}.pdb"
            response = requests.get(pdb_url, timeout=30)
            response.raise_for_status()
            
            # Extract sequences from PDB content
            sequences = self._extract_sequences_from_pdb_content(response.text)
            
            # Filter by chain if specified
            if chain:
                chain = chain.upper()
                if chain in sequences:
                    return {chain: sequences[chain]}
                else:
                    raise ValueError(f"Chain {chain} not found in PDB {pdb_id}")
            
            return sequences
            
        except Exception as e:
            logger.error(f"Failed to extract sequence from PDB {pdb_id}: {e}")
            raise
    
    def _extract_sequences_from_pdb_content(self, pdb_content: str) -> Dict[str, str]:
        """Extract protein sequences from PDB file content"""
        sequences = {}
        current_chain = None
        current_residues = []
        
        # Standard amino acid three-letter codes
        aa_codes = {
            'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D', 'CYS': 'C',
            'GLN': 'Q', 'GLU': 'E', 'GLY': 'G', 'HIS': 'H', 'ILE': 'I',
            'LEU': 'L', 'LYS': 'K', 'MET': 'M', 'PHE': 'F', 'PRO': 'P',
            'SER': 'S', 'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V'
        }
        
        last_res_seq = None
        
        for line in pdb_content.split('\n'):
            if line.startswith('ATOM') and line[12:16].strip() == 'CA':  # CA atoms only
                chain_id = line[21]
                res_name = line[17:20].strip()
                res_seq = int(line[22:26].strip())
                
                # Skip non-standard amino acids
                if res_name not in aa_codes:
                    continue
                
                # New chain or first residue
                if current_chain != chain_id:
                    # Save previous chain if it exists
                    if current_chain and current_residues:
                        sequences[current_chain] = ''.join(current_residues)
                    
                    current_chain = chain_id
                    current_residues = []
                    last_res_seq = None
                
                # Add residue if it's new (avoid duplicates)
                if res_seq != last_res_seq:
                    current_residues.append(aa_codes[res_name])
                    last_res_seq = res_seq
        
        # Save the last chain
        if current_chain and current_residues:
            sequences[current_chain] = ''.join(current_residues)
        
        return sequences
    
    def extract_from_fasta(self, fasta_content: str) -> Dict[str, str]:
        """
        Extract sequences from FASTA format content
        
        Args:
            fasta_content: FASTA format string
            
        Returns:
            Dictionary with sequence IDs as keys and sequences as values
        """
        sequences = {}
        current_id = None
        current_seq = []
        
        for line in fasta_content.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
                
            if line.startswith('>'):
                # Save previous sequence
                if current_id and current_seq:
                    sequences[current_id] = ''.join(current_seq)
                
                # Start new sequence
                current_id = line[1:].strip()
                current_seq = []
            else:
                # Add to current sequence
                if current_id:
                    current_seq.append(line.upper())
        
        # Save last sequence
        if current_id and current_seq:
            sequences[current_id] = ''.join(current_seq)
        
        return sequences
    
    def extract_subsequence(self, sequence: str, start: int, end: int) -> str:
        """
        Extract a subsequence from a protein sequence
        
        Args:
            sequence: Full protein sequence
            start: Start position (1-indexed)
            end: End position (1-indexed, inclusive)
            
        Returns:
            Subsequence string
        """
        if start < 1:
            raise ValueError("Start position must be >= 1")
        if end > len(sequence):
            raise ValueError(f"End position {end} exceeds sequence length {len(sequence)}")
        if start > end:
            raise ValueError("Start position must be <= end position")
        
        # Convert to 0-indexed for Python slicing
        return sequence[start-1:end]
    
    def validate_sequence(self, sequence: str) -> Tuple[bool, List[str]]:
        """
        Validate a protein sequence
        
        Args:
            sequence: Protein sequence string
            
        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []
        clean_seq = sequence.replace(' ', '').replace('\n', '').upper()
        
        if not clean_seq:
            errors.append("Sequence is empty")
            return False, errors
        
        # Check for valid amino acids
        valid_aa = set("ACDEFGHIKLMNPQRSTVWY")
        invalid_chars = set(clean_seq) - valid_aa
        if invalid_chars:
            errors.append(f"Invalid amino acids: {', '.join(sorted(invalid_chars))}")
        
        # Check length
        if len(clean_seq) < 20:
            errors.append(f"Sequence too short ({len(clean_seq)} residues, minimum 20)")
        elif len(clean_seq) > 2000:
            errors.append(f"Sequence too long ({len(clean_seq)} residues, maximum 2000)")
        
        return len(errors) == 0, errors
    
    def parse_sequence_request(self, text: str) -> Dict:
        """
        Parse a natural language request for sequence extraction
        
        Args:
            text: User input text
            
        Returns:
            Dictionary with parsed information
        """
        text = text.lower()
        result = {
            "type": None,
            "pdb_id": None,
            "chain": None,
            "start": None,
            "end": None,
            "sequence": None
        }
        
        # Look for PDB ID patterns
        pdb_match = re.search(r'pdb[:\s]*([0-9a-z]{4})', text)
        if pdb_match:
            result["type"] = "pdb"
            result["pdb_id"] = pdb_match.group(1).upper()
        else:
            # Look for bare 4-character PDB IDs (like "fold 1TUP")
            bare_pdb_match = re.search(r'\b([0-9][a-z0-9]{3})\b', text)
            if bare_pdb_match:
                result["type"] = "pdb"
                result["pdb_id"] = bare_pdb_match.group(1).upper()
        
        # Look for chain patterns
        chain_match = re.search(r'chain\s+([a-z])', text)
        if chain_match:
            result["chain"] = chain_match.group(1).upper()
        
        # Look for residue range patterns
        range_match = re.search(r'residues?\s+(\d+)[-\s]+(\d+)', text)
        if range_match:
            result["start"] = int(range_match.group(1))
            result["end"] = int(range_match.group(2))
        
        # Check if it might be a direct sequence
        if not result["pdb_id"] and not result["type"]:
            # Look for sequence-like patterns with more flexible matching
            # Pattern 1: "sequence XXXXX" or "sequence: XXXXX"
            seq_pattern = re.search(r'sequence[:\s]*([ACDEFGHIKLMNPQRSTVWY\s]+)', text.upper())
            if seq_pattern:
                potential_seq = re.sub(r'\s', '', seq_pattern.group(1))
                if len(potential_seq) >= 10:  # Minimum reasonable length
                    result["type"] = "sequence"
                    result["sequence"] = potential_seq
            else:
                # Pattern 2: Look for any long stretch of amino acids (for "dock this sequence XXXX")
                # Find sequences of amino acids that are at least 15 characters long
                aa_pattern = re.search(r'\b([ACDEFGHIKLMNPQRSTVWY]{15,})', text.upper())
                if aa_pattern:
                    potential_seq = aa_pattern.group(1)
                    result["type"] = "sequence" 
                    result["sequence"] = potential_seq
        
        return result
    
    def get_sequence_info(self, sequence: str) -> Dict:
        """
        Get information about a protein sequence
        
        Args:
            sequence: Protein sequence
            
        Returns:
            Dictionary with sequence information
        """
        clean_seq = sequence.replace(' ', '').upper()
        
        # Count amino acids
        aa_counts = {}
        for aa in clean_seq:
            aa_counts[aa] = aa_counts.get(aa, 0) + 1
        
        # Calculate molecular weight (approximate)
        aa_weights = {
            'A': 89.1, 'R': 174.2, 'N': 132.1, 'D': 133.1, 'C': 121.2,
            'Q': 146.2, 'E': 147.1, 'G': 75.1, 'H': 155.2, 'I': 131.2,
            'L': 131.2, 'K': 146.2, 'M': 149.2, 'F': 165.2, 'P': 115.1,
            'S': 105.1, 'T': 119.1, 'W': 204.2, 'Y': 181.2, 'V': 117.1
        }
        
        mol_weight = sum(aa_weights.get(aa, 0) for aa in clean_seq) - (len(clean_seq) - 1) * 18.0  # Subtract water
        
        return {
            "length": len(clean_seq),
            "molecular_weight": round(mol_weight, 1),
            "amino_acid_counts": aa_counts,
            "sequence": clean_seq
        }


# Example usage and testing
def test_sequence_extractor():
    """Test function for sequence extractor"""
    extractor = SequenceExtractor()
    
    # Test PDB extraction
    try:
        sequences = extractor.extract_from_pdb_id("1ABC", chain="A")
        print("PDB extraction test:", sequences)
    except Exception as e:
        print("PDB extraction failed:", e)
    
    # Test FASTA parsing
    fasta_test = """>Test_sequence
MVLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASED
LKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPG
"""
    sequences = extractor.extract_from_fasta(fasta_test)
    print("FASTA parsing test:", sequences)
    
    # Test sequence parsing
    request = "fold chain A from PDB:1HHO residues 50-100"
    parsed = extractor.parse_sequence_request(request)
    print("Request parsing test:", parsed)


if __name__ == "__main__":
    test_sequence_extractor()