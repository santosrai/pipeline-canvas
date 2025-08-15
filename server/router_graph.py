from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

try:
    from langchain_openai import OpenAIEmbeddings  # type: ignore
except Exception:  # pragma: no cover
    OpenAIEmbeddings = None  # type: ignore


class SimpleRouterGraph:
    def __init__(self) -> None:
        self.agent_texts: Dict[str, str] = {}
        self.embeddings: Optional[Any] = None
        self.agent_vecs: Dict[str, List[float]] = {}
        self.threshold = float(0.32)
        self.margin = float(0.05)

    async def ainit(self, agents: List[Dict[str, Any]]):
        # Build embedding index using agent descriptions and names
        texts = []
        keys = []
        for agent in agents:
            key = agent["id"]
            text = f"{agent.get('name','')}\n{agent.get('description','')}\n{agent.get('system','')}"
            texts.append(text)
            keys.append(key)
            self.agent_texts[key] = text
        # Initialize embeddings only if OPENAI_API_KEY present and library available
        if texts and OpenAIEmbeddings and os.getenv("OPENAI_API_KEY"):
            self.embeddings = OpenAIEmbeddings()
            vecs = await self.embeddings.aembed_documents(texts)  # type: ignore[attr-defined]
            for key, vec in zip(keys, vecs):
                self.agent_vecs[key] = vec

    async def ainvoke(self, state: Dict[str, Any]) -> Dict[str, Any]:
        # Rule-based shortcut: selection present + interrogative → bio-chat
        input_text: str = state.get("input", "") or ""
        selection = state.get("selection")
        selections = state.get("selections", [])
        # Use selections array if available, otherwise fall back to single selection
        has_selection = (selections and len(selections) > 0) or selection
        
        interrogatives = [
            "what is this", "what's this", "what am i looking at", "this residue", "selected", "identify", "which residue", "these residues", "what are these",
        ]
        low = input_text.lower()
        # UniProt search rule
        if "uniprot" in low and ("search" in low or "find" in low):
            return {"routedAgentId": "uniprot-search", "reason": "rule:uniprot-search"}
        if has_selection and any(k in low for k in interrogatives):
            return {"routedAgentId": "bio-chat", "reason": "rule:selection+question"}

        # Semantic routing: input against agent vectors
        if not input_text.strip() or not self.agent_vecs or not self.embeddings:
            # Use keyword heuristic only
            keywords = [
                "show ", "display ", "visualize", "render", "color", "colour", "cartoon", "surface", "ball-and-stick", "water", "ligand", "focus", "zoom", "load", "pdb", "highlight", "chain", "view", "representation",
            ]
            likely_code = any(k in low for k in keywords)
            chosen = "code-builder" if likely_code else "bio-chat"
            return {"routedAgentId": chosen, "reason": "default:heuristic-no-embeddings"}

        q_vec = await self.embeddings.aembed_query(input_text)  # type: ignore[attr-defined]

        def cosine(a: List[float], b: List[float]) -> float:
            import math

            num = sum(x * y for x, y in zip(a, b))
            da = math.sqrt(sum(x * x for x in a))
            db = math.sqrt(sum(y * y for y in b))
            if da == 0 or db == 0:
                return 0.0
            return num / (da * db)

        scores = []
        for key, vec in self.agent_vecs.items():
            scores.append((key, cosine(q_vec, vec)))
        scores.sort(key=lambda kv: kv[1], reverse=True)

        if not scores:
            return {"routedAgentId": "code-builder", "reason": "default:no-scores"}

        best_key, best_score = scores[0]
        second_score = scores[1][1] if len(scores) > 1 else -1.0

        if best_score < self.threshold or (best_score - second_score) < self.margin:
            # fallback logic: simple heuristic using keywords
            keywords = [
                "show ", "display ", "visualize", "render", "color", "colour", "cartoon", "surface", "ball-and-stick", "water", "ligand", "focus", "zoom", "load", "pdb", "highlight", "chain", "view", "representation",
            ]
            likely_code = any(k in low for k in keywords)
            chosen = "code-builder" if likely_code else "bio-chat"
            return {"routedAgentId": chosen, "reason": f"llm-fallback:score={best_score:.2f},margin={best_score-second_score:.2f}"}

        return {
            "routedAgentId": best_key,
            "reason": f"semantic:best={best_key},score={best_score:.2f},second={second_score:.2f}",
            "scores": scores[:3],
        }


routerGraph = SimpleRouterGraph()


async def init_router(agents: List[Dict[str, Any]]):
    await routerGraph.ainit(agents)

