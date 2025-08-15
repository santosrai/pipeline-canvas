#!/usr/bin/env python3
"""
AlphaFold request handler for the server.
Integrates sequence extraction, NIMS API calls, and result processing.
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional
# Import sequence_utils and nims_client
try:
    # Try relative import first (when imported as module)
    from .sequence_utils import SequenceExtractor
    from .nims_client import NIMSClient
except ImportError:
    try:
        # Try absolute import (when running as script)
        from sequence_utils import SequenceExtractor
        from nims_client import NIMSClient
    except ImportError:
        # Try importing from current directory
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from sequence_utils import SequenceExtractor
        from nims_client import NIMSClient

logger = logging.getLogger(__name__)

class AlphaFoldHandler:
    """Handles AlphaFold folding requests from the frontend"""
    
    def __init__(self):
        self.sequence_extractor = SequenceExtractor()
        self.nims_client = None  # Initialize when needed
        self.active_jobs = {}  # Track running jobs
    
    def _get_nims_client(self) -> NIMSClient:
        """Get or create NIMS client"""
        if not self.nims_client:
            try:
                self.nims_client = NIMSClient()
            except ValueError as e:
                # NIMS client throws ValueError for missing API key
                logger.error(f"NIMS API configuration error: {e}")
                raise ValueError("NIMS API key not configured. Please set the NVCF_RUN_KEY environment variable with your NVIDIA API key.")
            except Exception as e:
                logger.error(f"Failed to initialize NIMS client: {e}")
                raise ValueError(f"NIMS API initialization failed: {str(e)}")
        return self.nims_client
    
    async def process_folding_request(self, input_text: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Process a natural language folding request
        
        Args:
            input_text: User's folding request
            context: Optional context (current PDB, selection, etc.)
            
        Returns:
            Dictionary with folding parameters for user confirmation
        """
        try:
            # Parse the request
            parsed = self.sequence_extractor.parse_sequence_request(input_text)
            logger.info(f"Parsed folding request: {parsed}")
            
            # Extract sequence based on request type
            sequence = await self._extract_sequence(parsed, context)
            
            if not sequence:
                return {
                    "error": "Could not extract sequence from request",
                    "action": "error"
                }
            
            # Validate sequence
            is_valid, errors = self.sequence_extractor.validate_sequence(sequence)
            if not is_valid:
                return {
                    "error": f"Invalid sequence: {'; '.join(errors)}",
                    "action": "error"
                }
            
            # Get sequence info
            seq_info = self.sequence_extractor.get_sequence_info(sequence)
            
            # Determine source description
            source = self._get_source_description(parsed)
            
            # Estimate processing time
            estimated_time = self._estimate_time(len(sequence))
            
            # Create confirmation response
            return {
                "action": "confirm_folding",
                "sequence": sequence,
                "source": source,
                "parameters": {
                    "algorithm": "mmseqs2",
                    "e_value": 0.0001,
                    "iterations": 1,
                    "databases": ["small_bfd"],
                    "relax_prediction": False,
                    "skip_template_search": True
                },
                "sequence_info": seq_info,
                "estimated_time": estimated_time,
                "message": f"Ready to fold {seq_info['length']}-residue protein from {source}. Please confirm parameters."
            }
            
        except Exception as e:
            logger.error(f"Error processing folding request: {e}")
            return {
                "error": str(e),
                "action": "error"
            }
    
    async def _extract_sequence(self, parsed: Dict, context: Dict[str, Any] = None) -> Optional[str]:
        """Extract sequence based on parsed request"""
        
        if parsed["type"] == "sequence":
            # Direct sequence provided
            return parsed["sequence"]
        
        elif parsed["type"] == "pdb":
            # Extract from PDB ID
            try:
                sequences = self.sequence_extractor.extract_from_pdb_id(
                    parsed["pdb_id"],
                    chain=parsed["chain"]
                )
                
                if len(sequences) == 1:
                    # Single chain
                    return list(sequences.values())[0]
                elif parsed["chain"] and parsed["chain"] in sequences:
                    # Specific chain requested
                    sequence = sequences[parsed["chain"]]
                else:
                    # Multiple chains, take the first one or ask user
                    sequence = list(sequences.values())[0]
                
                # Apply residue range if specified
                if parsed["start"] and parsed["end"]:
                    sequence = self.sequence_extractor.extract_subsequence(
                        sequence, parsed["start"], parsed["end"]
                    )
                
                return sequence
                
            except Exception as e:
                logger.error(f"Failed to extract sequence from PDB: {e}")
                return None
        
        elif context:
            # Try to infer from context (current loaded structure, selection, etc.)
            return self._extract_from_context(context)
        
        return None
    
    def _extract_from_context(self, context: Dict[str, Any]) -> Optional[str]:
        """Extract sequence from current context (loaded structure, selection)"""
        # This would need to be implemented based on your app's context structure
        # For now, return None
        return None
    
    def _get_source_description(self, parsed: Dict) -> str:
        """Get human-readable description of sequence source"""
        if parsed["type"] == "sequence":
            return "user-provided sequence"
        elif parsed["type"] == "pdb":
            desc = f"PDB {parsed['pdb_id']}"
            if parsed["chain"]:
                desc += f" chain {parsed['chain']}"
            if parsed["start"] and parsed["end"]:
                desc += f" residues {parsed['start']}-{parsed['end']}"
            return desc
        else:
            return "unknown source"
    
    def _estimate_time(self, length: int) -> str:
        """Estimate folding time based on sequence length"""
        if length < 100:
            return "2-5 minutes"
        elif length < 300:
            return "5-15 minutes"
        elif length < 600:
            return "15-30 minutes"
        else:
            return "30-60 minutes"
    
    async def submit_folding_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit folding job to NIMS API
        
        Args:
            job_data: Job parameters from frontend
            
        Returns:
            Dictionary with job status and result
        """
        job_id = job_data.get("jobId")
        sequence = job_data.get("sequence")
        parameters = job_data.get("parameters", {})
        
        if not sequence or not job_id:
            return {
                "status": "error",
                "error": "Missing sequence or job ID"
            }
        
        try:
            # Initialize NIMS client (this will catch configuration errors)
            try:
                nims_client = self._get_nims_client()
            except ValueError as config_error:
                # Configuration error (missing API key, etc.)
                self.active_jobs[job_id] = "error"
                return {
                    "status": "error",
                    "error": str(config_error)
                }
            
            # Create progress callback
            def progress_callback(message: str, progress: float):
                # In a real implementation, you'd send this to the frontend
                # via WebSocket or similar real-time mechanism
                logger.info(f"Job {job_id} progress: {progress}% - {message}")
            
            # Start the folding job
            self.active_jobs[job_id] = "running"
            
            # Submit to NIMS API
            result = await nims_client.submit_folding_request(
                sequence=sequence,
                progress_callback=progress_callback,
                **parameters
            )
            
            if result.get("status") == "completed":
                # Extract PDB content
                pdb_content = nims_client.extract_pdb_from_result(result["data"])
                
                if pdb_content:
                    # Save PDB file
                    filename = f"alphafold_{job_id}.pdb"
                    filepath = nims_client.save_pdb_file(pdb_content, filename)
                    
                    self.active_jobs[job_id] = "completed"
                    
                    return {
                        "status": "success",
                        "data": {
                            "pdbContent": pdb_content,
                            "filename": filename,
                            "filepath": filepath,
                            "metadata": {
                                "sequence_length": len(sequence),
                                "job_id": job_id,
                                "parameters": parameters
                            }
                        }
                    }
                else:
                    self.active_jobs[job_id] = "error"
                    return {
                        "status": "error",
                        "error": "No PDB content in API response"
                    }
            else:
                self.active_jobs[job_id] = "error"
                return {
                    "status": "error",
                    "error": result.get("error", "Folding failed")
                }
                
        except Exception as e:
            logger.error(f"AlphaFold job {job_id} failed: {e}")
            self.active_jobs[job_id] = "error"
            return {
                "status": "error",
                "error": str(e)
            }
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get status of a running job"""
        status = self.active_jobs.get(job_id, "not_found")
        return {
            "job_id": job_id,
            "status": status
        }
    
    def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """Cancel a running job"""
        if job_id in self.active_jobs:
            self.active_jobs[job_id] = "cancelled"
            return {
                "job_id": job_id,
                "status": "cancelled"
            }
        else:
            return {
                "job_id": job_id,
                "status": "not_found"
            }


# Global handler instance
alphafold_handler = AlphaFoldHandler()


# Example usage
async def test_alphafold_handler():
    """Test the AlphaFold handler"""
    handler = AlphaFoldHandler()
    
    # Test request processing
    test_requests = [
        "fold PDB:1ABC",
        "fold chain A from PDB:1HHO",
        "fold residues 50-100 from chain A in PDB:1LAP",
        "fold this sequence: MVLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLK"
    ]
    
    for request in test_requests:
        print(f"\nProcessing: {request}")
        result = await handler.process_folding_request(request)
        print(f"Result: {json.dumps(result, indent=2)}")


if __name__ == "__main__":
    asyncio.run(test_alphafold_handler())