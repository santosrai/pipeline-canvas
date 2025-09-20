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

# Set up file logging for NIMS API calls
def setup_nims_logging():
    """Set up file logging for NIMS API calls"""
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / "alphafold_api.log"
    
    # Create a logger with a specific name for NIMS API
    api_logger = logging.getLogger('nims_client.api')
    api_logger.setLevel(logging.INFO)
    
    # Avoid adding multiple handlers if already configured
    if not api_logger.handlers:
        # File handler
        file_handler = logging.FileHandler(log_file, encoding='utf-8', mode='a')
        file_handler.setLevel(logging.INFO)
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        api_logger.addHandler(file_handler)
    
    return api_logger

logger = logging.getLogger(__name__)
api_logger = setup_nims_logging()

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
        # Polling configuration
        # Default to a much shorter interval for development so the server doesn't appear to hang
        # Allows override via env: POLL_INTERVAL (seconds) and NIMS_MAX_POLLS / MAX_POLLS
        self.poll_interval = max(5, int(os.getenv("POLL_INTERVAL", "10")))  # seconds
        # Max polls cap; set to 0 or a negative value to disable (poll until completion)
        # Default to unlimited in dev-friendly mode
        self.max_polls = int(os.getenv("NIMS_MAX_POLLS", os.getenv("MAX_POLLS", "0")))
        # Hard time limit for polling (seconds). 0/negative disables.
        self.max_poll_seconds = int(
            os.getenv("NIMS_MAX_WAIT_SECONDS", os.getenv("MAX_WAIT_SECONDS", "1800"))
        )
        
        self.headers = {
            "content-type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "NVCF-POLL-SECONDS": str(self.poll_interval),
        }
        api_logger.info(
            f"NIMSClient configured: poll_interval={self.poll_interval}s, max_polls={self.max_polls}"
        )
        # Timeouts and retry config
        self.request_timeout = int(os.getenv("NIMS_REQUEST_TIMEOUT", "180"))  # seconds
        self.post_retries = int(os.getenv("NIMS_POST_RETRIES", "3"))  # transient 5xx retries
    
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
        
        # Detailed API logging
        api_logger.info(f"=== NVIDIA NIMS API Submit Request ===")
        api_logger.info(f"Sequence Length: {len(sequence)}")
        api_logger.info(f"Sequence Preview: {sequence[:50] + '...' if len(sequence) > 50 else sequence}")
        api_logger.info(f"Parameters: {json.dumps(params, indent=2)}")
        
        # Validate sequence
        is_valid, result = self.validate_sequence(sequence)
        if not is_valid:
            api_logger.error(f"Sequence validation failed: {result}")
            return {"error": result, "status": "validation_failed"}
        
        clean_sequence = result
        payload = self.create_request_payload(clean_sequence, **params)
        
        api_logger.info(f"Payload Size: {len(json.dumps(payload))} bytes")
        api_logger.info(f"Target URL: {self.base_url}")
        
        if progress_callback:
            progress_callback("Submitting folding request...", 0)
        
        try:
            # Create SSL context that doesn't verify certificates (for development)
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            # Create connector with SSL context
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            timeout = aiohttp.ClientTimeout(total=self.request_timeout)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                # Submit initial request with basic retry on transient 5xx
                api_logger.info(f"Making HTTP POST request to NIMS API...")
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
                    
                    api_logger.info(f"=== NVIDIA NIMS API Response ===")
                    api_logger.info(f"Status Code: {response.status}")
                    api_logger.info(f"Response Headers: {dict(response.headers)}")
                    
                    if response.status == 200:
                        # Immediate response (rare)
                        result_data = await response.json()
                        api_logger.info(f"Immediate completion - Response Body: {json.dumps(result_data, indent=2)}")
                        if progress_callback:
                            progress_callback("Folding completed!", 100)
                        return {"status": "completed", "data": result_data}
                    
                    elif response.status == 202:
                        # Request accepted, need to poll
                        req_id = response.headers.get("nvcf-reqid")
                        api_logger.info(f"Request accepted for polling. Request ID: {req_id}")
                        
                        if not req_id:
                            api_logger.error("No request ID received in response headers")
                            return {"error": "No request ID received", "status": "error"}
                        
                        if progress_callback:
                            progress_callback("Request accepted, starting folding process...", 10)
                        
                        # Poll for results
                        return await self._poll_for_results(session, req_id, progress_callback)
                    
                    elif response.status in (502, 503, 504):
                        # Transient upstream error. If we received a reqid, continue with polling.
                        req_id = response.headers.get("nvcf-reqid")
                        body_text = await response.text()
                        api_logger.warning(f"Transient {response.status}. Body: {body_text!r}. ReqID: {req_id}")
                        if req_id:
                            if progress_callback:
                                progress_callback("Request accepted (via 5xx), polling for result...", 10)
                            return await self._poll_for_results(session, req_id, progress_callback)
                        # No reqid; retry if attempts remain
                        if attempt <= self.post_retries:
                            backoff = min(2 ** attempt, 5)
                            api_logger.info(f"Retrying POST (attempt {attempt}/{self.post_retries}) in {backoff}s...")
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
        max_polls = self.max_polls  # Cap total wait; <=0 means unlimited
        unlimited = max_polls <= 0
        consecutive_errors = 0
        
        start_time = time.monotonic()
        transient_failures = 0

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
                
                # Estimate progress based on time (rough approximation)
                estimated_progress = min(90, 10 + (poll_count * 2))
                
                if progress_callback:
                    progress_callback(f"Processing... (poll {poll_count})", estimated_progress)
                
                status_endpoint = f"{self.status_url}/{req_id}"
                api_logger.info(f"Polling NIMS status: {status_endpoint} (poll {poll_count})")
                # Use a per-request timeout tuned for long-poll. Allow server to hold connection ~poll_interval.
                per_req_timeout = aiohttp.ClientTimeout(
                    total=None,  # don't enforce a hard total per request here
                    sock_connect=30,
                    sock_read=max(self.poll_interval + 30, 60)  # allow read slightly beyond poll window
                )
                async with session.get(status_endpoint, headers=self.headers, timeout=per_req_timeout) as response:
                    if response.status == 200:
                        # Completed
                        result_data = await response.json()
                        if progress_callback:
                            progress_callback("Folding completed successfully!", 100)
                        transient_failures = 0
                        return {"status": "completed", "data": result_data}

                    elif response.status == 202:
                        # Still processing
                        consecutive_errors = 0
                        transient_failures = 0
                        continue
                    elif response.status in (502, 503, 504):
                        body_text = await response.text()
                        nvcf_status = response.headers.get("Nvcf-Status", "").lower()
                        api_logger.warning(
                            "Polling transient %s (Nvcf-Status=%s). Body: %r.",
                            response.status,
                            nvcf_status or "unknown",
                            body_text,
                        )
                        consecutive_errors = 0

                        # If the platform already marks the run as errored, stop polling early
                        if nvcf_status in {"errored", "failed", "error"}:
                            return {
                                "error": body_text or f"Polling failed with HTTP {response.status}",
                                "status": "polling_failed",
                            }

                        transient_failures += 1
                        if transient_failures >= 30:
                            api_logger.error(
                                "Polling aborted after %s transient errors (last HTTP %s)",
                                transient_failures,
                                response.status,
                            )
                            return {
                                "error": f"Polling aborted after {transient_failures} transient failures (last HTTP {response.status}).",
                                "status": "polling_failed",
                            }
                        if progress_callback:
                            progress_callback(
                                f"Still processing (NVIDIA backend returned HTTP {response.status}). Retrying...",
                                min(95, estimated_progress),
                            )
                        continue
                    elif response.status == 429:
                        body_text = await response.text()
                        api_logger.warning(f"Polling rate limited (429). Body: {body_text!r}. Backing off.")
                        await asyncio.sleep(min(10, self.poll_interval))
                        consecutive_errors = 0
                        continue
                    elif response.status in (401, 403):
                        error_text = await response.text()
                        api_logger.error(f"Polling auth error {response.status}: {error_text}")
                        return {
                            "error": f"Polling failed: HTTP {response.status}: {error_text}",
                            "status": "polling_failed"
                        }
                    
                    else:
                        # Error
                        error_text = await response.text()
                        return {
                            "error": f"Polling failed: HTTP {response.status}: {error_text}",
                            "status": "polling_failed"
                        }
            
            except (asyncio.TimeoutError, aiohttp.ClientError, ssl.SSLError) as e:
                consecutive_errors += 1
                api_logger.warning(f"Polling error (attempt {consecutive_errors}): {repr(e)}")
                if consecutive_errors <= 5:
                    # brief backoff, then keep polling
                    await asyncio.sleep(min(5, consecutive_errors))
                    continue
                return {"error": f"Polling exception: {str(e)}", "status": "polling_exception"}
            except Exception as e:
                logger.error(f"Polling error: {e}")
                return {"error": f"Polling exception: {str(e)}", "status": "polling_exception"}
        
        # Timeout (only when capped)
        total_wait_sec = self.poll_interval * max_polls if max_polls > 0 else None
        msg = (
            f"Request timeout after {total_wait_sec} seconds" if total_wait_sec is not None
            else "Request timeout"
        )
        return {"error": msg, "status": "timeout"}
    
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
