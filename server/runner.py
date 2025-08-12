import os
from typing import Any, Dict, List, Optional

from anthropic import Anthropic

from .utils import log_line, get_text_from_completion, strip_code_fences, trim_history
from .safety import violates_whitelist, ensure_clear_on_change
from .uniprot import search_uniprot


_anthropic_client: Optional[Anthropic] = None

def _get_anthropic_client() -> Anthropic:
    global _anthropic_client
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing ANTHROPIC_API_KEY; set it in your environment or .env and restart the server."
        )
    if _anthropic_client is None:
        _anthropic_client = Anthropic(api_key=api_key)
    return _anthropic_client


async def run_agent(
    *,
    agent: Dict[str, Any],
    user_text: str,
    current_code: Optional[str],
    history: Optional[List[Dict[str, Any]]],
    selection: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    model = os.getenv(agent.get("modelEnv", "")) or agent.get("defaultModel")
    base_log = {"model": model, "agentId": agent.get("id")}

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

        from .runner import _get_anthropic_client  # avoid circular import typing issues
        client = _get_anthropic_client()
        
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
        
        log_line("agent:code:req", {**base_log, "hasCurrentCode": bool(current_code and str(current_code).strip()), "userText": user_text})
        completion = client.messages.create(
            model=model,
            max_tokens=800,
            temperature=0.2,
            system=system_prompt,
            messages=[{"role": "user", "content": context_prefix + prior_dialogue}],
        )
        content_text = get_text_from_completion(completion)
        code = strip_code_fences(content_text)

        # Safety pass
        if violates_whitelist(code):
            log_line("safety:whitelist", {"blocked": True})
            # Ask once to regenerate within constraints
            completion2 = client.messages.create(
                model=model,
                max_tokens=800,
                temperature=0.2,
                system=agent.get("system"),
                messages=[
                    {
                        "role": "user",
                        "content": context_prefix
                        + "\n\nThe code you returned included calls that are not in the whitelist. Regenerate strictly using only the allowed builder methods.",
                    }
                ],
            )
            code = strip_code_fences(get_text_from_completion(completion2))

        code = ensure_clear_on_change(current_code, code)
        log_line("agent:code:res", {"length": len(code)})
        return {"type": "code", "code": code}

    # Text agent
    selection_lines = []
    if selection:
        selection_lines.append(f"- PDB: {selection.get('pdbId') or 'unknown'}")
        selection_lines.append(f"- Kind: {selection.get('kind')}")
        selection_lines.append(f"- Residue: {selection.get('compId') or '?'}")
        selection_lines.append(f"- label_seq_id: {selection.get('labelSeqId') if selection.get('labelSeqId') is not None else 'null'}")
        selection_lines.append(f"- auth_seq_id: {selection.get('authSeqId') if selection.get('authSeqId') is not None else 'null'}")
        selection_lines.append(f"- insCode: {selection.get('insCode') if selection.get('insCode') is not None else 'null'}")
        selection_lines.append(f"- label_asym_id: {selection.get('labelAsymId') or 'null'}")
        selection_lines.append(f"- auth_asym_id: {selection.get('authAsymId') or 'null'}")
        mutation = (selection or {}).get("mutation") or {}
        if mutation.get("toCompId"):
            selection_lines.append(
                f"- ProposedMutation: {selection.get('compId') or '?'}{selection.get('authSeqId') or '?'}{selection.get('authAsymId') or ''} -> {mutation.get('toCompId')}"
            )
    selection_context = "Context:\n" + "\n".join(selection_lines) if selection_lines else ""
    code_context = (
        "Additional code context (may indicate PDB via builder.loadStructure):\n" + str(current_code)[:3000]
        if current_code and str(current_code).strip()
        else ""
    )

    messages: List[Dict[str, Any]] = []
    if selection_context or code_context:
        messages.append({"role": "user", "content": (selection_context + ("\n\n" if selection_context and code_context else "") + code_context)})
    messages.append({"role": "user", "content": user_text})

    log_line("agent:text:req", {**base_log, "hasSelection": bool(selection), "userText": user_text})
    from .runner import _get_anthropic_client  # avoid circular import typing issues
    client = _get_anthropic_client()
    completion = client.messages.create(
        model=model,
        max_tokens=1000,
        temperature=0.5,
        system=agent.get("system"),
        messages=messages,
    )
    text = get_text_from_completion(completion)
    log_line("agent:text:res", {"length": len(text), "preview": text[:400]})
    return {"type": "text", "text": text}

