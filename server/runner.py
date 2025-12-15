import os
import json
import requests
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, AsyncGenerator

try:
    from .utils import log_line, get_text_from_completion, strip_code_fences, trim_history
    from .safety import violates_whitelist, ensure_clear_on_change
    from .uniprot import search_uniprot
except ImportError:
    from utils import log_line, get_text_from_completion, strip_code_fences, trim_history
    from safety import violates_whitelist, ensure_clear_on_change
    from uniprot import search_uniprot


_openrouter_api_key: Optional[str] = None
_model_map: Optional[Dict[str, str]] = None


def _load_model_map() -> Dict[str, str]:
    """Load model ID mappings from models_config.json.
    Maps legacy Anthropic model IDs to OpenRouter model IDs.
    """
    global _model_map
    if _model_map is not None:
        return _model_map
    
    _model_map = {}
    
    # Try to load from models_config.json
    config_path = Path(__file__).parent / "models_config.json"
    try:
        if config_path.exists():
            with open(config_path, 'r') as f:
                config = json.load(f)
                models = config.get("models", [])
                
                # Create mapping from legacy IDs to OpenRouter IDs
                # Map common legacy Anthropic model IDs to their OpenRouter equivalents
                legacy_to_openrouter = {
                    "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
                    "claude-3-5-sonnet-20240620": "anthropic/claude-3.5-sonnet",
                    "claude-3-opus-20240229": "anthropic/claude-3-opus",
                    "claude-3-sonnet-20240229": "anthropic/claude-3-sonnet",
                    "claude-3-haiku-20240307": "anthropic/claude-3-haiku",
                }
                
                # Add mappings from config file models (if they have legacy IDs)
                for model in models:
                    model_id = model.get("id", "")
                    # If model ID is already in OpenRouter format, use it as-is
                    if "/" in model_id:
                        _model_map[model_id] = model_id
                
                # Add legacy mappings
                _model_map.update(legacy_to_openrouter)
                
                log_line("runner:model_map", {"loaded": True, "count": len(_model_map)})
        else:
            log_line("runner:model_map", {"error": "models_config.json not found"})
    except Exception as e:
        log_line("runner:model_map", {"error": str(e)})
        # Fallback to basic mappings
        _model_map = {
            "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
            "claude-3-5-sonnet-20240620": "anthropic/claude-3.5-sonnet",
            "claude-3-opus-20240229": "anthropic/claude-3-opus",
            "claude-3-sonnet-20240229": "anthropic/claude-3-sonnet",
            "claude-3-haiku-20240307": "anthropic/claude-3-haiku",
        }
    
    return _model_map


def _get_openrouter_api_key(api_key: Optional[str] = None) -> Optional[str]:    
    """Get OpenRouter API key. Supports OPENROUTER_API_KEY or ANTHROPIC_API_KEY env vars."""
    global _openrouter_api_key
    
    # If a specific key is provided (e.g. from client request), use it
    if api_key:
        return api_key

    # Return cached key if available
    if _openrouter_api_key:
        return _openrouter_api_key

    # Check for OpenRouter key first in env
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if openrouter_key:
        _openrouter_api_key = openrouter_key
        return _openrouter_api_key

    # Fallback to ANTHROPIC_API_KEY (may be OpenRouter key)
    env_api_key = os.getenv("ANTHROPIC_API_KEY")
    if env_api_key:
        _openrouter_api_key = env_api_key
        return _openrouter_api_key
    
    return None


def _is_thinking_model(model: str) -> bool:
    """Check if a model is a thinking/reasoning model."""
    if not model:
        return False
    model_lower = model.lower()
    return 'thinking' in model_lower


def _parse_incremental_thinking_step(accumulated_reasoning: str, current_step: Optional[Dict[str, Any]] = None) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Parse thinking step incrementally from accumulated reasoning text.
    
    Returns:
        (completed_step, current_step) - completed_step is emitted when a step boundary is detected
    """
    if not accumulated_reasoning:
        return None, current_step
    
    lines = accumulated_reasoning.split('\n')
    completed_step = None
    new_current = current_step
    
    # Look for step boundaries (numbered lists, headers, etc.)
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        
        # Check for step markers
        step_match = None
        step_id = None
        
        # Numbered list: "1. Step Title" or "1) Step Title"
        if line and (line[0].isdigit() and (line.startswith(('.', ')')) or (len(line) > 1 and line[1] in ('.', ')')))):
            if line[0].isdigit():
                # Extract number
                num_end = 1
                while num_end < len(line) and line[num_end].isdigit():
                    num_end += 1
                if num_end < len(line) and line[num_end] in ('.', ')'):
                    step_match = line[num_end + 1:].strip()
                    step_id = f"step_{line[:num_end]}"
        
        # Bullet points: "- Step Title" or "* Step Title" or "• Step Title"
        elif line.startswith(('-', '*', '•')):
            step_match = line[1:].strip()
            step_id = f"step_{len([l for l in lines[:i] if l.strip() and (l.strip()[0].isdigit() or l.strip().startswith(('-', '*', '•')))]) + 1}"
        
        # Header-like format: "Step Name:" or "STEP NAME:"
        elif ':' in line and len(line) > 0 and (line[0].isupper() or line.split(':')[0].strip().isupper()):
            parts = line.split(':', 1)
            if len(parts) == 2:
                step_match = parts[0].strip()
                step_id = f"step_{step_match.lower().replace(' ', '_')}"
        
        if step_match:
            # If we have a current step, complete it
            if new_current:
                new_current["content"] = new_current.get("content", "").strip()
                completed_step = new_current
                new_current = None
            
            # Start new step
            new_current = {
                "id": step_id or f"step_{int(time.time() * 1000)}",
                "title": step_match,
                "content": parts[1].strip() if ':' in line and len(parts) == 2 else "",
                "status": "processing"
            }
        elif new_current:
            # Append to current step content
            if new_current.get("content"):
                new_current["content"] += "\n" + line
            else:
                new_current["content"] = line
    
    return completed_step, new_current


def _call_openrouter_api_stream(
    model: str,
    messages: List[Dict[str, Any]],
    max_tokens: int,
    temperature: float,
    api_key: Optional[str] = None,
) -> Any:
    """Make a streaming API call to OpenRouter.
    
    Yields chunks as they arrive from OpenRouter.
    Each chunk contains either reasoning tokens or content tokens.
    
    Args:
        model: Model ID to use
        messages: List of message dicts
        max_tokens: Maximum tokens to generate
        temperature: Temperature for generation
        api_key: Optional API key override
    
    Yields:
        Dict with 'type' ('reasoning' or 'content') and 'data' (the chunk text)
    """
    key = _get_openrouter_api_key(api_key)
    if not key:
        raise RuntimeError("OpenRouter API key is missing. Please set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env file.")
    
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "HTTP-Referer": os.getenv("APP_ORIGIN", "http://localhost:3000"),
        "X-Title": "NovoProtein AI",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    
    # Request reasoning tokens for thinking models
    is_thinking = _is_thinking_model(model)
    if is_thinking:
        payload["extra_body"] = {
            "reasoning": {
                "effort": "high"
            }
        }
    
    try:
        response = requests.post(url, headers=headers, json=payload, stream=True)
        response.raise_for_status()
        
        log_line("runner:stream:started", {"model": model, "status": response.status_code})
        chunk_count = 0
        
        # Parse Server-Sent Events (SSE) format
        for line in response.iter_lines():
            if not line:
                continue
            
            # SSE format: "data: {...}"
            if line.startswith(b'data: '):
                data_str = line[6:].decode('utf-8')
                if data_str.strip() == '[DONE]':
                    log_line("runner:stream:done", {"chunk_count": chunk_count})
                    break
                
                try:
                    chunk_data = json.loads(data_str)
                    choices = chunk_data.get("choices", [])
                    if choices:
                        choice = choices[0]
                        delta = choice.get("delta", {})
                        
                        # Check for reasoning tokens
                        if "reasoning" in delta:
                            reasoning_text = delta["reasoning"]
                            if reasoning_text:
                                chunk_count += 1
                                log_line("runner:stream:reasoning", {"chunk": chunk_count, "length": len(reasoning_text)})
                                yield {"type": "reasoning", "data": reasoning_text}
                        
                        # Check for content tokens
                        if "content" in delta:
                            content_text = delta["content"]
                            if content_text:
                                chunk_count += 1
                                log_line("runner:stream:content", {"chunk": chunk_count, "length": len(content_text)})
                                yield {"type": "content", "data": content_text}
                except json.JSONDecodeError as e:
                    log_line("runner:stream:parse_error", {"line": data_str[:100], "error": str(e)})
                    continue
        
        log_line("runner:stream:finished", {"model": model, "total_chunks": chunk_count})
    except requests.exceptions.RequestException as e:
        log_line("runner:stream:error", {"error": str(e)})
        raise RuntimeError(f"OpenRouter streaming API call failed: {str(e)}")


def _call_openrouter_api(
    model: str,
    messages: List[Dict[str, Any]],
    max_tokens: int,
    temperature: float,
    api_key: Optional[str] = None,
    max_retries: int = 3,
    retry_delay: float = 1.0,
) -> Any:
    """Make a direct API call to OpenRouter using requests with retry logic.
    
    Returns a response object compatible with get_text_from_completion().
    
    Args:
        model: Model ID to use
        messages: List of message dicts
        max_tokens: Maximum tokens to generate
        temperature: Temperature for generation
        api_key: Optional API key override
        max_retries: Maximum number of retries for rate limit errors (default: 3)
        retry_delay: Initial delay between retries in seconds (default: 1.0)
    """
    key = _get_openrouter_api_key(api_key)
    if not key:
        raise RuntimeError("OpenRouter API key is missing. Please set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env file.")
    
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "HTTP-Referer": os.getenv("APP_ORIGIN", "http://localhost:3000"),
        "X-Title": "NovoProtein AI",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    
    # Request reasoning tokens for thinking models
    is_thinking = _is_thinking_model(model)
    log_line("runner:thinking:check", {"model": model, "is_thinking": is_thinking})
    if is_thinking:
        # Different thinking models may need different parameters
        if "moonshot" in model.lower() or "kimi" in model.lower():
            # Moonshot models may need streaming for reasoning
            # But let's try non-streaming first and check response
            payload["extra_body"] = {
                "reasoning": {
                    "effort": "high"
                }
            }
        else:
            # Anthropic and other thinking models
            payload["extra_body"] = {
                "reasoning": {
                    "effort": "high"
                }
            }
        log_line("runner:thinking:requested", {"model": model, "payload_has_extra_body": "extra_body" in payload})
    
    last_exception = None
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            # Parse response and create a compatible object
            data = response.json()
            
            # Check for reasoning tokens in usage (some models like Moonshot report this)
            if "usage" in data and isinstance(data["usage"], dict):
                reasoning_tokens = data["usage"].get("reasoning_tokens") or data["usage"].get("reasoningTokens")
                if reasoning_tokens:
                    log_line("runner:thinking:usage", {
                        "reasoning_tokens": reasoning_tokens,
                        "model": model
                    })
            
            # Extract thinking/reasoning data from response if available
            # OpenRouter returns reasoning in message.reasoning when extra_body.reasoning is requested
            thinking_data = None
            if data.get("choices") and len(data["choices"]) > 0:
                choice = data["choices"][0]
                message_data = choice.get("message", {})
                
                # Primary location: message.reasoning (OpenRouter standard for reasoning tokens)
                if "reasoning" in message_data:
                    thinking_data = message_data["reasoning"]
                    log_line("runner:thinking:extracted", {
                        "location": "message.reasoning",
                        "type": type(thinking_data).__name__,
                        "is_str": isinstance(thinking_data, str),
                        "is_list": isinstance(thinking_data, list),
                        "is_dict": isinstance(thinking_data, dict),
                        "preview": str(thinking_data)[:200] if isinstance(thinking_data, str) else None
                    })
                
                # Fallback locations for other formats
                elif "thinking" in message_data:
                    thinking_data = message_data["thinking"]
                    log_line("runner:thinking:extracted", {"location": "message.thinking"})
                elif "chain_of_thought" in message_data:
                    thinking_data = message_data["chain_of_thought"]
                    log_line("runner:thinking:extracted", {"location": "message.chain_of_thought"})
                
                # Check choice level
                elif "reasoning" in choice:
                    thinking_data = choice["reasoning"]
                    log_line("runner:thinking:extracted", {"location": "choice.reasoning"})
                elif "thinking" in choice:
                    thinking_data = choice["thinking"]
                    log_line("runner:thinking:extracted", {"location": "choice.thinking"})
                
                # Check response root level
                elif "reasoning" in data:
                    thinking_data = data["reasoning"]
                    log_line("runner:thinking:extracted", {"location": "data.reasoning"})
                elif "thinking" in data:
                    thinking_data = data["thinking"]
                    log_line("runner:thinking:extracted", {"location": "data.thinking"})
                
                # Debug logging if not found - also check delta for streaming responses
                if not thinking_data:
                    # Check if reasoning might be in delta (for streaming responses)
                    delta = choice.get("delta", {})
                    if "reasoning" in delta:
                        thinking_data = delta["reasoning"]
                        log_line("runner:thinking:extracted", {"location": "choice.delta.reasoning"})
                    elif "thinking" in delta:
                        thinking_data = delta["thinking"]
                        log_line("runner:thinking:extracted", {"location": "choice.delta.thinking"})
                    
                    if not thinking_data:
                        log_line("runner:thinking:debug", {
                            "has_choices": "choices" in data,
                            "choice_keys": list(choice.keys()) if isinstance(choice, dict) else None,
                            "message_keys": list(message_data.keys()) if isinstance(message_data, dict) else None,
                            "delta_keys": list(delta.keys()) if isinstance(delta, dict) else None,
                            "data_keys": list(data.keys()) if isinstance(data, dict) else None,
                            "has_usage": "usage" in data,
                            "usage_keys": list(data["usage"].keys()) if isinstance(data.get("usage"), dict) else None,
                            "is_thinking_model": _is_thinking_model(model),
                            "model": model
                        })
                elif _is_thinking_model(model):
                    # Log when we have a thinking model but didn't find reasoning
                    log_line("runner:thinking:warning", {
                        "model": model,
                        "message_has_reasoning": "reasoning" in message_data if isinstance(message_data, dict) else False,
                        "message_has_thinking": "thinking" in message_data if isinstance(message_data, dict) else False
                    })
            
            # Create a simple object that mimics OpenAI/OpenRouter response format
            class CompletionResponse:
                def __init__(self, data, thinking=None):
                    self.choices = [Choice(data.get("choices", [{}])[0] if data.get("choices") else {}, thinking)]
                    self.thinking = thinking  # Store thinking data at response level for easy access
            
            class Choice:
                def __init__(self, choice_data, thinking=None):
                    self.message = Message(choice_data.get("message", {}), thinking)
                    self.thinking = thinking  # Also store at choice level
            
            class Message:
                def __init__(self, message_data, thinking=None):
                    self.content = message_data.get("content", "")
                    # Store thinking/reasoning data - prioritize passed thinking, then check message_data
                    self.thinking = thinking if thinking is not None else message_data.get("reasoning")
                    self.reasoning = message_data.get("reasoning") if thinking is None else thinking
            
            return CompletionResponse(data, thinking_data)
        except requests.exceptions.HTTPError as e:
            # Extract the actual error message from OpenRouter's response
            error_detail = str(e)
            status_code = None
            user_message = None
            retry_after = None
            
            if hasattr(e, 'response') and e.response is not None:
                status_code = e.response.status_code
                
                # Handle specific HTTP status codes with user-friendly messages
                if status_code == 429:
                    user_message = "Rate limit exceeded. Please wait a moment and try again, or use a different model."
                elif status_code == 401:
                    user_message = "API key is invalid or missing. Please check your OpenRouter API key."
                elif status_code == 403:
                    user_message = "Access forbidden. The API key may not have permission for this model."
                elif status_code == 404:
                    user_message = f"Model '{model}' not found. Please check the model ID."
                elif status_code == 500:
                    user_message = "OpenRouter service error. Please try again later."
                elif status_code == 503:
                    user_message = "Service temporarily unavailable. Please try again later."
                
                # Try to extract detailed error message from response
                try:
                    error_data = e.response.json()
                    if isinstance(error_data, dict):
                        # OpenRouter error format: {"error": {"message": "...", "type": "...", ...}}
                        if 'error' in error_data:
                            error_obj = error_data['error']
                            if isinstance(error_obj, dict):
                                # Extract message, type, and other details
                                if 'message' in error_obj:
                                    error_detail = error_obj['message']
                                if 'type' in error_obj:
                                    error_detail = f"{error_obj.get('type', 'Error')}: {error_detail}"
                                # Check for rate limit details
                                if status_code == 429 and 'retry_after' in error_obj:
                                    retry_after = error_obj['retry_after']
                                    user_message = f"Rate limit exceeded. Please wait {retry_after} seconds before trying again."
                            elif isinstance(error_obj, str):
                                error_detail = error_obj
                        # Sometimes the error is at the top level
                        elif 'message' in error_data:
                            error_detail = error_data['message']
                        # Check for additional error context
                        if 'detail' in error_data:
                            error_detail = f"{error_detail} ({error_data['detail']})"
                except (ValueError, KeyError, AttributeError, json.JSONDecodeError):
                    # If JSON parsing fails, try to get text response
                    try:
                        error_text = e.response.text
                        if error_text:
                            # Try to extract useful info from text response
                            if len(error_text) < 500:
                                error_detail = f"{error_detail} (Response: {error_text})"
                            else:
                                error_detail = f"{error_detail} (Response: {error_text[:200]}...)"
                    except:
                        pass
            
            # Retry logic for rate limit errors (429)
            if status_code == 429 and attempt < max_retries:
                # Use retry_after from response if available, otherwise use exponential backoff
                wait_time = retry_after if retry_after else (retry_delay * (2 ** attempt))
                log_line("runner:openrouter:retry", {
                    "model": model,
                    "attempt": attempt + 1,
                    "max_retries": max_retries,
                    "wait_time": wait_time,
                    "retry_after": retry_after
                })
                time.sleep(wait_time)
                last_exception = e
                continue  # Retry the request
            
            # For non-retryable errors or after max retries, raise the exception
            # Use user-friendly message if available, otherwise use technical error detail
            final_error = user_message if user_message else error_detail
            
            log_line("runner:openrouter:error", {
                "error": error_detail,
                "status": status_code,
                "model": model,
                "user_message": user_message,
                "attempt": attempt + 1,
                "max_retries": max_retries
            })
            
            # For rate limits after all retries, provide more helpful error message
            if status_code == 429:
                raise RuntimeError(f"Rate limit exceeded for model '{model}' after {max_retries + 1} attempts. {user_message or 'Please wait a moment and try again, or use a different model.'}")
            else:
                raise RuntimeError(f"OpenRouter API call failed: {final_error}")
        except requests.exceptions.RequestException as e:
            # For network errors, retry with exponential backoff
            if attempt < max_retries:
                wait_time = retry_delay * (2 ** attempt)
                log_line("runner:openrouter:retry", {
                    "model": model,
                    "attempt": attempt + 1,
                    "max_retries": max_retries,
                    "wait_time": wait_time,
                    "error": str(e)
                })
                time.sleep(wait_time)
                last_exception = e
                continue  # Retry the request
            
            log_line("runner:openrouter:error", {
                "error": str(e),
                "status": getattr(e, 'response', {}).status_code if hasattr(e, 'response') and e.response is not None else None,
                "model": model,
                "attempt": attempt + 1,
                "max_retries": max_retries
            })
            raise RuntimeError(f"OpenRouter API call failed after {max_retries + 1} attempts: {str(e)}")
    
    # If we've exhausted all retries, raise the last exception
    if last_exception:
        raise last_exception
    raise RuntimeError(f"OpenRouter API call failed for model '{model}'")


def _map_model_id(model_id: str) -> str:
    """Map legacy model ID to OpenRouter model ID using models_config.json"""
    model_map = _load_model_map()
    return model_map.get(model_id, model_id)


def _parse_thinking_data(completion: Any) -> Optional[Dict[str, Any]]:
    """Extract and parse thinking data from API completion response.
    
    Returns a structured thinking process object with steps, or None if no thinking data.
    """
    try:
        # Get thinking data from completion object
        thinking_raw = None
        
        # Try to get thinking from response level first
        if hasattr(completion, 'thinking') and completion.thinking:
            thinking_raw = completion.thinking
            log_line("runner:thinking:found", {"location": "response.thinking"})
        
        # Try to get thinking/reasoning from message level (primary location for OpenRouter)
        if not thinking_raw and hasattr(completion, 'choices'):
            try:
                if len(completion.choices) > 0:
                    message = completion.choices[0].message
                    # Check reasoning first (OpenRouter standard for thinking models)
                    if hasattr(message, 'reasoning') and message.reasoning:
                        thinking_raw = message.reasoning
                        log_line("runner:thinking:found", {"location": "message.reasoning"})
                    # Fallback to thinking attribute
                    elif hasattr(message, 'thinking') and message.thinking:
                        thinking_raw = message.thinking
                        log_line("runner:thinking:found", {"location": "message.thinking"})
            except (AttributeError, IndexError, TypeError) as e:
                log_line("runner:thinking:access_error", {"error": str(e), "type": type(e).__name__})
        
        # If still not found, try to access the raw data structure
        if not thinking_raw and hasattr(completion, 'choices'):
            try:
                if len(completion.choices) > 0:
                    choice = completion.choices[0]
                    # Check if choice has reasoning/thinking directly
                    if hasattr(choice, 'reasoning') and choice.reasoning:
                        thinking_raw = choice.reasoning
                        log_line("runner:thinking:found", {"location": "choice.reasoning"})
                    elif hasattr(choice, 'thinking') and choice.thinking:
                        thinking_raw = choice.thinking
                        log_line("runner:thinking:found", {"location": "choice.thinking"})
            except (AttributeError, IndexError, TypeError) as e:
                log_line("runner:thinking:access_error", {"error": str(e), "type": type(e).__name__})
        
        if not thinking_raw:
            log_line("runner:thinking:not_found", {"has_completion": completion is not None})
            return None
        
        log_line("runner:thinking:raw", {"type": type(thinking_raw).__name__, "is_str": isinstance(thinking_raw, str), "is_list": isinstance(thinking_raw, list), "is_dict": isinstance(thinking_raw, dict)})
        
        # Parse thinking data - structure depends on API response format
        # OpenRouter/Anthropic may return thinking as:
        # - A string (raw thinking text)
        # - A list of steps
        # - A dict with steps
        # - Embedded in content with special markers
        
        thinking_steps = []
        current_step = None  # Initialize outside if block to avoid NameError
        
        if isinstance(thinking_raw, str):
            # If it's a string, try to parse it into steps
            # Look for common patterns like numbered steps, headers, etc.
            lines = thinking_raw.split('\n')
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # Check for step markers (numbered, bulleted, or header-like)
                step_match = None
                if line.startswith(('1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.')):
                    step_match = line[2:].strip()
                elif line.startswith(('-', '*', '•')):
                    step_match = line[1:].strip()
                elif len(line) > 0 and line[0].isupper() and ':' in line:
                    # Header-like format: "Step Name: description"
                    parts = line.split(':', 1)
                    if len(parts) == 2:
                        step_match = parts[0].strip()
                        line = parts[1].strip()
                
                if step_match:
                    # Save previous step if exists
                    if current_step:
                        thinking_steps.append(current_step)
                    # Start new step
                    current_step = {
                        "id": f"step_{len(thinking_steps) + 1}",
                        "title": step_match,
                        "content": line if line else "",
                        "status": "completed"
                    }
                elif current_step:
                    # Append to current step content
                    current_step["content"] += "\n" + line if current_step["content"] else line
        
        elif isinstance(thinking_raw, list):
            # If it's already a list of steps
            for i, step in enumerate(thinking_raw):
                if isinstance(step, dict):
                    thinking_steps.append({
                        "id": step.get("id", f"step_{i+1}"),
                        "title": step.get("title", step.get("name", f"Step {i+1}")),
                        "content": step.get("content", step.get("description", "")),
                        "status": step.get("status", "completed")
                    })
                elif isinstance(step, str):
                    thinking_steps.append({
                        "id": f"step_{i+1}",
                        "title": f"Step {i+1}",
                        "content": step,
                        "status": "completed"
                    })
        
        elif isinstance(thinking_raw, dict):
            # If it's a dict with steps
            if "steps" in thinking_raw:
                steps = thinking_raw["steps"]
                if isinstance(steps, list):
                    for i, step in enumerate(steps):
                        if isinstance(step, dict):
                            thinking_steps.append({
                                "id": step.get("id", f"step_{i+1}"),
                                "title": step.get("title", step.get("name", f"Step {i+1}")),
                                "content": step.get("content", step.get("description", "")),
                                "status": step.get("status", "completed")
                            })
            else:
                # Single thinking entry
                thinking_steps.append({
                    "id": "step_1",
                    "title": thinking_raw.get("title", "Thinking"),
                    "content": thinking_raw.get("content", str(thinking_raw)),
                    "status": "completed"
                })
        
        # Save last step if exists
        if current_step:
            thinking_steps.append(current_step)
        
        if thinking_steps:
            return {
                "steps": thinking_steps,
                "isComplete": True,
                "totalSteps": len(thinking_steps)
            }
        
        return None
    except Exception as e:
        log_line("runner:thinking:parse_error", {"error": str(e)})
        return None


async def run_agent(
    *,
    agent: Dict[str, Any],
    user_text: str,
    current_code: Optional[str],
    history: Optional[List[Dict[str, Any]]],
    selection: Optional[Dict[str, Any]],
    selections: Optional[List[Dict[str, Any]]] = None,
    model_override: Optional[str] = None,
) -> Dict[str, Any]:
    # Use model_override if provided, otherwise fall back to agent's default
    if model_override:
        model = model_override
    else:
        model = os.getenv(agent.get("modelEnv", "")) or agent.get("defaultModel")
    base_log = {"model": model, "agentId": agent.get("id"), "model_override": bool(model_override)}

    # Special handling for AlphaFold agent - use handler instead of LLM
    if agent.get("id") == "alphafold-agent":
        try:
            from .alphafold_handler import alphafold_handler
            result = await alphafold_handler.process_folding_request(
                user_text, 
                context={
                    "current_code": current_code,
                    "history": history,
                    "selection": selection
                }
            )
            
            if result.get("action") == "error":
                log_line("agent:alphafold:error", {"error": result.get("error"), "userText": user_text})
                return {"type": "text", "text": f"Error: {result.get('error')}"}
            else:
                # Convert handler result to JSON text for frontend processing
                import json
                log_line("agent:alphafold:success", {"userText": user_text, "hasSequence": bool(result.get("sequence"))})
                return {"type": "text", "text": json.dumps(result)}
                
        except Exception as e:
            log_line("agent:alphafold:failed", {"error": str(e), "userText": user_text})
            return {"type": "text", "text": f"AlphaFold processing failed: {str(e)}"}

    # Special handling for RFdiffusion agent - use handler instead of LLM
    if agent.get("id") == "rfdiffusion-agent":
        try:
            from .rfdiffusion_handler import rfdiffusion_handler
            result = await rfdiffusion_handler.process_design_request(
                user_text,
                context={
                    "current_code": current_code,
                    "history": history,
                    "selection": selection
                }
            )
            
            if result.get("action") == "error":
                log_line("agent:rfdiffusion:error", {"error": result.get("error"), "userText": user_text})
                return {"type": "text", "text": f"Error: {result.get('error')}"}
            else:
                # Convert handler result to JSON text for frontend processing
                import json
                log_line("agent:rfdiffusion:success", {"userText": user_text, "hasDesignMode": bool(result.get("parameters", {}).get("design_mode"))})
                return {"type": "text", "text": json.dumps(result)}
                
        except Exception as e:
            log_line("agent:rfdiffusion:failed", {"error": str(e), "userText": user_text})
            return {"type": "text", "text": f"RFdiffusion processing failed: {str(e)}"}

    # Special handling for ProteinMPNN agent - use handler instead of LLM
    if agent.get("id") == "proteinmpnn-agent":
        try:
            from .proteinmpnn_handler import proteinmpnn_handler
            result = await proteinmpnn_handler.process_design_request(
                user_text,
                context={
                    "current_code": current_code,
                    "history": history,
                    "selection": selection
                }
            )
            
            if result.get("action") == "error":
                log_line("agent:proteinmpnn:error", {"error": result.get("error"), "userText": user_text})
                return {"type": "text", "text": f"Error: {result.get('error')}"}
            else:
                # Convert handler result to JSON text for frontend processing
                import json
                log_line("agent:proteinmpnn:success", {"userText": user_text, "hasPdbSource": bool(result.get("pdbSource"))})
                return {"type": "text", "text": json.dumps(result)}
                
        except Exception as e:
            log_line("agent:proteinmpnn:failed", {"error": str(e), "userText": user_text})
            return {"type": "text", "text": f"ProteinMPNN processing failed: {str(e)}"}

    # Deterministic UniProt search agent (no LLM call)
    if agent.get("id") == "uniprot-search":
        import re, json
        # extract term between 'search ... in uniprot' or fallback to entire text
        m_term = re.search(r"(?:search|find)\s+(.+?)\s+in\s+uniprot", user_text, flags=re.I)
        term = (m_term.group(1) if m_term else user_text).strip()
        # number of results
        m_size = re.search(r"(?:show|top|first)\s+(\d+)\s+(?:results|hits)?", user_text, flags=re.I)
        size = int(m_size.group(1)) if m_size else 3
        # format preference
        m_format = re.search(r"(?:as|in)\s+(json|table|csv)\b", user_text, flags=re.I)
        fmt = (m_format.group(1).lower() if m_format else "table")

        items = await search_uniprot(term, size=size)

        if fmt == "json":
            text = json.dumps(items, indent=2)
        elif fmt == "csv":
            header = "accession,id,protein,organism,length,reviewed"
            lines = [header]
            for i in items:
                protein = (i.get("protein") or "").replace(",", " ")
                organism = (i.get("organism") or "").replace(",", " ")
                lines.append(f"{i.get('accession')},{i.get('id')},{protein},{organism},{i.get('length') or ''},{'Yes' if i.get('reviewed') else 'No'}")
            text = "\n".join(lines)
        else:
            # markdown-like table (renders as text in current chat UI)
            lines = [
                "Accession | ID | Protein | Organism | Length | Reviewed",
                "---|---|---|---|---|---",
            ]
            for i in items:
                lines.append(
                    f"{i.get('accession')} | {i.get('id')} | {i.get('protein') or '-'} | {i.get('organism') or '-'} | {i.get('length') or '-'} | {'Yes' if i.get('reviewed') else 'No'}"
                )
            text = "\n".join(lines) if items else "No UniProt matches found."
        log_line("agent:uniprot:res", {"count": len(items), "fmt": fmt, "term": term})
        return {"type": "text", "text": text}

    if agent.get("kind") == "code":
        context_prefix = (
            f"You may MODIFY the existing Molstar builder code below to satisfy the new request. Prefer editing in-place if it does not change the loaded PDB. Always return the full updated code.\n\n"
            f"Existing code:\n\n```js\n{str(current_code)}\n```\n\nRequest: {user_text}"
            if current_code and str(current_code).strip()
            else f"Generate Molstar builder code for: {user_text}"
        )

        prior_dialogue = (
            "\n\nRecent context: "
            + " | ".join(f"{m.get('type')}: {m.get('content')}" for m in (history or [])[-4:])
            if history
            else ""
        )

        # Enhanced system prompt with RAG for MVS agent
        system_prompt = agent.get("system")
        if agent.get("id") == "mvs-builder":
            print(f"🧠 [RAG] MVS agent triggered, enhancing prompt with Pinecone examples...")
            try:
                from .mvs_rag import enhance_mvs_prompt_with_rag
                system_prompt = await enhance_mvs_prompt_with_rag(user_text, system_prompt)
                print(f"✅ [RAG] Successfully enhanced MVS prompt")
                log_line("agent:mvs:rag", {"enhanced": True, "userText": user_text})
            except Exception as e:
                print(f"❌ [RAG] Failed to enhance prompt: {e}")
                log_line("agent:mvs:rag_error", {"error": str(e)})
                # Fallback to base prompt if RAG fails
        
        # Map model ID to OpenRouter format
        openrouter_model = _map_model_id(model)
        
        # Prepare messages with system prompt
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": context_prefix + prior_dialogue})
        
        log_line("agent:code:req", {**base_log, "hasCurrentCode": bool(current_code and str(current_code).strip()), "userText": user_text})
        completion = _call_openrouter_api(
            model=openrouter_model,
            messages=messages,
            max_tokens=800,
            temperature=0.2,
        )
        content_text = get_text_from_completion(completion)
        code = strip_code_fences(content_text)
        final_completion = completion  # Track which completion to use for thinking data

        # Safety pass
        if violates_whitelist(code):
            log_line("safety:whitelist", {"blocked": True})
            # Ask once to regenerate within constraints
            safety_messages = []
            if agent.get("system"):
                safety_messages.append({"role": "system", "content": agent.get("system")})
            safety_messages.append({
                "role": "user",
                "content": context_prefix
                + "\n\nThe code you returned included calls that are not in the whitelist. Regenerate strictly using only the allowed builder methods.",
            })
            completion2 = _call_openrouter_api(
                model=openrouter_model,
                messages=safety_messages,
                max_tokens=800,
                temperature=0.2,
            )
            code = strip_code_fences(get_text_from_completion(completion2))
            final_completion = completion2  # Use the safety pass completion for thinking data

        code = ensure_clear_on_change(current_code, code)
        log_line("agent:code:res", {"length": len(code)})
        
        # Extract thinking data if available (from final completion)
        thinking_process = _parse_thinking_data(final_completion)
        result = {"type": "code", "code": code}
        if thinking_process:
            result["thinkingProcess"] = thinking_process
        return result

    # Text agent
    selection_lines = []
    
    # Extract PDB ID from current code if available
    code_pdb_id = None
    if current_code and str(current_code).strip():
        import re
        # Look for loadStructure calls with PDB ID
        pdb_match = re.search(r"loadStructure\s*\(\s*['\"]([0-9A-Za-z]{4})['\"]", str(current_code))
        if pdb_match:
            code_pdb_id = pdb_match.group(1).upper()
    
    # Handle multiple selections if provided, otherwise fall back to single selection
    active_selections = selections if selections and len(selections) > 0 else ([selection] if selection else [])
    
    if active_selections:
        # Always treat as multiple selections to provide comprehensive info
        # Use the new multiple selection format even for single selections
        selection_lines.append(f"SelectedResiduesContext ({len(active_selections)} residue{'s' if len(active_selections) != 1 else ''}):")
        
        for i, sel in enumerate(active_selections):
            chain = sel.get('labelAsymId') or sel.get('authAsymId') or '?'
            seq_id = sel.get('labelSeqId') if sel.get('labelSeqId') is not None else sel.get('authSeqId')
            comp_id = sel.get('compId') or '?'
            # Use PDB ID from selection, or fall back to code context
            pdb_id = sel.get('pdbId') or code_pdb_id or 'unknown'
            
            # Provide detailed info for each residue
            selection_lines.append(f"  {i+1}. {comp_id}{seq_id} (Chain {chain}) in PDB {pdb_id}")
            selection_lines.append(f"     - Residue Type: {comp_id}")
            selection_lines.append(f"     - Position: {seq_id}")
            selection_lines.append(f"     - Chain: {chain}")
            selection_lines.append(f"     - PDB Structure: {pdb_id}")
            if sel.get('insCode'):
                selection_lines.append(f"     - Insertion Code: {sel.get('insCode')}")
        
        if len(active_selections) > 1:
            selection_lines.append(f"Note: User has selected {len(active_selections)} residues for analysis or comparison.")
        else:
            selection_lines.append("Note: User has selected this specific residue for analysis.")
    selection_context = "Context:\n" + "\n".join(selection_lines) if selection_lines else ""
    
    code_context = (
        f"CodeContext (Current PDB: {code_pdb_id or 'unknown'}):\n" + str(current_code)[:3000]
        if current_code and str(current_code).strip()
        else ""
    )

    messages: List[Dict[str, Any]] = []
    if selection_context or code_context:
        messages.append({"role": "user", "content": (selection_context + ("\n\n" if selection_context and code_context else "") + code_context)})
    messages.append({"role": "user", "content": user_text})

    log_line("agent:text:req", {**base_log, "hasSelection": bool(selection), "userText": user_text})
    
    # Map model ID to OpenRouter format
    openrouter_model = _map_model_id(model)
    
    # Prepare messages with system prompt
    openrouter_messages = []
    system_prompt = agent.get("system")
    if system_prompt:
        openrouter_messages.append({"role": "system", "content": system_prompt})
    openrouter_messages.extend(messages)
    
    # Try the requested model, with automatic fallback to default if rate limited
    try:
        completion = _call_openrouter_api(
            model=openrouter_model,
            messages=openrouter_messages,
            max_tokens=1000,
            temperature=0.5,
        )
    except RuntimeError as e:
        # If rate limited and using a model override, try falling back to default model
        if "Rate limit exceeded" in str(e) and model_override:
            default_model = os.getenv(agent.get("modelEnv", "")) or agent.get("defaultModel")
            default_openrouter_model = _map_model_id(default_model)
            
            # Only fallback if default model is different from the override
            if default_openrouter_model != openrouter_model:
                log_line("runner:model:fallback", {
                    "from": openrouter_model,
                    "to": default_openrouter_model,
                    "reason": "rate_limit",
                    "agentId": agent.get("id")
                })
                try:
                    completion = _call_openrouter_api(
                        model=default_openrouter_model,
                        messages=openrouter_messages,
                        max_tokens=1000,
                        temperature=0.5,
                    )
                    # Update base_log to reflect the fallback
                    base_log["model"] = default_model
                    base_log["fallback_used"] = True
                except RuntimeError as fallback_error:
                    # If fallback also fails, raise the original error with context
                    log_line("runner:model:fallback_failed", {
                        "original_model": openrouter_model,
                        "fallback_model": default_openrouter_model,
                        "error": str(fallback_error)
                    })
                    raise RuntimeError(f"Rate limit exceeded for model '{openrouter_model}'. Fallback to default model '{default_openrouter_model}' also failed: {str(fallback_error)}")
            else:
                # Same model, just re-raise the original error
                raise
        else:
            # Not a rate limit or no override, just re-raise
            raise
    
    text = get_text_from_completion(completion)
    log_line("agent:text:res", {"length": len(text), "preview": text[:400]})
    
    # Extract thinking data if available
    thinking_process = _parse_thinking_data(completion)
    result = {"type": "text", "text": text}
    if thinking_process:
        result["thinkingProcess"] = thinking_process
    return result


async def run_agent_stream(
    *,
    agent: Dict[str, Any],
    user_text: str,
    current_code: Optional[str],
    history: Optional[List[Dict[str, Any]]],
    selection: Optional[Dict[str, Any]],
    selections: Optional[List[Dict[str, Any]]] = None,
    model_override: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream agent execution with incremental thinking step updates.
    
    Yields incremental updates:
    - {"type": "thinking_step", "data": {...}} - New or updated thinking step
    - {"type": "content", "data": {"text": "..."}} - Content chunk
    - {"type": "complete", "data": {...}} - Final result
    - {"type": "error", "data": {"error": "..."}} - Error occurred
    """
    # Use model_override if provided, otherwise fall back to agent's default
    if model_override:
        model = model_override
    else:
        model = os.getenv(agent.get("modelEnv", "")) or agent.get("defaultModel")
    base_log = {"model": model, "agentId": agent.get("id"), "model_override": bool(model_override)}
    
    # Check if this is a thinking model
    is_thinking = _is_thinking_model(model)
    if not is_thinking:
        # For non-thinking models, fall back to regular execution
        try:
            result = await run_agent(
                agent=agent,
                user_text=user_text,
                current_code=current_code,
                history=history,
                selection=selection,
                selections=selections,
                model_override=model_override,
            )
            yield {"type": "complete", "data": result}
            return
        except Exception as e:
            yield {"type": "error", "data": {"error": str(e)}}
            return
    
    # Support streaming for both text and code agents with thinking models
    agent_kind = agent.get("kind")
    
    # Handle code agents
    if agent_kind == "code":
        try:
            # Build context similar to run_agent for code agents
            context_prefix = (
                f"You may MODIFY the existing Molstar builder code below to satisfy the new request. Prefer editing in-place if it does not change the loaded PDB. Always return the full updated code.\n\n"
                f"Existing code:\n\n```js\n{str(current_code)}\n```\n\nRequest: {user_text}"
                if current_code and str(current_code).strip()
                else f"Generate Molstar builder code for: {user_text}"
            )

            prior_dialogue = (
                "\n\nRecent context: "
                + " | ".join(f"{m.get('type')}: {m.get('content')}" for m in (history or [])[-4:])
                if history
                else ""
            )

            # Enhanced system prompt with RAG for MVS agent
            system_prompt = agent.get("system")
            if agent.get("id") == "mvs-builder":
                try:
                    from .mvs_rag import enhance_mvs_prompt_with_rag
                    system_prompt = await enhance_mvs_prompt_with_rag(user_text, system_prompt)
                    log_line("agent:mvs:rag:stream", {"enhanced": True, "userText": user_text})
                except Exception as e:
                    log_line("agent:mvs:rag_error:stream", {"error": str(e)})
            
            # Map model ID to OpenRouter format
            openrouter_model = _map_model_id(model)
            
            # Build messages
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": context_prefix + prior_dialogue})
            
            # Stream from OpenRouter
            accumulated_reasoning = ""
            accumulated_content = ""
            thinking_steps: List[Dict[str, Any]] = []
            current_step: Optional[Dict[str, Any]] = None
            
            log_line("agent:stream:code:start", {**base_log, "userText": user_text})
            
            # Call streaming API (synchronous generator, but we're in async context)
            stream_gen = _call_openrouter_api_stream(
                model=openrouter_model,
                messages=messages,
                max_tokens=800,
                temperature=0.2,
            )
            for chunk in stream_gen:
                if chunk["type"] == "reasoning":
                    accumulated_reasoning += chunk["data"]
                    completed_step, current_step = _parse_incremental_thinking_step(accumulated_reasoning, current_step)
                    
                    if completed_step:
                        completed_step["status"] = "completed"
                        existing_idx = next((i for i, s in enumerate(thinking_steps) if s["id"] == completed_step["id"]), None)
                        if existing_idx is not None:
                            thinking_steps[existing_idx] = completed_step
                        else:
                            thinking_steps.append(completed_step)
                        yield {"type": "thinking_step", "data": completed_step}
                    
                    if current_step:
                        existing_idx = next((i for i, s in enumerate(thinking_steps) if s["id"] == current_step["id"]), None)
                        if existing_idx is not None:
                            thinking_steps[existing_idx] = current_step
                        else:
                            thinking_steps.append(current_step)
                        yield {"type": "thinking_step", "data": current_step}
                
                elif chunk["type"] == "content":
                    accumulated_content += chunk["data"]
                    yield {"type": "content", "data": {"text": chunk["data"]}}
            
            # Finalize any remaining step
            if current_step:
                current_step["status"] = "completed"
                current_step["content"] = current_step.get("content", "").strip()
                existing_idx = next((i for i, s in enumerate(thinking_steps) if s["id"] == current_step["id"]), None)
                if existing_idx is not None:
                    thinking_steps[existing_idx] = current_step
                else:
                    thinking_steps.append(current_step)
                yield {"type": "thinking_step", "data": current_step}
            
            # Extract code from content
            log_line("agent:stream:code:extract", {
                **base_log,
                "accumulated_content_length": len(accumulated_content),
                "accumulated_content_preview": accumulated_content[:200] if accumulated_content else None
            })
            
            code = strip_code_fences(accumulated_content)
            
            # If no code found, log warning but still return result with thinking process
            if not code or not code.strip():
                log_line("agent:stream:code:empty", {
                    **base_log,
                    "accumulated_content_length": len(accumulated_content),
                    "has_thinking_steps": len(thinking_steps) > 0
                })
            
            # Safety pass (simplified for streaming)
            if code and code.strip() and violates_whitelist(code):
                log_line("safety:whitelist:stream", {"blocked": True})
                # For streaming, we'll just log the violation
                code = ensure_clear_on_change(current_code, code)
            
            if code and code.strip():
                code = ensure_clear_on_change(current_code, code)
            else:
                # If code is empty, keep it empty (don't use current_code)
                code = ""
            
            # Build final result - always include thinking process if available
            final_result = {
                "type": "code",
                "code": code,
            }
            
            # Add thinking process if we have steps (even if code is empty)
            if thinking_steps:
                final_result["thinkingProcess"] = {
                    "steps": thinking_steps,
                    "isComplete": True,
                    "totalSteps": len(thinking_steps)
                }
            
            log_line("agent:stream:code:complete", {
                **base_log,
                "code_length": len(code) if code else 0,
                "steps_count": len(thinking_steps),
                "has_thinking_process": "thinkingProcess" in final_result
            })
            yield {"type": "complete", "data": final_result}
            return
            
        except Exception as e:
            log_line("agent:stream:code:error", {**base_log, "error": str(e), "trace": traceback.format_exc()})
            yield {"type": "error", "data": {"error": str(e)}}
            return
    
    # Handle text agents (existing code)
    
    try:
        # Build messages (same logic as run_agent for text agents)
        selection_lines = []
        code_pdb_id = None
        if current_code and str(current_code).strip():
            import re
            pdb_match = re.search(r"loadStructure\s*\(\s*['\"]([0-9A-Za-z]{4})['\"]", str(current_code))
            if pdb_match:
                code_pdb_id = pdb_match.group(1).upper()
        
        active_selections = selections if selections and len(selections) > 0 else ([selection] if selection else [])
        
        if active_selections:
            selection_lines.append(f"SelectedResiduesContext ({len(active_selections)} residue{'s' if len(active_selections) != 1 else ''}):")
            for i, sel in enumerate(active_selections):
                chain = sel.get('labelAsymId') or sel.get('authAsymId') or '?'
                seq_id = sel.get('labelSeqId') if sel.get('labelSeqId') is not None else sel.get('authSeqId')
                comp_id = sel.get('compId') or '?'
                pdb_id = sel.get('pdbId') or code_pdb_id or 'unknown'
                selection_lines.append(f"  {i+1}. {comp_id}{seq_id} (Chain {chain}) in PDB {pdb_id}")
                selection_lines.append(f"     - Residue Type: {comp_id}")
                selection_lines.append(f"     - Position: {seq_id}")
                selection_lines.append(f"     - Chain: {chain}")
                selection_lines.append(f"     - PDB Structure: {pdb_id}")
                if sel.get('insCode'):
                    selection_lines.append(f"     - Insertion Code: {sel.get('insCode')}")
            
            if len(active_selections) > 1:
                selection_lines.append(f"Note: User has selected {len(active_selections)} residues for analysis or comparison.")
            else:
                selection_lines.append("Note: User has selected this specific residue for analysis.")
        
        selection_context = "Context:\n" + "\n".join(selection_lines) if selection_lines else ""
        code_context = (
            f"CodeContext (Current PDB: {code_pdb_id or 'unknown'}):\n" + str(current_code)[:3000]
            if current_code and str(current_code).strip()
            else ""
        )
        
        messages: List[Dict[str, Any]] = []
        if selection_context or code_context:
            messages.append({"role": "user", "content": (selection_context + ("\n\n" if selection_context and code_context else "") + code_context)})
        messages.append({"role": "user", "content": user_text})
        
        # Prepare messages with system prompt
        openrouter_messages = []
        system_prompt = agent.get("system")
        if system_prompt:
            openrouter_messages.append({"role": "system", "content": system_prompt})
        openrouter_messages.extend(messages)
        
        # Map model ID to OpenRouter format
        openrouter_model = _map_model_id(model)
        
        # Stream from OpenRouter
        accumulated_reasoning = ""
        accumulated_content = ""
        thinking_steps: List[Dict[str, Any]] = []
        current_step: Optional[Dict[str, Any]] = None
        step_counter = 0
        
        log_line("agent:stream:start", {**base_log, "userText": user_text})
        
        reasoning_chunks = 0
        content_chunks = 0
        
        for chunk in _call_openrouter_api_stream(
            model=openrouter_model,
            messages=openrouter_messages,
            max_tokens=1000,
            temperature=0.5,
        ):
            log_line("agent:stream:chunk", {"type": chunk.get("type"), "agentId": agent.get("id")})
            
            if chunk["type"] == "reasoning":
                reasoning_chunks += 1
                # Accumulate reasoning tokens
                accumulated_reasoning += chunk["data"]
                
                # Parse incremental thinking steps
                completed_step, current_step = _parse_incremental_thinking_step(accumulated_reasoning, current_step)
                
                # Emit completed step
                if completed_step:
                    completed_step["status"] = "completed"
                    # Check if step already exists
                    existing_idx = next((i for i, s in enumerate(thinking_steps) if s["id"] == completed_step["id"]), None)
                    if existing_idx is not None:
                        thinking_steps[existing_idx] = completed_step
                    else:
                        thinking_steps.append(completed_step)
                    yield {"type": "thinking_step", "data": completed_step}
                
                # Emit current step if it exists
                if current_step:
                    # Check if step already exists
                    existing_idx = next((i for i, s in enumerate(thinking_steps) if s["id"] == current_step["id"]), None)
                    if existing_idx is not None:
                        thinking_steps[existing_idx] = current_step
                    else:
                        thinking_steps.append(current_step)
                    yield {"type": "thinking_step", "data": current_step}
            
            elif chunk["type"] == "content":
                content_chunks += 1
                # Accumulate content tokens
                accumulated_content += chunk["data"]
                yield {"type": "content", "data": {"text": chunk["data"]}}
        
        log_line("agent:stream:chunks_received", {
            **base_log, 
            "reasoning_chunks": reasoning_chunks, 
            "content_chunks": content_chunks,
            "accumulated_reasoning_length": len(accumulated_reasoning),
            "accumulated_content_length": len(accumulated_content)
        })
        
        # Finalize any remaining step
        if current_step:
            current_step["status"] = "completed"
            current_step["content"] = current_step.get("content", "").strip()
            existing_idx = next((i for i, s in enumerate(thinking_steps) if s["id"] == current_step["id"]), None)
            if existing_idx is not None:
                thinking_steps[existing_idx] = current_step
            else:
                thinking_steps.append(current_step)
            yield {"type": "thinking_step", "data": current_step}
        
        # Build final result
        final_result = {
            "type": "text",
            "text": accumulated_content.strip(),
        }
        
        # Add thinking process if we have steps
        if thinking_steps:
            final_result["thinkingProcess"] = {
                "steps": thinking_steps,
                "isComplete": True,
                "totalSteps": len(thinking_steps)
            }
        
        log_line("agent:stream:complete", {**base_log, "text_length": len(accumulated_content), "steps_count": len(thinking_steps)})
        yield {"type": "complete", "data": final_result}
        
    except Exception as e:
        log_line("agent:stream:error", {**base_log, "error": str(e), "trace": traceback.format_exc()})
        yield {"type": "error", "data": {"error": str(e)}}

