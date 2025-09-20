import os
import traceback
from typing import Any, Dict

from dotenv import load_dotenv

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

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

try:
    from .agents import agents, list_agents
    from .router_graph import init_router, routerGraph
    from .runner import run_agent
    from .utils import log_line, spell_fix
    from .alphafold_handler import alphafold_handler
    from .rfdiffusion_handler import rfdiffusion_handler
except ImportError:
    # When running directly (not as module)
    from agents import agents, list_agents
    from router_graph import init_router, routerGraph
    from runner import run_agent
    from utils import log_line, spell_fix
    from alphafold_handler import alphafold_handler
    from rfdiffusion_handler import rfdiffusion_handler

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

        # Log the input for debugging
        log_line("agent_route_input", {
            "input": input_text,
            "input_length": len(input_text),
            "has_selection": bool(body.get("selection")),
            "has_code": bool(body.get("currentCode"))
        })
        
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
        
        log_line("agent_route_result", {
            "input": input_text,
            "agentId": agent_id,
            "reason": routed.get("reason"),
            "is_alphafold": agent_id == "alphafold-agent"
        })
        
        if not agent_id:
            return {"error": "router_no_decision", "reason": routed.get("reason")}
        log_line("router", {"agentId": agent_id, "reason": routed.get("reason")})
        log_line("agent_executing", {
            "agentId": agent_id,
            "agent_kind": agents[agent_id].get("kind"),
            "input": input_text
        })
        
        res = await run_agent(
            agent=agents[agent_id],
            user_text=input_text,
            current_code=body.get("currentCode"),
            history=body.get("history"),
            selection=body.get("selection"),
            selections=body.get("selections"),
        )
        
        log_line("agent_completed", {
            "agentId": agent_id,
            "response_type": res.get("type"),
            "has_text": "text" in res,
            "has_code": "code" in res,
            "text_length": len(res.get("text", "")) if res.get("text") else 0
        })
        
        return {"agentId": agent_id, **res, "reason": routed.get("reason")}
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


# RFdiffusion API endpoints
@app.post("/api/rfdiffusion/design")
@limiter.limit("5/minute")
async def rfdiffusion_design(request: Request):
    try:
        body = await request.json()
        parameters = body.get("parameters", {})
        job_id = body.get("jobId")
        
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
            "jobId": job_id
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
        log_line("chat_failed", {"error": str(e), "trace": traceback.format_exc()})
        content = {"error": "chat_failed"}
        if DEBUG_API:
            content["detail"] = str(e)
        return JSONResponse(status_code=500, content=content)
