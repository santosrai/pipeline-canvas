"""Track PDB files associated with chat sessions."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).parent
TRACKER_FILE = BASE_DIR / "session_files.json"


def _ensure_tracker() -> None:
    """Ensure tracker file exists."""
    if not TRACKER_FILE.exists():
        TRACKER_FILE.write_text("{}", encoding="utf-8")


def _load_tracker() -> Dict[str, List[Dict[str, any]]]:
    """Load session file tracker."""
    _ensure_tracker()
    try:
        return json.loads(TRACKER_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_tracker(tracker: Dict[str, List[Dict[str, any]]]) -> None:
    """Save session file tracker."""
    TRACKER_FILE.write_text(json.dumps(tracker, indent=2), encoding="utf-8")


def associate_file_with_session(
    session_id: str,
    file_id: str,
    file_type: str,
    file_path: str,
    filename: str,
    size: int,
    job_id: Optional[str] = None,
    metadata: Optional[Dict[str, any]] = None,
) -> None:
    """Associate a file with a session."""
    tracker = _load_tracker()
    
    if session_id not in tracker:
        tracker[session_id] = []
    
    # Check if file already associated
    existing = next(
        (f for f in tracker[session_id] if f.get("file_id") == file_id and f.get("type") == file_type),
        None
    )
    
    if not existing:
        file_entry = {
            "file_id": file_id,
            "type": file_type,  # 'upload', 'rfdiffusion', 'alphafold'
            "file_path": file_path,
            "filename": filename,
            "size": size,
            "job_id": job_id,
            "metadata": metadata or {},
        }
        tracker[session_id].append(file_entry)
        _save_tracker(tracker)


def get_session_files(session_id: str) -> List[Dict[str, any]]:
    """Get all files associated with a session."""
    tracker = _load_tracker()
    return tracker.get(session_id, [])


def remove_file_from_session(session_id: str, file_id: str, file_type: str) -> None:
    """Remove a file association from a session."""
    tracker = _load_tracker()
    if session_id in tracker:
        tracker[session_id] = [
            f for f in tracker[session_id]
            if not (f.get("file_id") == file_id and f.get("type") == file_type)
        ]
        _save_tracker(tracker)




