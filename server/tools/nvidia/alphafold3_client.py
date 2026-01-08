#!/usr/bin/env python3
"""
NVIDIA NIMS API client for AlphaFold3 protein structure prediction.
Supports multiple entity types (Protein, DNA, RNA, Ligand) with MSA files.
"""

import os
import json
import time
import asyncio
from typing import Dict, Any, Optional, Callable, List, Tuple
from pathlib import Path
import aiohttp
import ssl
import logging

try:
    import certifi
except ImportError:
    certifi = None

# Set up logging
logger = logging.getLogger(__name__)

def setup_alphafold3_logging():
    """Set up file logging for AlphaFold3 API calls"""
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / "alphafold3_api.log"
    
    api_logger = logging.getLogger('alphafold3_client.api')
    api_logger.setLevel(logging.INFO)
    
    if not api_logger.handlers:
        file_handler = logging.FileHandler(log_file, encoding='utf-8', mode='a')
        file_handler.setLevel(logging.INFO)
        
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        api_logger.addHandler(file_handler)
    
    return api_logger

api_logger = setup_alphafold3_logging()

class AlphaFold3Client:
    """Client for NVIDIA NIMS AlphaFold3 API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("NVCF_RUN_KEY")
        if not self.api_key:
            raise ValueError("NVCF_RUN_KEY environment variable or api_key parameter required")
        
        # AlphaFold3 API endpoint
        self.base_url = os.getenv("ALPHAFOLD3_URL", "https://health.api.nvidia.com/v1/biology/openfold/openfold3/predict")
        self.status_url = os.getenv("STATUS_URL", "https://health.api.nvidia.com/v1/status")
        
        # Polling configuration
        self.poll_interval = max(300, int(os.getenv("ALPHAFOLD3_POLL_INTERVAL", "300")))  # 5 minutes default
        self.max_polls = int(os.getenv("ALPHAFOLD3_MAX_POLLS", "0"))  # 0 = unlimited
        self.max_poll_seconds = int(os.getenv("ALPHAFOLD3_MAX_WAIT_SECONDS", "3600"))  # 1 hour default
        
        self.headers = {
            "content-type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "NVCF-POLL-SECONDS": str(self.poll_interval),
        }
        
        self.request_timeout = int(os.getenv("NIMS_REQUEST_TIMEOUT", "600"))  # 10 minutes
        self.post_retries = int(os.getenv("NIMS_POST_RETRIES", "3"))
    
    def validate_entity(self, entity: Dict[str, Any]) -> Tuple[bool, str]:
        """Validate an entity (protein, DNA, RNA, ligand)"""
        entity_type = entity.get("type", "").lower()
        sequence = entity.get("sequence", "").strip()
        
        if not sequence:
            return False, "Sequence cannot be empty"
        
        clean_seq = ''.join(sequence.split()).upper()
        
        if entity_type == "protein":
            valid_aa = set("ACDEFGHIKLMNPQRSTVWY")
            invalid_chars = set(clean_seq) - valid_aa
            if invalid_chars:
                return False, f"Invalid amino acids: {', '.join(sorted(invalid_chars))}"
            if len(clean_seq) < 20:
                return False, f"Sequence too short ({len(clean_seq)} residues). Minimum: 20"
        elif entity_type == "dna":
            valid_bases = set("ATCG")
            invalid_chars = set(clean_seq) - valid_bases
            if invalid_chars:
                return False, f"Invalid DNA bases: {', '.join(sorted(invalid_chars))}"
            if len(clean_seq) < 10:
                return False, f"DNA sequence too short ({len(clean_seq)} bases). Minimum: 10"
        elif entity_type == "rna":
            valid_bases = set("AUCG")
            invalid_chars = set(clean_seq) - valid_bases
            if invalid_chars:
                return False, f"Invalid RNA bases: {', '.join(sorted(invalid_chars))}"
            if len(clean_seq) < 10:
                return False, f"RNA sequence too short ({len(clean_seq)} bases). Minimum: 10"
        elif entity_type == "ligand":
            # Ligand validation can be more flexible
            if len(clean_seq) < 1:
                return False, "Ligand sequence cannot be empty"
        
        copies = entity.get("copies", 1)
        if not isinstance(copies, int) or copies < 1 or copies > 5:
            return False, "Copies must be an integer between 1 and 5"
        
        return True, clean_seq
    
    def read_msa_file(self, file_path: str) -> str:
        """Read MSA file content"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading MSA file {file_path}: {e}")
            raise
    
    def create_molecule_payload(self, entity: Dict[str, Any], msa_files: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Create molecule payload for AlphaFold3 API"""
        entity_type = entity.get("type", "protein").lower()
        sequence = entity.get("sequence", "").strip()
        chain_id = entity.get("chainId", "A")
        copies = entity.get("copies", 1)
        
        # Validate and clean sequence
        is_valid, clean_seq = self.validate_entity(entity)
        if not is_valid:
            raise ValueError(f"Invalid entity: {clean_seq}")
        
        molecule: Dict[str, Any] = {
            "type": entity_type,
            "id": chain_id,
            "sequence": clean_seq,
        }
        
        if copies > 1:
            molecule["copies"] = copies
        
        # Add MSA if provided
        if msa_files and entity_type == "protein":
            msa_data: Dict[str, Any] = {}
            
            # Main MSA
            main_msa = next((f for f in msa_files if f.get("type") == "main"), None)
            if main_msa:
                msa_content = self.read_msa_file(main_msa["file_path"])
                file_ext = Path(main_msa["file_path"]).suffix.lower()
                
                if file_ext == ".csv":
                    msa_data["main_db"] = {
                        "csv": {
                            "alignment": msa_content,
                            "format": "csv"
                        }
                    }
                elif file_ext == ".a3m":
                    msa_data["main_db"] = {
                        "a3m": {
                            "alignment": msa_content,
                            "format": "a3m"
                        }
                    }
            
            # Paired MSA
            paired_msa = next((f for f in msa_files if f.get("type") == "paired"), None)
            if paired_msa:
                msa_content = self.read_msa_file(paired_msa["file_path"])
                file_ext = Path(paired_msa["file_path"]).suffix.lower()
                
                if file_ext == ".csv":
                    msa_data["paired_db"] = {
                        "csv": {
                            "alignment": msa_content,
                            "format": "csv"
                        }
                    }
                elif file_ext == ".a3m":
                    msa_data["paired_db"] = {
                        "a3m": {
                            "alignment": msa_content,
                            "format": "a3m"
                        }
                    }
            
            if msa_data:
                molecule["msa"] = msa_data
        
        return molecule
    
    def create_request_payload(self, entities: List[Dict[str, Any]], request_id: Optional[str] = None, msa_files_map: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Any]:
        """Create AlphaFold3 API request payload"""
        if not entities:
            raise ValueError("At least one entity is required")
        
        if not request_id:
            import uuid
            request_id = str(uuid.uuid4())
        
        molecules = []
        for entity in entities:
            entity_id = entity.get("id") or entity.get("chainId", "A")
            msa_files = msa_files_map.get(entity_id, []) if msa_files_map else None
            molecule = self.create_molecule_payload(entity, msa_files)
            molecules.append(molecule)
        
        return {
            "request_id": request_id,
            "inputs": [
                {
                    "input_id": request_id,
                    "molecules": molecules,
                    "output_format": "pdb"
                }
            ]
        }
    
    async def submit_folding_request(
        self,
        entities: List[Dict[str, Any]],
        request_id: Optional[str] = None,
        msa_files_map: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        progress_callback: Optional[Callable[[str, float], None]] = None
    ) -> Dict[str, Any]:
        """
        Submit AlphaFold3 folding request
        
        Args:
            entities: List of entity dictionaries (type, sequence, chainId, copies, etc.)
            request_id: Optional request ID
            msa_files_map: Optional map of entity_id -> list of MSA file info
            progress_callback: Function to call with (status_message, progress_percent)
        
        Returns:
            Dictionary containing folding results or error information
        """
        api_logger.info(f"=== AlphaFold3 API Submit Request ===")
        api_logger.info(f"Entities: {len(entities)}")
        for i, entity in enumerate(entities):
            api_logger.info(f"  Entity {i+1}: {entity.get('type')} ({entity.get('chainId')}), length={len(entity.get('sequence', ''))}")
        
        # Create payload
        payload = self.create_request_payload(entities, request_id, msa_files_map)
        api_logger.info(f"Payload size: {len(json.dumps(payload))} bytes")
        
        if progress_callback:
            progress_callback("Submitting AlphaFold3 request...", 0)
        
        try:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            if certifi is not None:
                try:
                    ssl_context.load_verify_locations(certifi.where())
                except Exception:
                    pass
            
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            timeout = aiohttp.ClientTimeout(total=self.request_timeout)
            
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                attempt = 0
                while True:
                    attempt += 1
                    try:
                        response = await session.post(self.base_url, headers=self.headers, json=payload)
                    except Exception as e:
                        if attempt <= self.post_retries:
                            backoff = min(2 ** attempt, 5)
                            api_logger.warning(f"POST attempt {attempt} failed: {e}; retrying in {backoff}s")
                            await asyncio.sleep(backoff)
                            continue
                        raise
                    
                    api_logger.info(f"=== AlphaFold3 API Response ===")
                    api_logger.info(f"Status Code: {response.status}")
                    
                    if response.status == 200:
                        result_data = await response.json()
                        api_logger.info(f"Immediate completion")
                        if progress_callback:
                            progress_callback("Folding completed!", 100)
                        return {"status": "completed", "data": result_data}
                    
                    elif response.status == 202:
                        req_id = response.headers.get("nvcf-reqid")
                        api_logger.info(f"Request accepted for polling. Request ID: {req_id}")
                        
                        if not req_id:
                            return {"error": "No request ID received", "status": "error"}
                        
                        if progress_callback:
                            progress_callback("Request accepted, starting folding process...", 10)
                        
                        return await self._poll_for_results(session, req_id, progress_callback)
                    
                    elif response.status in (502, 503, 504):
                        req_id = response.headers.get("nvcf-reqid")
                        body_text = await response.text()
                        api_logger.warning(f"Transient {response.status}. ReqID: {req_id}")
                        if req_id:
                            if progress_callback:
                                progress_callback("Request accepted (via 5xx), polling for result...", 10)
                            return await self._poll_for_results(session, req_id, progress_callback)
                        if attempt <= self.post_retries:
                            backoff = min(2 ** attempt, 5)
                            await asyncio.sleep(backoff)
                            continue
                        return {
                            "error": f"HTTP {response.status}: {body_text}",
                            "status": "request_failed",
                            "http_status": response.status
                        }
                    
                    else:
                        error_text = await response.text()
                        api_logger.error(f"API request failed with status {response.status}: {error_text}")
                        return {
                            "error": f"HTTP {response.status}: {error_text}",
                            "status": "request_failed",
                            "http_status": response.status
                        }
        
        except Exception as e:
            import traceback
            error_details = f"AlphaFold3 API request failed: {e}\nTraceback: {traceback.format_exc()}"
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
        max_polls = self.max_polls
        unlimited = max_polls <= 0
        start_time = time.monotonic()
        
        while unlimited or poll_count < max_polls:
            if self.max_poll_seconds > 0:
                elapsed = time.monotonic() - start_time
                if elapsed >= self.max_poll_seconds:
                    return {
                        "error": f"Polling timeout after {int(elapsed)} seconds",
                        "status": "timeout",
                    }
            
            try:
                await asyncio.sleep(self.poll_interval)
                poll_count += 1
                
                estimated_progress = min(90, 10 + (poll_count * 2))
                if progress_callback:
                    progress_callback(f"Processing... (poll {poll_count})", estimated_progress)
                
                status_endpoint = f"{self.status_url}/{req_id}"
                api_logger.info(f"Polling AlphaFold3 status: {status_endpoint} (poll {poll_count})")
                
                per_req_timeout = aiohttp.ClientTimeout(
                    total=None,
                    sock_connect=30,
                    sock_read=max(self.poll_interval + 30, 60)
                )
                
                async with session.get(status_endpoint, headers=self.headers, timeout=per_req_timeout) as response:
                    if response.status == 200:
                        result_data = await response.json()
                        if progress_callback:
                            progress_callback("Folding completed successfully!", 100)
                        return {"status": "completed", "data": result_data}
                    
                    elif response.status == 202:
                        continue
                    
                    elif response.status in (502, 503, 504):
                        body_text = await response.text()
                        nvcf_status = response.headers.get("Nvcf-Status", "").lower()
                        api_logger.warning(f"Polling transient {response.status} (Nvcf-Status={nvcf_status})")
                        
                        if nvcf_status in {"errored", "failed", "error"}:
                            return {
                                "error": body_text or f"Polling failed with HTTP {response.status}",
                                "status": "polling_failed",
                            }
                        continue
                    
                    elif response.status == 429:
                        await asyncio.sleep(min(10, self.poll_interval))
                        continue
                    
                    elif response.status in (401, 403):
                        error_text = await response.text()
                        return {
                            "error": f"Polling failed: HTTP {response.status}: {error_text}",
                            "status": "polling_failed"
                        }
                    
                    else:
                        error_text = await response.text()
                        return {
                            "error": f"Polling failed: HTTP {response.status}: {error_text}",
                            "status": "polling_failed"
                        }
            
            except (asyncio.TimeoutError, aiohttp.ClientError, ssl.SSLError) as e:
                api_logger.warning(f"Polling error (attempt {poll_count}): {repr(e)}")
                await asyncio.sleep(min(5, poll_count))
                continue
            except Exception as e:
                logger.error(f"Polling error: {e}")
                return {"error": f"Polling exception: {str(e)}", "status": "polling_exception"}
        
        return {"error": "Request timeout", "status": "timeout"}
    
    def extract_pdb_from_result(self, result_data: Dict[str, Any]) -> Optional[str]:
        """Extract PDB content from API result"""
        try:
            if isinstance(result_data, dict):
                # Try different possible locations for PDB data
                if "pdb" in result_data:
                    return result_data["pdb"]
                elif "structure" in result_data:
                    return result_data["structure"]
                elif "result" in result_data:
                    return self.extract_pdb_from_result(result_data["result"])
                elif "inputs" in result_data and isinstance(result_data["inputs"], list):
                    # AlphaFold3 format may have results in inputs
                    for input_item in result_data["inputs"]:
                        if "pdb" in input_item:
                            return input_item["pdb"]
                        if "result" in input_item:
                            return self.extract_pdb_from_result(input_item["result"])
            
            return None
        except Exception as e:
            logger.error(f"Error extracting PDB from result: {e}")
            return None
    
    def save_pdb_file(self, pdb_content: str, filename: str) -> str:
        """Save PDB content to file"""
        try:
            base_dir = Path(__file__).parent.parent.parent
            results_dir = base_dir / "alphafold3_results"
            results_dir.mkdir(exist_ok=True)
            
            filepath = results_dir / filename
            with open(filepath, 'w') as f:
                f.write(pdb_content)
            
            return str(filepath.relative_to(base_dir))
        except Exception as e:
            logger.error(f"Error saving PDB file: {e}")
            raise
