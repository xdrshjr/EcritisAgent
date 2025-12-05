"""
Document Agent
LangGraph-based agent for intelligent document processing
"""

import json
import logging
from typing import Dict, Any, Generator, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from .state import AgentState
from .tools import DocumentTools
from .prompts import get_planning_prompt, get_execution_prompt, get_summary_prompt


logger = logging.getLogger(__name__)


class DocumentAgent:
    """
    Document processing agent using LangGraph workflow
    
    Workflow:
    1. Plan: Analyze user command and create AgentTodo list
    2. Execute: Execute each AgentTodo item using available tools
    3. Summarize: Generate final execution summary
    """
    
    def __init__(self, api_key: str, api_url: str, model_name: str, language: str = 'en'):
        """
        Initialize document agent
        
        Args:
            api_key: LLM API key
            api_url: LLM API base URL
            model_name: Model name to use
            language: Language for prompts ('en' or 'zh')
        """
        self.language = language
        self.tools = DocumentTools()
        
        # Initialize LLM
        self.llm = ChatOpenAI(
            model=model_name,
            openai_api_key=api_key,
            openai_api_base=api_url,
            temperature=0.3,
            streaming=True
        )
        
        logger.info('DocumentAgent initialized', extra={
            'model': model_name,
            'language': language,
            'api_url': api_url,
        })
    
    def run(self, user_command: str, document_content) -> Generator[Dict[str, Any], None, None]:
        """
        Run the agent workflow and stream results
        
        Args:
            user_command: User's command/instruction
            document_content: Current document content (HTML string or paragraphs array)
            
        Yields:
            Status updates and results
        """
        import json
        # Parse document_content if it's a JSON string
        if isinstance(document_content, str):
            try:
                parsed = json.loads(document_content)
                if isinstance(parsed, list):
                    document_content = parsed
                    logger.info('Parsed document_content as paragraphs array', extra={
                        'paragraph_count': len(document_content),
                    })
            except (json.JSONDecodeError, TypeError):
                # Not JSON, treat as HTML string
                pass
        
        content_length = len(document_content) if isinstance(document_content, str) else len(document_content) if isinstance(document_content, list) else 0
        logger.info('Starting agent workflow', extra={
            'command': user_command[:100] + '...' if len(user_command) > 100 else user_command,
            'content_type': 'paragraphs' if isinstance(document_content, list) else 'html',
            'content_length': content_length,
        })
        
        try:
            # Initialize tools with document content (supports both HTML and paragraphs)
            if isinstance(document_content, list):
                self.tools = DocumentTools(initial_content=document_content)
            else:
                self.tools = DocumentTools(initial_content=document_content)
            
            # Phase 1: Planning
            yield {
                "type": "status",
                "phase": "planning",
                "message": "Analyzing your request and creating an action plan..." if self.language == 'en' 
                          else "正在分析您的请求并制定行动计划..."
            }
            
            logger.info('Phase 1: Planning')
            todo_list = yield from self._plan_phase(user_command)
            
            if not todo_list:
                yield {
                    "type": "error",
                    "message": "Failed to create execution plan" if self.language == 'en'
                              else "创建执行计划失败"
                }
                return
            
            # Ensure all AgentTodo items have 'status' and 'id' fields
            for idx, item in enumerate(todo_list):
                if 'status' not in item:
                    item['status'] = 'pending'
                if 'id' not in item:
                    item['id'] = str(idx + 1)
            
            # Phase 2: Execution
            yield {
                "type": "todo_list",
                "todo_list": todo_list,
                "message": f"Plan created with {len(todo_list)} steps" if self.language == 'en'
                          else f"已创建包含 {len(todo_list)} 个步骤的计划"
            }
            
            logger.info('Phase 2: Executing AgentTodo items', extra={'total_items': len(todo_list)})
            
            execution_results = []
            for idx, todo_item in enumerate(todo_list):
                # Update AgentTodo item status to 'in_progress'
                todo_item['status'] = 'in_progress'
                
                yield {
                    "type": "status",
                    "phase": "executing",
                    "current_step": idx + 1,
                    "total_steps": len(todo_list),
                    "step_description": todo_item.get("description", ""),
                    "message": f"Executing step {idx + 1}/{len(todo_list)}..." if self.language == 'en'
                              else f"正在执行第 {idx + 1}/{len(todo_list)} 步..."
                }
                
                # Send AgentTodo item status update to 'in_progress'
                yield {
                    "type": "todo_item_update",
                    "todo_id": todo_item.get("id"),
                    "status": "in_progress",
                    "step": idx + 1,
                }
                
                logger.info('AgentTodo item status updated to in_progress', extra={
                    'step': f'{idx + 1}/{len(todo_list)}',
                    'todo_id': todo_item.get("id"),
                    'description': todo_item.get("description", "")[:50],
                })
                
                # Check if this is a modify step that needs parameter refinement
                refined_todo = todo_item
                if todo_item.get("tool") == "modify_document_paragraph" and execution_results:
                    # Check if previous step was get_document_paragraphs or search_document_paragraphs
                    prev_result = execution_results[-1]
                    if prev_result.get("tool") in ["get_document_paragraphs", "search_document_paragraphs"]:
                        logger.info('[Agent] Attempting to refine modify parameters from previous result', extra={
                            'previous_tool': prev_result.get("tool"),
                            'step': idx + 1,
                        })
                        
                        # Extract paragraph_id from search results if available
                        if prev_result.get("tool") == "search_document_paragraphs" and prev_result.get("matches"):
                            matches = prev_result.get("matches", [])
                            if matches:
                                # Use the first (most relevant) match
                                best_match = matches[0]
                                extracted_para_id = best_match.get("paragraph_id")
                                if extracted_para_id:
                                    logger.info('[Agent] Extracted paragraph_id from search results', extra={
                                        'paragraph_id': extracted_para_id,
                                        'match_type': best_match.get("match_type"),
                                        'relevance_score': best_match.get("relevance_score"),
                                    })
                                    refined_todo = {
                                        **todo_item,
                                        "args": {
                                            **todo_item.get("args", {}),
                                            "paragraph_id": extracted_para_id,
                                        }
                                    }
                                    logger.info('[Agent] Updated todo with extracted paragraph_id', extra={
                                        'original_args': todo_item.get("args", {}),
                                        'refined_args': refined_todo.get("args", {}),
                                    })
                        else:
                            # Try to refine the parameters using LLM
                            refined_result = yield from self._refine_modify_parameters(
                                todo_item, 
                                prev_result, 
                                user_command
                            )
                            
                            if refined_result:
                                refined_todo = refined_result
                                logger.info('[Agent] Successfully refined modify parameters', extra={
                                    'original_params_preview': str(todo_item.get("args", {}))[:100],
                                    'refined_params_preview': str(refined_todo.get("args", {}))[:100],
                                })
                            else:
                                logger.warning('[Agent] Failed to refine parameters, using original', extra={
                                    'step': idx + 1,
                                })
                
                result = yield from self._execute_todo(refined_todo, idx + 1, len(todo_list))
                execution_results.append(result)
                
                # Update AgentTodo item status based on execution result
                is_success = result.get("success", result.get("found", True))
                final_status = "completed" if is_success else "failed"
                todo_item['status'] = final_status
                
                # Send AgentTodo item status update after execution
                yield {
                    "type": "todo_item_update",
                    "todo_id": todo_item.get("id"),
                    "status": final_status,
                    "step": idx + 1,
                    "result": result.get("message", ""),
                    "error": result.get("error") if not is_success else None,
                }
                
                logger.info('AgentTodo item execution completed', extra={
                    'step': f'{idx + 1}/{len(todo_list)}',
                    'todo_id': todo_item.get("id"),
                    'status': final_status,
                    'success': is_success,
                })
                
                # If modification was made, send updated content
                if result.get("tool") == "modify_document_paragraph" and result.get("success"):
                    # Determine content format based on content_type
                    if self.tools.content_type == 'paragraphs':
                        updated_content = self.tools.paragraphs
                        content_type = 'paragraphs'
                    else:
                        updated_content = self.tools.document_content
                        content_type = 'html'
                    
                    yield {
                        "type": "document_update",
                        "updated_content": updated_content,
                        "content_type": content_type,
                        "step": idx + 1,
                        "message": "Document updated" if self.language == 'en' else "文档已更新"
                    }
                    logger.info('[Agent] Document update event sent to frontend', extra={
                        'step': idx + 1,
                        'content_type': content_type,
                        'content_length': len(updated_content) if isinstance(updated_content, str) else len(updated_content),
                    })
            
            # Phase 3: Summary
            yield {
                "type": "status",
                "phase": "summarizing",
                "message": "Generating summary..." if self.language == 'en' else "正在生成总结..."
            }
            
            logger.info('Phase 3: Summarizing results')
            summary = yield from self._summary_phase(user_command, todo_list, execution_results)
            
            # Final result
            final_paragraphs = self.tools.paragraphs if self.tools.content_type == 'paragraphs' else None
            yield {
                "type": "complete",
                "summary": summary,
                "todo_list": todo_list,
                "execution_results": execution_results,
                "final_content": final_paragraphs if final_paragraphs else self.tools.document_content,
                "content_type": "paragraphs" if final_paragraphs else "html",
                "message": "Task completed successfully!" if self.language == 'en' else "任务完成！"
            }
            
            logger.info('Agent workflow completed successfully')
            
        except Exception as e:
            logger.error('Agent workflow failed', extra={
                'error': str(e),
                'error_type': type(e).__name__,
            }, exc_info=True)
            
            yield {
                "type": "error",
                "message": f"Execution failed: {str(e)}",
                "error_details": str(e)
            }
    
    def _plan_phase(self, user_command: str) -> Generator[Any, None, Optional[list]]:
        """
        Planning phase: Create AgentTodo list
        
        Args:
            user_command: User's command
            
        Yields:
            Planning progress
            
        Returns:
            AgentTodo list or None if failed
        """
        try:
            tool_descriptions = DocumentTools.get_tool_descriptions()
            planning_prompt = get_planning_prompt(self.language).format(
                tool_descriptions=tool_descriptions
            )
            
            messages = [
                SystemMessage(content=planning_prompt),
                HumanMessage(content=f"User Command: {user_command}\n\nPlease create a detailed execution plan.")
            ]
            
            logger.info('[LLM] Sending planning request to LLM', extra={
                'phase': 'planning',
                'user_command': user_command[:100] + '...' if len(user_command) > 100 else user_command,
                'system_prompt_length': len(planning_prompt),
                'model': self.llm.model_name,
                'temperature': self.llm.temperature,
            })
            logger.debug('[LLM] Planning request details', extra={
                'messages_count': len(messages),
                'system_message_preview': planning_prompt[:300],
                'user_message': user_command,
            })
            
            # Stream the response
            accumulated_content = ""
            chunk_count = 0
            for chunk in self.llm.stream(messages):
                if hasattr(chunk, 'content') and chunk.content:
                    accumulated_content += chunk.content
                    chunk_count += 1
                    yield {
                        "type": "thinking",
                        "phase": "planning",
                        "content": chunk.content
                    }
            
            logger.info('[LLM] Received planning response', extra={
                'phase': 'planning',
                'response_length': len(accumulated_content),
                'chunks_received': chunk_count,
            })
            logger.debug('[LLM] Planning response preview', extra={
                'response_preview': accumulated_content[:500] + '...' if len(accumulated_content) > 500 else accumulated_content,
            })
            
            # Parse the JSON response
            try:
                # Extract JSON from markdown code blocks if present
                logger.debug('[LLM] Parsing LLM response JSON', extra={
                    'has_json_marker': "```json" in accumulated_content,
                    'has_code_block': "```" in accumulated_content,
                })
                
                if "```json" in accumulated_content:
                    start = accumulated_content.find("```json") + 7
                    end = accumulated_content.find("```", start)
                    json_str = accumulated_content[start:end].strip()
                elif "```" in accumulated_content:
                    start = accumulated_content.find("```") + 3
                    end = accumulated_content.find("```", start)
                    json_str = accumulated_content[start:end].strip()
                else:
                    json_str = accumulated_content.strip()
                
                logger.debug('[LLM] Extracted JSON string', extra={
                    'json_length': len(json_str),
                    'json_preview': json_str[:200],
                })
                
                plan_data = json.loads(json_str)
                todo_list = plan_data.get("todo_list", [])
                reasoning = plan_data.get("reasoning", "")
                
                logger.info('[LLM] Successfully parsed AgentTodo list', extra={
                    'items_count': len(todo_list),
                    'reasoning': reasoning[:100] + '...' if len(reasoning) > 100 else reasoning,
                })
                logger.debug('[LLM] AgentTodo list details', extra={
                    'todo_list': str(todo_list)[:500],
                })
                
                # Validate tool names in the TODO list
                valid_tools = {
                    "get_document_paragraphs",
                    "search_document_paragraphs",
                    "modify_document_paragraph",
                    "add_document_paragraph",
                    "delete_document_paragraph"
                }
                invalid_items = []
                for idx, item in enumerate(todo_list):
                    tool_name = item.get("tool", "")
                    if tool_name not in valid_tools:
                        invalid_items.append({
                            'id': item.get('id', idx + 1),
                            'tool': tool_name,
                            'description': item.get('description', '')[:50]
                        })
                
                if invalid_items:
                    logger.error('[LLM] Invalid tool names detected in TODO list', extra={
                        'invalid_items': invalid_items,
                        'valid_tools': list(valid_tools),
                    })
                    error_msg = f"Invalid tool names detected: {', '.join([item['tool'] for item in invalid_items])}. Only these tools are allowed: {', '.join(valid_tools)}"
                    yield {
                        "type": "error",
                        "message": error_msg,
                        "invalid_items": invalid_items
                    }
                    return None
                
                return todo_list
                
            except json.JSONDecodeError as e:
                logger.error('[LLM] Failed to parse planning JSON', extra={
                    'error': str(e),
                    'error_position': e.pos if hasattr(e, 'pos') else None,
                    'content_preview': accumulated_content[:300],
                    'json_str_preview': json_str[:200] if 'json_str' in locals() else 'N/A',
                }, exc_info=True)
                return None
                
        except Exception as e:
            logger.error('Planning phase failed', extra={'error': str(e)}, exc_info=True)
            return None
    
    def _execute_todo(self, todo_item: Dict[str, Any], step_num: int, total_steps: int) -> Generator[Any, None, Dict[str, Any]]:
        """
        Execute a single AgentTodo item
        
        Args:
            todo_item: AgentTodo item to execute
            step_num: Current step number
            total_steps: Total number of steps
            
        Yields:
            Execution progress
            
        Returns:
            Execution result
        """
        try:
            tool_name = todo_item.get("tool", "")
            tool_args = todo_item.get("args", {})
            description = todo_item.get("description", "")
            
            logger.info('Executing AgentTodo item', extra={
                'step': f'{step_num}/{total_steps}',
                'tool': tool_name,
                'description': description,
            })
            
            # Execute the tool
            result = self.tools.execute_tool(tool_name, **tool_args)
            
            # Add metadata
            result["tool"] = tool_name
            result["step"] = step_num
            result["description"] = description
            
            logger.info('AgentTodo item executed', extra={
                'step': f'{step_num}/{total_steps}',
                'success': result.get("success", True),
                'result_message': result.get("message", "")
            })
            
            # Yield execution result
            yield {
                "type": "tool_result",
                "step": step_num,
                "tool": tool_name,
                "result": result,
                "description": description
            }
            
            return result
            
        except Exception as e:
            logger.error('AgentTodo execution failed', extra={
                'step': f'{step_num}/{total_steps}',
                'error': str(e)
            }, exc_info=True)
            
            return {
                "success": False,
                "tool": todo_item.get("tool", "unknown"),
                "step": step_num,
                "description": todo_item.get("description", ""),
                "error": str(e),
                "message": f"Execution failed: {str(e)}"
            }
    
    def _refine_modify_parameters(
        self, 
        todo_item: Dict[str, Any], 
        prev_result: Dict[str, Any], 
        user_command: str
    ) -> Generator[Any, None, Optional[Dict[str, Any]]]:
        """
        Refine modify_document_paragraph parameters using previous tool results
        
        Args:
            todo_item: Current AgentTodo item (modify_document_paragraph)
            prev_result: Previous tool execution result
            user_command: Original user command
            
        Yields:
            Refinement progress
            
        Returns:
            Refined AgentTodo item with accurate parameters, or None if refinement failed
        """
        try:
            prev_tool = prev_result.get("tool", "")
            original_args = todo_item.get("args", {})
            
            logger.info('[Agent] Starting parameter refinement', extra={
                'prev_tool': prev_tool,
                'paragraph_id_preview': original_args.get("paragraph_id", "")[:50],
            })
            
            # Build refinement prompt
            if self.language == 'zh':
                system_prompt = """你是文档编辑参数提取专家。你的任务是从前一步工具的执行结果中，提取出 modify_document_paragraph 工具需要的精确 paragraph_id 参数。

**重要原则：**
1. paragraph_id 必须是搜索结果中实际存在的段落ID（如 "para-0"）
2. 如果搜索结果中有多个匹配，选择相关性最高的（relevance_score最高的）
3. paragraph_id 必须完全匹配，不能修改或猜测
4. 从搜索结果的 matches 数组中提取 paragraph_id

**输出格式：**
输出JSON格式：
```json
{{
  "paragraph_id": "从搜索结果中提取的段落ID",
  "new_content": "新的段落HTML内容",
  "reasoning": "说明为什么选择这个段落ID"
}}
```
"""
                user_content = f"""用户命令: {user_command}

前一步工具执行结果:
工具: {prev_tool}
结果: {str(prev_result)[:2000]}

当前计划的修改参数:
- paragraph_id: {original_args.get("paragraph_id", "")}
- new_content: {original_args.get("new_content", "")}

请根据前一步的工具结果，从 matches 数组中提取准确的 paragraph_id。选择 relevance_score 最高的匹配项。
"""
            else:
                system_prompt = """You are a document editing parameter extraction expert. Your task is to extract the precise paragraph_id parameter needed for the modify_document_paragraph tool from the previous tool's execution result.

**Important Principles:**
1. paragraph_id must be an actual paragraph ID that exists in the search results (e.g., "para-0")
2. If search results have multiple matches, choose the one with the highest relevance_score
3. paragraph_id must match exactly, do not modify or guess
4. Extract paragraph_id from the matches array in search results

**Output Format:**
Output in JSON format:
```json
{{
  "paragraph_id": "Paragraph ID extracted from search results",
  "new_content": "New paragraph HTML content",
  "reasoning": "Explain why this paragraph ID was chosen"
}}
```
"""
                user_content = f"""User Command: {user_command}

Previous Tool Execution Result:
Tool: {prev_tool}
Result: {str(prev_result)[:2000]}

Currently Planned Modification Parameters:
- paragraph_id: {original_args.get("paragraph_id", "")}
- new_content: {original_args.get("new_content", "")}

Based on the previous tool's result, extract the accurate paragraph_id from the matches array. Choose the match with the highest relevance_score.
"""
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_content)
            ]
            
            logger.debug('[Agent] Sending refinement request to LLM', extra={
                'system_prompt_length': len(system_prompt),
                'user_content_length': len(user_content),
            })
            
            # Get refinement from LLM
            accumulated_content = ""
            for chunk in self.llm.stream(messages):
                if hasattr(chunk, 'content') and chunk.content:
                    accumulated_content += chunk.content
                    yield {
                        "type": "thinking",
                        "phase": "refining",
                        "content": chunk.content
                    }
            
            logger.debug('[Agent] Received refinement response', extra={
                'response_length': len(accumulated_content),
                'response_preview': accumulated_content[:200],
            })
            
            # Parse the response
            try:
                # Extract JSON
                if "```json" in accumulated_content:
                    start = accumulated_content.find("```json") + 7
                    end = accumulated_content.find("```", start)
                    json_str = accumulated_content[start:end].strip()
                elif "```" in accumulated_content:
                    start = accumulated_content.find("```") + 3
                    end = accumulated_content.find("```", start)
                    json_str = accumulated_content[start:end].strip()
                else:
                    json_str = accumulated_content.strip()
                
                refinement_data = json.loads(json_str)
                
                # Create refined AgentTodo item
                refined_todo = {
                    **todo_item,
                    "args": {
                        "paragraph_id": refinement_data.get("paragraph_id", original_args.get("paragraph_id", "")),
                        "new_content": refinement_data.get("new_content", original_args.get("new_content", ""))
                    }
                }
                
                logger.info('[Agent] Parameter refinement successful', extra={
                    'refined_paragraph_id': refinement_data.get("paragraph_id", ""),
                    'reasoning': refinement_data.get("reasoning", "")[:100],
                })
                
                return refined_todo
                
            except json.JSONDecodeError as e:
                logger.error('[Agent] Failed to parse refinement JSON', extra={
                    'error': str(e),
                    'content_preview': accumulated_content[:300],
                }, exc_info=True)
                return None
                
        except Exception as e:
            logger.error('[Agent] Parameter refinement failed', extra={
                'error': str(e),
                'error_type': type(e).__name__,
            }, exc_info=True)
            return None
    
    def _summary_phase(self, user_command: str, todo_list: list, execution_results: list) -> Generator[Any, None, str]:
        """
        Summary phase: Generate execution summary
        
        Args:
            user_command: Original user command
            todo_list: List of AgentTodo items
            execution_results: Results of execution
            
        Yields:
            Summary generation progress
            
        Returns:
            Summary text
        """
        try:
            summary_prompt = get_summary_prompt(self.language)
            
            # Prepare execution summary
            execution_summary = []
            for idx, (todo, result) in enumerate(zip(todo_list, execution_results), 1):
                status = "✓" if result.get("success", True) else "✗"
                execution_summary.append(
                    f"{status} Step {idx}: {todo.get('description', '')}\n"
                    f"   Result: {result.get('message', 'No message')}"
                )
            
            user_content = f"""
User Command: {user_command}

Execution Results:
{chr(10).join(execution_summary)}

Please provide a concise summary of what was accomplished.
"""
            
            messages = [
                SystemMessage(content=summary_prompt),
                HumanMessage(content=user_content)
            ]
            
            logger.info('[LLM] Sending summary request to LLM', extra={
                'phase': 'summarizing',
                'user_command': user_command[:100] + '...' if len(user_command) > 100 else user_command,
                'todo_count': len(todo_list),
                'successful_steps': sum(1 for r in execution_results if r.get("success", True)),
                'failed_steps': sum(1 for r in execution_results if not r.get("success", True)),
            })
            logger.debug('[LLM] Summary request details', extra={
                'execution_summary': chr(10).join(execution_summary),
            })
            
            # Stream the summary
            summary = ""
            chunk_count = 0
            for chunk in self.llm.stream(messages):
                if hasattr(chunk, 'content') and chunk.content:
                    summary += chunk.content
                    chunk_count += 1
                    yield {
                        "type": "thinking",
                        "phase": "summarizing",
                        "content": chunk.content
                    }
            
            logger.info('[LLM] Summary generated', extra={
                'summary_length': len(summary),
                'chunks_received': chunk_count,
            })
            logger.debug('[LLM] Summary content', extra={
                'summary': summary,
            })
            
            return summary
            
        except Exception as e:
            logger.error('[LLM] Summary phase failed', extra={
                'error': str(e),
                'error_type': type(e).__name__,
            }, exc_info=True)
            return "Summary generation failed: " + str(e)

