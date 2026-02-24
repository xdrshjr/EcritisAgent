"""
AutoWriterAgent
---------------

LangGraph based agent dedicated to the AI Document Auto-Writer feature.
It composes a multi-step workflow:

1. Intent detection (LLM) – determines whether writing is required.
2. Parameter extraction (LLM) – extracts paragraph count, tone, etc.
3. LangGraph workflow – outline -> section drafting -> refinement -> compile.
4. Streaming status events so the frontend can render an elegant timeline.

The agent exposes a synchronous generator interface so Flask can stream
Server-Sent Events (SSE) back to the UI.
"""

from __future__ import annotations

import logging
import operator
import json
import os
import sys
import random
import requests
from pathlib import Path
from typing import Annotated, Dict, Generator, List, Optional, TypedDict

from langchain_core.messages import SystemMessage
from langgraph.graph import END, StateGraph

from .writer_intent import (
    IntentResult,
    WriterParameters,
    analyze_intent,
    extract_writer_parameters,
    parse_json_block,
)

logger = logging.getLogger(__name__)


class WriterLLMConfig:
    def __init__(
        self,
        api_key: str,
        api_url: str,
        model: str,
        max_retries: int = 3,
        timeout: int = 90,
        call_config: dict = None,
    ):
        self.api_key = api_key
        self.api_url = api_url
        self.model = model
        self.max_retries = max_retries
        self.timeout = timeout
        self.call_config = call_config

    def get_llm(self, temperature: float = 0.7, streaming: bool = False):
        if self.call_config:
            from llm_factory import create_llm_client
            return create_llm_client(
                self.call_config,
                temperature=temperature,
                streaming=streaming,
                max_retries=self.max_retries,
                timeout=self.timeout,
            )

        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=self.model,
            temperature=temperature,
            api_key=self.api_key,
            base_url=self.api_url,
            max_retries=self.max_retries,
            timeout=self.timeout,
            streaming=streaming,
        )


class WriterState(TypedDict, total=False):
    user_prompt: str
    language: str
    parameters: WriterParameters
    outline: List[Dict[str, str]]
    completed_sections: Annotated[List[Dict[str, str]], operator.add]
    section_summaries: Annotated[List[Dict[str, str]], operator.add]  # Track summaries of completed paragraphs
    refined_sections: Annotated[List[str], operator.add]
    final_article_markdown: str
    final_article_html: str
    llm_config: WriterLLMConfig
    error_message: Optional[str]


def build_outline(state: WriterState) -> WriterState:
    llm = state["llm_config"].get_llm(temperature=0.4)
    params = state["parameters"]
    section_count = params["paragraph_count"]

    prompt = (
        "你是一名高级结构化写作专家。根据用户需求和参数生成段落大纲。\n"
        f"用户输入：{state['user_prompt']}\n"
        f"段落数量：{section_count}\n"
        f"语调：{params['tone']}，目标读者：{params['audience']}\n"
        "输出 JSON 数组，每个元素格式：\n"
        "{\n"
        '  "title": "段落标题",\n'
        '  "summary": "50字以内概述"\n'
        "}\n"
    )

    response = llm.invoke(prompt)
    outline = []
    payload = parse_json_block(response.content if hasattr(response, "content") else str(response))
    outline = []
    if isinstance(payload, list):
        for i, item in enumerate(payload):
            outline.append({
                "title": item.get("title", f"段落 {i + 1}") if isinstance(item, dict) else f"段落 {i + 1}",
                "summary": (item.get("summary") if isinstance(item, dict) else params["topic"]) or params["topic"],
            })
    elif isinstance(payload, dict) and "outline" in payload and isinstance(payload["outline"], list):
        for i, item in enumerate(payload["outline"]):
            outline.append({
                "title": item.get("title", f"段落 {i + 1}") if isinstance(item, dict) else f"段落 {i + 1}",
                "summary": (item.get("summary") if isinstance(item, dict) else params["topic"]) or params["topic"],
            })

    if not outline:
        outline = [
            {"title": f"段落 {i + 1}", "summary": params["topic"]}
            for i in range(section_count)
        ]

    if len(outline) < section_count:
        remainder = section_count - len(outline)
        outline.extend(
            {"title": f"段落 {len(outline) + idx + 1}", "summary": params["topic"]}
            for idx in range(remainder)
        )

    state["outline"] = outline[:section_count]
    logger.info("[AutoWriter] Outline generated", extra={"sections": len(state["outline"])})
    return state


def write_section(state: WriterState) -> WriterState:
    """
    Write a single section - NOTE: This is now only used as a fallback.
    The main run() method handles streaming section generation directly.
    """
    outline = state["outline"]
    completed_count = len(state.get("completed_sections", []))
    if completed_count >= len(outline):
        return state

    section = outline[completed_count]
    params = state["parameters"]

    llm = state["llm_config"].get_llm(temperature=params["temperature"])
    previous_snippets = "\n".join(
        f"{idx + 1}. {item['title']}: {item['content'][:120]}"
        for idx, item in enumerate(state.get("completed_sections", []))
    )

    prompt = SystemMessage(
        content=(
            f"你是一名专业写作者，语言为{params['language']}。\n"
            f"主题：{params['topic']}\n"
            f"目标读者：{params['audience']}\n"
            f"语调：{params['tone']}\n"
            f"必备关键词：{', '.join(params['keywords']) or '无'}\n"
            f"之前段落内容（供参考）：\n{previous_snippets or '无'}\n"
            f"请写作段落《{section['title']}》，要求紧扣概述：{section['summary']}，字数 250-400 字。\n"
            "内容需要结构清晰，使用自然段，语言流畅。"
        )
    )

    response = llm.invoke([prompt])
    drafted_section = {
        "title": section["title"],
        "content": response.content.strip() if hasattr(response, "content") else str(response),
    }

    logger.debug("[AutoWriter] Section drafted", extra={
        "index": completed_count + 1,
        "title": drafted_section["title"],
    })

    return {
        "completed_sections": [drafted_section],
    }


def should_continue_writing(state: WriterState) -> str:
    completed_count = len(state.get("completed_sections", []))
    total = len(state["outline"])
    return "continue" if completed_count < total else "done"


def refine_article(state: WriterState) -> WriterState:
    llm = state["llm_config"].get_llm(temperature=0.3)
    sections = state.get("completed_sections", [])
    combined_text = "\n\n".join(
        f"{section['title']}\n{section['content']}" for section in sections
    )

    prompt = (
        "请将以下多段内容润色成语言更加连贯、衔接自然的正文，保留原有结构和关键信息。\n"
        "输出纯文本，不需要额外说明。\n"
        f"{combined_text}"
    )

    response = llm.invoke(prompt)
    refined_text = response.content if hasattr(response, "content") else str(response)

    return {
        "refined_sections": [refined_text],
    }


def compile_article(state: WriterState) -> WriterState:
    sections = state.get("completed_sections", [])
    
    # Directly compile from completed sections without refinement
    markdown_parts = []
    for section in sections:
        markdown_parts.append(f"## {section['title']}\n\n{section['content']}\n")
    markdown = "\n".join(markdown_parts)

    state["final_article_markdown"] = markdown.strip()
    state["final_article_html"] = build_html_from_sections(sections)

    logger.info("[AutoWriter] Article compiled", extra={
        "sections": len(sections),
        "length": len(state["final_article_markdown"]),
    })
    return state


def build_html_from_sections(sections: List[Dict[str, str]], article_title: str = None) -> str:
    """
    Build HTML from article sections.
    
    Args:
        sections: List of section dictionaries with 'title' and 'content'
        article_title: Optional main article title to display at the top
    
    Returns:
        Complete HTML string with optional article title and all sections
    """
    html_parts = []
    
    # Add main article title if provided
    if article_title:
        html_parts.append(f"<h1>{article_title}</h1>")
    
    # Add each section with h2 title and paragraphs
    for section in sections:
        html_parts.append(f"<h2>{section['title']}</h2>")
        
        # Ensure content is a string
        content = section.get("content", "")
        if not isinstance(content, str):
            logger.warning("[AutoWriter] Section content is not a string, converting", extra={
                "content_type": type(content).__name__,
                "section_title": section.get("title", "Unknown"),
            })
            content = str(content) if content else ""
        
        for paragraph in content.split("\n"):
            clean = paragraph.strip()
            if clean:
                html_parts.append(f"<p>{clean}</p>")
    
    return "".join(html_parts)


def create_writer_workflow() -> StateGraph:
    """
    Create simplified workflow for outline generation only.
    Section writing is now handled manually with streaming in the run() method.
    """
    workflow = StateGraph(WriterState)
    workflow.add_node("outline", build_outline)

    workflow.set_entry_point("outline")
    workflow.add_edge("outline", END)

    return workflow.compile()


def _get_image_service_config_path():
    """
    Determine image service configuration file path based on environment
    Returns the path to image-service-configs.json
    """
    electron_user_data = os.environ.get('ELECTRON_USER_DATA')
    
    if electron_user_data:
        # Running in Electron - use the userData path provided by Electron
        config_dir = Path(electron_user_data)
        logger.debug('[AutoWriter] Using Electron userData path for image service configs', extra={
            'path': str(config_dir)
        })
    elif getattr(sys, 'frozen', False):
        # Running as packaged executable (non-Electron)
        if sys.platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
        else:
            config_dir = Path.home() / '.config' / 'EcritisAgent'
        logger.debug('[AutoWriter] Using packaged app config path for image service configs', extra={
            'path': str(config_dir)
        })
    else:
        # Running in development
        config_dir = Path(__file__).parent.parent.parent / 'userData'
        logger.debug('[AutoWriter] Using development config path for image service configs', extra={
            'path': str(config_dir)
        })
    
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / 'image-service-configs.json'


def _get_search_service_config_path():
    """
    Determine search service configuration file path based on environment
    Returns the path to search-service-configs.json
    """
    electron_user_data = os.environ.get('ELECTRON_USER_DATA')
    
    if electron_user_data:
        # Running in Electron - use the userData path provided by Electron
        config_dir = Path(electron_user_data)
        logger.debug('[AutoWriter] Using Electron userData path for search service configs', extra={
            'path': str(config_dir)
        })
    elif getattr(sys, 'frozen', False):
        # Running as packaged executable (non-Electron)
        if sys.platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
        else:
            config_dir = Path.home() / '.config' / 'EcritisAgent'
        logger.debug('[AutoWriter] Using packaged app config path for search service configs', extra={
            'path': str(config_dir)
        })
    else:
        # Running in development
        config_dir = Path(__file__).parent.parent.parent / 'userData'
        logger.debug('[AutoWriter] Using development config path for search service configs', extra={
            'path': str(config_dir)
        })
    
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / 'search-service-configs.json'


def _search_references_for_section(
    section_title: str,
    section_summary: str,
    topic: str,
    keywords: List[str]
) -> List[Dict[str, str]]:
    """
    Search for 5 reference articles for a section using the configured search service.
    
    Args:
        section_title: Title of the section
        section_summary: Summary of the section
        topic: Main topic of the article
        keywords: Keywords from the article parameters
        
    Returns:
        List of reference dictionaries with 'title', 'url', 'content', 'score'
    """
    logger.info('[AutoWriter] Searching references for section', extra={
        'section_title': section_title,
        'section_summary': section_summary[:100] if section_summary else '',
        'topic': topic,
        'keywords': keywords,
    })
    
    try:
        # Load search service configuration
        config_path = _get_search_service_config_path()
        
        if not config_path.exists():
            logger.warning('[AutoWriter] Search service config file not found')
            return []
        
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        services = configs.get('searchServices', [])
        if not services:
            logger.warning('[AutoWriter] No search services configured')
            return []
        
        # Select default service
        selected_service = None
        default_service_id = configs.get('defaultServiceId')
        if default_service_id:
            selected_service = next((s for s in services if s.get('id') == default_service_id), None)
        
        if not selected_service:
            selected_service = services[0]
        
        logger.info('[AutoWriter] Using search service', extra={
            'serviceId': selected_service.get('id'),
            'serviceName': selected_service.get('name'),
            'serviceType': selected_service.get('type'),
        })
        
        # Get API keys
        api_keys = selected_service.get('apiKeys', [])
        if not api_keys:
            logger.error('[AutoWriter] No API keys available for search service')
            return []
        
        # Select random API key
        selected_api_key = random.choice(api_keys)
        
        # Build search query from section title, summary, topic, and keywords
        query_parts = [section_title, section_summary, topic]
        query_parts.extend(keywords[:3])  # Add first 3 keywords
        search_query = " ".join([part for part in query_parts if part and part.strip()])
        
        # Search based on service type
        service_type = selected_service.get('type', 'tavily')
        
        if service_type == 'tavily':
            # Search Tavily API
            tavily_api_url = 'https://api.tavily.com/search'
            
            search_payload = {
                'api_key': selected_api_key,
                'query': search_query.strip(),
                'max_results': 5,  # Get 5 references
                'search_depth': 'basic'
            }
            
            logger.debug('[AutoWriter] Calling Tavily API for references', extra={
                'query': search_query,
                'max_results': 5,
            })
            
            response = requests.post(tavily_api_url, json=search_payload, timeout=15)
            
            if response.status_code != 200:
                logger.error('[AutoWriter] Tavily API error', extra={
                    'status_code': response.status_code,
                    'error_text': response.text[:200],
                })
                return []
            
            result_data = response.json()
            results = result_data.get('results', [])
            
            # Format results
            formatted_results = []
            for idx, result in enumerate(results):
                formatted_result = {
                    'title': result.get('title', 'No title'),
                    'url': result.get('url', ''),
                    'content': result.get('content', ''),
                    'score': result.get('score', 0.0),
                }
                formatted_results.append(formatted_result)
            
            logger.info('[AutoWriter] References found successfully', extra={
                'section_title': section_title,
                'reference_count': len(formatted_results),
            })
            
            return formatted_results
        else:
            logger.warning('[AutoWriter] Unsupported search service type', extra={
                'service_type': service_type,
            })
            return []
            
    except requests.Timeout:
        logger.error('[AutoWriter] Reference search request timed out')
        return []
    except Exception as error:
        logger.error('[AutoWriter] Reference search failed', extra={
            'section_title': section_title,
            'error': str(error),
        }, exc_info=True)
        return []


def _extract_keywords_from_paragraph(
    paragraph_content: str,
    section_title: str,
    llm: ChatOpenAI
) -> List[str]:
    """
    Extract 3 keywords from paragraph content using LLM.
    
    Args:
        paragraph_content: The paragraph content to extract keywords from
        section_title: The title of the section
        llm: LLM instance for keyword extraction
        
    Returns:
        List of 3 keywords (strings)
    """
    logger.info('[AutoWriter] Extracting keywords from paragraph', extra={
        'section_title': section_title,
        'content_length': len(paragraph_content),
    })
    
    try:
        prompt = SystemMessage(
            content=(
                f"你是一名专业的关键词提取专家。请从以下段落中提取3个最重要的关键词。\n\n"
                f"段落标题：{section_title}\n\n"
                f"段落内容：\n{paragraph_content}\n\n"
                f"要求：\n"
                f"- 提取3个关键词，这些关键词应该最能代表段落的核心内容\n"
                f"- 关键词应该适合用于图片搜索\n"
                f"- 关键词应该简洁、具体、有代表性\n"
                f"- 输出格式为JSON数组，例如：[\"关键词1\", \"关键词2\", \"关键词3\"]\n"
                f"- 只输出JSON数组，不要添加任何其他说明或文字\n"
            )
        )
        
        logger.debug('[AutoWriter] Calling LLM for keyword extraction', extra={
            'section_title': section_title,
        })
        
        response = llm.invoke([prompt])
        response_text = response.content.strip() if hasattr(response, "content") else str(response).strip()
        
        # Parse JSON response
        keywords = parse_json_block(response_text)
        
        if isinstance(keywords, list) and len(keywords) >= 1:
            # Take first 3 keywords
            extracted_keywords = [str(k).strip() for k in keywords[:3] if k and str(k).strip()]
            
            # Ensure we have at least 3 keywords (pad if needed)
            while len(extracted_keywords) < 3 and len(extracted_keywords) > 0:
                # Use the first keyword as fallback
                extracted_keywords.append(extracted_keywords[0])
            
            if len(extracted_keywords) >= 3:
                logger.info('[AutoWriter] Keywords extracted successfully', extra={
                    'section_title': section_title,
                    'keywords': extracted_keywords[:3],
                })
                return extracted_keywords[:3]
            else:
                logger.warning('[AutoWriter] Insufficient keywords extracted, using fallback', extra={
                    'section_title': section_title,
                    'extracted_count': len(extracted_keywords),
                })
                # Fallback: use section title and first few words from content
                fallback_keywords = [
                    section_title,
                    paragraph_content.split()[0] if paragraph_content.split() else "image",
                    "illustration"
                ]
                return fallback_keywords[:3]
        else:
            logger.warning('[AutoWriter] Invalid keyword extraction response format', extra={
                'section_title': section_title,
                'response_preview': response_text[:100],
            })
            # Fallback keywords
            return [section_title, "image", "illustration"]
            
    except Exception as error:
        logger.error('[AutoWriter] Failed to extract keywords', extra={
            'section_title': section_title,
            'error': str(error),
        }, exc_info=True)
        # Fallback keywords
        return [section_title, "image", "illustration"]


def _search_image_for_keywords(keywords: List[str]) -> Optional[Dict[str, str]]:
    """
    Search for an image using keywords via the configured image service.
    
    Args:
        keywords: List of keywords to search for
        
    Returns:
        Dictionary with image info (url, description, etc.) or None if search fails
    """
    logger.info('[AutoWriter] Searching image with keywords', extra={
        'keywords': keywords,
    })
    
    try:
        # Load image service configuration
        config_path = _get_image_service_config_path()
        
        if not config_path.exists():
            logger.warning('[AutoWriter] Image service config file not found')
            return None
        
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        services = configs.get('imageServices', [])
        if not services:
            logger.warning('[AutoWriter] No image services configured')
            return None
        
        # Select default service
        selected_service = None
        default_service_id = configs.get('defaultServiceId')
        if default_service_id:
            selected_service = next((s for s in services if s.get('id') == default_service_id), None)
        
        if not selected_service:
            selected_service = services[0]
        
        logger.info('[AutoWriter] Using image service', extra={
            'serviceId': selected_service.get('id'),
            'serviceName': selected_service.get('name'),
            'serviceType': selected_service.get('type'),
        })
        
        # Get API keys
        api_keys = selected_service.get('apiKeys', [])
        if not api_keys:
            logger.error('[AutoWriter] No API keys available for image service')
            return None
        
        # Select random API key
        selected_api_key = random.choice(api_keys)
        
        # Build search query from keywords
        search_query = " ".join(keywords)
        
        # Search based on service type
        service_type = selected_service.get('type', 'unsplash')
        
        if service_type == 'unsplash':
            # Search Unsplash API
            unsplash_api_url = 'https://api.unsplash.com/search/photos'
            
            search_params = {
                'query': search_query.strip(),
                'per_page': 1,  # Only need one image
                'page': 1,
                'client_id': selected_api_key
            }
            
            logger.debug('[AutoWriter] Calling Unsplash API', extra={
                'query': search_query,
            })
            
            response = requests.get(unsplash_api_url, params=search_params, timeout=10)
            
            if response.status_code != 200:
                logger.error('[AutoWriter] Unsplash API error', extra={
                    'status_code': response.status_code,
                    'error_text': response.text[:200],
                })
                return None
            
            result_data = response.json()
            results = result_data.get('results', [])
            
            if not results:
                logger.warning('[AutoWriter] No images found for keywords', extra={
                    'keywords': keywords,
                })
                return None
            
            # Get first result
            photo = results[0]
            image_data = {
                'url': photo.get('urls', {}).get('regular', photo.get('urls', {}).get('small', '')),
                'description': photo.get('description') or photo.get('alt_description') or 'No description',
                'author': photo.get('user', {}).get('name', 'Unknown'),
            }
            
            logger.info('[AutoWriter] Image found successfully', extra={
                'keywords': keywords,
                'image_url_preview': image_data['url'][:100],
            })
            
            return image_data
        else:
            logger.warning('[AutoWriter] Unsupported image service type', extra={
                'service_type': service_type,
            })
            return None
            
    except requests.Timeout:
        logger.error('[AutoWriter] Image search request timed out')
        return None
    except Exception as error:
        logger.error('[AutoWriter] Image search failed', extra={
            'error': str(error),
        }, exc_info=True)
        return None


class AutoWriterAgent:
    def __init__(self, api_key: str, api_url: str, model_name: str, language: str = "zh", call_config: dict = None):
        self.language = language
        self.config = WriterLLMConfig(api_key=api_key, api_url=api_url, model=model_name, call_config=call_config)
        self.intent_llm = self.config.get_llm(temperature=0.0)
        self.workflow = create_writer_workflow()

    def _status_event(self, phase: str, message: str, timeline: Optional[List[Dict]] = None):
        return {
            "type": "status",
            "phase": phase,
            "message": message,
            "timeline": timeline,
        }

    def _generate_section_summary(
        self,
        section_title: str,
        section_content: str,
        section_index: int
    ) -> str:
        """
        Generate a concise summary of a completed paragraph for context in subsequent paragraphs.
        
        Args:
            section_title: Title of the completed section
            section_content: Full content of the completed section
            section_index: Index of the section (0-based)
            
        Returns:
            Concise summary of the paragraph
        """
        logger.info("[AutoWriter] Generating paragraph summary", extra={
            "section_index": section_index + 1,
            "section_title": section_title,
            "content_length": len(section_content),
        })
        
        # Use a dedicated LLM instance with lower temperature for consistent summarization
        summary_llm = self.config.get_llm(temperature=0.3, streaming=False)
        
        # Create prompt for summarization
        prompt = SystemMessage(
            content=(
                f"你是一名专业的文本总结专家。请为以下段落生成一个简短的总结，不超过50字。\n\n"
                f"段落标题：{section_title}\n\n"
                f"段落内容：\n{section_content}\n\n"
                f"要求：\n"
                f"- 总结必须简洁，不超过50字\n"
                f"- 抓住段落的核心观点和主要内容\n"
                f"- 使用清晰、流畅的语言\n"
                f"- 直接输出总结内容，不要添加任何前缀或后缀\n"
            )
        )
        
        try:
            logger.debug("[AutoWriter] Calling LLM for paragraph summary", extra={
                "section_index": section_index + 1,
            })
            
            response = summary_llm.invoke([prompt])
            summary = response.content.strip() if hasattr(response, "content") else str(response).strip()
            
            logger.info("[AutoWriter] Paragraph summary generated successfully", extra={
                "section_index": section_index + 1,
                "section_title": section_title,
                "summary_length": len(summary),
                "summary_preview": summary[:50] + "..." if len(summary) > 50 else summary,
            })
            
            return summary
            
        except Exception as error:
            logger.error("[AutoWriter] Failed to generate paragraph summary", extra={
                "section_index": section_index + 1,
                "section_title": section_title,
                "error": str(error),
            }, exc_info=True)
            
            # Fallback: return a truncated version of the content
            fallback_summary = section_content[:80].strip() + "..."
            logger.info("[AutoWriter] Using fallback summary", extra={
                "section_index": section_index + 1,
                "fallback_summary": fallback_summary,
            })
            
            return fallback_summary

    def _stream_section_content(
        self,
        section: Dict[str, str],
        section_index: int,
        total_sections: int,
        params: WriterParameters,
        previous_sections: List[Dict[str, str]],
        previous_summaries: List[Dict[str, str]],
        enable_network_search: bool = False,
        all_references: List[Dict[str, str]] = None
    ) -> Generator[Dict, None, str]:
        """
        Stream section content generation with real-time chunk events.
        Yields content_chunk events as the LLM generates text.
        Returns the complete section content.
        """
        logger.info("[AutoWriter] Starting streaming section generation", extra={
            "section_index": section_index + 1,
            "total_sections": total_sections,
            "section_title": section["title"],
            "previous_summaries_count": len(previous_summaries),
            "enable_network_search": enable_network_search,
        })

        # Search for references if network search is enabled
        section_references = []
        added_reference_indices = []  # Track reference indices for prompt numbering
        if enable_network_search:
            logger.info("[AutoWriter] Network search enabled, searching references for section", extra={
                "section_index": section_index + 1,
                "section_title": section["title"],
            })
            
            # Yield status event for reference search
            yield {
                "type": "network_search_status",
                "section_index": section_index,
                "section_title": section["title"],
                "status": "searching",
                "message": f"正在为段落《{section['title']}》检索参考文献...",
            }
            
            section_references = _search_references_for_section(
                section["title"],
                section.get("summary", ""),
                params["topic"],
                params["keywords"]
            )
            
            if section_references:
                logger.info("[AutoWriter] References found for section", extra={
                    "section_index": section_index + 1,
                    "reference_count": len(section_references),
                })
                
                # Add to all_references list if provided
                # Track which references were actually added (for numbering in prompt)
                if all_references is not None:
                    # Check if references already exist to avoid duplicates
                    existing_urls = {ref.get('url', '') for ref in all_references}
                    for ref in section_references:
                        ref_url = ref.get('url', '')
                        if ref_url not in existing_urls:
                            all_references.append(ref)
                            existing_urls.add(ref_url)
                            # Track the index of this reference in all_references (1-based)
                            added_reference_indices.append(len(all_references))
                        else:
                            # Reference already exists, find its index
                            for idx, existing_ref in enumerate(all_references, start=1):
                                if existing_ref.get('url', '') == ref_url:
                                    added_reference_indices.append(idx)
                                    break
                else:
                    # If all_references is None, use sequential numbering
                    added_reference_indices = list(range(1, len(section_references) + 1))
                
                # Yield status event for reference search completion
                logger.info("[AutoWriter] Sending network_search_status event with references", extra={
                    "section_index": section_index + 1,
                    "section_title": section["title"],
                    "reference_count": len(section_references),
                })
                yield {
                    "type": "network_search_status",
                    "section_index": section_index,
                    "section_title": section["title"],
                    "status": "completed",
                    "message": f"已检索到 {len(section_references)} 篇参考文献",
                    "reference_count": len(section_references),
                    "references": section_references,  # Include actual reference data
                }
            else:
                logger.warning("[AutoWriter] No references found for section", extra={
                    "section_index": section_index + 1,
                })
                
                # Yield status event for no references found
                logger.info("[AutoWriter] No references found, sending network_search_status event", extra={
                    "section_index": section_index + 1,
                    "section_title": section["title"],
                })
                yield {
                    "type": "network_search_status",
                    "section_index": section_index,
                    "section_title": section["title"],
                    "status": "completed",
                    "message": "未找到相关参考文献",
                    "reference_count": 0,
                    "references": [],  # Empty references array
                }

        # Create streaming LLM instance
        streaming_llm = self.config.get_llm(temperature=params["temperature"], streaming=True)

        # Build context from previous paragraph summaries (优化：使用总结而非完整内容)
        previous_context = ""
        if previous_summaries:
            logger.debug("[AutoWriter] Including previous paragraph summaries in context", extra={
                "section_index": section_index + 1,
                "summaries_count": len(previous_summaries),
            })
            
            summary_lines = [
                f"{idx + 1}. {item['title']}：{item['summary']}"
                for idx, item in enumerate(previous_summaries)
            ]
            previous_context = "前面段落的内容总结：\n" + "\n".join(summary_lines)
        else:
            logger.debug("[AutoWriter] No previous summaries - this is the first paragraph", extra={
                "section_index": section_index + 1,
            })
            previous_context = "这是文章的第一段。"

        # Build references context if available
        references_context = ""
        if section_references:
            logger.debug("[AutoWriter] Including references in prompt", extra={
                "section_index": section_index + 1,
                "reference_count": len(section_references),
                "total_references_so_far": len(all_references) if all_references is not None else 0,
                "added_reference_indices": added_reference_indices,
            })
            
            # Use the indices we tracked when adding references
            ref_indices = added_reference_indices if added_reference_indices else []
            
            # Fallback: if we don't have indices, calculate them
            if not ref_indices:
                if all_references is not None:
                    # Find the indices of section_references in all_references
                    ref_urls = {ref.get('url', '') for ref in section_references}
                    for idx, ref in enumerate(all_references, start=1):
                        if ref.get('url', '') in ref_urls:
                            ref_indices.append(idx)
                else:
                    ref_indices = list(range(1, len(section_references) + 1))
            
            ref_lines = []
            for idx, ref in enumerate(section_references):
                ref_num = ref_indices[idx] if idx < len(ref_indices) else (idx + 1)
                ref_lines.append(
                    f"[{ref_num}] {ref.get('title', 'No title')}\n"
                    f"    内容摘要：{ref.get('content', '')[:200]}...\n"
                    f"    来源：{ref.get('url', '')}"
                )
            
            references_context = (
                "\n\n=== 参考文献 ===\n"
                "请根据以下参考文献来写作，并在适当的地方使用参考文献标号（如[1], [2]等）：\n"
                + "\n\n".join(ref_lines) + "\n\n"
                "要求：\n"
                "- 在引用参考文献的内容时，必须在相应位置标注参考文献标号，格式为[数字]\n"
                "- 参考文献标号应该放在引用内容的后面，如：根据研究显示[1]，...\n"
                "- 确保引用的内容与参考文献相关\n"
                "- 使用正确的参考文献编号，不要自己编造编号\n"
            )

        # Create prompt for section with article title and previous summaries
        prompt = SystemMessage(
            content=(
                f"你是一名专业写作者，语言为{params['language']}。\n\n"
                f"文章标题：《{params['title']}》\n"
                f"主题：{params['topic']}\n"
                f"目标读者：{params['audience']}\n"
                f"语调：{params['tone']}\n"
                f"必备关键词：{', '.join(params['keywords']) or '无'}\n\n"
                f"{previous_context}\n\n"
                f"{references_context}"
                f"请写作段落《{section['title']}》，要求紧扣概述：{section['summary']}，字数 250-400 字。\n"
                f"内容需要结构清晰，使用自然段，语言流畅，并与前面段落保持连贯性。"
            )
        )

        # Stream the content
        accumulated_content = ""
        chunk_count = 0

        logger.debug("[AutoWriter] Starting LLM streaming for section", extra={
            "section_index": section_index + 1,
            "section_title": section["title"],
        })

        try:
            for chunk in streaming_llm.stream([prompt]):
                chunk_content = chunk.content if hasattr(chunk, "content") else str(chunk)
                
                if chunk_content:
                    accumulated_content += chunk_content
                    chunk_count += 1

                    # Yield content chunk event for real-time display
                    yield {
                        "type": "content_chunk",
                        "section_index": section_index,
                        "section_title": section["title"],
                        "chunk": chunk_content,
                        "accumulated_length": len(accumulated_content),
                        "current_section": section_index + 1,
                        "total_sections": total_sections,
                    }

                    # Log progress periodically
                    if chunk_count % 10 == 0:
                        logger.debug("[AutoWriter] Streaming progress", extra={
                            "section_index": section_index + 1,
                            "chunks_received": chunk_count,
                            "content_length": len(accumulated_content),
                        })

            logger.info("[AutoWriter] Section streaming completed", extra={
                "section_index": section_index + 1,
                "section_title": section["title"],
                "total_chunks": chunk_count,
                "final_content_length": len(accumulated_content),
            })

            return accumulated_content.strip()

        except Exception as error:
            logger.error("[AutoWriter] Section streaming failed", extra={
                "section_index": section_index + 1,
                "section_title": section["title"],
                "error": str(error),
                "chunks_before_error": chunk_count,
            }, exc_info=True)
            
            # Return partial content if any was generated
            if accumulated_content:
                logger.info("[AutoWriter] Returning partial section content after error", extra={
                    "section_index": section_index + 1,
                    "partial_length": len(accumulated_content),
                })
                return accumulated_content.strip()
            
            raise

    def run(self, user_prompt: str, enable_image_generation: bool = False, enable_network_search: bool = False) -> Generator[Dict, None, None]:
        logger.info("[AutoWriter] Agent run started with streaming support", extra={
            "prompt_preview": user_prompt[:120],
            "enable_image_generation": enable_image_generation,
            "enable_network_search": enable_network_search,
        })
        
        if enable_image_generation:
            logger.info("[AutoWriter] Image generation is ENABLED for this run")
        else:
            logger.warning("[AutoWriter] Image generation is DISABLED for this run - images will NOT be searched")
        
        if enable_network_search:
            logger.info("[AutoWriter] Network search is ENABLED for this run - references will be searched and included")
        else:
            logger.info("[AutoWriter] Network search is DISABLED for this run - references will NOT be searched")
        
        # Track all references across all sections
        all_references: List[Dict[str, str]] = []

        try:
            timeline = [
                {"id": "intent", "label": "意图识别", "state": "active"},
                {"id": "params", "label": "参数提取", "state": "upcoming"},
                {"id": "outline", "label": "结构设计", "state": "upcoming"},
                {"id": "writing", "label": "段落写作", "state": "upcoming"},
                {"id": "deliver", "label": "结果输出", "state": "upcoming"},
            ]

            # Phase 1: Intent Analysis
            yield self._status_event("intent", "正在分析任务意图...", timeline)
            intent: IntentResult = analyze_intent(self.intent_llm, user_prompt)

            if not intent["should_write"]:
                logger.info("[AutoWriter] Intent check failed - no writing needed", extra={
                    "reason": intent["reason"],
                })
                yield {
                    "type": "error",
                    "message": "当前指令不需要生成文档",
                    "reason": intent["reason"],
                }
                return

            # Phase 2: Parameter Extraction
            timeline[0]["state"] = "complete"
            timeline[1]["state"] = "active"
            yield self._status_event("parameterizing", "提取写作关键参数...", timeline)

            parameters: WriterParameters = extract_writer_parameters(self.intent_llm, user_prompt)
            logger.info("[AutoWriter] Parameters extracted", extra={
                "title": parameters["title"],
                "paragraph_count": parameters["paragraph_count"],
                "tone": parameters["tone"],
            })
            
            yield {
                "type": "parameters",
                "parameters": parameters,
            }

            # Phase 3: Outline Generation
            timeline[1]["state"] = "complete"
            timeline[2]["state"] = "active"
            yield self._status_event("outlining", "构建文档结构...", timeline)

            initial_state: WriterState = {
                "user_prompt": user_prompt,
                "language": self.language,
                "parameters": parameters,
                "completed_sections": [],
                "llm_config": self.config,
            }

            # Run outline generation workflow
            logger.debug("[AutoWriter] Starting outline generation workflow")
            outline_state = self.workflow.invoke(initial_state)
            outline = outline_state.get("outline", [])
            
            if not outline:
                logger.error("[AutoWriter] No outline generated")
                raise ValueError("Failed to generate document outline")

            logger.info("[AutoWriter] Outline generated successfully", extra={
                "section_count": len(outline),
                "sections": [s["title"] for s in outline],
            })

            timeline[2]["state"] = "complete"
            timeline[3]["state"] = "active"
            yield self._status_event(
                "writing",
                f"文档结构已设计完成，开始生成 {len(outline)} 个段落...",
                timeline,
            )

            # Phase 4: Stream Section Writing with Summary Generation
            drafted_sections: List[Dict[str, str]] = []
            section_summaries: List[Dict[str, str]] = []  # Track paragraph summaries
            total_sections = len(outline)

            logger.info("[AutoWriter] Starting streaming section generation with summary tracking", extra={
                "total_sections": total_sections,
            })

            for section_index, section in enumerate(outline):
                logger.info("[AutoWriter] Starting section", extra={
                    "section_index": section_index + 1,
                    "total_sections": total_sections,
                    "section_title": section["title"],
                })

                # Yield section start status
                yield self._status_event(
                    "writing",
                    f"正在生成段落 {section_index + 1}/{total_sections}：{section['title']}",
                    timeline,
                )

                # Stream section content with real-time chunks
                section_content = ""
                chunk_counter = 0
                last_update_length = 0
                
                last_event = None
                for event in self._stream_section_content(
                    section,
                    section_index,
                    total_sections,
                    parameters,
                    drafted_sections,
                    section_summaries,  # Pass summaries for context
                    enable_network_search,  # Pass network search flag
                    all_references  # Pass references list to track all references
                ):
                    last_event = event
                    
                    if event.get("type") == "content_chunk":
                        # Forward chunk event to frontend
                        yield event
                        # Accumulate for building draft HTML
                        section_content += event.get("chunk", "")
                        chunk_counter += 1

                        # Send draft HTML update every 2 chunks OR every 50 characters for smooth real-time display
                        # This ensures frequent updates for better streaming experience
                        chars_since_update = len(section_content) - last_update_length
                        
                        if chunk_counter % 2 == 0 or chars_since_update >= 50:
                            # Build current draft with partial section
                            current_draft = drafted_sections + [{
                                "title": section["title"],
                                "content": section_content,
                            }]
                            draft_html = build_html_from_sections(current_draft, article_title=parameters["title"])
                            
                            logger.debug("[AutoWriter] Sending incremental draft update", extra={
                                "section_index": section_index + 1,
                                "chunk_counter": chunk_counter,
                                "current_content_length": len(section_content),
                                "chars_since_last_update": chars_since_update,
                                "html_length": len(draft_html),
                            })
                            
                            yield {
                                "type": "article_draft",
                                "html": draft_html,
                            }
                            
                            last_update_length = len(section_content)
                    elif event.get("type") == "network_search_status":
                        # Forward network search status events to frontend
                        yield event
                    else:
                        # Handle other event types (shouldn't happen normally)
                        logger.debug("[AutoWriter] Unexpected event type in section stream", extra={
                            "event_type": event.get("type"),
                            "section_index": section_index + 1,
                        })
                        # If it's a string (return value), use it as content
                        if isinstance(event, str):
                            section_content = event
                            break

                # If section_content is empty and last_event is a string, use it
                if not section_content and isinstance(last_event, str):
                    section_content = last_event

                # Add completed section
                completed_section = {
                    "title": section["title"],
                    "content": section_content,
                }
                drafted_sections.append(completed_section)

                logger.info("[AutoWriter] Section completed, generating summary", extra={
                    "section_index": section_index + 1,
                    "section_title": section["title"],
                    "content_length": len(section_content),
                })

                # Generate summary for the completed paragraph
                section_summary = self._generate_section_summary(
                    section["title"],
                    section_content,
                    section_index
                )
                
                # Store summary for use in subsequent paragraphs
                section_summaries.append({
                    "title": section["title"],
                    "summary": section_summary,
                })
                
                logger.info("[AutoWriter] Section summary stored for context", extra={
                    "section_index": section_index + 1,
                    "section_title": section["title"],
                    "summary_length": len(section_summary),
                    "total_summaries": len(section_summaries),
                })

                # Yield section completion progress
                yield {
                    "type": "section_progress",
                    "current": section_index + 1,
                    "total": total_sections,
                    "title": section["title"],
                    "content": section_content,
                }
                
                # Yield paragraph summary event for display in chat
                yield {
                    "type": "paragraph_summary",
                    "section_index": section_index,
                    "section_title": section["title"],
                    "summary": section_summary,
                    "current": section_index + 1,
                    "total": total_sections,
                }

                # Send full draft HTML after each section completes
                yield {
                    "type": "article_draft",
                    "html": build_html_from_sections(drafted_sections, article_title=parameters["title"]),
                }
                
                # Generate and search for image if enabled
                if enable_image_generation:
                    logger.info("[AutoWriter] Image generation enabled, searching for image", extra={
                        "section_index": section_index + 1,
                        "section_title": section["title"],
                    })
                    
                    try:
                        # Extract keywords from paragraph
                        keyword_llm = self.config.get_llm(temperature=0.3, streaming=False)
                        keywords = _extract_keywords_from_paragraph(
                            section_content,
                            section["title"],
                            keyword_llm
                        )
                        
                        # Search for image
                        image_data = _search_image_for_keywords(keywords)
                        
                        if image_data:
                            logger.info("[AutoWriter] Image found and ready to insert", extra={
                                "section_index": section_index + 1,
                                "section_title": section["title"],
                                "image_url_preview": image_data["url"][:100],
                            })
                            
                            # Yield image event for frontend
                            yield {
                                "type": "paragraph_image",
                                "section_index": section_index,
                                "section_title": section["title"],
                                "image_url": image_data["url"],
                                "image_description": image_data.get("description", ""),
                                "image_author": image_data.get("author", ""),
                                "keywords": keywords,
                                "current": section_index + 1,
                                "total": total_sections,
                            }
                        else:
                            logger.warning("[AutoWriter] No image found for paragraph", extra={
                                "section_index": section_index + 1,
                                "section_title": section["title"],
                                "keywords": keywords,
                            })
                    except Exception as image_error:
                        logger.error("[AutoWriter] Image generation failed", extra={
                            "section_index": section_index + 1,
                            "section_title": section["title"],
                            "error": str(image_error),
                        }, exc_info=True)
                        # Continue without image - don't fail the whole process

            # Phase 5: Deliver Final Article
            timeline[3]["state"] = "complete"
            timeline[4]["state"] = "active"
            yield self._status_event("delivering", "所有段落完成，正在整理最终文稿...", timeline)

            # Build references section if network search was enabled and references were found
            references_section = ""
            if enable_network_search and all_references:
                logger.info("[AutoWriter] Building references section", extra={
                    "reference_count": len(all_references),
                })
                
                references_html_parts = ["<h2>参考文献</h2>"]
                references_markdown_parts = ["## 参考文献\n"]
                
                for idx, ref in enumerate(all_references, start=1):
                    ref_title = ref.get('title', 'No title')
                    ref_url = ref.get('url', '')
                    
                    references_html_parts.append(
                        f"<p>[{idx}] {ref_title}. <a href=\"{ref_url}\" target=\"_blank\" rel=\"noopener noreferrer\">{ref_url}</a></p>"
                    )
                    references_markdown_parts.append(
                        f"[{idx}] {ref_title}. {ref_url}"
                    )
                
                references_section = "\n".join(references_html_parts)
                references_markdown_section = "\n\n" + "\n".join(references_markdown_parts)
            else:
                references_markdown_section = ""

            # Build final output with article title
            final_html = build_html_from_sections(drafted_sections, article_title=parameters["title"])
            
            # Add references section to HTML if available
            if references_section:
                final_html += references_section
            
            # Build markdown with title
            final_markdown_parts = [f"# {parameters['title']}\n"]
            for section in drafted_sections:
                final_markdown_parts.append(f"## {section['title']}\n\n{section['content']}\n")
            final_markdown = "\n".join(final_markdown_parts).strip() + references_markdown_section

            logger.info("[AutoWriter] Final article assembled", extra={
                "total_sections": len(drafted_sections),
                "markdown_length": len(final_markdown),
                "html_length": len(final_html),
            })

            timeline[4]["state"] = "complete"
            yield {
                "type": "complete",
                "summary": "AI Auto-Writer 任务完成。",
                "final_markdown": final_markdown,
                "final_html": final_html,
                "title": parameters["title"],
                "timeline": timeline,
            }

            logger.info("[AutoWriter] Agent run completed successfully", extra={
                "total_sections": len(drafted_sections),
            })

        except Exception as error:
            logger.error("[AutoWriter] Agent run failed", extra={
                "error": str(error),
                "error_type": type(error).__name__,
            }, exc_info=True)
            yield {
                "type": "error",
                "message": "Auto-Writer 执行失败",
                "error": str(error),
            }


if __name__ == "__main__":
    import os

    api_key = os.environ.get("WRITER_API_KEY")
    api_url = os.environ.get("WRITER_API_URL", "https://api.openai.com/v1")
    model = os.environ.get("WRITER_MODEL", "gpt-4o-mini")

    if not api_key:
        raise SystemExit("Please set WRITER_API_KEY environment variable.")

    agent = AutoWriterAgent(api_key=api_key, api_url=api_url, model_name=model, language="zh")
    example_prompt = "请帮我写一篇面向消费电子行业的年度趋势报告，5段，语气专业。"

    for event in agent.run(example_prompt):
        print(event)

