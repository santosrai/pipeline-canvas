#!/usr/bin/env python3
"""
NVIDIA NIMS API client for RFdiffusion protein design.
Handles protein design requests, hotspot specifications, and contigs.
"""

import os
import json
import time
import asyncio
from typing import Dict, Any, Optional, List, Callable, Tuple
from pathlib import Path
import aiohttp
import ssl
import logging
import requests

logger = logging.getLogger(__name__)

class RFdiffusionClient:
    """Client for NVIDIA NIMS RFdiffusion API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("NVCF_RUN_KEY")
        if not self.api_key:
            raise ValueError("NVCF_RUN_KEY environment variable or api_key parameter required")
        
        # Use the correct NVIDIA Health API endpoint for RFdiffusion
        self.base_url = os.getenv("RFDIFFUSION_URL") or "https://health.api.nvidia.com/v1/biology/ipd/rfdiffusion/generate"
        self.poll_interval = int(os.getenv("POLL_INTERVAL", "30"))  # seconds
        
        self.headers = {
            "content-type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
    
    def validate_parameters(self, params: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate RFdiffusion parameters"""
        errors = []
        
        # Validate contigs format
        contigs = params.get("contigs", "")
        if not contigs:
            errors.append("Contigs specification is required")
        else:
            # Basic contig format validation (e.g., "A20-60/0 50-100")
            if not isinstance(contigs, str):
                errors.append("Contigs must be a string")
        
        # Validate hotspot residues if provided
        hotspot_res = params.get("hotspot_res", [])
        if hotspot_res and not isinstance(hotspot_res, list):
            errors.append("Hotspot residues must be a list")
        
        # Validate diffusion steps
        diffusion_steps = params.get("diffusion_steps", 15)
        if not isinstance(diffusion_steps, int) or not 1 <= diffusion_steps <= 100:
            errors.append("Diffusion steps must be an integer between 1 and 100")
        
        return len(errors) == 0, errors
    
    def process_input_pdb(self, pdb_content: str, max_atoms: int = 400) -> str:
        """
        Process input PDB content by filtering ATOM records and limiting size
        
        Args:
            pdb_content: Raw PDB file content
            max_atoms: Maximum number of ATOM lines to include
            
        Returns:
            Processed PDB content with only ATOM records
        """
        try:
            lines = pdb_content.split('\n')
            atom_lines = [line for line in lines if line.startswith('ATOM')]
            
            # Limit the number of atoms to prevent API limits
            if len(atom_lines) > max_atoms:
                atom_lines = atom_lines[:max_atoms]
                logger.info(f"Reduced PDB from {len(lines)} to {len(atom_lines)} ATOM lines")
            
            return '\n'.join(atom_lines)
            
        except Exception as e:
            logger.error(f"Error processing PDB content: {e}")
            raise ValueError(f"Invalid PDB content: {str(e)}")
    
    def fetch_pdb_from_id(self, pdb_id: str) -> str:
        """Fetch PDB content from RCSB PDB database"""
        try:
            pdb_id = pdb_id.upper().strip()
            if len(pdb_id) != 4:
                raise ValueError(f"Invalid PDB ID format: {pdb_id}")
            
            pdb_url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
            response = requests.get(pdb_url, timeout=30)
            response.raise_for_status()
            
            return response.text
            
        except Exception as e:
            logger.error(f"Failed to fetch PDB {pdb_id}: {e}")
            raise
    
    def create_request_payload(self, **params) -> Dict[str, Any]:
        """Create the request payload with validated parameters"""
        
        # Default parameters
        default_params = {
            "contigs": "A20-60/0 50-100",
            "hotspot_res": [],
            "diffusion_steps": 15,
        }
        
        # Update with user-provided parameters
        default_params.update(params)
        
        # Validate parameters
        is_valid, errors = self.validate_parameters(default_params)
        if not is_valid:
            raise ValueError(f"Invalid parameters: {'; '.join(errors)}")
        
        # Get design mode to determine if PDB is required
        design_mode = params.get("design_mode", "motif_scaffolding")
        logger.debug(f"create_request_payload: design_mode={design_mode}, params keys={list(params.keys())}")
        
        # Handle input PDB - get values and check if they're actually present (not empty strings)
        input_pdb = params.get("input_pdb")
        pdb_id = params.get("pdb_id")
        
        # Check if we have actual PDB content (not None, not empty string)
        has_input_pdb = bool(input_pdb and isinstance(input_pdb, str) and input_pdb.strip())
        has_pdb_id = bool(pdb_id and isinstance(pdb_id, str) and pdb_id.strip())
        has_pdb = has_input_pdb or has_pdb_id
        
        logger.debug(f"create_request_payload: has_input_pdb={has_input_pdb}, has_pdb_id={has_pdb_id}, has_pdb={has_pdb}")
        
        # For unconditional design, PDB is optional
        if design_mode == "unconditional" and not has_pdb:
            # Unconditional design without template - create payload without input_pdb
            logger.info("Creating unconditional design payload without PDB template")
            payload = {
                "contigs": default_params["contigs"],
                "diffusion_steps": default_params["diffusion_steps"],
            }
            
            # Only include hotspot_res if it's not empty
            hotspot_res = default_params.get("hotspot_res", [])
            if hotspot_res and len(hotspot_res) > 0:
                filtered_hotspot_res = [h for h in hotspot_res if h and str(h).strip()]
                if filtered_hotspot_res:
                    payload["hotspot_res"] = filtered_hotspot_res
            
            return payload
        
        # For other modes, PDB is required
        if has_pdb_id and not has_input_pdb:
            # Fetch PDB from ID
            raw_pdb = self.fetch_pdb_from_id(pdb_id)
            input_pdb = self.process_input_pdb(raw_pdb)
        elif has_input_pdb:
            # Process provided PDB content
            input_pdb = self.process_input_pdb(input_pdb)
        else:
            raise ValueError(f"Either input_pdb content or pdb_id must be provided (or use unconditional design_mode). Current design_mode: {design_mode}, has_pdb: {has_pdb}")
        
        payload = {
            "input_pdb": input_pdb,
            "contigs": default_params["contigs"],
            "diffusion_steps": default_params["diffusion_steps"],
        }
        
        # Only include hotspot_res if it's not empty
        # Empty hotspot_res can cause validation errors
        hotspot_res = default_params.get("hotspot_res", [])
        if hotspot_res and len(hotspot_res) > 0:
            # Filter out empty strings
            filtered_hotspot_res = [h for h in hotspot_res if h and str(h).strip()]
            if filtered_hotspot_res:
                payload["hotspot_res"] = filtered_hotspot_res
        
        return payload
    
    async def submit_design_request(
        self, 
        progress_callback: Optional[Callable[[str, float], None]] = None,
        **params
    ) -> Dict[str, Any]:
        """
        Submit protein design request to RFdiffusion API
        
        Args:
            progress_callback: Function to call with (status_message, progress_percent)
            **params: RFdiffusion parameters (contigs, hotspot_res, etc.)
        
        Returns:
            Dictionary containing design results or error information
        """
        
        try:
            logger.debug(f"submit_design_request called with params: {list(params.keys())}")
            # Debug: Log params received by client
            print("=" * 80)
            print(f"[RFdiffusion Client] ===== PARAMS RECEIVED ======")
            for key, value in params.items():
                if key == "input_pdb" and isinstance(value, str) and len(value) > 200:
                    print(f"[RFdiffusion Client]   {key}: {type(value).__name__} (length: {len(value)}, preview: {value[:100]}...)")
                elif isinstance(value, (dict, list)):
                    print(f"[RFdiffusion Client]   {key}: {type(value).__name__} = {value}")
                else:
                    print(f"[RFdiffusion Client]   {key}: {type(value).__name__} = {repr(value)}")
            print("=" * 80)
            
            payload = self.create_request_payload(**params)
            logger.debug(f"Created payload with keys: {list(payload.keys())}")
            
            # Debug: Log final payload being sent to NVIDIA API
            print("=" * 80)
            print(f"[RFdiffusion Client] ===== FINAL PAYLOAD TO NVIDIA API ======")
            print(f"[RFdiffusion Client] URL: {self.base_url}")
            print(f"[RFdiffusion Client] Payload keys: {list(payload.keys())}")
            for key, value in payload.items():
                if key == "input_pdb" and isinstance(value, str) and len(value) > 200:
                    print(f"[RFdiffusion Client]   {key}: {type(value).__name__} (length: {len(value)}, preview: {value[:100]}...)")
                elif isinstance(value, (dict, list)):
                    print(f"[RFdiffusion Client]   {key}: {type(value).__name__} = {value}")
                else:
                    print(f"[RFdiffusion Client]   {key}: {type(value).__name__} = {repr(value)}")
            print("=" * 80)
            
            if progress_callback:
                progress_callback("Submitting protein design request...", 0)
            
            # Create SSL context that doesn't verify certificates (for development)
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            # Create connector with SSL context
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(self.base_url, headers=self.headers, json=payload) as response:
                    if progress_callback:
                        progress_callback("Processing design request...", 50)
                    
                    if response.status == 200:
                        # Successful response
                        result_data = await response.json()
                        if progress_callback:
                            progress_callback("Protein design completed!", 100)
                        return {"status": "completed", "data": result_data}
                    
                    else:
                        # Error response - try to parse JSON error details
                        error_text = await response.text()
                        error_msg = f"HTTP {response.status}: {error_text}"
                        
                        # Try to extract detailed error message from JSON response
                        try:
                            error_json = await response.json()
                            if isinstance(error_json, dict):
                                detail = error_json.get("detail", error_text)
                                error_msg = f"HTTP {response.status}: {detail}"
                        except:
                            # If not JSON, use the text as-is
                            pass
                        
                        logger.error(f"RFdiffusion API error response: {error_msg}")
                        return {
                            "error": error_msg,
                            "status": "request_failed"
                        }
        
        except Exception as e:
            import traceback
            error_details = f"RFdiffusion API request failed: {e}\nTraceback: {traceback.format_exc()}"
            logger.error(error_details)
            return {"error": str(e), "status": "exception", "details": error_details}
    
    def extract_pdb_from_result(self, result_data: Dict[str, Any]) -> Optional[str]:
        """Extract designed PDB content from API result"""
        try:
            if isinstance(result_data, dict):
                # Try different possible locations for PDB data
                if "output_pdb" in result_data:
                    return result_data["output_pdb"]
                elif "pdb" in result_data:
                    return result_data["pdb"]
                elif "structure" in result_data:
                    return result_data["structure"]
                elif "result" in result_data:
                    return self.extract_pdb_from_result(result_data["result"])
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting PDB from result: {e}")
            return None
    
    def save_pdb_file(self, pdb_content: str, filename: str) -> str:
        """Save designed PDB content to file"""
        try:
            # Create results directory if it doesn't exist (in server directory, like proteinmpnn_results)
            base_dir = Path(__file__).parent
            results_dir = base_dir / "rfdiffusion_results"
            results_dir.mkdir(exist_ok=True)
            
            filepath = results_dir / filename
            with open(filepath, 'w') as f:
                f.write(pdb_content)
            
            # Return relative path from server directory for consistency with proteinmpnn
            return str(filepath.relative_to(base_dir))
            
        except Exception as e:
            logger.error(f"Error saving PDB file: {e}")
            raise
    
    def estimate_design_time(self, diffusion_steps: int, complexity: str = "medium") -> str:
        """Estimate design time based on parameters"""
        
        # Base time estimation
        if diffusion_steps <= 10:
            base_time = "1-3 minutes"
        elif diffusion_steps <= 20:
            base_time = "3-8 minutes"
        elif diffusion_steps <= 50:
            base_time = "8-15 minutes"
        else:
            base_time = "15-30 minutes"
        
        # Adjust for complexity
        if complexity == "high":
            base_time = base_time.replace("minutes", "minutes (complex design)")
        elif complexity == "low":
            base_time = base_time.replace("minutes", "minutes (simple design)")
        
        return base_time


# Example usage and testing
async def test_rfdiffusion_client():
    """Test function for RFdiffusion client"""
    client = RFdiffusionClient()
    
    def progress_cb(message: str, percent: float):
        print(f"Progress: {percent:5.1f}% - {message}")
    
    # Test with example parameters from the official script
    result = await client.submit_design_request(
        progress_callback=progress_cb,
        pdb_id="1R42",  # Use PDB ID instead of providing content
        contigs="A20-60/0 50-100",
        hotspot_res=["A50", "A51", "A52", "A53", "A54"],
        diffusion_steps=15,
    )
    
    print("Result:", json.dumps(result, indent=2))
    
    if result.get("status") == "completed" and result.get("data"):
        pdb_content = client.extract_pdb_from_result(result["data"])
        if pdb_content:
            filepath = client.save_pdb_file(pdb_content, "test_design.pdb")
            print(f"Designed PDB saved to: {filepath}")


if __name__ == "__main__":
    # Test the client
    asyncio.run(test_rfdiffusion_client())