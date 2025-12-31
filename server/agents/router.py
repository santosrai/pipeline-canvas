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
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if texts and OpenAIEmbeddings and openai_api_key:
            try:
                # Initialize embeddings - will use OPENAI_API_KEY from environment
                # or can be passed explicitly as api_key parameter
                self.embeddings = OpenAIEmbeddings(api_key=openai_api_key)
                vecs = await self.embeddings.aembed_documents(texts)  # type: ignore[attr-defined]
                for key, vec in zip(keys, vecs):
                    self.agent_vecs[key] = vec
                print("[RouterGraph] Successfully initialized embeddings for semantic routing")
            except Exception as e:
                # If embeddings fail (e.g., invalid API key), continue without them
                # The router will fall back to rule-based routing
                print(f"[RouterGraph] Warning: Failed to initialize embeddings: {e}")
                print("[RouterGraph] Continuing with rule-based routing only (embeddings disabled)")
                self.embeddings = None
                self.agent_vecs = {}
        else:
            if not openai_api_key:
                print("[RouterGraph] OPENAI_API_KEY not found - using rule-based routing only")
            elif not OpenAIEmbeddings:
                print("[RouterGraph] OpenAIEmbeddings not available - using rule-based routing only")

    async def ainvoke(self, state: Dict[str, Any]) -> Dict[str, Any]:
        # Rule-based shortcut: selection present + interrogative → bio-chat
        input_text: str = state.get("input", "") or ""
        selection = state.get("selection")
        selections = state.get("selections", [])
        # Use selections array if available, otherwise fall back to single selection
        has_selection = (selections and len(selections) > 0) or selection
        uploaded_file_id = state.get("uploadedFileId")
        has_uploaded_file = bool(uploaded_file_id)
        pipeline_context = state.get("pipelineContext")
        has_pipeline_context = bool(pipeline_context)
        
        low = input_text.lower().strip()
        
        # Early detection: empty or very short input
        if not input_text.strip() or len(input_text.strip()) < 2:
            return {"routedAgentId": "bio-chat", "reason": "rule:empty-input"}
        
        interrogatives = [
            "what is this", "what's this", "what am i looking at", "this residue", "selected", "identify", "which residue", "these residues", "what are these",
            # Chain-related questions
            "what chains", "which chains", "how many chains", "what chain", "which chain", 
            "tell me about the chains", "describe the chains", "what are the chains",
            "chain information", "chain details", "tell me about chain", "describe chain"
        ]
        
        # Visualization keywords when uploaded file is present
        visualization_keywords = [
            "visualize", "show", "display", "render", "view", "load", "open", "see", "3d", "three dimensional"
        ]
        has_visualization_request = any(kw in low for kw in visualization_keywords)
        
        # Check for explicit visualization commands that should override bio-chat
        visualization_commands = [
            "color", "colour", "highlight", "label", "focus", "zoom", "show", "hide", 
            "surface", "cartoon", "ball", "stick", "water", "representation"
        ]
        has_viz_command = any(cmd in low for cmd in visualization_commands)
        
        # Pipeline context detection - early routing for pipeline questions
        pipeline_question_keywords = [
            "what is happening", "what's happening", "what happened",
            "describe pipeline", "explain pipeline", "pipeline status",
            "what nodes", "which nodes", "node status", "execution",
            "workflow status", "pipeline progress", "what is in this pipeline",
            "what's in this pipeline", "what does this pipeline", "how does this pipeline",
            "how is this pipeline", "what are the nodes", "show me the pipeline",
            "tell me about the pipeline", "describe this pipeline", "explain this pipeline"
        ]
        
        # When pipeline context exists and user asks pipeline-related questions, route to bio-chat
        if has_pipeline_context and any(k in low for k in pipeline_question_keywords):
            return {"routedAgentId": "bio-chat", "reason": "rule:pipeline-context+question"}
        
        # More lenient: if pipeline context exists and question-like, route to bio-chat
        if has_pipeline_context:
            is_question = any(q in low for q in ["what", "how", "describe", "explain", "tell", "show", "which"])
            if is_question and not has_viz_command:
                return {"routedAgentId": "bio-chat", "reason": "rule:pipeline-context+question-like"}
        
        # Chain information questions (when structure is loaded) - route to bio-chat if not a visualization command
        chain_question_keywords = [
            "what chains", "which chains", "how many chains", "what chain",
            "which chain", "tell me about chain", "describe chain", 
            "chain information", "chain details", "what are the chains",
            "tell me about the chains", "describe the chains"
        ]
        # Only route to bio-chat if it's a question AND not a visualization command
        if any(k in low for k in chain_question_keywords) and not has_viz_command:
            return {"routedAgentId": "bio-chat", "reason": "rule:chain-question"}
        
        # UniProt search rule
        if "uniprot" in low and ("search" in low or "find" in low):
            return {"routedAgentId": "uniprot-search", "reason": "rule:uniprot-search"}
        
        # AlphaFold folding/docking rule
        alphafold_keywords = [
            "fold", "dock", "predict structure", "alphafold", "structure prediction",
            "fold protein", "dock protein", "predict fold", "predict 3d structure",
            "predicts 3d structure", "3d structure", "3-d structure"
        ]
        predicts_structure_signal = (
            ("predict" in low or "predicts" in low or "prediction" in low)
            and ("structure" in low or "3d" in low or "3-d" in low)
        )
        if any(k in low for k in alphafold_keywords) or predicts_structure_signal:
            return {"routedAgentId": "alphafold-agent", "reason": "rule:alphafold-folding"}

        proteinmpnn_keywords = [
            "proteinmpnn",
            "protein mpnn",
            "inverse folding",
            "inverse-folding",
            "sequence design",
            "design sequence",
            "redesign sequence",
            "sequence redesign",
            "fix backbone",
            "stabilize sequence",
        ]
        structure_keywords = [
            "pdb",
            "structure",
            "backbone",
            "scaffold",
            "rf_",
            "rf-",
            "fold",
        ]
        has_sequence_design = ("design" in low or "redesign" in low or "optimize" in low) and (
            "sequence" in low or "seq" in low or "inverse" in low
        )
        has_structure_context = any(k in low for k in structure_keywords)
        if any(k in low for k in proteinmpnn_keywords) or (has_sequence_design and has_structure_context):
            return {"routedAgentId": "proteinmpnn-agent", "reason": "rule:proteinmpnn"}

        # Pipeline creation rule (check BEFORE RFdiffusion to avoid conflicts)
        # Check for explicit pipeline/workflow creation intent first
        pipeline_keywords = [
            "create pipeline", "design workflow", "build pipeline", "make pipeline",
            "create workflow", "build workflow", "make workflow",
            "design protein pipeline", "fold pipeline", "protein workflow",
            "create a pipeline", "set up pipeline", "setup pipeline",
            "pipeline for", "workflow for", "create a workflow",
            "generate pipeline", "generate workflow", "make a pipeline"
        ]
        # Check for explicit pipeline/workflow creation intent
        has_pipeline_intent = any(k in low for k in pipeline_keywords) or (
            ("pipeline" in low or "workflow" in low) and 
            ("create" in low or "build" in low or "make" in low or "design" in low or "set up" in low or "setup" in low or "generate" in low)
        )
        if has_pipeline_intent:
            return {"routedAgentId": "pipeline-agent", "reason": "rule:pipeline-creation"}
        
        # RFdiffusion protein design rule (after pipeline check)
        rfdiffusion_keywords = ["design", "create", "generate", "build", "rfdiffusion", "rf-diffusion", "protein design", "design protein", "create protein", "generate protein", "scaffold", "motif scaffolding", "hotspot design", "de novo", "new protein"]
        # Exclude pipeline-related keywords from RFdiffusion
        if any(k in low for k in rfdiffusion_keywords) and not has_pipeline_intent:
            return {"routedAgentId": "rfdiffusion-agent", "reason": "rule:rfdiffusion-design"}
        
        # Bio-chat for selection questions, BUT NOT if explicit visualization command
        if has_selection and any(k in low for k in interrogatives) and not has_viz_command:
            return {"routedAgentId": "bio-chat", "reason": "rule:selection+question"}
        
        # Uploaded file + visualization request → code-builder or mvs-builder
        if has_uploaded_file and has_visualization_request:
            # Check if it's a complex visualization (labels, annotations) → mvs-builder
            if mvs_signals:
                return {"routedAgentId": "mvs-builder", "reason": "rule:uploaded-file+visualization+mvs"}
            # Otherwise → code-builder
            return {"routedAgentId": "code-builder", "reason": "rule:uploaded-file+visualization"}
        
        # Uploaded file + informational question → bio-chat
        if has_uploaded_file and any(k in low for k in interrogatives) and not has_viz_command:
            return {"routedAgentId": "bio-chat", "reason": "rule:uploaded-file+question"}
        
        # MVS vs Simple Code routing rules
        mvs_keywords = [
            "label", "labels", "annotate", "highlight", "annotation", "text", "custom label", 
            "multiple", "complex", "declarative", "scene", "components",
            "fluent api", "mvs", "molviewspec", "specification", "write text", 
            "add text", "name the", "call it", "mark as", "tag as"
        ]
        
        simple_keywords = [
            "show", "display", "load", "basic", "simple", "just show", 
            "only show", "quick", "basic view", "disable", "enable", "remove", "add", "set", "get", "show", "display", "load", "basic", "simple", "just show", 
        ]
        
        mvs_signals = any(k in low for k in mvs_keywords)
        simple_signals = any(k in low for k in simple_keywords)
        
        # Strong MVS signals (without simple override)
        if mvs_signals and not simple_signals:
            return {"routedAgentId": "mvs-builder", "reason": "rule:mvs-keywords"}
        
        # Strong simple signals (without MVS override)  
        if simple_signals and not mvs_signals:
            return {"routedAgentId": "code-builder", "reason": "rule:simple-keywords"}

        # Semantic routing: input against agent vectors
        if not input_text.strip() or not self.agent_vecs or not self.embeddings:
            # Use keyword heuristic only
            # Enhanced keyword heuristic with MVS detection
            mvs_keywords = ["label", "labels", "annotate", "annotation", "text", "custom", "multiple", "complex"]
            code_keywords = [
                "show ", "display ", "visualize", "render", "color", "colour", "cartoon", "surface", "ball-and-stick", "water", "ligand", "focus", "zoom", "load", "pdb", "highlight", "chain", "view", "representation",
            ]
            proteinmpnn_keywords = ["proteinmpnn", "inverse folding", "sequence design", "design sequence", "fix backbone"]
            structure_keywords = ["pdb", "structure", "rf_", "backbone", "fold"]

            has_mvs = any(k in low for k in mvs_keywords)
            has_code = any(k in low for k in code_keywords)
            has_proteinmpnn = any(k in low for k in proteinmpnn_keywords) or (
                "design" in low and "sequence" in low and any(s in low for s in structure_keywords)
            )

            if has_proteinmpnn:
                return {"routedAgentId": "proteinmpnn-agent", "reason": "default:heuristic-proteinmpnn"}
            if has_mvs:
                chosen = "mvs-builder"
            elif has_code:
                chosen = "code-builder"
            else:
                chosen = "bio-chat"
            return {"routedAgentId": chosen, "reason": "default:enhanced-heuristic-no-embeddings"}

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
            return {"routedAgentId": "bio-chat", "reason": "default:no-scores"}

        best_key, best_score = scores[0]
        second_score = scores[1][1] if len(scores) > 1 else -1.0

        if best_score < self.threshold or (best_score - second_score) < self.margin:
            # fallback logic: simple heuristic using keywords
            # Enhanced fallback with MVS detection
            mvs_keywords = ["label", "labels", "annotate", "annotation", "text", "custom", "multiple", "complex"]
            code_keywords = [
                "show ", "display ", "visualize", "render", "color", "colour", "cartoon", "surface", "ball-and-stick", "water", "ligand", "focus", "zoom", "load", "pdb", "highlight", "chain", "view", "representation",
            ]
            proteinmpnn_keywords = ["proteinmpnn", "inverse folding", "sequence design", "design sequence", "fix backbone"]
            structure_keywords = ["pdb", "structure", "rf_", "backbone", "fold"]

            has_mvs = any(k in low for k in mvs_keywords)
            has_code = any(k in low for k in code_keywords)
            has_proteinmpnn = any(k in low for k in proteinmpnn_keywords) or (
                "design" in low and "sequence" in low and any(s in low for s in structure_keywords)
            )

            if has_proteinmpnn:
                chosen = "proteinmpnn-agent"
            elif has_mvs:
                chosen = "mvs-builder"
            elif has_code:
                chosen = "code-builder"
            else:
                chosen = "bio-chat"
            return {"routedAgentId": chosen, "reason": f"enhanced-fallback:score={best_score:.2f},margin={best_score-second_score:.2f}"}

        return {
            "routedAgentId": best_key,
            "reason": f"semantic:best={best_key},score={best_score:.2f},second={second_score:.2f}",
            "scores": scores[:3],
        }


routerGraph = SimpleRouterGraph()


async def init_router(agents: List[Dict[str, Any]]):
    await routerGraph.ainit(agents)
