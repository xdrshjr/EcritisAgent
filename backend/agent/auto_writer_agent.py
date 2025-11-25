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
from typing import Annotated, Dict, Generator, List, Optional, TypedDict

from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
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
    ):
        self.api_key = api_key
        self.api_url = api_url
        self.model = model
        self.max_retries = max_retries
        self.timeout = timeout

    def get_llm(self, temperature: float = 0.7, streaming: bool = False):
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
        for paragraph in section["content"].split("\n"):
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


class AutoWriterAgent:
    def __init__(self, api_key: str, api_url: str, model_name: str, language: str = "zh"):
        self.language = language
        self.config = WriterLLMConfig(api_key=api_key, api_url=api_url, model=model_name)
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
        previous_summaries: List[Dict[str, str]]
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
        })

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

    def run(self, user_prompt: str) -> Generator[Dict, None, None]:
        logger.info("[AutoWriter] Agent run started with streaming support", extra={
            "prompt_preview": user_prompt[:120],
        })

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
                
                for event in self._stream_section_content(
                    section,
                    section_index,
                    total_sections,
                    parameters,
                    drafted_sections,
                    section_summaries  # Pass summaries for context
                ):
                    if event["type"] == "content_chunk":
                        # Forward chunk event to frontend
                        yield event
                        # Accumulate for building draft HTML
                        section_content += event["chunk"]
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
                    else:
                        # This shouldn't happen, but handle gracefully
                        section_content = event
                        break

                # If section_content is empty (generator returned directly), use the return value
                if not section_content and isinstance(event, str):
                    section_content = event

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

            # Phase 5: Deliver Final Article
            timeline[3]["state"] = "complete"
            timeline[4]["state"] = "active"
            yield self._status_event("delivering", "所有段落完成，正在整理最终文稿...", timeline)

            # Build final output with article title
            final_html = build_html_from_sections(drafted_sections, article_title=parameters["title"])
            
            # Build markdown with title
            final_markdown_parts = [f"# {parameters['title']}\n"]
            for section in drafted_sections:
                final_markdown_parts.append(f"## {section['title']}\n\n{section['content']}\n")
            final_markdown = "\n".join(final_markdown_parts).strip()

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

