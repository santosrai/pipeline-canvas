"""ProteinMPNN job orchestration for the FastAPI backend."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

try:
    from .utils import log_line
    from .proteinmpnn_client import get_proteinmpnn_client, ProteinMPNNClient
    from .pdb_storage import get_uploaded_pdb, list_uploaded_pdbs
except ImportError:
    from utils import log_line
    from proteinmpnn_client import get_proteinmpnn_client, ProteinMPNNClient
    from pdb_storage import get_uploaded_pdb, list_uploaded_pdbs

logger = logging.getLogger(__name__)


class ProteinMPNNHandler:
    """Coordinates ProteinMPNN design jobs and persists results."""

    def __init__(self) -> None:
        self._client: Optional[ProteinMPNNClient] = None
        self.active_jobs: Dict[str, str] = {}
        self.job_results: Dict[str, Dict[str, Any]] = {}
        self.results_dir = Path(__file__).parent / "proteinmpnn_results"
        self.results_dir.mkdir(exist_ok=True)

    def _get_client(self) -> ProteinMPNNClient:
        if self._client is None:
            self._client = get_proteinmpnn_client()
        return self._client

    def _resolve_rfdiffusion_path(self, source_job_id: str) -> Path:
        safe_id = source_job_id.replace("..", "").replace("/", "").strip()
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
        status = self.active_jobs.get(job_id, "not_found")
        response: Dict[str, Any] = {"job_id": job_id, "status": status}
        if job_id in self.job_results:
            response.update(self.job_results[job_id])
        return response

    def get_job_result(self, job_id: str) -> Optional[Dict[str, Any]]:
        result_dir = self.results_dir / job_id
        result_file = result_dir / "result.json"
        if not result_file.exists():
            return None
        try:
            data = json.loads(result_file.read_text())
            return data
        except json.JSONDecodeError:
            return None

    def list_available_sources(self) -> Dict[str, Any]:
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

        uploads = list_uploaded_pdbs()
        return {
            "rfdiffusion": rfdiffusion_entries,
            "uploads": uploads,
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

            result_dir = self.results_dir / job_id
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
                self.job_results[job_id] = {
                    "status": "completed",
                    "metadata": metadata,
                }
                (result_dir / "result.json").write_text(
                    json.dumps(result, indent=2), encoding="utf-8"
                )
                await self._persist_design_outputs(result_dir, result)
                log_line("proteinmpnn_job_completed", {"jobId": job_id, "status": result.get("status")})
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

        # Attempt to extract designed sequences from known fields
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
            fasta_lines = []
            for idx, seq in enumerate(sequences, start=1):
                header = f">ProteinMPNN_design_{idx}"
                fasta_lines.append(header)
                fasta_lines.append(seq)
            (result_dir / "designed_sequences.fasta").write_text("\n".join(fasta_lines), encoding="utf-8")

        (result_dir / "raw_data.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


proteinmpnn_handler = ProteinMPNNHandler()
