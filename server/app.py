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

from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse

try:
    from .agents import agents, list_agents
    from .router_graph import init_router, routerGraph
    from .runner import run_agent, run_agent_stream
    from .utils import log_line, spell_fix
    from .alphafold_handler import alphafold_handler
    from .rfdiffusion_handler import rfdiffusion_handler
    from .proteinmpnn_handler import proteinmpnn_handler
    from .pdb_storage import save_uploaded_pdb, get_uploaded_pdb
    from .session_file_tracker import associate_file_with_session, get_session_files
except ImportError:
    # When running directly (not as module)
    import sys
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    from agents import agents, list_agents
    from router_graph import init_router, routerGraph
    from runner import run_agent, run_agent_stream
    from utils import log_line, spell_fix
    from alphafold_handler import alphafold_handler
    from rfdiffusion_handler import rfdiffusion_handler
    from proteinmpnn_handler import proteinmpnn_handler
    from pdb_storage import save_uploaded_pdb, get_uploaded_pdb
    from session_file_tracker import associate_file_with_session, get_session_files

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
                    "uploadedFileId": body.get("uploadedFileId"),
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
        
        # Load uploaded file metadata if uploadedFileId is provided
        uploaded_file_context = None
        uploaded_file_id = body.get("uploadedFileId")
        if uploaded_file_id:
            try:
                file_metadata = get_uploaded_pdb(uploaded_file_id)
                if file_metadata:
                    uploaded_file_context = {
                        "file_id": uploaded_file_id,
                        "filename": file_metadata.get("filename"),
                        "atoms": file_metadata.get("atoms"),
                        "chains": file_metadata.get("chains", []),
                        "file_url": f"/api/upload/pdb/{uploaded_file_id}",
                    }
                    log_line("agent_route:uploaded_file", {
                        "file_id": uploaded_file_id,
                        "filename": file_metadata.get("filename"),
                        "atoms": file_metadata.get("atoms"),
                    })
            except Exception as e:
                log_line("agent_route:uploaded_file_error", {"error": str(e), "file_id": uploaded_file_id})
        
        res = await run_agent(
            agent=agents[agent_id],
            user_text=input_text,
            current_code=body.get("currentCode"),
            history=body.get("history"),
            selection=body.get("selection"),
            selections=body.get("selections"),
            current_structure_origin=body.get("currentStructureOrigin"),
            uploaded_file_context=uploaded_file_context,
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


@app.post("/api/agents/route-stream")
@limiter.limit("60/minute")
async def route_stream(request: Request):
    """Streaming endpoint for thinking models that yields incremental updates."""
    try:
        body = await request.json()
        input_text = body.get("input")
        if not isinstance(input_text, str):
            return JSONResponse(status_code=400, content={"error": "invalid_input"})
        input_text = spell_fix(input_text)

        # Check for manual agent override
        manual_agent_id = body.get("agentId")
        model_override = body.get("model")
        
        # Log the input for debugging
        log_line("agent_route_stream_input", {
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
                return JSONResponse(status_code=400, content={"error": "invalid_agent_id", "agentId": manual_agent_id})
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
                    "uploadedFileId": body.get("uploadedFileId"),
                }
            )
            agent_id = routed.get("routedAgentId")
            reason = routed.get("reason")
        
        log_line("agent_route_stream_result", {
            "input": input_text,
            "agentId": agent_id,
            "reason": reason,
            "manual_override": bool(manual_agent_id)
        })
        
        if not agent_id:
            return JSONResponse(status_code=400, content={"error": "router_no_decision", "reason": reason})
        
        log_line("agent_stream_executing", {
            "agentId": agent_id,
            "agent_kind": agents[agent_id].get("kind"),
            "input": input_text,
            "model_override": model_override
        })
        
        # Load uploaded file metadata if uploadedFileId is provided
        uploaded_file_context = None
        uploaded_file_id = body.get("uploadedFileId")
        if uploaded_file_id:
            try:
                file_metadata = get_uploaded_pdb(uploaded_file_id)
                if file_metadata:
                    uploaded_file_context = {
                        "file_id": uploaded_file_id,
                        "filename": file_metadata.get("filename"),
                        "atoms": file_metadata.get("atoms"),
                        "chains": file_metadata.get("chains", []),
                        "file_url": f"/api/upload/pdb/{uploaded_file_id}",
                    }
                    log_line("agent_route_stream:uploaded_file", {
                        "file_id": uploaded_file_id,
                        "filename": file_metadata.get("filename"),
                        "atoms": file_metadata.get("atoms"),
                    })
            except Exception as e:
                log_line("agent_route_stream:uploaded_file_error", {"error": str(e), "file_id": uploaded_file_id})
        
        async def generate_stream():
            try:
                async for chunk in run_agent_stream(
                    agent=agents[agent_id],
                    user_text=input_text,
                    current_code=body.get("currentCode"),
                    history=body.get("history"),
                    selection=body.get("selection"),
                    selections=body.get("selections"),
                    current_structure_origin=body.get("currentStructureOrigin"),
                    uploaded_file_context=uploaded_file_context,
                    model_override=model_override,
                ):
                    # Format chunk as JSON line
                    chunk_data = {
                        "type": chunk["type"],
                        "data": chunk["data"]
                    }
                    # Add agentId and reason to complete message
                    if chunk["type"] == "complete":
                        chunk_data["data"]["agentId"] = agent_id
                        chunk_data["data"]["reason"] = reason
                    
                    yield json.dumps(chunk_data) + "\n"
            except Exception as e:
                log_line("agent_stream_failed", {"error": str(e), "trace": traceback.format_exc()})
                error_chunk = {
                    "type": "error",
                    "data": {
                        "error": "agent_stream_failed",
                        "detail": str(e) if DEBUG_API else None
                    }
                }
                yield json.dumps(error_chunk) + "\n"
        
        return StreamingResponse(
            generate_stream(),
            media_type="application/x-ndjson"  # Newline-delimited JSON
        )
    except Exception as e:
        log_line("agent_route_stream_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "agent_route_stream_failed"}
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
        session_id = body.get("sessionId")  # Optional session ID
        
        # Comprehensive logging
        log_line("alphafold_request", {
            "jobId": job_id,
            "sessionId": session_id,
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
            "sessionId": session_id,
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
                "jobId": job_id,
                "sessionId": session_id,  # Pass session ID to handler
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


# PDB upload utilities -----------------------------------------------------


@app.post("/api/upload/pdb")
@limiter.limit("20/minute")
async def upload_pdb(request: Request, file: UploadFile = File(...)):
    try:
        # Try to get session_id from form data or query params
        form_data = await request.form()
        session_id = form_data.get("session_id") or request.query_params.get("session_id")
        
        contents = await file.read()
        metadata = save_uploaded_pdb(file.filename, contents)
        
        # Associate file with session if session_id provided
        if session_id:
            try:
                associate_file_with_session(
                    session_id=str(session_id),
                    file_id=metadata["file_id"],
                    file_type="upload",
                    file_path=metadata.get("stored_path", ""),
                    filename=metadata.get("filename", file.filename),
                    size=metadata.get("size", len(contents)),
                    metadata={
                        "atoms": metadata.get("atoms"),
                        "chains": metadata.get("chains", []),
                    },
                )
            except Exception as e:
                # Log but don't fail the upload if association fails
                log_line("file_association_failed", {"error": str(e), "session_id": session_id})
        
        log_line(
            "pdb_upload_success",
            {
                "filename": file.filename,
                "file_id": metadata["file_id"],
                "size": metadata.get("size"),
                "chains": metadata.get("chains"),
                "session_id": session_id,
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
                "chain_residue_counts": metadata.get("chain_residue_counts", {}),
                "total_residues": metadata.get("total_residues", 0),
                "suggested_contigs": metadata.get("suggested_contigs", "50-150"),
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


# Session file management endpoints -----------------------------------------


@app.get("/api/sessions/{session_id}/files")
@limiter.limit("30/minute")
async def get_session_files_endpoint(request: Request, session_id: str):
    """List all PDB files associated with a session."""
    _ = request
    try:
        log_line("session_files_request", {"session_id": session_id})
        files = get_session_files(session_id)
        log_line("session_files_loaded", {"session_id": session_id, "file_count": len(files)})
        
        # Enrich file data with download URLs and verify file existence
        enriched_files = []
        for file_entry in files:
            file_type = file_entry.get("type", "")
            file_id = file_entry.get("file_id", "")
            file_path = file_entry.get("file_path", "")
            
            # Determine download URL based on file type
            if file_type == "upload":
                download_url = f"/api/upload/pdb/{file_id}"
            elif file_type == "alphafold":
                # Check if file exists in server/alphafold_results (like proteinmpnn_results)
                filename = file_entry.get("filename", "")
                stored_path = file_entry.get("file_path", "")
                
                # Files are stored relative to server directory
                if stored_path and not Path(stored_path).is_absolute():
                    result_path = Path(__file__).parent / stored_path
                elif stored_path and Path(stored_path).is_absolute():
                    result_path = Path(stored_path)
                else:
                    # Fallback to standard location
                    result_path = Path(__file__).parent / "alphafold_results" / filename
                
                if result_path.exists():
                    download_url = f"/api/sessions/{session_id}/files/{file_id}/download"
                else:
                    log_line("alphafold_file_not_found", {
                        "session_id": session_id,
                        "file_id": file_id,
                        "filename": filename,
                        "expected_path": str(result_path),
                        "stored_path": stored_path
                    })
                    continue  # Skip if file doesn't exist
            elif file_type == "rfdiffusion":
                # Check if file exists in server/rfdiffusion_results (like proteinmpnn_results)
                filename = file_entry.get("filename", "")
                stored_path = file_entry.get("file_path", "")
                
                # Files are stored relative to server directory
                if stored_path and not Path(stored_path).is_absolute():
                    result_path = Path(__file__).parent / stored_path
                elif stored_path and Path(stored_path).is_absolute():
                    result_path = Path(stored_path)
                else:
                    # Fallback to standard location
                    result_path = Path(__file__).parent / "rfdiffusion_results" / filename
                
                if result_path.exists():
                    download_url = f"/api/sessions/{session_id}/files/{file_id}/download"
                else:
                    log_line("rfdiffusion_file_not_found", {
                        "session_id": session_id,
                        "file_id": file_id,
                        "filename": filename,
                        "expected_path": str(result_path),
                        "stored_path": stored_path
                    })
                    continue  # Skip if file doesn't exist
            else:
                download_url = f"/api/sessions/{session_id}/files/{file_id}/download"
            
            enriched_file = {
                **file_entry,
                "download_url": download_url,
            }
            enriched_files.append(enriched_file)
        
        return {
            "status": "success",
            "files": enriched_files,
        }
    except Exception as e:
        log_line("session_files_list_failed", {"error": str(e), "trace": traceback.format_exc(), "session_id": session_id})
        content = {"error": "Failed to list session files"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.get("/api/sessions/{session_id}/files/{file_id}")
@limiter.limit("30/minute")
async def get_session_file_content(request: Request, session_id: str, file_id: str):
    """Get content of a specific file from a session."""
    _ = request
    try:
        files = get_session_files(session_id)
        file_entry = next((f for f in files if f.get("file_id") == file_id), None)
        
        if not file_entry:
            raise HTTPException(status_code=404, detail="File not found in session")
        
        file_type = file_entry.get("type", "")
        file_path = file_entry.get("file_path", "")
        filename = file_entry.get("filename", "")
        
        # Load file content based on type
        if file_type == "upload":
            metadata = get_uploaded_pdb(file_id)
            if not metadata or not metadata.get("absolute_path"):
                raise HTTPException(status_code=404, detail="Uploaded file not found")
            file_path = metadata["absolute_path"]
        elif file_type == "alphafold":
            # Files are stored in server/alphafold_results (relative to server directory)
            stored_path = file_entry.get("file_path", "")
            if stored_path and not Path(stored_path).is_absolute():
                result_path = Path(__file__).parent / stored_path
            elif stored_path and Path(stored_path).is_absolute():
                result_path = Path(stored_path)
            else:
                result_path = Path(__file__).parent / "alphafold_results" / filename
            
            if not result_path.exists():
                raise HTTPException(status_code=404, detail="AlphaFold result file not found")
            file_path = str(result_path)
        elif file_type == "rfdiffusion":
            # Files are stored in server/rfdiffusion_results (relative to server directory)
            stored_path = file_entry.get("file_path", "")
            if stored_path and not Path(stored_path).is_absolute():
                result_path = Path(__file__).parent / stored_path
            elif stored_path and Path(stored_path).is_absolute():
                result_path = Path(stored_path)
            else:
                result_path = Path(__file__).parent / "rfdiffusion_results" / filename
            
            if not result_path.exists():
                raise HTTPException(status_code=404, detail="RFdiffusion result file not found")
            file_path = str(result_path)
        else:
            raise HTTPException(status_code=400, detail="Unknown file type")
        
        # Read and return file content
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        return {
            "status": "success",
            "file_id": file_id,
            "filename": filename,
            "type": file_type,
            "content": content,
            "size": len(content),
        }
    except HTTPException:
        raise
    except Exception as e:
        log_line("session_file_content_failed", {"error": str(e), "trace": traceback.format_exc(), "session_id": session_id, "file_id": file_id})
        content = {"error": "Failed to get file content"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)


@app.get("/api/sessions/{session_id}/files/{file_id}/download")
@limiter.limit("30/minute")
async def download_session_file(request: Request, session_id: str, file_id: str):
    """Download a file from a session."""
    _ = request
    try:
        files = get_session_files(session_id)
        file_entry = next((f for f in files if f.get("file_id") == file_id), None)
        
        if not file_entry:
            raise HTTPException(status_code=404, detail="File not found in session")
        
        file_type = file_entry.get("type", "")
        filename = file_entry.get("filename", "")
        
        # Determine file path based on type
        if file_type == "upload":
            metadata = get_uploaded_pdb(file_id)
            if not metadata or not metadata.get("absolute_path"):
                raise HTTPException(status_code=404, detail="Uploaded file not found")
            file_path = metadata["absolute_path"]
        elif file_type == "alphafold":
            # Files are stored in server/alphafold_results (relative to server directory)
            stored_path = file_entry.get("file_path", "")
            if stored_path and not Path(stored_path).is_absolute():
                result_path = Path(__file__).parent / stored_path
            elif stored_path and Path(stored_path).is_absolute():
                result_path = Path(stored_path)
            else:
                result_path = Path(__file__).parent / "alphafold_results" / filename
            
            if not result_path.exists():
                raise HTTPException(status_code=404, detail="AlphaFold result file not found")
            file_path = str(result_path)
        elif file_type == "rfdiffusion":
            # Files are stored in server/rfdiffusion_results (relative to server directory)
            stored_path = file_entry.get("file_path", "")
            if stored_path and not Path(stored_path).is_absolute():
                result_path = Path(__file__).parent / stored_path
            elif stored_path and Path(stored_path).is_absolute():
                result_path = Path(stored_path)
            else:
                result_path = Path(__file__).parent / "rfdiffusion_results" / filename
            
            if not result_path.exists():
                raise HTTPException(status_code=404, detail="RFdiffusion result file not found")
            file_path = str(result_path)
        else:
            raise HTTPException(status_code=400, detail="Unknown file type")
        
        return FileResponse(
            file_path,
            media_type="chemical/x-pdb",
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        log_line("session_file_download_failed", {"error": str(e), "trace": traceback.format_exc(), "session_id": session_id, "file_id": file_id})
        raise HTTPException(status_code=500, detail="Failed to download file")


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
async def rfdiffusion_design(request: Request):
    try:
        body = await request.json()
        parameters = body.get("parameters", {})
        job_id = body.get("jobId")
        session_id = body.get("sessionId")  # Optional session ID
        
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
        
        result = await rfdiffusion_handler.submit_design_job({
            "parameters": parameters,
            "jobId": job_id,
            "sessionId": session_id,  # Pass session ID to handler
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
                # For validation errors (422), use the detailed error message as userMessage
                # Check if it's a validation error (contains "Residue" or "not in pdb" or "Validation error")
                is_validation_error = (
                    "Validation error" in error_msg or 
                    "Residue" in error_msg and "not in pdb" in error_msg.lower() or
                    "422" in error_msg
                )
                
                user_message = error_msg if is_validation_error else "Protein design computation failed"
                
                return JSONResponse(
                    status_code=500,
                    content={
                        "status": "error",
                        "error": "",  # Empty for frontend error handling
                        "errorCode": "DESIGN_FAILED",
                        "userMessage": user_message,
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


@app.post("/api/rfdiffusion/run")
@limiter.limit("5/minute")
async def rfdiffusion_run(request: Request):
    """
    Direct RFdiffusion endpoint for pipeline nodes.
    Accepts pipeline node format and bridges to existing handler.
    
    Expected request body format (from pipeline node):
    {
        "pdb_file": "...",  # PDB content string, file path, or file ID
        "contigs": "50",     # Contig specification
        "num_designs": 1,    # Number of designs (optional)
        "hotspot_res": [],   # Hotspot residues (optional)
        "diffusion_steps": 15  # Diffusion steps (optional)
    }
    
    Returns:
    {
        "status": "success",
        "output_pdb": "...",  # PDB content string
        "filename": "...",
        "filepath": "..."
    }
    """
    try:
        body = await request.json()
        
        # Debug: Log incoming request - FULL DETAILS
        print("=" * 80)
        print("[RFdiffusion Run] ===== INCOMING REQUEST ======")
        print(f"[RFdiffusion Run] Request body type: {type(body).__name__}")
        if isinstance(body, dict):
            print(f"[RFdiffusion Run] Request body keys: {list(body.keys())}")
            for key, value in body.items():
                if key == "pdb_file" and isinstance(value, str) and len(value) > 200:
                    print(f"[RFdiffusion Run]   {key}: {type(value).__name__} (length: {len(value)}, preview: {value[:100]}...)")
                elif isinstance(value, (dict, list)):
                    print(f"[RFdiffusion Run]   {key}: {type(value).__name__} = {value}")
                else:
                    print(f"[RFdiffusion Run]   {key}: {type(value).__name__} = {repr(value)}")
        else:
            print(f"[RFdiffusion Run] Request body: {body}")
        print("=" * 80)
        
        # Extract parameters from pipeline node format
        pdb_file = body.get("pdb_file") or body.get("input_pdb")
        pdb_id = body.get("pdb_id")
        contigs = body.get("contigs", "A50-150")
        num_designs = body.get("num_designs", 1)
        hotspot_res_raw = body.get("hotspot_res", [])
        # Parse hotspot_res - can be array or comma-separated string
        if isinstance(hotspot_res_raw, str):
            # If it's a string, parse it (even if empty)
            if hotspot_res_raw.strip():
                hotspot_res = [h.strip() for h in hotspot_res_raw.split(',') if h.strip()]
            else:
                hotspot_res = []  # Empty string = empty array
        elif isinstance(hotspot_res_raw, list):
            # Filter out empty strings from list
            hotspot_res = [h for h in hotspot_res_raw if h and str(h).strip()]
        else:
            hotspot_res = []
        
        # Debug log hotspot_res
        print(f"[RFdiffusion Run] hotspot_res: {hotspot_res} (type: {type(hotspot_res).__name__}, length: {len(hotspot_res)})")
        diffusion_steps = body.get("diffusion_steps", 15)
        design_mode = body.get("design_mode", "unconditional")
        
        # Handle pdb_file if it's an object (from input_node)
        upload_id_from_object = None
        if pdb_file and isinstance(pdb_file, dict):
            # Extract file_id if it's a file metadata object
            upload_id_from_object = pdb_file.get("file_id") or pdb_file.get("uploadId")
            # Also check for pdb_id in the object
            if not pdb_id and pdb_file.get("pdb_id"):
                pdb_id = pdb_file.get("pdb_id")
            # If it has file_id, use that as uploadId and clear pdb_file
            if upload_id_from_object:
                pdb_file = None  # Clear pdb_file so we use uploadId instead
            else:
                # If it's a dict but no file_id, try to extract other useful info
                # Maybe it has file_url or we should treat it as invalid
                # For now, clear it and let the handler deal with missing PDB
                pdb_file = None
        
        # Generate job ID for tracking
        job_id = f"rf_{int(time.time() * 1000)}"
        
        # Convert pipeline format to handler format
        # The handler expects parameters in a specific structure
        parameters = {
            "contigs": contigs,
            "diffusion_steps": diffusion_steps,
            "design_mode": design_mode,
            "num_designs": num_designs,
        }
        
        # Only include hotspot_res if it's not empty
        # Empty hotspot_res can cause API errors if the PDB doesn't match
        # Also filter out any invalid/empty entries
        if hotspot_res and len(hotspot_res) > 0:
            # Filter out empty strings and ensure all entries are valid
            filtered_hotspot_res = [h for h in hotspot_res if h and str(h).strip()]
            if filtered_hotspot_res:
                parameters["hotspot_res"] = filtered_hotspot_res
                print(f"[RFdiffusion Run] Including hotspot_res: {filtered_hotspot_res}")
            else:
                print(f"[RFdiffusion Run] hotspot_res was provided but all values were empty, omitting it")
        else:
            print(f"[RFdiffusion Run] No hotspot_res provided, omitting from parameters")
        
        # Handle PDB ID if provided separately
        if pdb_id and pdb_id.strip():
            parameters["pdb_id"] = pdb_id.strip().upper()
            parameters["design_mode"] = "motif_scaffolding"
        
        # Handle upload ID from object
        if upload_id_from_object:
            # Verify the upload ID exists before using it
            try:
                metadata = get_uploaded_pdb(upload_id_from_object)
                if metadata and metadata.get("absolute_path"):
                    parameters["uploadId"] = upload_id_from_object
                    # Only set design_mode to motif_scaffolding if we have a PDB source
                    if design_mode == "unconditional":
                        parameters["design_mode"] = "motif_scaffolding"
                    print(f"[RFdiffusion Run] Using uploadId: {upload_id_from_object}, file exists: {Path(metadata['absolute_path']).exists()}")
                else:
                    print(f"[RFdiffusion Run] Warning: uploadId {upload_id_from_object} not found in metadata")
                    # If uploadId doesn't exist, don't set it - let handler deal with missing PDB
            except Exception as e:
                print(f"[RFdiffusion Run] Error checking uploadId {upload_id_from_object}: {e}")
                # Don't set uploadId if we can't verify it
        
        # Track if we set input_pdb so we can update design_mode
        has_input_pdb_set = False
        
        # Handle PDB file - could be:
        # 1. PDB content string (starts with ATOM or HEADER)
        # 2. File path (relative to server directory)
        # 3. File ID (upload ID)
        # 4. PDB ID (4-character code)
        if pdb_file:
            pdb_str = str(pdb_file).strip()
            
            # Check if it's PDB content (starts with ATOM or HEADER)
            if pdb_str.startswith("ATOM") or pdb_str.startswith("HEADER"):
                parameters["input_pdb"] = pdb_str
                has_input_pdb_set = True
                # If we have PDB content, we must use motif_scaffolding or partial_diffusion mode
                # Unconditional mode doesn't accept input_pdb
                if parameters.get("design_mode") == "unconditional":
                    parameters["design_mode"] = "motif_scaffolding"
                    print(f"[RFdiffusion Run] Changed design_mode from unconditional to motif_scaffolding (PDB content provided)")
            # Check if it's a PDB ID (4 characters)
            elif len(pdb_str) == 4 and pdb_str.isalnum():
                parameters["pdb_id"] = pdb_str.upper()
                parameters["design_mode"] = "motif_scaffolding"
            # Check if it's a file path or upload ID
            else:
                # Try as upload ID first
                try:
                    metadata = get_uploaded_pdb(pdb_str)
                    if metadata and metadata.get("absolute_path"):
                        parameters["uploadId"] = pdb_str
                        parameters["design_mode"] = "motif_scaffolding"
                    else:
                        # Try as file path
                        pdb_path = Path(__file__).parent / pdb_str
                        if pdb_path.exists():
                            parameters["input_pdb"] = pdb_path.read_text()
                            has_input_pdb_set = True
                            # If we have PDB content, use motif_scaffolding mode
                            if parameters.get("design_mode") == "unconditional":
                                parameters["design_mode"] = "motif_scaffolding"
                                print(f"[RFdiffusion Run] Changed design_mode from unconditional to motif_scaffolding (PDB file found)")
                        else:
                            # Assume it's PDB content
                            parameters["input_pdb"] = pdb_str
                            has_input_pdb_set = True
                            # If we have PDB content, use motif_scaffolding mode
                            if parameters.get("design_mode") == "unconditional":
                                parameters["design_mode"] = "motif_scaffolding"
                                print(f"[RFdiffusion Run] Changed design_mode from unconditional to motif_scaffolding (assuming PDB content)")
                except Exception as e:
                    log_line("rfdiffusion_run_pdb_resolve_warning", {
                        "pdb_source": pdb_str,
                        "error": str(e)
                    })
                    parameters["input_pdb"] = pdb_str
                    # If we have PDB content, use motif_scaffolding mode
                    if parameters.get("design_mode") == "unconditional":
                        parameters["design_mode"] = "motif_scaffolding"
        
        # Final check: if we have input_pdb but design_mode is still unconditional, change it
        if parameters.get("input_pdb") and parameters.get("design_mode") == "unconditional":
            parameters["design_mode"] = "motif_scaffolding"
            print(f"[RFdiffusion Run] Final fix: Changed design_mode from unconditional to motif_scaffolding (input_pdb present)")
        
        # Debug: Log parameters being sent to handler - FULL DETAILS
        print("=" * 80)
        print("[RFdiffusion Run] ===== PARAMETERS TO HANDLER ======")
        print(f"[RFdiffusion Run] Parameters keys: {list(parameters.keys())}")
        for key, value in parameters.items():
            if key == "input_pdb" and isinstance(value, str) and len(value) > 200:
                print(f"[RFdiffusion Run]   {key}: {type(value).__name__} (length: {len(value)}, preview: {value[:100]}...)")
            elif isinstance(value, (dict, list)):
                print(f"[RFdiffusion Run]   {key}: {type(value).__name__} = {value}")
            else:
                print(f"[RFdiffusion Run]   {key}: {type(value).__name__} = {repr(value)}")
        print(f"[RFdiffusion Run] Design mode: {parameters.get('design_mode')}")
        print(f"[RFdiffusion Run] Has uploadId: {bool(parameters.get('uploadId'))}")
        if parameters.get('uploadId'):
            # Verify uploadId exists before calling handler
            try:
                upload_metadata = get_uploaded_pdb(parameters.get('uploadId'))
                if upload_metadata:
                    print(f"[RFdiffusion Run] UploadId verified, file path: {upload_metadata.get('absolute_path')}")
                else:
                    print(f"[RFdiffusion Run] WARNING: UploadId {parameters.get('uploadId')} not found!")
            except Exception as e:
                print(f"[RFdiffusion Run] ERROR checking uploadId: {e}")
        print(f"[RFdiffusion Run] Has pdb_id: {bool(parameters.get('pdb_id'))}")
        print(f"[RFdiffusion Run] Has input_pdb: {bool(parameters.get('input_pdb'))}")
        if parameters.get('input_pdb'):
            input_pdb_val = parameters.get('input_pdb')
            print(f"[RFdiffusion Run] input_pdb type: {type(input_pdb_val).__name__}, length: {len(input_pdb_val) if isinstance(input_pdb_val, str) else 'N/A'}")
        print("=" * 80)
        
        # Call existing handler
        result = await rfdiffusion_handler.submit_design_job({
            "parameters": parameters,
            "jobId": job_id,
            "sessionId": None,  # Pipeline nodes don't use sessions
        })
        
        # Check for errors
        if result.get("status") == "error":
            error_msg = result.get("error", "Unknown error")
            # Log the error for debugging
            log_line("rfdiffusion_run_handler_error", {
                "error": error_msg,
                "job_id": job_id,
                "parameters_keys": list(parameters.keys()),
                "design_mode": parameters.get("design_mode"),
                "has_input_pdb": bool(parameters.get("input_pdb")),
                "has_uploadId": bool(parameters.get("uploadId")),
                "has_pdb_id": bool(parameters.get("pdb_id"))
            })
            print(f"[RFdiffusion Run] Handler returned error: {error_msg}")
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "error": error_msg,
                    "response": {
                        "status": 500,
                        "statusText": "Internal Server Error",
                        "headers": {},
                        "data": {"detail": error_msg}
                    }
                }
            )
        
        # Success case - extract PDB content
        if result.get("status") == "success":
            data = result.get("data", {})
            pdb_content = data.get("pdbContent")
            filename = data.get("filename", f"rfdiffusion_{job_id}.pdb")
            filepath = data.get("filepath")
            
            if pdb_content:
                return JSONResponse(
                    status_code=200,
                    content={
                        "status": "success",
                        "output_pdb": pdb_content,
                        "filename": filename,
                        "filepath": filepath,
                        "data": {
                            "pdbContent": pdb_content,
                            "filename": filename,
                            "filepath": filepath
                        }
                    }
                )
            else:
                return JSONResponse(
                    status_code=500,
                    content={
                        "status": "error",
                        "error": "No PDB content in response",
                        "response": {
                            "status": 500,
                            "statusText": "Internal Server Error",
                            "headers": {},
                            "data": {"detail": "No PDB content in response"}
                        }
                    }
                )
        
        # Unexpected status
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": f"Unexpected status: {result.get('status')}",
                "response": {
                    "status": 500,
                    "statusText": "Internal Server Error",
                    "headers": {},
                    "data": {"detail": f"Unexpected status: {result.get('status')}"}
                }
            }
        )
        
    except Exception as e:
        error_trace = traceback.format_exc()
        error_msg = str(e)
        log_line("rfdiffusion_run_failed", {
            "error": error_msg,
            "trace": error_trace,
            "body_keys": list(body.keys()) if isinstance(body, dict) else "not_dict",
            "body_pdb_file_type": type(body.get("pdb_file")).__name__ if isinstance(body, dict) and body.get("pdb_file") else "unknown"
        })
        print(f"[RFdiffusion Run Error] {error_msg}\n{error_trace}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": error_msg,
                "response": {
                    "status": 500,
                    "statusText": "Internal Server Error",
                    "headers": {},
                    "data": {"detail": error_msg if DEBUG_API else "Internal server error"}
                }
            }
        )


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
        
        log_line("title_generation_request", {
            "message_count": len(messages) if messages else 0,
            "has_messages": bool(messages)
        })
        
        if not messages or len(messages) < 2:
            log_line("title_generation_skipped", {"reason": "insufficient_messages"})
            return {"title": "New Chat"}
        
        # Get first user message and first AI response
        user_msg = next((m for m in messages if m.get("type") == "user"), None)
        ai_msg = next((m for m in messages if m.get("type") == "ai"), None)
        
        if not user_msg or not ai_msg:
            log_line("title_generation_skipped", {"reason": "missing_user_or_ai_message"})
            return {"title": "New Chat"}
        
        # Create prompt for title generation
        user_content = user_msg.get("content", "")[:200]
        ai_content = ai_msg.get("content", "")[:200]
        
        title_prompt = f"""Generate a concise, descriptive title (max 60 characters) for this chat conversation.

User: {user_content}
AI: {ai_content}

Return ONLY the title text, no quotes, no explanation. Make it specific and meaningful."""

        # Use a lightweight model for title generation (Haiku is fast and cheap)
        from .runner import _get_openrouter_api_key, _load_model_map
        
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
