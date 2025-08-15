#!/usr/bin/env python3
"""
NVIDIA NIMS API client for AlphaFold2 protein structure prediction.
Handles authentication, request submission, polling, and result processing.
"""

import os
import json
import time
import asyncio
from typing import Dict, Any, Optional, Callable, Tuple
from pathlib import Path
import aiohttp
import ssl
import logging

logger = logging.getLogger(__name__)

class NIMSClient:
    """Client for NVIDIA NIMS AlphaFold2 API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("NVCF_RUN_KEY")
        if not self.api_key:
            raise ValueError("NVCF_RUN_KEY environment variable or api_key parameter required")
        
        # Use the correct NVIDIA Health API endpoints (same as the reference script)
        # Handle empty env vars by using defaults
        self.base_url = os.getenv("NIMS_URL") or "https://health.api.nvidia.com/v1/biology/deepmind/alphafold2"
        self.status_url = os.getenv("STATUS_URL") or "https://health.api.nvidia.com/v1/status"
        self.poll_interval = int(os.getenv("POLL_INTERVAL", "300"))  # seconds (5 minutes like the script)
        
        self.headers = {
            "content-type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "NVCF-POLL-SECONDS": str(self.poll_interval),
        }
    
    def validate_sequence(self, sequence: str) -> Tuple[bool, str]:
        """Validate protein sequence format and length"""
        if not sequence:
            return False, "Sequence cannot be empty"
        
        # Remove whitespace and convert to uppercase
        clean_seq = ''.join(sequence.split()).upper()
        
        # Check for valid amino acids only
        valid_aa = set("ACDEFGHIKLMNPQRSTVWY")
        invalid_chars = set(clean_seq) - valid_aa
        if invalid_chars:
            return False, f"Invalid amino acids found: {', '.join(sorted(invalid_chars))}"
        
        # Check length constraints
        if len(clean_seq) < 20:
            return False, f"Sequence too short ({len(clean_seq)} residues). Minimum: 20"
        if len(clean_seq) > 2000:
            return False, f"Sequence too long ({len(clean_seq)} residues). Maximum: 2000"
        
        return True, clean_seq
    
    def create_request_payload(self, sequence: str, **params) -> Dict[str, Any]:
        """Create the request payload with validated parameters"""
        # Default parameters
        default_params = {
            "algorithm": "mmseqs2",
            "e_value": 0.0001,
            "iterations": 1,
            "databases": ["small_bfd"],
            "relax_prediction": False,
            "skip_template_search": True
        }
        
        # Update with user-provided parameters
        default_params.update(params)
        
        # Validate parameters
        if default_params["algorithm"] not in ["mmseqs2", "jackhmmer"]:
            default_params["algorithm"] = "mmseqs2"
        
        if not isinstance(default_params["e_value"], (int, float)) or default_params["e_value"] <= 0:
            default_params["e_value"] = 0.0001
        
        if not isinstance(default_params["iterations"], int) or not 1 <= default_params["iterations"] <= 3:
            default_params["iterations"] = 1
        
        # Validate databases
        valid_dbs = {"small_bfd", "uniref90", "mgnify", "bfd", "uniclust30"}
        if not isinstance(default_params["databases"], list):
            default_params["databases"] = ["small_bfd"]
        else:
            # Filter valid databases
            default_params["databases"] = [db for db in default_params["databases"] if db in valid_dbs]
            if not default_params["databases"]:
                default_params["databases"] = ["small_bfd"]
        
        return {
            "sequence": sequence,
            **default_params
        }
    
    async def submit_folding_request(
        self, 
        sequence: str, 
        progress_callback: Optional[Callable[[str, float], None]] = None,
        **params
    ) -> Dict[str, Any]:
        """
        Submit protein folding request to NIMS API
        
        Args:
            sequence: Protein sequence (amino acids)
            progress_callback: Function to call with (status_message, progress_percent)
            **params: AlphaFold2 parameters (algorithm, e_value, etc.)
        
        Returns:
            Dictionary containing folding results or error information
        """
        
        # Validate sequence
        is_valid, result = self.validate_sequence(sequence)
        if not is_valid:
            return {"error": result, "status": "validation_failed"}
        
        clean_sequence = result
        payload = self.create_request_payload(clean_sequence, **params)
        
        if progress_callback:
            progress_callback("Submitting folding request...", 0)
        
        try:
            # Create SSL context that doesn't verify certificates (for development)
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            # Create connector with SSL context
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                # Submit initial request
                async with session.post(self.base_url, headers=self.headers, json=payload) as response:
                    if response.status == 200:
                        # Immediate response (rare)
                        result_data = await response.json()
                        if progress_callback:
                            progress_callback("Folding completed!", 100)
                        return {"status": "completed", "data": result_data}
                    
                    elif response.status == 202:
                        # Request accepted, need to poll
                        req_id = response.headers.get("nvcf-reqid")
                        if not req_id:
                            return {"error": "No request ID received", "status": "error"}
                        
                        if progress_callback:
                            progress_callback("Request accepted, starting folding process...", 10)
                        
                        # Poll for results
                        return await self._poll_for_results(session, req_id, progress_callback)
                    
                    else:
                        error_text = await response.text()
                        return {
                            "error": f"HTTP {response.status}: {error_text}",
                            "status": "request_failed"
                        }
        
        except Exception as e:
            import traceback
            error_details = f"NIMS API request failed: {e}\nTraceback: {traceback.format_exc()}"
            logger.error(error_details)
            return {"error": str(e), "status": "exception", "details": error_details}
    
    async def _poll_for_results(
        self, 
        session: aiohttp.ClientSession, 
        req_id: str, 
        progress_callback: Optional[Callable[[str, float], None]] = None
    ) -> Dict[str, Any]:
        """Poll the status endpoint until completion"""
        
        poll_count = 0
        max_polls = 120  # 1 hour maximum with 30-second intervals
        
        while poll_count < max_polls:
            try:
                await asyncio.sleep(self.poll_interval)
                poll_count += 1
                
                # Estimate progress based on time (rough approximation)
                estimated_progress = min(90, 10 + (poll_count * 2))
                
                if progress_callback:
                    progress_callback(f"Processing... (poll {poll_count})", estimated_progress)
                
                async with session.get(f"{self.status_url}/{req_id}", headers=self.headers) as response:
                    if response.status == 200:
                        # Completed
                        result_data = await response.json()
                        if progress_callback:
                            progress_callback("Folding completed successfully!", 100)
                        return {"status": "completed", "data": result_data}
                    
                    elif response.status == 202:
                        # Still processing
                        continue
                    
                    else:
                        # Error
                        error_text = await response.text()
                        return {
                            "error": f"Polling failed: HTTP {response.status}: {error_text}",
                            "status": "polling_failed"
                        }
            
            except Exception as e:
                logger.error(f"Polling error: {e}")
                return {"error": f"Polling exception: {str(e)}", "status": "polling_exception"}
        
        # Timeout
        return {"error": "Request timeout after 1 hour", "status": "timeout"}
    
    def extract_pdb_from_result(self, result_data: Dict[str, Any]) -> Optional[str]:
        """Extract PDB content from API result"""
        try:
            if isinstance(result_data, dict):
                # Try different possible locations for PDB data
                if "pdb" in result_data:
                    return result_data["pdb"]
                elif "structure" in result_data:
                    return result_data["structure"]
                elif "prediction" in result_data and isinstance(result_data["prediction"], dict):
                    if "pdb" in result_data["prediction"]:
                        return result_data["prediction"]["pdb"]
                elif "result" in result_data:
                    return self.extract_pdb_from_result(result_data["result"])
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting PDB from result: {e}")
            return None
    
    def save_pdb_file(self, pdb_content: str, filename: str) -> str:
        """Save PDB content to file"""
        try:
            # Create results directory if it doesn't exist
            results_dir = Path("alphafold_results")
            results_dir.mkdir(exist_ok=True)
            
            filepath = results_dir / filename
            with open(filepath, 'w') as f:
                f.write(pdb_content)
            
            return str(filepath)
            
        except Exception as e:
            logger.error(f"Error saving PDB file: {e}")
            raise

    def estimate_folding_time(self, sequence: str, **params) -> str:
        """Estimate folding time based on sequence length and parameters"""
        seq_len = len(sequence.replace(' ', ''))
        
        # Base time estimation
        if seq_len < 100:
            base_time = "2-5 minutes"
        elif seq_len < 300:
            base_time = "5-15 minutes" 
        elif seq_len < 600:
            base_time = "15-30 minutes"
        else:
            base_time = "30-60 minutes"
        
        # Adjust for parameters
        if params.get("relax_prediction", False):
            base_time = base_time.replace("minutes", "minutes (+ relaxation time)")
        
        if params.get("iterations", 1) > 1:
            base_time += f" (x{params['iterations']} iterations)"
        
        return base_time


# Example usage and testing
async def test_nims_client():
    """Test function for NIMS client"""
    client = NIMSClient()
    
    test_sequence = (
        "MVPSAGQLALFALGIVLAACQALENSTSPLSADPPVAAAVVSHFNDCPDSHTQFCFHGTCRFL"
        "VQEDKPACVCHSGYVGARCEHADLLAVVAASQKKQAITALVVVSIVALAVLIITCVLIHCCQVRKHCEWCR"
        "ALICRHEKPSALLKGRTACCHSETVV"
    )
    
    def progress_cb(message: str, percent: float):
        print(f"Progress: {percent:5.1f}% - {message}")
    
    result = await client.submit_folding_request(
        sequence=test_sequence,
        progress_callback=progress_cb,
        algorithm="mmseqs2",
        e_value=0.0001,
        iterations=1,
        databases=["small_bfd"],
        relax_prediction=False
    )
    
    print("Result:", json.dumps(result, indent=2))
    
    if result.get("status") == "completed" and result.get("data"):
        pdb_content = client.extract_pdb_from_result(result["data"])
        if pdb_content:
            filepath = client.save_pdb_file(pdb_content, "test_fold.pdb")
            print(f"PDB saved to: {filepath}")


if __name__ == "__main__":
    # Test the client
    asyncio.run(test_nims_client())