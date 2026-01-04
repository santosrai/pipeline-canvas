"""ProteinMPNN job orchestration for the FastAPI backend."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# Ensure server directory is in Python path for imports
_server_dir = os.path.dirname(os.path.abspath(__file__))
if _server_dir not in sys.path:
    sys.path.insert(0, _server_dir)

try:
    from ...infrastructure.utils import log_line
    from ...tools.nvidia.proteinmpnn import get_proteinmpnn_client, ProteinMPNNClient
    from ...domain.storage.pdb_storage import get_uploaded_pdb, list_uploaded_pdbs
except ImportError:
    from infrastructure.utils import log_line
    from tools.nvidia.proteinmpnn import get_proteinmpnn_client, ProteinMPNNClient
    from domain.storage.pdb_storage import get_uploaded_pdb, list_uploaded_pdbs

logger = logging.getLogger(__name__)


class ProteinMPNNHandler:
    """Coordinates ProteinMPNN design jobs and persists results."""

    def __init__(self) -> None:
        self._client: Optional[ProteinMPNNClient] = None
        self.active_jobs: Dict[str, str] = {}
        self.job_results: Dict[str, Dict[str, Any]] = {}
        # Results directory will be user-scoped, set per job
        self._base_dir = Path(__file__).parent.parent.parent

    def _get_client(self) -> ProteinMPNNClient:
        if self._client is None:
            self._client = get_proteinmpnn_client()
        return self._client

    def _resolve_rfdiffusion_path(self, source_job_id: str, user_id: Optional[str] = None) -> Path:
        safe_id = source_job_id.replace("..", "").replace("/", "").strip()
        if user_id:
            base = self._base_dir / "storage" / user_id / "rfdiffusion_results"
        else:
            # Fallback to old location for backward compatibility
            base = Path(__file__).parent / "rfdiffusion_results"
        candidate = base / f"rfdiffusion_{safe_id}.pdb"
        if not candidate.exists():
            raise FileNotFoundError(f"RFdiffusion result for job {source_job_id} not found")
        return candidate

    def _resolve_uploaded_path(self, upload_id: str) -> Path:
        metadata = get_uploaded_pdb(upload_id)
        if not metadata:
            raise FileNotFoundError(f"Uploaded PDB {upload_id} not found")
        return Path(metadata["absolute_path"])

    def _load_pdb_content(self, job_data: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """Load PDB text and return with source metadata."""
        source_type = job_data.get("pdbSource") or job_data.get("source", {}).get("type")
        source_meta: Dict[str, Any] = {}

        if source_type == "rfdiffusion":
            source_job_id = job_data.get("sourceJobId") or job_data.get("source", {}).get("jobId")
            if not source_job_id:
                raise ValueError("sourceJobId required for RFdiffusion source")
            path = self._resolve_rfdiffusion_path(source_job_id)
            pdb_text = path.read_text()
            source_meta = {
                "type": "rfdiffusion",
                "job_id": source_job_id,
                "pdb_path": str(path),
                "filename": path.name,
            }
        elif source_type == "upload":
            upload_id = job_data.get("uploadId") or job_data.get("source", {}).get("uploadId")
            if not upload_id:
                raise ValueError("uploadId required for upload source")
            path = self._resolve_uploaded_path(upload_id)
            pdb_text = path.read_text()
            source_meta = {
                "type": "upload",
                "upload_id": upload_id,
                "pdb_path": str(path),
                "filename": path.name,
            }
        elif job_data.get("pdbPath"):
            path = Path(job_data["pdbPath"]).expanduser().resolve()
            pdb_text = path.read_text()
            source_meta = {
                "type": "path",
                "pdb_path": str(path),
                "filename": path.name,
            }
        elif job_data.get("pdbContent"):
            pdb_text = str(job_data["pdbContent"])
            source_meta = {"type": "inline"}
        else:
            raise ValueError("No PDB source provided for ProteinMPNN job")

        if len(pdb_text) < 10:
            raise ValueError("PDB content appears empty")

        return pdb_text, source_meta

    def validate_job(self, job_data: Dict[str, Any]) -> None:
        """Ensure the provided job request has a readable PDB source."""
        self._load_pdb_content(job_data)

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        # First check in-memory status (for active/running jobs)
        status = self.active_jobs.get(job_id, "not_found")
        
        # If not found in memory, check file system (for completed jobs after server restart)
        if status == "not_found":
            # Check multiple locations for result files
            search_paths = [
                self._base_dir / "storage" / "system" / "proteinmpnn_results" / job_id,
                self._base_dir / "proteinmpnn_results" / job_id,  # Old location
            ]
            
            for result_dir in search_paths:
                result_file = result_dir / "result.json"
                if result_file.exists():
                    try:
                        data = json.loads(result_file.read_text())
                        status = data.get("status", "completed")
                        response = {
                            "job_id": job_id,
                            "status": status,
                            "metadata": data.get("metadata", {}),
                        }
                        if status == "error":
                            response["error"] = data.get("error")
                        logger.info(f"[ProteinMPNN] Found job status from file system: {job_id} = {status}")
                        return response
                    except (json.JSONDecodeError, KeyError) as e:
                        logger.warning(f"[ProteinMPNN] Failed to read status from {result_file}: {e}")
                        continue
        
        # Return in-memory status
        response: Dict[str, Any] = {"job_id": job_id, "status": status}
        if job_id in self.job_results:
            response.update(self.job_results[job_id])
        return response

    def get_job_result(self, job_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        # Try multiple locations in order:
        # 1. User-scoped directory (if user_id provided)
        # 2. System directory (for jobs created with userId="system")
        # 3. Old location (for backward compatibility)
        search_paths = []
        
        if user_id:
            search_paths.append(self._base_dir / "storage" / user_id / "proteinmpnn_results" / job_id)
        
        # Always check system directory as fallback
        search_paths.append(self._base_dir / "storage" / "system" / "proteinmpnn_results" / job_id)
        
        # Old location for backward compatibility
        search_paths.append(self._base_dir / "proteinmpnn_results" / job_id)
        
        logger.debug(f"[ProteinMPNN] Searching for result {job_id} (user_id={user_id}) in {len(search_paths)} locations")
        for result_dir in search_paths:
            result_file = result_dir / "result.json"
            logger.debug(f"[ProteinMPNN] Checking: {result_file} (exists={result_file.exists()})")
            if result_file.exists():
                try:
                    data = json.loads(result_file.read_text())
                    logger.info(f"[ProteinMPNN] Found result at: {result_file}")
                    return data
                except json.JSONDecodeError as e:
                    logger.warning(f"[ProteinMPNN] Failed to parse JSON at {result_file}: {e}")
                    continue
        
        logger.warning(f"[ProteinMPNN] Result not found for {job_id} in any of {len(search_paths)} locations")
        return None

    def list_available_sources(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        rfdiffusion_dir = Path(__file__).parent / "rfdiffusion_results"
        rfdiffusion_entries = []
        if rfdiffusion_dir.exists():
            for pdb_file in sorted(rfdiffusion_dir.glob("rfdiffusion_*.pdb"), reverse=True):
                try:
                    job_id = pdb_file.stem.replace("rfdiffusion_", "", 1)
                    stat = pdb_file.stat()
                    rfdiffusion_entries.append(
                        {
                            "jobId": job_id,
                            "filename": pdb_file.name,
                            "path": str(pdb_file),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                        }
                    )
                except OSError:
                    continue

        # If user_id is provided, list user-specific uploads; otherwise return empty list
        if user_id:
            uploads = list_uploaded_pdbs(user_id)
        else:
            uploads = []
        return {
            "rfdiffusion": rfdiffusion_entries,
            "uploads": uploads,
        }

    async def process_design_request(self, input_text: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Process a natural language ProteinMPNN design request
        
        Args:
            input_text: User's design request
            context: Optional context (current PDB, selection, etc.)
            
        Returns:
            Dictionary with design parameters for user confirmation
        """
        import re
        try:
            text = input_text.lower()
            
            # Determine PDB source
            pdb_source = "upload"  # Default to upload
            source_info: Dict[str, Any] = {}
            
            # Check for RFdiffusion job reference
            rf_match = re.search(r'rf[_\s]*(\w+)', text)
            if rf_match:
                job_id = rf_match.group(1)
                # Check if RFdiffusion result exists
                rfdiffusion_dir = Path(__file__).parent / "rfdiffusion_results"
                candidate = rfdiffusion_dir / f"rfdiffusion_{job_id}.pdb"
                if candidate.exists():
                    pdb_source = "rfdiffusion"
                    source_info = {"jobId": job_id}
            
            # Check for uploaded PDB reference
            if "upload" in text or "file" in text or "pdb file" in text:
                pdb_source = "upload"
            
            # Parse parameters
            num_designs = 5  # Default
            temperature = 0.1  # Default
            chain_ids = []
            fixed_positions = []
            
            # Extract number of designs
            designs_match = re.search(r'(\d+)\s*(?:designs?|sequences?)', text)
            if designs_match:
                num_designs = min(max(1, int(designs_match.group(1))), 20)
            
            # Extract temperature
            temp_match = re.search(r'temperature[:\s]*([0-9.]+)', text)
            if temp_match:
                temp_val = float(temp_match.group(1))
                temperature = min(max(0.0, temp_val), 1.0)
            
            # Extract chain IDs
            chain_match = re.search(r'chain[s]?[:\s]*([A-Z,\s]+)', text, re.I)
            if chain_match:
                chain_ids = [c.strip().upper() for c in chain_match.group(1).split(',') if c.strip()]
            
            # Extract fixed positions
            fixed_match = re.search(r'fixed[:\s]*\[([A-Z0-9,\s]+)\]', text, re.I)
            if fixed_match:
                fixed_positions = [p.strip() for p in fixed_match.group(1).split(',') if p.strip()]
            else:
                # Try pattern like "fix A45, A46"
                fixed_match2 = re.search(r'fix(?:ed)?[:\s]+([A-Z]\d+(?:,\s*[A-Z]\d+)*)', text, re.I)
                if fixed_match2:
                    fixed_positions = [p.strip() for p in fixed_match2.group(1).split(',') if p.strip()]
            
            # Check available sources
            available_sources = self.list_available_sources()
            has_rfdiffusion = len(available_sources.get("rfdiffusion", [])) > 0
            has_uploads = len(available_sources.get("uploads", [])) > 0
            
            # If no source is available, default to upload
            if pdb_source == "rfdiffusion" and not has_rfdiffusion:
                pdb_source = "upload"
                source_info = {}
            
            # Create confirmation response
            design_info = {
                "summary": f"Redesigning sequence for backbone structure",
                "notes": []
            }
            
            if pdb_source == "rfdiffusion":
                design_info["summary"] = f"Using RFdiffusion result {source_info.get('jobId', 'unknown')}"
            elif pdb_source == "upload":
                design_info["notes"].append("Please upload a PDB file to continue")
            
            if chain_ids:
                design_info["notes"].append(f"Designing chains: {', '.join(chain_ids)}")
            if fixed_positions:
                design_info["notes"].append(f"Fixed positions: {', '.join(fixed_positions)}")
            
            return {
                "action": "confirm_proteinmpnn_design",
                "pdbSource": pdb_source,
                "source": source_info if source_info else {},
                "parameters": {
                    "numDesigns": num_designs,
                    "temperature": temperature,
                    "chainIds": chain_ids if chain_ids else [],
                    "fixedPositions": fixed_positions if fixed_positions else [],
                },
                "design_info": design_info,
                "message": f"Ready to run ProteinMPNN with {num_designs} design(s). Please confirm backbone source and parameters."
            }
            
        except Exception as e:
            logger.error(f"Error processing ProteinMPNN design request: {e}")
            return {
                "error": str(e),
                "action": "error"
            }

    async def submit_design_job(self, job_data: Dict[str, Any]) -> None:
        job_id = job_data.get("jobId")
        if not job_id:
            raise ValueError("jobId is required for ProteinMPNN job")

        self.active_jobs[job_id] = "running"
        log_line("proteinmpnn_job_start", {"jobId": job_id, "data": {k: v for k, v in job_data.items() if k != "pdbContent"}})

        try:
            pdb_text, source_meta = self._load_pdb_content(job_data)
            parameters = job_data.get("parameters", {})
            client = self._get_client()

            num_designs = parameters.get("numDesigns", parameters.get("num_designs", 1))
            temperature = parameters.get("temperature", 0.1)
            chain_ids = parameters.get("chainIds") or parameters.get("chain_ids")
            fixed_positions = parameters.get("fixedPositions") or parameters.get("fixed_positions")
            random_seed = parameters.get("randomSeed") or parameters.get("random_seed")
            extra_options = parameters.get("options")

            progress_state = {"message": "Job started", "progress": 5}

            def progress_callback(message: str, progress: float) -> None:
                progress_state.update({"message": message, "progress": progress})
                self.job_results[job_id] = {
                    "status": "running",
                    "progress": progress_state,
                    "metadata": {
                        "job_id": job_id,
                        "source": source_meta,
                        "parameters": parameters,
                    },
                }

            result = await client.submit_design_job(
                pdb_text,
                num_designs=num_designs,
                temperature=temperature,
                chain_ids=chain_ids,
                fixed_positions=fixed_positions,
                random_seed=random_seed,
                extra_options=extra_options,
                progress_callback=progress_callback,
            )

            # Get user-scoped results directory
            user_id = job_data.get("userId", "system")
            results_dir = self._base_dir / "storage" / user_id / "proteinmpnn_results"
            result_dir = results_dir / job_id
            result_dir.mkdir(parents=True, exist_ok=True)
            metadata = {
                "job_id": job_id,
                "source": source_meta,
                "parameters": parameters,
                "result": result,
            }

            (result_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

            if result.get("status") == "completed":
                self.active_jobs[job_id] = "completed"
                # Extract sequences before saving
                await self._persist_design_outputs(result_dir, result)
                # Update result with extracted sequences if available
                if "sequences" in result:
                    metadata["sequences"] = result["sequences"]
                self.job_results[job_id] = {
                    "status": "completed",
                    "metadata": metadata,
                    "sequences": result.get("sequences", []),
                }
                (result_dir / "result.json").write_text(
                    json.dumps(result, indent=2), encoding="utf-8"
                )
                log_line("proteinmpnn_job_completed", {"jobId": job_id, "status": result.get("status"), "num_sequences": len(result.get("sequences", []))})
            else:
                self.active_jobs[job_id] = result.get("status", "error")
                self.job_results[job_id] = {
                    "status": result.get("status", "error"),
                    "error": result.get("error"),
                    "metadata": metadata,
                }
                (result_dir / "result.json").write_text(
                    json.dumps(result, indent=2), encoding="utf-8"
                )
                log_line(
                    "proteinmpnn_job_failed",
                    {"jobId": job_id, "status": result.get("status"), "error": result.get("error")},
                )
        except Exception as exc:
            logger.exception("ProteinMPNN job %s failed", job_id)
            self.active_jobs[job_id] = "error"
            self.job_results[job_id] = {
                "status": "error",
                "error": str(exc),
                "metadata": {
                    "job_id": job_id,
                    "parameters": job_data.get("parameters", {}),
                },
            }
            log_line("proteinmpnn_job_exception", {"jobId": job_id, "error": str(exc)})

    async def _persist_design_outputs(self, result_dir: Path, result: Dict[str, Any]) -> None:
        """Save any design artefacts (FASTA, JSON) if present in result."""
        data = result.get("data") or {}
        sequences = None

        # First, check for mfasta field (NVIDIA API format)
        if "mfasta" in data and isinstance(data["mfasta"], str):
            mfasta_content = data["mfasta"]
            # Parse FASTA format: extract sequences (lines that don't start with >)
            parsed_sequences = []
            current_seq = []
            for line in mfasta_content.split("\n"):
                line = line.strip()
                if line.startswith(">"):
                    # Save previous sequence if we have one
                    if current_seq:
                        seq = "".join(current_seq)
                        # Skip input sequence (usually first one with ">input" header)
                        if not line.startswith(">input"):
                            # Remove any chain separators (/) and extract just the sequence
                            clean_seq = seq.split("/")[0] if "/" in seq else seq
                            if clean_seq and all(c in "ACDEFGHIKLMNPQRSTVWY" for c in clean_seq.upper()):
                                parsed_sequences.append(clean_seq)
                    current_seq = []
                elif line:
                    # Accumulate sequence lines
                    current_seq.append(line)
            # Handle last sequence
            if current_seq:
                seq = "".join(current_seq)
                clean_seq = seq.split("/")[0] if "/" in seq else seq
                if clean_seq and all(c in "ACDEFGHIKLMNPQRSTVWY" for c in clean_seq.upper()):
                    parsed_sequences.append(clean_seq)
            if parsed_sequences:
                sequences = parsed_sequences
                # Also save the original mfasta as FASTA file
                (result_dir / "designed_sequences.fasta").write_text(mfasta_content, encoding="utf-8")

        # Fallback: Attempt to extract designed sequences from known fields
        if not sequences:
            possible_fields = [
                "designed_sequences",
                "designed_seqs",
                "sequences",
                "output_sequences",
            ]
            for field in possible_fields:
                if field in data and isinstance(data[field], (list, tuple)):
                    sequences = list(data[field])
                    break
            if not sequences and "result" in data and isinstance(data["result"], dict):
                inner = data["result"]
                for field in possible_fields:
                    if field in inner and isinstance(inner[field], (list, tuple)):
                        sequences = list(inner[field])
                        data = inner
                        break

        if sequences:
            # If we didn't already write FASTA from mfasta, create it now
            if not (result_dir / "designed_sequences.fasta").exists():
                fasta_lines = []
                for idx, seq in enumerate(sequences, start=1):
                    header = f">ProteinMPNN_design_{idx}"
                    fasta_lines.append(header)
                    fasta_lines.append(seq)
                (result_dir / "designed_sequences.fasta").write_text("\n".join(fasta_lines), encoding="utf-8")
            
            # Store sequences in result.json for easy access
            result["sequences"] = sequences

        (result_dir / "raw_data.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


proteinmpnn_handler = ProteinMPNNHandler()
