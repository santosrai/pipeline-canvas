import asyncio
import os
import traceback
import time
import json
from typing import Any, Dict
from pathlib import Path

from dotenv import load_dotenv
import httpx

# Load env as early as possible, before importing modules that read env at import-time
# Load .env from project root (one level up from server directory)
project_root = os.path.dirname(os.path.dirname(__file__))
env_path = os.path.join(project_root, '.env')

if os.path.exists(env_path):
    load_dotenv(env_path, override=True)
    print(f"Loaded .env from: {env_path}")
else:
    print(f"Warning: .env file not found at {env_path}")

# Also load from server directory (for keys like NVCF_RUN_KEY)
server_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(server_env_path):
    load_dotenv(server_env_path, override=True)
    print(f"Also loaded .env from: {server_env_path}")

# Debug: Check if key environment variables are loaded
api_key = os.getenv('ANTHROPIC_API_KEY')
if api_key:
    print(f"ANTHROPIC_API_KEY loaded: {api_key[:20]}...")
else:
    print("Warning: ANTHROPIC_API_KEY not found in environment")

nvidia_key = os.getenv('NVCF_RUN_KEY')
if nvidia_key:
    print(f"NVCF_RUN_KEY loaded: {nvidia_key[:20]}...")
else:
    print("Warning: NVCF_RUN_KEY not found in environment")

from fastapi import FastAPI, Request, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse, FileResponse

try:
    from .agents.registry import agents, list_agents
    from .agents.router import init_router, routerGraph
    from .agents.runner import run_agent
    from .infrastructure.utils import log_line, spell_fix
    from .agents.handlers.alphafold import alphafold_handler
    from .agents.handlers.rfdiffusion import rfdiffusion_handler
    from .agents.handlers.proteinmpnn import proteinmpnn_handler
    from .domain.storage.pdb_storage import save_uploaded_pdb, get_uploaded_pdb
    from .domain.storage.file_access import list_user_files, verify_file_ownership, get_file_metadata, get_user_file_path
    from .database.db import get_db
    from .api.middleware.auth import get_current_user
    from .api.routes import auth, chat_sessions, chat_messages, pipelines, credits, reports, admin, three_d_canvases, attachments
except ImportError:
    # When running directly (not as module)
    import sys
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    from agents.registry import agents, list_agents
    from agents.router import init_router, routerGraph
    from agents.runner import run_agent
    from infrastructure.utils import log_line, spell_fix
    from agents.handlers.alphafold import alphafold_handler
    from agents.handlers.rfdiffusion import rfdiffusion_handler
    from agents.handlers.proteinmpnn import proteinmpnn_handler
    from domain.storage.pdb_storage import save_uploaded_pdb, get_uploaded_pdb
    from domain.storage.file_access import list_user_files, verify_file_ownership, get_file_metadata, get_user_file_path
    from database.db import get_db
    from api.middleware.auth import get_current_user
    from api.routes import auth, chat_sessions, chat_messages, pipelines, credits, reports, admin, three_d_canvases, attachments

DEBUG_API = os.getenv("DEBUG_API", "0") == "1"

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

allowed_origins = os.getenv("APP_ORIGIN", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_router(list(agents.values()))

# Register API routers
app.include_router(auth.router)
app.include_router(chat_sessions.router)
app.include_router(chat_messages.router)
app.include_router(pipelines.router)
app.include_router(credits.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(three_d_canvases.router)
app.include_router(attachments.router)


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"ok": True}


@app.post("/api/logs/error")
@limiter.limit("100/minute")
async def log_error(request: Request):
    """Accept error logs from frontend"""
    try:
        body = await request.json()
        log_line("frontend_error", body)
        return {"status": "logged"}
    except Exception as e:
        log_line("error_logging_failed", {"error": str(e), "trace": traceback.format_exc()})
        return JSONResponse(status_code=500, content={"error": "logging_failed"})


@app.exception_handler(RateLimitExceeded)
def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"error": "rate_limited", "detail": str(exc)})


@app.get("/api/agents")
def get_agents() -> Dict[str, Any]:
    return {"agents": list_agents()}


# Cache for models config
_models_config_cache: Dict[str, Any] = None


def _load_models_config() -> Dict[str, Any]:
    """Load models configuration from JSON file."""
    global _models_config_cache
    
    if _models_config_cache is not None:
        return _models_config_cache
    
    try:
        # Get the server directory path
        server_dir = Path(__file__).parent
        config_path = server_dir / "models_config.json"
        
        if not config_path.exists():
            log_line("models_config_not_found", {"path": str(config_path)})
            return {"models": []}
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        _models_config_cache = config
        log_line("models_config_loaded", {"count": len(config.get("models", []))})
        return config
        
    except json.JSONDecodeError as e:
        log_line("models_config_invalid_json", {"error": str(e)})
        return {"models": []}
    except Exception as e:
        log_line("models_config_load_error", {"error": str(e), "trace": traceback.format_exc()})
        return {"models": []}


@app.get("/api/models")
@limiter.limit("30/minute")
async def get_models(request: Request) -> Dict[str, Any]:
    """Get available models from configuration file."""
    config = _load_models_config()
    models = config.get("models", [])
    
    # Sort by provider, then by name
    models.sort(key=lambda x: (x.get("provider", "Other"), x.get("name", "")))
    
    log_line("models_returned", {"count": len(models)})
    return {"models": models}


@app.post("/api/agents/invoke")
@limiter.limit("30/minute")
async def invoke(request: Request):
    try:
        body = await request.json()
        agent_id = body.get("agentId")
        input_text = body.get("input")
        if not agent_id or agent_id not in agents or not isinstance(input_text, str):
            return {"error": "invalid_input"}
        res = await run_agent(
            agent=agents[agent_id],
            user_text=input_text,
            current_code=body.get("currentCode"),
            history=body.get("history"),
            selection=body.get("selection"),
            selections=body.get("selections"),
        )
        return {"agentId": agent_id, **res}
    except Exception as e:
        log_line("agent_invoke_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "agent_invoke_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/agents/route")
@limiter.limit("60/minute")
async def route(request: Request):
    try:
        body = await request.json()
        input_text = body.get("input")
        if not isinstance(input_text, str):
            return {"error": "invalid_input"}
        input_text = spell_fix(input_text)

        # Check for manual agent override
        manual_agent_id = body.get("agentId")
        model_override = body.get("model")
        
        # Log the input for debugging
        log_line("agent_route_input", {
            "input": input_text,
            "input_length": len(input_text),
            "has_selection": bool(body.get("selection")),
            "has_code": bool(body.get("currentCode")),
            "manual_agent": manual_agent_id,
            "model_override": model_override
        })
        
        # If agentId is provided, skip routing and use specified agent
        if manual_agent_id:
            if manual_agent_id not in agents:
                return {"error": "invalid_agent_id", "agentId": manual_agent_id}
            agent_id = manual_agent_id
            reason = f"Manually selected: {agents[agent_id].get('name', agent_id)}"
        else:
            # Use router to determine agent
            routed = await routerGraph.ainvoke(
                {
                    "input": input_text,
                    "selection": body.get("selection"),
                    "selections": body.get("selections"),
                    "currentCode": body.get("currentCode"),
                    "history": body.get("history"),
                }
            )
            agent_id = routed.get("routedAgentId")
            reason = routed.get("reason")
        
        log_line("agent_route_result", {
            "input": input_text,
            "agentId": agent_id,
            "reason": reason,
            "is_alphafold": agent_id == "alphafold-agent",
            "manual_override": bool(manual_agent_id)
        })
        
        if not agent_id:
            return {"error": "router_no_decision", "reason": reason}
        log_line("router", {"agentId": agent_id, "reason": reason})
        log_line("agent_executing", {
            "agentId": agent_id,
            "agent_kind": agents[agent_id].get("kind"),
            "input": input_text,
            "model_override": model_override
        })
        
        res = await run_agent(
            agent=agents[agent_id],
            user_text=input_text,
            current_code=body.get("currentCode"),
            history=body.get("history"),
            selection=body.get("selection"),
            selections=body.get("selections"),
            model_override=model_override,
        )
        
        log_line("agent_completed", {
            "agentId": agent_id,
            "response_type": res.get("type"),
            "has_text": "text" in res,
            "has_code": "code" in res,
            "text_length": len(res.get("text", "")) if res.get("text") else 0
        })
        
        return {"agentId": agent_id, **res, "reason": reason}
    except Exception as e:
        log_line("agent_route_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "agent_route_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


# AlphaFold API endpoints
@app.post("/api/alphafold/fold")
@limiter.limit("5/minute")
async def alphafold_fold(request: Request):
    try:
        body = await request.json()
        sequence = body.get("sequence")
        parameters = body.get("parameters", {})
        job_id = body.get("jobId")
        
        # Comprehensive logging
        log_line("alphafold_request", {
            "jobId": job_id,
            "sequence_length": len(sequence) if sequence else 0,
            "sequence_preview": sequence[:50] if sequence else None,
            "parameters": parameters,
            "client_ip": get_remote_address(request)
        })
        
        if not sequence or not job_id:
            log_line("alphafold_validation_failed", {
                "missing_sequence": not sequence,
                "missing_jobId": not job_id,
                "jobId": job_id
            })
            return JSONResponse(
                status_code=400,
                content={
                    "status": "error",
                    "error": "Missing sequence or jobId",
                    "errorCode": "MISSING_PARAMETERS",
                    "userMessage": "Required parameters are missing"
                }
            )
        
        # Queue background job and return 202 Accepted immediately
        log_line("alphafold_submitting", {
            "jobId": job_id,
            "handler": "alphafold_handler.submit_folding_job (background)"
        })
        # Mark job as queued
        try:
            alphafold_handler.active_jobs[job_id] = "queued"
        except Exception:
            pass

        # Run the folding job asynchronously
        import asyncio as _asyncio
        _asyncio.create_task(
            alphafold_handler.submit_folding_job({
                "sequence": sequence,
                "parameters": parameters,
                "jobId": job_id
            })
        )

        return JSONResponse(
            status_code=202,
            content={
                "status": "accepted",
                "jobId": job_id,
                "message": "Folding job accepted. Poll /api/alphafold/status/{job_id} for updates."
            }
        )
        
    except Exception as e:
        log_line("alphafold_fold_failed", {"error": str(e), "trace": traceback.format_exc()})
        return JSONResponse(
            status_code=500, 
            content={
                "status": "error",
                "error": "",  # Empty for frontend error handling
                "errorCode": "INTERNAL_ERROR",
                "userMessage": "An unexpected error occurred",
                "technicalMessage": str(e) if DEBUG_API else "Internal server error"
            }
        )


@app.get("/api/alphafold/status/{job_id}")
@limiter.limit("30/minute")
async def alphafold_status(request: Request, job_id: str):
    try:
        status = alphafold_handler.get_job_status(job_id)
        return status
    except Exception as e:
        log_line("alphafold_status_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "alphafold_status_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/alphafold/cancel/{job_id}")
@limiter.limit("10/minute")
async def alphafold_cancel(request: Request, job_id: str):
    try:
        result = alphafold_handler.cancel_job(job_id)
        return result
    except Exception as e:
        log_line("alphafold_cancel_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "alphafold_cancel_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


# AlphaFold3 API endpoints
@app.post("/api/alphafold3/fold")
@limiter.limit("5/minute")
async def alphafold3_fold(request: Request):
    try:
        body = await request.json()
        entities = body.get("entities", [])
        msa_files_map = body.get("msaFilesMap", {})
        job_id = body.get("jobId")
        
        log_line("alphafold3_request", {
            "jobId": job_id,
            "entity_count": len(entities),
            "entity_types": [e.get("type") for e in entities],
            "client_ip": get_remote_address(request)
        })
        
        if not entities or not job_id:
            log_line("alphafold3_validation_failed", {
                "missing_entities": not entities,
                "missing_jobId": not job_id,
                "jobId": job_id
            })
            return JSONResponse(
                status_code=400,
                content={
                    "status": "error",
                    "error": "Missing entities or jobId",
                    "errorCode": "MISSING_PARAMETERS",
                    "userMessage": "Required parameters are missing"
                }
            )
        
        # Queue background job and return 202 Accepted immediately
        log_line("alphafold3_submitting", {
            "jobId": job_id,
            "handler": "alphafold_handler.submit_alphafold3_job (background)"
        })
        
        try:
            alphafold_handler.active_jobs[job_id] = "queued"
        except Exception:
            pass
        
        # Run the folding job asynchronously
        import asyncio as _asyncio
        _asyncio.create_task(
            alphafold_handler.submit_alphafold3_job({
                "entities": entities,
                "msaFilesMap": msa_files_map,
                "jobId": job_id,
                "sessionId": body.get("sessionId"),
                "userId": body.get("userId")
            })
        )
        
        return JSONResponse(
            status_code=202,
            content={
                "status": "accepted",
                "jobId": job_id,
                "message": "AlphaFold3 folding job accepted. Poll /api/alphafold3/status/{job_id} for updates."
            }
        )
        
    except Exception as e:
        log_line("alphafold3_fold_failed", {"error": str(e), "trace": traceback.format_exc()})
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": "",
                "errorCode": "INTERNAL_ERROR",
                "userMessage": "An unexpected error occurred",
                "technicalMessage": str(e) if DEBUG_API else "Internal server error"
            }
        )


@app.get("/api/alphafold3/status/{job_id}")
@limiter.limit("30/minute")
async def alphafold3_status(request: Request, job_id: str):
    try:
        status = alphafold_handler.get_job_status(job_id)
        return status
    except Exception as e:
        log_line("alphafold3_status_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "alphafold3_status_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/alphafold3/cancel/{job_id}")
@limiter.limit("10/minute")
async def alphafold3_cancel(request: Request, job_id: str):
    try:
        result = alphafold_handler.cancel_job(job_id)
        return result
    except Exception as e:
        log_line("alphafold3_cancel_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "alphafold3_cancel_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


# PDB upload utilities -----------------------------------------------------


@app.post("/api/upload/pdb")
@limiter.limit("20/minute")
async def upload_pdb(
    request: Request,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    _ = request
    try:
        contents = await file.read()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        metadata = save_uploaded_pdb(file.filename, contents, user_id)
        log_line(
            "pdb_upload_success",
            {
                "filename": file.filename,
                "file_id": metadata["file_id"],
                "size": metadata.get("size"),
                "chains": metadata.get("chains"),
            },
        )
        return {
            "status": "success",
            "message": "File uploaded",
            "file_info": {
                "filename": metadata.get("filename"),
                "file_id": metadata.get("file_id"),
                "file_url": f"/api/upload/pdb/{metadata.get('file_id')}",
                "file_path": metadata.get("stored_path"),
                "size": metadata.get("size"),
                "atoms": metadata.get("atoms"),
                "chains": metadata.get("chains", []),
            },
        }
    except HTTPException as exc:
        raise exc
    except Exception as e:
        log_line("pdb_upload_failed", {"error": str(e), "trace": traceback.format_exc()})
        raise HTTPException(status_code=500, detail="Failed to upload PDB file")


@app.get("/api/upload/pdb/{file_id}")
@limiter.limit("30/minute")
async def download_uploaded_pdb(request: Request, file_id: str):
    _ = request
    metadata = get_uploaded_pdb(file_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Uploaded file not found")
    return FileResponse(
        metadata["absolute_path"],
        media_type="chemical/x-pdb",
        filename=metadata.get("filename") or f"{file_id}.pdb",
    )


# User file management endpoints -----------------------------------------


@app.get("/api/files")
@limiter.limit("30/minute")
async def get_user_files_endpoint(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """List all files for the current user. Files are already user-scoped in the database."""
    _ = request
    try:
        log_line("user_files_request", {"user_id": user["id"]})
        base_dir = Path(__file__).parent
        all_files = []
        
        # Get all user files (already filtered by user_id in list_user_files)
        user_files = list_user_files(user["id"])
        log_line("user_files_raw", {"user_id": user["id"], "count": len(user_files)})
        
        for file_entry in user_files:
            file_type = file_entry.get("file_type", "")
            file_id = file_entry.get("id", "")
            stored_path_str = file_entry.get("stored_path", "")
            filename = file_entry.get("original_filename", f"{file_id}")
            
            log_line("processing_file", {
                "file_id": file_id,
                "file_type": file_type,
                "stored_path": stored_path_str,
                "filename": filename
            })
            
            if stored_path_str:
                file_path = base_dir / stored_path_str
                file_exists = file_path.exists()
                log_line("file_path_check", {
                    "file_id": file_id,
                    "stored_path": stored_path_str,
                    "absolute_path": str(file_path),
                    "exists": file_exists
                })
                
                if file_exists:
                    # Determine download URL based on file type
                    if file_type == "upload":
                        download_url = f"/api/upload/pdb/{file_id}"
                    elif file_type == "proteinmpnn":
                        download_url = f"/api/proteinmpnn/result/{file_id}"
                    else:
                        # For other types, use generic download endpoint
                        download_url = f"/api/files/{file_id}/download"
                    
                    # Parse metadata if it's a JSON string
                    metadata = file_entry.get("metadata", {})
                    if isinstance(metadata, str):
                        try:
                            metadata = json.loads(metadata)
                        except json.JSONDecodeError:
                            metadata = {}
                    
                    file_size = file_entry.get("size", 0)
                    if file_size == 0:
                        try:
                            file_size = file_path.stat().st_size
                        except OSError:
                            file_size = 0
                    
                    all_files.append({
                        "file_id": file_id,
                        "type": file_type,
                        "filename": filename,
                        "file_path": stored_path_str,
                        "size": file_size,
                        "download_url": download_url,
                        "metadata": metadata,
                    })
                else:
                    log_line("file_not_found", {
                        "file_id": file_id,
                        "expected_path": str(file_path)
                    })
        
        log_line("user_files_loaded", {"user_id": user["id"], "file_count": len(all_files)})
        
        return {
            "status": "success",
            "files": all_files,
        }
    except Exception as e:
        log_line("user_files_list_failed", {"error": str(e), "trace": traceback.format_exc(), "user_id": user["id"]})
        content = {"error": "Failed to list user files"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.get("/api/files/{file_id}/download")
@limiter.limit("30/minute")
async def download_user_file(request: Request, file_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Download a user file. Verifies ownership."""
    _ = request
    try:
        # Get file path with ownership verification
        file_path = get_user_file_path(file_id, user["id"])
        
        # Get file metadata for filename
        file_metadata = get_file_metadata(file_id, user["id"])
        filename = file_metadata.get("original_filename", f"{file_id}.pdb") if file_metadata else f"{file_id}.pdb"
        
        # Determine media type based on file extension
        media_type = "chemical/x-pdb" if filename.lower().endswith(".pdb") else "application/octet-stream"
        
        log_line("file_downloaded", {"file_id": file_id, "user_id": user["id"], "path": str(file_path)})
        
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        log_line("file_download_failed", {"error": str(e), "trace": traceback.format_exc()})
        raise HTTPException(status_code=500, detail="Failed to download file")


@app.get("/api/files/{file_id}")
@limiter.limit("30/minute")
async def get_user_file_content(request: Request, file_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Get file content as JSON (for editor/viewer). Verifies ownership."""
    _ = request
    try:
        # Get file path with ownership verification
        file_path = get_user_file_path(file_id, user["id"])
        
        # Get file metadata
        file_metadata = get_file_metadata(file_id, user["id"])
        if not file_metadata:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Read file content
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # If text decoding fails, return as base64
            import base64
            content = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            return {
                "status": "success",
                "file_id": file_id,
                "filename": file_metadata.get("original_filename", f"{file_id}.pdb"),
                "content": content,
                "encoding": "base64",
                "type": file_metadata.get("file_type", "unknown")
            }
        
        log_line("file_content_accessed", {"file_id": file_id, "user_id": user["id"], "path": str(file_path)})
        
        return {
            "status": "success",
            "file_id": file_id,
            "filename": file_metadata.get("original_filename", f"{file_id}.pdb"),
            "content": content,
            "type": file_metadata.get("file_type", "unknown")
        }
    except HTTPException:
        raise
    except Exception as e:
        log_line("file_content_failed", {"error": str(e), "trace": traceback.format_exc()})
        raise HTTPException(status_code=500, detail="Failed to read file content")


@app.delete("/api/files/{file_id}")
@limiter.limit("10/minute")
async def delete_user_file(request: Request, file_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a user file. Verifies ownership."""
    _ = request
    try:
        # Verify ownership
        if not verify_file_ownership(file_id, user["id"]):
            raise HTTPException(status_code=403, detail="File not found or access denied")
        
        # Get file metadata
        file_metadata = get_file_metadata(file_id, user["id"])
        if not file_metadata:
            raise HTTPException(status_code=404, detail="File not found")
        
        base_dir = Path(__file__).parent
        stored_path = file_metadata.get("stored_path")
        
        if stored_path:
            file_path = base_dir / stored_path
            if file_path.exists():
                file_path.unlink()
                log_line("file_deleted", {"file_id": file_id, "user_id": user["id"], "path": str(file_path)})
        
        # Delete from database
        with get_db() as conn:
            conn.execute("DELETE FROM user_files WHERE id = ? AND user_id = ?", (file_id, user["id"]))
            # Also remove from session_files associations
            conn.execute("DELETE FROM session_files WHERE file_id = ? AND user_id = ?", (file_id, user["id"]))
        
        return {"status": "success", "message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        log_line("file_delete_failed", {"error": str(e), "trace": traceback.format_exc(), "file_id": file_id, "user_id": user["id"]})
        content = {"error": "Failed to delete file"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


# ProteinMPNN endpoints ---------------------------------------------------


@app.get("/api/proteinmpnn/sources")
@limiter.limit("30/minute")
async def proteinmpnn_sources(request: Request):
    _ = request
    try:
        sources = proteinmpnn_handler.list_available_sources()
        return {"status": "success", "sources": sources}
    except Exception as e:
        log_line("proteinmpnn_sources_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "proteinmpnn_sources_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/proteinmpnn/design")
@limiter.limit("5/minute")
async def proteinmpnn_design(request: Request):
    body = await request.json()
    job_id = body.get("jobId")

    if not job_id:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": "Missing jobId",
                "errorCode": "MISSING_PARAMETERS",
                "userMessage": "Required parameters are missing",
            },
        )

    job_payload = {
        "jobId": job_id,
        "parameters": body.get("parameters", {}),
        "pdbSource": body.get("pdbSource"),
        "sourceJobId": body.get("sourceJobId"),
        "uploadId": body.get("uploadId"),
        "pdbPath": body.get("pdbPath"),
        "pdbContent": body.get("pdbContent"),
        "source": body.get("source"),
    }

    try:
        proteinmpnn_handler.validate_job(job_payload)
    except Exception as e:
        log_line(
            "proteinmpnn_validation_failed",
            {"error": str(e), "jobId": job_id},
        )
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": str(e),
                "errorCode": "INVALID_INPUT",
                "userMessage": "ProteinMPNN request is invalid",
            },
        )

    try:
        proteinmpnn_handler.active_jobs[job_id] = "queued"
    except Exception:
        pass

    log_line(
        "proteinmpnn_request",
        {
            "jobId": job_id,
            "pdbSource": job_payload.get("pdbSource"),
            "sourceJobId": job_payload.get("sourceJobId"),
            "uploadId": job_payload.get("uploadId"),
        },
    )

    asyncio.create_task(proteinmpnn_handler.submit_design_job(job_payload))

    return JSONResponse(
        status_code=202,
        content={
            "status": "accepted",
            "jobId": job_id,
            "message": "ProteinMPNN job accepted. Poll /api/proteinmpnn/status/{job_id} for updates.",
        },
    )


@app.get("/api/proteinmpnn/status/{job_id}")
@limiter.limit("30/minute")
async def proteinmpnn_status(request: Request, job_id: str):
    try:
        status = proteinmpnn_handler.get_job_status(job_id)
        return status
    except Exception as e:
        log_line("proteinmpnn_status_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "proteinmpnn_status_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.get("/api/proteinmpnn/result/{job_id}")
@limiter.limit("30/minute")
async def proteinmpnn_result(request: Request, job_id: str, fmt: str = "json"):
    try:
        result = proteinmpnn_handler.get_job_result(job_id)
        if not result:
            raise HTTPException(status_code=404, detail="ProteinMPNN result not found")

        if fmt == "json":
            return result
        if fmt == "fasta":
            fasta_path = proteinmpnn_handler.results_dir / job_id / "designed_sequences.fasta"
            if not fasta_path.exists():
                raise HTTPException(status_code=404, detail="FASTA output not available")
            return FileResponse(
                fasta_path,
                media_type="text/plain",
                filename=f"proteinmpnn_{job_id}.fasta",
            )
        if fmt == "raw":
            raw_path = proteinmpnn_handler.results_dir / job_id / "raw_data.json"
            if raw_path.exists():
                return FileResponse(
                    raw_path,
                    media_type="application/json",
                    filename=f"proteinmpnn_{job_id}_raw.json",
                )
            raise HTTPException(status_code=404, detail="Raw output not available")

        raise HTTPException(status_code=400, detail="Unsupported format requested")
    except HTTPException as exc:
        raise exc
    except Exception as e:
        log_line("proteinmpnn_result_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "proteinmpnn_result_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


# RFdiffusion API endpoints
@app.post("/api/rfdiffusion/design")
@limiter.limit("5/minute")
async def rfdiffusion_design(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        body = await request.json()
        parameters = body.get("parameters", {})
        job_id = body.get("jobId")
        session_id = body.get("sessionId")
        
        if not job_id:
            return JSONResponse(
                status_code=400,
                content={
                    "status": "error",
                    "error": "Missing jobId",
                    "errorCode": "MISSING_PARAMETERS",
                    "userMessage": "Required parameters are missing"
                }
            )
        
        log_line("rfdiffusion_design_request", {
            "job_id": job_id,
            "user_id": user["id"],
            "session_id": session_id,
            "has_parameters": bool(parameters)
        })
        
        result = await rfdiffusion_handler.submit_design_job({
            "parameters": parameters,
            "jobId": job_id,
            "userId": user["id"],
            "sessionId": session_id
        })
        
        # Check if result contains an error and return appropriate HTTP status
        if result.get("status") == "error":
            error_msg = result.get("error", "Unknown error")
            
            # Check for specific error types
            if "API key not configured" in error_msg or "NVCF_RUN_KEY" in error_msg:
                return JSONResponse(
                    status_code=503,  # Service Unavailable
                    content={
                        "status": "error",
                        "error": "",  # Empty for frontend error handling
                        "errorCode": "RFDIFFUSION_API_NOT_CONFIGURED",
                        "userMessage": "RFdiffusion service is not available. API key not configured.",
                        "technicalMessage": error_msg,
                        "suggestions": [
                            {
                                "action": "Contact administrator",
                                "description": "The RFdiffusion service requires NVIDIA API key configuration",
                                "type": "contact",
                                "priority": 1
                            }
                        ]
                    }
                )
            else:
                return JSONResponse(
                    status_code=500,
                    content={
                        "status": "error",
                        "error": "",  # Empty for frontend error handling
                        "errorCode": "DESIGN_FAILED",
                        "userMessage": "Protein design computation failed",
                        "technicalMessage": error_msg
                    }
                )
        
        return result
        
    except Exception as e:
        log_line("rfdiffusion_design_failed", {"error": str(e), "trace": traceback.format_exc()})
        return JSONResponse(
            status_code=500, 
            content={
                "status": "error",
                "error": "",  # Empty for frontend error handling
                "errorCode": "INTERNAL_ERROR",
                "userMessage": "An unexpected error occurred",
                "technicalMessage": str(e) if DEBUG_API else "Internal server error"
            }
        )


@app.get("/api/rfdiffusion/status/{job_id}")
@limiter.limit("30/minute")
async def rfdiffusion_status(request: Request, job_id: str):
    try:
        status = rfdiffusion_handler.get_job_status(job_id)
        return status
    except Exception as e:
        log_line("rfdiffusion_status_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "rfdiffusion_status_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/rfdiffusion/cancel/{job_id}")
@limiter.limit("10/minute")
async def rfdiffusion_cancel(request: Request, job_id: str):
    try:
        result = rfdiffusion_handler.cancel_job(job_id)
        return result
    except Exception as e:
        log_line("rfdiffusion_cancel_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "rfdiffusion_cancel_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


# Back-compat endpoints
@app.post("/api/generate")
async def generate(request: Request):
    try:
        body = await request.json()
        prompt = body.get("prompt")
        if not isinstance(prompt, str):
            return {"error": "prompt is required"}
        res = await run_agent(
            agent=agents["code-builder"],
            user_text=prompt,
            current_code=body.get("currentCode"),
            history=body.get("history"),
            selection=body.get("selection"),
        )
        return res
    except Exception as e:
        log_line("generation_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "generation_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/chat")
async def chat(request: Request):
    try:
        body = await request.json()
        prompt = body.get("prompt")
        if not isinstance(prompt, str):
            return {"error": "prompt is required"}
        res = await run_agent(
            agent=agents["bio-chat"],
            user_text=prompt,
            current_code=body.get("currentCode"),
            history=body.get("history"),
            selection=body.get("selection"),
        )
        return res
    except Exception as e:
        if "OpenRouter API key is missing" in str(e):
            return JSONResponse(status_code=503, content={"error": "api_key_missing", "message": str(e)})
        log_line("chat_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "chat_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.post("/api/chat/generate-title")
@limiter.limit("30/minute")
async def generate_chat_title(request: Request):
    """Generate an AI-powered title for a chat session based on messages."""
    try:
        body = await request.json()
        messages = body.get("messages", [])
        
        if not messages or len(messages) < 2:
            return {"title": "New Chat"}
        
        # Get first user message and first AI response
        user_msg = next((m for m in messages if m.get("type") == "user"), None)
        ai_msg = next((m for m in messages if m.get("type") == "ai"), None)
        
        if not user_msg or not ai_msg:
            return {"title": "New Chat"}
        
        # Create prompt for title generation
        user_content = user_msg.get("content", "")[:200]
        ai_content = ai_msg.get("content", "")[:200]
        
        title_prompt = f"""Generate a concise, descriptive title (max 60 characters) for this chat conversation.

User: {user_content}
AI: {ai_content}

Return ONLY the title text, no quotes, no explanation. Make it specific and meaningful."""

        # Use a lightweight model for title generation (Haiku is fast and cheap)
        from .agents.runner import _get_openrouter_api_key, _load_model_map
        
        model_map = _load_model_map()
        model_id = model_map.get("anthropic/claude-3-haiku", "anthropic/claude-3-haiku")
        api_key = _get_openrouter_api_key()
        
        if not api_key:
            log_line("title_generation_failed", {"error": "API key missing"})
            return {"title": "New Chat"}
        
        # Call OpenRouter API using httpx for async
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": os.getenv("APP_ORIGIN", "http://localhost:5173"),
                    "X-Title": "NovoProtein AI",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_id,
                    "messages": [
                        {"role": "user", "content": title_prompt}
                    ],
                    "max_tokens": 30,
                    "temperature": 0.3,
                }
            )
            response.raise_for_status()
            result = response.json()
            title = result["choices"][0]["message"]["content"].strip()
            
            # Clean up title (remove quotes, limit length)
            title = title.strip('"\'')
            if len(title) > 60:
                title = title[:57] + "..."
            
            log_line("title_generated", {"title": title, "model": model_id})
            return {"title": title or "New Chat"}
            
    except Exception as e:
        log_line("title_generation_failed", {"error": str(e), "trace": traceback.format_exc()})
        return {"title": "New Chat"}
