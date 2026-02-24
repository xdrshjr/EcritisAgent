"""
Agent Router
------------

Routes user requests to the appropriate agent (AutoWriterAgent or DocumentAgent)
based on LLM-powered intent analysis.

This module:
1. Defines agent descriptors with capabilities
2. Uses LLM to analyze user intent
3. Selects the appropriate agent based on intent and context
4. Provides structured logging for the routing decision
"""

import json
import logging
from typing import Dict, Any, Optional, Literal
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

AgentType = Literal["auto_writer", "document_modifier"]


class AgentDescriptor:
    """Describes an agent's capabilities and use cases"""
    
    def __init__(
        self,
        agent_type: AgentType,
        name: str,
        description: str,
        capabilities: list[str],
        typical_requests: list[str],
        requires_document: bool
    ):
        self.agent_type = agent_type
        self.name = name
        self.description = description
        self.capabilities = capabilities
        self.typical_requests = typical_requests
        self.requires_document = requires_document
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert descriptor to dictionary for LLM and API responses"""
        return {
            "type": self.agent_type,
            "name": self.name,
            "description": self.description,
            "capabilities": self.capabilities,
            "typical_requests": self.typical_requests,
            "requires_document": self.requires_document,
        }


# Define available agents
AUTO_WRITER_AGENT = AgentDescriptor(
    agent_type="auto_writer",
    name="AI Document Auto-Writer",
    description="Creates new documents from scratch based on user requirements. "
                "Generates complete articles with multiple sections, handles outline creation, "
                "and produces well-structured content.",
    capabilities=[
        "Generate new documents from topic descriptions",
        "Create multi-section articles with custom paragraph counts",
        "Design document structure and outlines",
        "Write content with specific tone and style",
        "Target specific audiences",
        "Include keywords and themes",
    ],
    typical_requests=[
        "Write an article about...",
        "Create a document on...",
        "Generate a report about...",
        "Draft a blog post on...",
        "Compose an essay about...",
    ],
    requires_document=False
)

DOCUMENT_MODIFIER_AGENT = AgentDescriptor(
    agent_type="document_modifier",
    name="AI Document Modifier",
    description="Modifies and edits existing documents. "
                "Performs targeted changes, corrections, formatting, and refinements "
                "based on user commands.",
    capabilities=[
        "Modify existing document content",
        "Fix grammar and spelling errors",
        "Rewrite or rephrase sections",
        "Add or remove content",
        "Search and replace text",
        "Format and restructure documents",
        "Improve clarity and readability",
    ],
    typical_requests=[
        "Fix the grammar in...",
        "Change the tone to...",
        "Add a section about...",
        "Remove all mentions of...",
        "Rewrite the introduction",
        "Make it more professional",
        "Correct spelling errors",
    ],
    requires_document=True
)

AVAILABLE_AGENTS = [AUTO_WRITER_AGENT, DOCUMENT_MODIFIER_AGENT]


class AgentRouter:
    """Routes requests to appropriate agents using LLM-based intent detection"""
    
    def __init__(self, api_key: str, api_url: str, model_name: str, language: str = 'en', call_config: dict = None):
        """
        Initialize agent router

        Args:
            api_key: LLM API key
            api_url: LLM API base URL
            model_name: Model name for intent detection
            language: Language for prompts ('en' or 'zh')
            call_config: Full LLM call config dict (protocol-aware). When provided,
                         api_key/api_url/model_name are ignored.
        """
        self.language = language

        if call_config:
            from llm_factory import create_llm_client
            self.llm = create_llm_client(call_config, temperature=0.0, streaming=False)
        else:
            from langchain_openai import ChatOpenAI
            self.llm = ChatOpenAI(
                model=model_name,
                openai_api_key=api_key,
                openai_api_base=api_url,
                temperature=0.0,
                streaming=False,
            )
        
        logger.info('AgentRouter initialized', extra={
            'model': model_name,
            'language': language,
            'available_agents': [agent.name for agent in AVAILABLE_AGENTS],
        })
    
    def route(self, user_request: str, has_document: bool = False) -> Dict[str, Any]:
        """
        Route user request to appropriate agent
        
        Args:
            user_request: User's command or request
            has_document: Whether a document is currently loaded
            
        Returns:
            Dictionary containing:
            - agent_type: Selected agent type ('auto_writer' or 'document_modifier')
            - agent_name: Human-readable agent name
            - confidence: Confidence level of the routing decision
            - reasoning: Explanation of why this agent was selected
        """
        logger.info('Starting agent routing', extra={
            'request_preview': user_request[:100] + '...' if len(user_request) > 100 else user_request,
            'has_document': has_document,
            'language': self.language,
        })
        
        try:
            # Build agent descriptions for LLM
            agent_descriptions = self._build_agent_descriptions()
            
            # Create routing prompt
            system_prompt = self._create_routing_prompt(agent_descriptions, has_document)
            user_prompt = self._create_user_prompt(user_request)
            
            logger.debug('Sending routing request to LLM', extra={
                'system_prompt_length': len(system_prompt),
                'user_prompt_length': len(user_prompt),
                'model': self.llm.model_name,
            })
            
            # Call LLM for routing decision
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            response = self.llm.invoke(messages)
            response_content = response.content if hasattr(response, 'content') else str(response)
            
            logger.debug('Received routing response from LLM', extra={
                'response_length': len(response_content),
                'response_preview': response_content[:200],
            })
            
            # Parse routing decision
            routing_result = self._parse_routing_response(response_content)
            
            logger.info('Agent routing completed', extra={
                'selected_agent': routing_result['agent_type'],
                'agent_name': routing_result['agent_name'],
                'confidence': routing_result.get('confidence', 'unknown'),
                'reasoning_preview': routing_result.get('reasoning', '')[:100],
            })
            
            return routing_result
            
        except Exception as error:
            logger.error('Agent routing failed', extra={
                'error': str(error),
                'error_type': type(error).__name__,
            }, exc_info=True)
            
            # Fallback: Use document presence as routing signal
            fallback_agent = DOCUMENT_MODIFIER_AGENT if has_document else AUTO_WRITER_AGENT
            
            logger.warning('Using fallback routing strategy', extra={
                'fallback_agent': fallback_agent.agent_type,
                'reason': 'LLM routing failed',
                'has_document': has_document,
            })
            
            return {
                'agent_type': fallback_agent.agent_type,
                'agent_name': fallback_agent.name,
                'confidence': 'low',
                'reasoning': f'Fallback routing due to error: {str(error)}',
                'is_fallback': True,
            }
    
    def _build_agent_descriptions(self) -> str:
        """Build formatted agent descriptions for LLM"""
        descriptions = []
        
        for idx, agent in enumerate(AVAILABLE_AGENTS, 1):
            desc = f"""
Agent {idx}: {agent.name}
Type: {agent.agent_type}
Description: {agent.description}

Capabilities:
{chr(10).join(f'  - {cap}' for cap in agent.capabilities)}

Typical User Requests:
{chr(10).join(f'  - "{req}"' for req in agent.typical_requests)}

Requires Existing Document: {'Yes' if agent.requires_document else 'No'}
"""
            descriptions.append(desc.strip())
        
        return "\n\n" + "\n\n".join(descriptions) + "\n"
    
    def _create_routing_prompt(self, agent_descriptions: str, has_document: bool) -> str:
        """Create system prompt for routing decision"""
        if self.language == 'zh':
            prompt = f"""你是一个智能代理路由器。你的任务是分析用户请求，并选择最合适的代理来处理该请求。

## 可用代理

{agent_descriptions}

## 当前上下文

文档状态: {'已加载文档' if has_document else '没有文档'}

## 路由规则

1. **文档创建请求** → 选择 "auto_writer" 代理
   - 用户想要创建新文档、文章、报告等
   - 关键词：写、创建、生成、起草等

2. **文档修改请求** → 选择 "document_modifier" 代理
   - 用户想要修改现有文档
   - 关键词：修改、更改、修复、重写、添加、删除等
   - 注意：需要已加载文档

3. **特殊情况处理**
   - 如果用户请求修改文档但没有加载文档 → 返回错误
   - 如果请求不明确 → 根据上下文和可能性选择最合适的代理

## 输出格式

必须输出有效的 JSON 格式：

```json
{{
  "agent_type": "auto_writer" 或 "document_modifier",
  "confidence": "high" 或 "medium" 或 "low",
  "reasoning": "选择该代理的详细理由"
}}
```

请始终输出有效的 JSON，不要添加其他文本。
"""
        else:
            prompt = f"""You are an intelligent agent router. Your task is to analyze user requests and select the most appropriate agent to handle the request.

## Available Agents

{agent_descriptions}

## Current Context

Document Status: {'Document is loaded' if has_document else 'No document loaded'}

## Routing Rules

1. **Document Creation Requests** → Select "auto_writer" agent
   - User wants to create a new document, article, report, etc.
   - Keywords: write, create, generate, draft, compose, etc.

2. **Document Modification Requests** → Select "document_modifier" agent
   - User wants to modify existing document content
   - Keywords: modify, change, fix, rewrite, add, remove, correct, etc.
   - Note: Requires a loaded document

3. **Special Cases**
   - If user requests modification but no document is loaded → Return error
   - If request is ambiguous → Choose the most appropriate agent based on context and probability

## Output Format

You must output valid JSON format:

```json
{{
  "agent_type": "auto_writer" or "document_modifier",
  "confidence": "high" or "medium" or "low",
  "reasoning": "Detailed explanation of why this agent was chosen"
}}
```

Always output valid JSON only. Do not add any other text.
"""
        return prompt.strip()
    
    def _create_user_prompt(self, user_request: str) -> str:
        """Create user prompt for routing decision"""
        if self.language == 'zh':
            return f"""请分析以下用户请求并选择合适的代理：

用户请求: {user_request}

请输出 JSON 格式的路由决策。"""
        else:
            return f"""Please analyze the following user request and select the appropriate agent:

User Request: {user_request}

Output your routing decision in JSON format."""
    
    def _parse_routing_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM routing response"""
        try:
            # Extract JSON from response
            json_str = response.strip()
            
            # Handle markdown code blocks
            if "```json" in json_str:
                start = json_str.find("```json") + 7
                end = json_str.find("```", start)
                json_str = json_str[start:end].strip()
            elif "```" in json_str:
                start = json_str.find("```") + 3
                end = json_str.find("```", start)
                json_str = json_str[start:end].strip()
            
            # Parse JSON
            routing_data = json.loads(json_str)
            
            # Validate agent_type
            agent_type = routing_data.get('agent_type')
            if agent_type not in ['auto_writer', 'document_modifier']:
                logger.warning('Invalid agent_type in routing response', extra={
                    'received_type': agent_type,
                    'valid_types': ['auto_writer', 'document_modifier'],
                })
                raise ValueError(f"Invalid agent_type: {agent_type}")
            
            # Find agent descriptor
            agent = next(
                (a for a in AVAILABLE_AGENTS if a.agent_type == agent_type),
                None
            )
            
            if not agent:
                raise ValueError(f"Agent not found for type: {agent_type}")
            
            return {
                'agent_type': agent_type,
                'agent_name': agent.name,
                'confidence': routing_data.get('confidence', 'medium'),
                'reasoning': routing_data.get('reasoning', 'No reasoning provided'),
            }
            
        except json.JSONDecodeError as error:
            logger.error('Failed to parse routing JSON', extra={
                'error': str(error),
                'response_preview': response[:300],
            }, exc_info=True)
            raise ValueError(f"Invalid JSON in routing response: {str(error)}")
        except Exception as error:
            logger.error('Failed to parse routing response', extra={
                'error': str(error),
                'response_preview': response[:300],
            }, exc_info=True)
            raise


def get_available_agents() -> list[Dict[str, Any]]:
    """Get list of available agents for API responses"""
    return [agent.to_dict() for agent in AVAILABLE_AGENTS]







