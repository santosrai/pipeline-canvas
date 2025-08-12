"""
MVS RAG (Retrieval-Augmented Generation) System
Integrates Pinecone vector database for intelligent MVS code generation
"""

import os
import asyncio
from typing import List, Dict, Any, Optional
from pinecone import Pinecone
import openai

class MVSRAGRetriever:
    """Retrieves relevant MVS examples from Pinecone for enhanced code generation"""
    
    def __init__(self, pinecone_api_key: str, openai_api_key: str, index_name: str = "mvs-examples"):
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.openai_client = openai.OpenAI(api_key=openai_api_key)
        self.index_name = index_name
        self.index = None
        
    async def initialize(self):
        """Initialize connection to Pinecone index"""
        try:
            self.index = self.pc.Index(self.index_name)
            print(f"[RAG] Connected to Pinecone index: {self.index_name}")
            return True
        except Exception as e:
            print(f"[RAG] Failed to connect to Pinecone: {e}")
            return False
    
    def extract_intent_keywords(self, user_query: str) -> List[str]:
        """Extract key intent words from user query for better retrieval"""
        intent_keywords = []
        
        # Component keywords
        if any(word in user_query.lower() for word in ['ligand', 'small molecule', 'drug', 'inhibitor']):
            intent_keywords.append('ligand')
        if any(word in user_query.lower() for word in ['protein', 'polymer', 'chain']):
            intent_keywords.append('polymer')
        if any(word in user_query.lower() for word in ['water', 'solvent']):
            intent_keywords.append('water')
            
        # Feature keywords
        if any(word in user_query.lower() for word in ['label', 'text', 'name', 'annotate']):
            intent_keywords.append('label')
        if any(word in user_query.lower() for word in ['color', 'colour', 'red', 'blue', 'green', 'orange']):
            intent_keywords.append('color')
        if any(word in user_query.lower() for word in ['surface', 'molecular surface']):
            intent_keywords.append('surface')
        if any(word in user_query.lower() for word in ['cartoon', 'ribbon']):
            intent_keywords.append('cartoon')
        if any(word in user_query.lower() for word in ['ball', 'stick', 'atomic']):
            intent_keywords.append('ball_and_stick')
        if any(word in user_query.lower() for word in ['focus', 'zoom', 'center']):
            intent_keywords.append('focus')
            
        return intent_keywords
    
    async def retrieve_relevant_examples(self, user_query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Retrieve most relevant MVS examples based on user intent"""
        
        if not self.index:
            print("[RAG] Index not initialized, using fallback")
            return []
            
        try:
            # Extract intent for enhanced query
            intent_keywords = self.extract_intent_keywords(user_query)
            
            # Build enhanced query with context
            enhanced_query = f"MVS molecular visualization {user_query}"
            if intent_keywords:
                enhanced_query += f" {' '.join(intent_keywords)}"
            
            print(f"[RAG] Searching for: {enhanced_query}")
            
            # Search Pinecone with text query (assuming index has integrated embeddings)
            results = self.index.query(
                vector=None,  # Use text query if index supports it
                top_k=top_k,
                include_metadata=True,
                namespace="mvs-examples"
            )
            
            # If direct text query doesn't work, try with OpenAI embeddings
            if not results.get('matches'):
                embedding = await self.get_embedding(enhanced_query)
                results = self.index.query(
                    vector=embedding,
                    top_k=top_k,
                    include_metadata=True,
                    namespace="mvs-examples"
                )
            
            relevant_examples = []
            for match in results.get('matches', []):
                if match.get('score', 0) > 0.7:  # Relevance threshold
                    metadata = match.get('metadata', {})
                    relevant_examples.append({
                        'code': metadata.get('code_text', ''),
                        'use_case': metadata.get('use_case', ''),
                        'features': metadata.get('features', []),
                        'complexity': metadata.get('complexity', 'basic'),
                        'score': match.get('score', 0)
                    })
            
            print(f"[RAG] Found {len(relevant_examples)} relevant examples")
            return relevant_examples
            
        except Exception as e:
            print(f"[RAG] Error retrieving examples: {e}")
            return []
    
    async def get_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI"""
        try:
            response = self.openai_client.embeddings.create(
                input=text,
                model="text-embedding-3-small"
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[RAG] Error generating embedding: {e}")
            return []
    
    async def build_enhanced_prompt(self, user_query: str, base_prompt: str) -> str:
        """Build enhanced prompt with retrieved examples"""
        
        relevant_examples = await self.retrieve_relevant_examples(user_query)
        
        if not relevant_examples:
            print("[RAG] No relevant examples found, using base prompt")
            return base_prompt
            
        # Build examples section
        examples_text = "\n\nRELEVANT WORKING EXAMPLES:\n"
        
        for i, example in enumerate(relevant_examples, 1):
            examples_text += f"\nExample {i} - {example['use_case']} (Score: {example['score']:.2f}):\n"
            examples_text += f"```javascript\n{example['code']}\n```\n"
            if example['features']:
                examples_text += f"Features: {', '.join(example['features'])}\n"
        
        examples_text += "\n" + "="*50 + "\n"
        examples_text += "IMPORTANT: Follow these proven patterns exactly. Pay attention to:\n"
        examples_text += "- Separate .color() and .label() into different component chains\n"
        examples_text += "- .color() only works after .representation()\n"
        examples_text += "- .label() only works after .component()\n"
        examples_text += "- Always end with await mvs.apply();\n"
        examples_text += "="*50 + "\n\n"
        
        enhanced_prompt = base_prompt + examples_text
        
        print(f"[RAG] Enhanced prompt with {len(relevant_examples)} examples")
        return enhanced_prompt


# Global RAG instance
_rag_retriever: Optional[MVSRAGRetriever] = None

async def get_rag_retriever() -> Optional[MVSRAGRetriever]:
    """Get or create global RAG retriever instance"""
    global _rag_retriever
    
    if _rag_retriever is None:
        pinecone_key = os.getenv("PINECONE_API_KEY")
        openai_key = os.getenv("OPENAI_API_KEY")
        
        if not pinecone_key:
            print("[RAG] PINECONE_API_KEY not found in environment")
            return None
            
        if not openai_key:
            print("[RAG] OPENAI_API_KEY not found in environment")
            return None
        
        _rag_retriever = MVSRAGRetriever(pinecone_key, openai_key)
        
        # Initialize connection
        if not await _rag_retriever.initialize():
            print("[RAG] Failed to initialize RAG retriever")
            _rag_retriever = None
            return None
    
    return _rag_retriever

async def enhance_mvs_prompt_with_rag(user_query: str, base_prompt: str) -> str:
    """Main function to enhance MVS prompt with RAG"""
    
    retriever = await get_rag_retriever()
    
    if not retriever:
        print("[RAG] RAG retriever not available, using base prompt")
        return base_prompt
    
    try:
        enhanced_prompt = await retriever.build_enhanced_prompt(user_query, base_prompt)
        return enhanced_prompt
    except Exception as e:
        print(f"[RAG] Error enhancing prompt: {e}")
        return base_prompt