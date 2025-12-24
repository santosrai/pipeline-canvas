"""Utilities for storing and retrieving uploaded PDB files."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
PDB_DIR = UPLOAD_DIR / "pdb"
INDEX_FILE = UPLOAD_DIR / "pdb_index.json"


def _ensure_dirs() -> None:
    PDB_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text("{}", encoding="utf-8")


def _load_index() -> Dict[str, Dict[str, str]]:
    _ensure_dirs()
    try:
        return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_index(index: Dict[str, Dict[str, str]]) -> None:
    INDEX_FILE.write_text(json.dumps(index, indent=2), encoding="utf-8")


def _analyze_pdb(content: str) -> Tuple[int, List[str], Dict[str, int]]:
    """Return atom count, list of chain identifiers, and residue counts per chain."""
    atoms = 0
    chains = set()
    chain_residues: Dict[str, set] = {}
    
    # Standard amino acid three-letter codes
    aa_codes = {
        'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
        'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL'
    }
    
    for line in content.splitlines():
        if not line:
            continue
        record = line[:6].strip().upper()
        if record in {"ATOM", "HETATM"}:
            atoms += 1
            if len(line) >= 22:
                chain_id = line[21].strip() or "?"
                chains.add(chain_id)
                
                # Extract residue information for CA atoms (protein residues)
                if len(line) >= 26 and line[12:16].strip() == 'CA':
                    res_name = line[17:20].strip()
                    if res_name in aa_codes:
                        try:
                            res_seq = int(line[22:26].strip())
                            if chain_id not in chain_residues:
                                chain_residues[chain_id] = set()
                            chain_residues[chain_id].add(res_seq)
                        except (ValueError, IndexError):
                            pass
    
    # Convert sets to counts
    chain_residue_counts = {
        chain: len(residues) 
        for chain, residues in chain_residues.items()
    }
    
    return atoms, sorted(chain for chain in chains if chain), chain_residue_counts


def _suggest_rfdiffusion_contigs(chain_residue_counts: Dict[str, int]) -> str:
    """Suggest RFdiffusion contigs based on chain residue counts."""
    if not chain_residue_counts:
        return "50-150"  # Default generic contig
    
    # Get the first chain (usually chain A)
    first_chain = sorted(chain_residue_counts.keys())[0] if chain_residue_counts else None
    if not first_chain:
        return "50-150"
    
    residue_count = chain_residue_counts[first_chain]
    
    # Suggest contigs based on structure size
    if residue_count < 50:
        # Small structure - suggest full length
        return f"{first_chain}1-{residue_count}"
    elif residue_count < 150:
        # Medium structure - suggest middle portion
        start = max(1, residue_count // 4)
        end = min(residue_count, start + 100)
        return f"{first_chain}{start}-{end}"
    else:
        # Large structure - suggest a 100-residue window
        start = residue_count // 4
        end = start + 100
        return f"{first_chain}{start}-{end}"


def save_uploaded_pdb(filename: str, content: bytes) -> Dict[str, object]:
    """Persist an uploaded PDB file and return metadata about it."""
    if not filename.lower().endswith(".pdb"):
        raise HTTPException(status_code=400, detail="Only .pdb files are supported")

    text_content = content.decode("utf-8", errors="ignore")
    atoms, chains, chain_residue_counts = _analyze_pdb(text_content)
    
    # Calculate suggested RFdiffusion parameters
    suggested_contigs = _suggest_rfdiffusion_contigs(chain_residue_counts)
    total_residues = sum(chain_residue_counts.values())

    file_id = uuid.uuid4().hex
    stored_name = f"{file_id}.pdb"
    stored_path = PDB_DIR / stored_name
    stored_path.write_bytes(content)

    index = _load_index()
    metadata = {
        "file_id": file_id,
        "filename": filename,
        "stored_path": str(stored_path.relative_to(BASE_DIR)),
        "size": len(content),
        "atoms": atoms,
        "chains": chains,
        "chain_residue_counts": chain_residue_counts,
        "total_residues": total_residues,
        "suggested_contigs": suggested_contigs,
    }
    index[file_id] = metadata
    _save_index(index)

    return metadata


def get_uploaded_pdb(file_id: str) -> Optional[Dict[str, object]]:
    index = _load_index()
    metadata = index.get(file_id)
    if not metadata:
        return None
    stored_rel = metadata.get("stored_path")
    if not stored_rel:
        return None
    stored_path = BASE_DIR / stored_rel
    if not stored_path.exists():
        return None
    metadata = dict(metadata)
    metadata["absolute_path"] = str(stored_path)
    return metadata


def list_uploaded_pdbs() -> List[Dict[str, object]]:
    index = _load_index()
    results: List[Dict[str, object]] = []
    for file_id, meta in index.items():
        stored_rel = meta.get("stored_path")
        if not stored_rel:
            continue
        stored_path = BASE_DIR / stored_rel
        if not stored_path.exists():
            continue
        enriched = dict(meta)
        enriched["file_id"] = file_id
        try:
            stat = stored_path.stat()
            enriched["modified"] = stat.st_mtime
        except OSError:
            enriched["modified"] = None
        results.append(enriched)
    results.sort(key=lambda item: item.get("modified") or 0, reverse=True)
    return results


def delete_uploaded_pdb(file_id: str) -> None:
    index = _load_index()
    if file_id not in index:
        return
    stored_rel = index[file_id].get("stored_path")
    stored_path = BASE_DIR / stored_rel if stored_rel else None
    if stored_path and stored_path.exists():
        try:
            stored_path.unlink()
        except OSError:
            pass
    index.pop(file_id, None)
    _save_index(index)

