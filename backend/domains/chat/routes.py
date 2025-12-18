"""
Chat Domain Routes
Handles AI chat completion requests with streaming support
Includes file upload and parsing functionality for document context
"""

import logging
import json
import requests
import threading
import uuid
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app
from datetime import datetime

logger = logging.getLogger(__name__)

# Create blueprint for chat domain
chat_bp = Blueprint('chat', __name__, url_prefix='/api')

# Session management for tracking active streams
# Dictionary to track active streaming sessions: {session_id: stop_flag}
active_streaming_sessions = {}
sessions_lock = threading.Lock()


@chat_bp.route('/chat/stop', methods=['POST'])
def stop_chat():
    """
    Stop an active chat streaming session
    Request body: { "sessionId": "unique-session-id" }
    """
    logger.info('[Chat Domain] Stop chat request received')
    
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        
        if not session_id:
            logger.warning('[Chat Domain] Stop request missing sessionId')
            return jsonify({
                'error': 'sessionId is required',
                'success': False
            }), 400
        
        logger.info(f'[Chat Domain] Attempting to stop session: {session_id}')
        
        # Set stop flag for the session
        with sessions_lock:
            if session_id in active_streaming_sessions:
                active_streaming_sessions[session_id]['stop_flag'] = True
                logger.info(f'[Chat Domain] Stop flag set for session {session_id}')
                
                return jsonify({
                    'success': True,
                    'message': f'Session {session_id} stop signal sent',
                    'sessionId': session_id
                })
            else:
                logger.warning(f'[Chat Domain] Session {session_id} not found or already completed')
                return jsonify({
                    'success': False,
                    'message': f'Session {session_id} not found or already completed',
                    'sessionId': session_id
                }), 404
    
    except Exception as e:
        logger.error(f'[Chat Domain] Error stopping chat session: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to stop chat session',
            'details': str(e),
            'success': False
        }), 500


@chat_bp.route('/chat', methods=['POST', 'GET'])
def chat():
    """
    Handle chat completion requests with streaming support
    POST: Stream chat completions from LLM
    GET: Health check for chat API
    """
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Chat Domain] config_loader not found in app.config')
        return jsonify({
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    if request.method == 'GET':
        logger.info('[Chat Domain] Chat API health check')
        
        try:
            config = config_loader.get_llm_config()
            
            if config is None:
                logger.info('[Chat Domain] Chat API health check: No model configured')
                return jsonify({
                    'status': 'ok',
                    'configured': False,
                    'message': 'No model configured. Please add a model in Settings.'
                })
            
            validation = config_loader.validate_llm_config(config)
            
            return jsonify({
                'status': 'ok',
                'configured': validation['valid'],
                'model': config['modelName'],
                'endpoint': config['apiUrl']
            })
        except Exception as e:
            logger.error(f'[Chat Domain] Chat API health check failed: {str(e)}', exc_info=True)
            return jsonify({'status': 'error', 'configured': False}), 500
    
    # POST request - handle chat completion
    start_time = datetime.now()
    
    # Generate unique session ID for tracking
    session_id = str(uuid.uuid4())
    logger.info(f'[Chat Domain] Chat request received with session ID: {session_id}')
    
    try:
        # Parse request body
        data = request.get_json()
        
        # Debug: Log raw request data
        logger.debug('[Chat Domain] Raw request data received', extra={
            'data_keys': list(data.keys()) if data else [],
            'data_preview': {k: v if k != 'messages' else f'[{len(v)} messages]' for k, v in (data.items() if data else [])}
        })
        
        messages = data.get('messages', [])
        model_id = data.get('modelId')  # Get optional model ID from request
        system_prompt = data.get('systemPrompt')  # Get optional system prompt from request
        mcp_enabled = data.get('mcpEnabled', False)  # Check if MCP is enabled
        mcp_tools = data.get('mcpTools', [])  # Get enabled MCP tools
        network_search_enabled = data.get('networkSearchEnabled', False)  # Check if network search is enabled
        
        # Debug: Log extracted system prompt
        logger.debug('[Chat Domain] Extracted system prompt from request', extra={
            'hasSystemPrompt': bool(system_prompt),
            'systemPromptLength': len(system_prompt) if system_prompt else 0,
            'systemPromptPreview': system_prompt[:100] + '...' if system_prompt and len(system_prompt) > 100 else system_prompt if system_prompt else None,
        })
        
        # Debug: Log extracted MCP data
        logger.debug('[Chat Domain] Extracted MCP configuration from request', extra={
            'mcpEnabled_raw': data.get('mcpEnabled'),
            'mcpEnabled_parsed': mcp_enabled,
            'mcpTools_raw': data.get('mcpTools'),
            'mcpTools_count': len(mcp_tools),
            'mcpTools_preview': [{'name': t.get('name'), 'id': t.get('id')} for t in mcp_tools] if mcp_tools else [],
        })
        
        # Debug: Log extracted network search data
        logger.debug('[Chat Domain] Extracted network search configuration from request', extra={
            'networkSearchEnabled_raw': data.get('networkSearchEnabled'),
            'networkSearchEnabled_parsed': network_search_enabled,
        })
        
        if not messages or not isinstance(messages, list):
            logger.warning(f'[Chat Domain] Invalid messages in chat request: {type(messages)}')
            return jsonify({'error': 'Messages array is required and must not be empty'}), 400
        
        logger.info(f'[Chat Domain] Processing chat request with {len(messages)} messages, modelId: {model_id or "default"}, MCP: {mcp_enabled}, NetworkSearch: {network_search_enabled}', extra={
            'messageCount': len(messages),
            'requestedModelId': model_id,
            'usingDefaultModel': model_id is None,
            'hasSystemPrompt': bool(system_prompt),
            'systemPromptLength': len(system_prompt) if system_prompt else 0,
            'mcpEnabled': mcp_enabled,
            'mcpToolCount': len(mcp_tools) if mcp_enabled else 0,
            'mcpToolNames': [t.get('name') for t in mcp_tools] if mcp_tools else [],
            'networkSearchEnabled': network_search_enabled,
        })
        
        # Get and validate LLM configuration with specified model ID
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            logger.error('[Chat Domain] LLM configuration not available - no model configured', extra={
                'requestedModelId': model_id,
                'error': 'No model configured'
            })
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use chat features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            logger.error(f'[Chat Domain] LLM configuration validation failed: {validation.get("error")}', extra={
                'requestedModelId': model_id,
                'validationError': validation.get('error'),
                'modelName': config.get('modelName', 'unknown')
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        logger.info(f'[Chat Domain] LLM configuration validated successfully, using model: {config["modelName"]}', extra={
            'modelName': config['modelName'],
            'apiUrl': config['apiUrl'],
            'requestedModelId': model_id,
            'messageCount': len(messages)
        })
        
        # Prepare system message
        # Use custom system prompt if provided, otherwise use default
        default_system_prompt = 'You are a helpful AI assistant for EcritisAgent, an AI-powered document editing and validation tool. You help users with document-related questions, provide guidance on using the tool, and assist with document editing tasks. Be concise, friendly, and professional.'
        system_content = system_prompt if system_prompt else default_system_prompt
        
        # If network search is enabled, we'll add search results to the last user message
        # This will be done in the generate() function after search completes
        
        logger.info('[Chat Domain] System message prepared', extra={
            'usingCustomPrompt': bool(system_prompt),
            'systemPromptLength': len(system_content),
            'systemPromptPreview': system_content[:150] + '...' if len(system_content) > 150 else system_content,
        })
        
        system_message = {
            'role': 'system',
            'content': system_content
        }
        
        full_messages = [system_message] + messages
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        logger.debug(f'[Chat Domain] Sending request to LLM API: {endpoint}')
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        payload = {
            'model': config['modelName'],
            'messages': full_messages,
            'stream': True,
            'temperature': 0.7
        }
        
        logger.info('[Chat Domain] [LLM Request] Removed max_tokens limit to allow unlimited response length', extra={
            'model': config['modelName'],
            'note': 'AI responses will not be truncated by token limits'
        })
        
        # Check if MCP tools should be used
        mcp_execution_steps = []
        should_use_mcp = mcp_enabled and len(mcp_tools) > 0
        
        if should_use_mcp:
            logger.info('[Chat Domain] [MCP] MCP tools enabled for this chat request', extra={
                'tool_count': len(mcp_tools),
                'tool_names': [t['name'] for t in mcp_tools],
                'note': 'All MCP tools are available. LLM will analyze user query and decide which tools to call.',
            })
        
        # Register this session as active
        with sessions_lock:
            active_streaming_sessions[session_id] = {
                'stop_flag': False,
                'start_time': start_time
            }
        
        logger.info(f'[Chat Domain] Session {session_id} registered as active streaming session')
        
        # Make streaming request to LLM API
        def generate():
            try:
                # Send session ID to client at the beginning
                session_event = {
                    'type': 'session_start',
                    'sessionId': session_id,
                }
                yield f"data: {json.dumps(session_event, ensure_ascii=False)}\n\n".encode('utf-8')
                logger.debug(f'[Chat Domain] Sent session ID to client: {session_id}')
                # Helper function to check if stop was requested
                def should_stop():
                    with sessions_lock:
                        session_data = active_streaming_sessions.get(session_id)
                        if session_data and session_data['stop_flag']:
                            logger.info(f'[Chat Domain] Stop signal detected for session {session_id}')
                            return True
                    return False
                
                # Step 0: If network search is enabled, perform search first
                network_search_results = []
                if network_search_enabled and not should_stop():
                    logger.info('[Chat Domain] [NetworkSearch] Network search enabled, performing search before chat', extra={
                        'enabled': network_search_enabled,
                    })
                    
                    try:
                        # Get user's last message as search query
                        last_user_message = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
                        
                        if last_user_message:
                            logger.info('[Chat Domain] [NetworkSearch] Preparing search query', extra={
                                'query_preview': last_user_message[:100],
                            })
                            
                            # Send search query event
                            search_query_event = {
                                'type': 'network_search_query',
                                'query': last_user_message,
                            }
                            yield f"data: {json.dumps(search_query_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            
                            # Send search execution event
                            search_execution_event = {
                                'type': 'network_search_execution',
                                'status': 'running',
                            }
                            yield f"data: {json.dumps(search_execution_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            
                            # Call search service API
                            search_api_url = f"{request.scheme}://{request.host}/api/search-services/search"
                            
                            logger.info('[Chat Domain] [NetworkSearch] Calling search service API', extra={
                                'api_url': search_api_url,
                                'query': last_user_message,
                            })
                            
                            search_response = requests.post(
                                search_api_url,
                                json={
                                    'query': last_user_message,
                                    'maxResults': 5,
                                },
                                timeout=15
                            )
                            
                            if search_response.status_code == 200:
                                search_data = search_response.json()
                                if search_data.get('success'):
                                    network_search_results = search_data.get('results', [])
                                    
                                    logger.info('[Chat Domain] [NetworkSearch] Search completed successfully', extra={
                                        'result_count': len(network_search_results),
                                    })
                                    
                                    # Send search results event
                                    search_results_event = {
                                        'type': 'network_search_results',
                                        'results': network_search_results,
                                    }
                                    yield f"data: {json.dumps(search_results_event, ensure_ascii=False)}\n\n".encode('utf-8')
                                    
                                    # Send synthesizing event
                                    synthesizing_event = {
                                        'type': 'network_search_synthesizing',
                                    }
                                    yield f"data: {json.dumps(synthesizing_event, ensure_ascii=False)}\n\n".encode('utf-8')
                                    
                                    # Update search execution status to success
                                    search_execution_success_event = {
                                        'type': 'network_search_execution',
                                        'status': 'success',
                                    }
                                    yield f"data: {json.dumps(search_execution_success_event, ensure_ascii=False)}\n\n".encode('utf-8')
                                else:
                                    logger.warning('[Chat Domain] [NetworkSearch] Search API returned error', extra={
                                        'error': search_data.get('error'),
                                    })
                                    search_execution_error_event = {
                                        'type': 'network_search_execution',
                                        'status': 'error',
                                        'error': search_data.get('error', 'Search failed'),
                                    }
                                    yield f"data: {json.dumps(search_execution_error_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            else:
                                logger.error('[Chat Domain] [NetworkSearch] Search API request failed', extra={
                                    'status_code': search_response.status_code,
                                    'response': search_response.text[:200],
                                })
                                search_execution_error_event = {
                                    'type': 'network_search_execution',
                                    'status': 'error',
                                    'error': f'Search API error: {search_response.status_code}',
                                }
                                yield f"data: {json.dumps(search_execution_error_event, ensure_ascii=False)}\n\n".encode('utf-8')
                        else:
                            logger.warning('[Chat Domain] [NetworkSearch] No user message found for search', extra={})
                    except Exception as search_error:
                        logger.error('[Chat Domain] [NetworkSearch] Network search failed', extra={
                            'error': str(search_error),
                        }, exc_info=True)
                        search_execution_error_event = {
                            'type': 'network_search_execution',
                            'status': 'error',
                            'error': f'Search error: {str(search_error)}',
                        }
                        yield f"data: {json.dumps(search_execution_error_event, ensure_ascii=False)}\n\n".encode('utf-8')
                
                # If network search was performed, add results to the last user message
                if network_search_results:
                    logger.info('[Chat Domain] [NetworkSearch] Adding search results to user message', extra={
                        'result_count': len(network_search_results),
                    })
                    
                    # Format search results for LLM
                    search_results_text = "\n\n=== 网络搜索结果 ===\n"
                    for idx, result in enumerate(network_search_results[:5], 1):
                        search_results_text += f"\n[{idx}] {result.get('title', 'No title')}\n"
                        search_results_text += f"URL: {result.get('url', '')}\n"
                        search_results_text += f"内容: {result.get('content', '')[:500]}\n"
                    
                    search_results_text += "\n=== 请根据以上搜索结果回答用户的问题 ===\n"
                    
                    # Append search results to the last user message
                    if full_messages and full_messages[-1]['role'] == 'user':
                        full_messages[-1]['content'] = full_messages[-1]['content'] + "\n\n" + search_results_text
                        logger.debug('[Chat Domain] [NetworkSearch] Updated last user message with search results', extra={
                            'original_length': len(full_messages[-1]['content']) - len(search_results_text),
                            'new_length': len(full_messages[-1]['content']),
                        })
                    
                    # Update payload with modified messages
                    payload['messages'] = full_messages
                    
                    # Send final answer event
                    final_answer_event = {
                        'type': 'network_search_final_answer',
                    }
                    yield f"data: {json.dumps(final_answer_event, ensure_ascii=False)}\n\n".encode('utf-8')
                
                # Check if stopped before proceeding to MCP
                if should_stop():
                    logger.info(f'[Chat Domain] Session {session_id} stopped before MCP execution')
                    stop_event = {
                        'type': 'stream_stopped',
                        'message': 'Stream stopped by user',
                    }
                    yield f"data: {json.dumps(stop_event, ensure_ascii=False)}\n\n".encode('utf-8')
                    return
                
                # Step 1: If MCP is enabled, analyze if tools are needed
                if should_use_mcp:
                    logger.info('[Chat Domain] [MCP] Starting MCP tool analysis with LLM', extra={
                        'tool_count': len(mcp_tools),
                        'tool_names': [t['name'] for t in mcp_tools],
                    })
                    
                    # Import MCP client
                    try:
                        from mcp_client import MCPClient, MCPToolCall, analyze_user_query_for_tools, format_tool_results_for_llm, get_mcp_tool_descriptions
                    except ImportError as import_error:
                        logger.error('[Chat Domain] [MCP] Failed to import MCP client', extra={
                            'error': str(import_error),
                        }, exc_info=True)
                        # Continue without MCP if import fails
                        should_use_mcp_local = False
                    else:
                        should_use_mcp_local = True
                        
                        # Get user's last message
                        last_user_message = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
                        
                        logger.debug('[Chat Domain] [MCP] Extracted user message for analysis', extra={
                            'message_preview': last_user_message[:100],
                        })
                        
                        # Initialize MCP client
                        mcp_client = MCPClient(mcp_tools)
                        
                        # Get detailed tool descriptions for LLM
                        tool_descriptions = get_mcp_tool_descriptions(mcp_tools)
                        
                        logger.debug('[Chat Domain] [MCP] Generated tool descriptions for LLM', extra={
                            'description_count': len(tool_descriptions),
                        })
                        
                        # Create LLM client for tool analysis
                        try:
                            from langchain_openai import ChatOpenAI
                            
                            llm_for_analysis = ChatOpenAI(
                                api_key=config['apiKey'],
                                base_url=config['apiUrl'].rstrip('/'),
                                model=config['modelName'],
                                temperature=0.1,  # Lower temperature for more deterministic tool selection
                            )
                            
                            logger.info('[Chat Domain] [MCP] Created LLM client for tool analysis', extra={
                                'model': config['modelName'],
                                'api_url': config['apiUrl'],
                            })
                            
                        except Exception as llm_error:
                            logger.warning('[Chat Domain] [MCP] Failed to create LLM client for analysis, will use fallback', extra={
                                'error': str(llm_error),
                            })
                            llm_for_analysis = None
                        
                        # Analyze if tools are needed using LLM
                        logger.info('[Chat Domain] [MCP] Calling LLM to analyze user intent and select tools', extra={
                            'available_tool_count': len(tool_descriptions),
                            'available_tools': [t['name'] for t in tool_descriptions],
                            'user_message_preview': last_user_message[:100] if last_user_message else '',
                        })
                        
                        tool_calls_to_make = analyze_user_query_for_tools(
                            last_user_message,
                            tool_descriptions,
                            llm_for_analysis,
                        )
                        
                        if tool_calls_to_make:
                            logger.info('[Chat Domain] [MCP] LLM selected tools for execution', extra={
                                'tool_count': len(tool_calls_to_make),
                                'tools': [tc['tool_name'] for tc in tool_calls_to_make],
                                'parameters': [tc['parameters'] for tc in tool_calls_to_make],
                            })
                            
                            # Create reasoning message
                            tool_names_list = [tc['tool_name'] for tc in tool_calls_to_make]
                            reasoning_text = f'Analyzing your query, I determined that I need to use external tools to provide accurate information. Selected tools: {", ".join(tool_names_list)}'
                            
                            # Send reasoning step to client
                            reasoning_event = {
                                'type': 'mcp_reasoning',
                                'reasoning': reasoning_text,
                            }
                            
                            logger.debug('[Chat Domain] [MCP] Sending reasoning event to client', extra={
                                'reasoning': reasoning_text,
                            })
                            
                            yield f"data: {json.dumps(reasoning_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            
                            # Execute each tool
                            executed_tools = []
                            for idx, tool_call_data in enumerate(tool_calls_to_make, 1):
                                tool_name = tool_call_data['tool_name']
                                parameters = tool_call_data['parameters']
                                
                                logger.info(f'[Chat Domain] [MCP] Executing tool {idx}/{len(tool_calls_to_make)}', extra={
                                    'tool_name': tool_name,
                                    'parameters': parameters,
                                })
                                
                                tool_call = MCPToolCall(
                                    tool_name=tool_name,
                                    parameters=parameters,
                                )
                                
                                # Send tool call start event
                                tool_start_event = {
                                    'type': 'mcp_tool_call',
                                    'tool_name': tool_call.tool_name,
                                    'parameters': tool_call.parameters,
                                    'status': 'running',
                                }
                                
                                logger.debug('[Chat Domain] [MCP] Sending tool call start event', extra={
                                    'tool_name': tool_name,
                                })
                                
                                yield f"data: {json.dumps(tool_start_event, ensure_ascii=False)}\n\n".encode('utf-8')
                                
                                # Execute tool
                                tool_call = mcp_client.execute_tool(tool_call)
                                executed_tools.append(tool_call)
                                
                                logger.info(f'[Chat Domain] [MCP] Tool execution completed', extra={
                                    'tool_name': tool_name,
                                    'status': tool_call.status,
                                    'has_result': tool_call.result is not None,
                                    'has_error': tool_call.error is not None,
                                })
                                
                                # Send tool result event
                                tool_result_event = {
                                    'type': 'mcp_tool_result',
                                    'tool_name': tool_call.tool_name,
                                    'status': tool_call.status,
                                    'result': tool_call.result,
                                    'error': tool_call.error,
                                }
                                
                                logger.debug('[Chat Domain] [MCP] Sending tool result event', extra={
                                    'tool_name': tool_name,
                                    'status': tool_call.status,
                                })
                                
                                yield f"data: {json.dumps(tool_result_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            
                            # Format tool results for LLM context
                            logger.info('[Chat Domain] [MCP] Formatting tool results for LLM context', extra={
                                'executed_tool_count': len(executed_tools),
                                'successful_tools': sum(1 for t in executed_tools if t.status == 'success'),
                                'failed_tools': sum(1 for t in executed_tools if t.status == 'error'),
                            })
                            
                            tool_results_context = format_tool_results_for_llm(executed_tools)
                            
                            logger.debug('[Chat Domain] [MCP] Tool results formatted', extra={
                                'context_length': len(tool_results_context),
                                'context_preview': tool_results_context[:200],
                            })
                            
                            # Add tool results to the last message
                            original_content = full_messages[-1]['content']
                            full_messages[-1]['content'] = f"{original_content}\n\n{tool_results_context}"
                            
                            logger.info('[Chat Domain] [MCP] Tool results added to context for LLM', extra={
                                'original_message_length': len(original_content),
                                'enhanced_message_length': len(full_messages[-1]['content']),
                            })
                            
                            # Update payload with modified messages
                            payload['messages'] = full_messages
                            
                            logger.debug('[Chat Domain] [MCP] Updated payload with tool results')
                            
                            # Send final answer generation event
                            final_answer_event = {
                                'type': 'mcp_final_answer',
                            }
                            
                            logger.debug('[Chat Domain] [MCP] Sending final answer generation event')
                            
                            yield f"data: {json.dumps(final_answer_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            
                            logger.info('[Chat Domain] [MCP] MCP tool execution workflow completed, proceeding to LLM for final answer generation')
                        else:
                            logger.info('[Chat Domain] [MCP] LLM analysis determined no tools needed for this query')
                
                # Log final prompts that will be sent to LLM
                final_messages = payload.get('messages', [])
                system_prompts = [msg.get('content', '') for msg in final_messages if msg.get('role') == 'system']
                user_prompts = [msg.get('content', '') for msg in final_messages if msg.get('role') == 'user']
                
                # Check if stopped before LLM request
                if should_stop():
                    logger.info(f'[Chat Domain] Session {session_id} stopped before LLM request')
                    stop_event = {
                        'type': 'stream_stopped',
                        'message': 'Stream stopped by user',
                    }
                    yield f"data: {json.dumps(stop_event, ensure_ascii=False)}\n\n".encode('utf-8')
                    return
                
                logger.info('=' * 80)
                logger.info('[Chat Domain] [LLM Request] Final prompts to be sent to LLM')
                logger.info('=' * 80)
                
                # Log system prompts
                if system_prompts:
                    for idx, system_prompt in enumerate(system_prompts, 1):
                        logger.info(f'[Chat Domain] [LLM Request] System Prompt #{idx} (length: {len(system_prompt)}):')
                        logger.info(f'[Chat Domain] [LLM Request] {system_prompt}')
                else:
                    logger.warning('[Chat Domain] [LLM Request] No system prompt found in messages')
                
                # Log user prompts
                if user_prompts:
                    logger.info(f'[Chat Domain] [LLM Request] User Prompts (total: {len(user_prompts)}):')
                    for idx, user_prompt in enumerate(user_prompts, 1):
                        logger.info(f'[Chat Domain] [LLM Request] User Prompt #{idx} (length: {len(user_prompt)}):')
                        logger.info(f'[Chat Domain] [LLM Request] {user_prompt}')
                else:
                    logger.warning('[Chat Domain] [LLM Request] No user prompts found in messages')
                
                logger.info('=' * 80)
                logger.info(f'[Chat Domain] [LLM Request] Total messages count: {len(final_messages)}')
                logger.info(f'[Chat Domain] [LLM Request] Model: {payload.get("model", "unknown")}')
                logger.info(f'[Chat Domain] [LLM Request] Endpoint: {endpoint}')
                logger.info('=' * 80)
                
                logger.info(f'[Chat Domain] Starting LLM API streaming request for session {session_id}')
                
                # Use a timeout for creating the connection
                llm_response = requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=(10, config['timeout'])  # (connection timeout, read timeout)
                )
                
                try:
                    if llm_response.status_code != 200:
                        error_text = llm_response.text
                        logger.error(f'[Chat Domain] LLM API error: {llm_response.status_code} - {error_text}')
                        yield json.dumps({
                            'error': f'LLM API error: {llm_response.status_code}',
                            'details': error_text
                        }).encode('utf-8')
                        return
                    
                    logger.info(f'[Chat Domain] Streaming chat response started for session {session_id}')
                    chunk_count = 0
                    
                    for chunk in llm_response.iter_content(chunk_size=8192):
                        # Check if stop was requested
                        if should_stop():
                            logger.info(f'[Chat Domain] Session {session_id} stopped during streaming at chunk {chunk_count}')
                            
                            # Close the response connection
                            llm_response.close()
                            
                            # Send stop event to client
                            stop_event = {
                                'type': 'stream_stopped',
                                'message': 'Stream stopped by user',
                                'chunksProcessed': chunk_count,
                            }
                            yield f"data: {json.dumps(stop_event, ensure_ascii=False)}\n\n".encode('utf-8')
                            
                            logger.info(f'[Chat Domain] Session {session_id} successfully stopped after {chunk_count} chunks')
                            return
                        
                        if chunk:
                            chunk_count += 1
                            yield chunk
                            
                            # Log progress periodically
                            if chunk_count % 10 == 0:
                                logger.debug(f'[Chat Domain] Chat stream progress for session {session_id}: {chunk_count} chunks')
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    logger.info(f'[Chat Domain] Chat stream completed for session {session_id}: {chunk_count} chunks in {duration:.2f}s')
                
                finally:
                    # Always close the response to free resources
                    llm_response.close()
                    logger.debug(f'[Chat Domain] LLM response connection closed for session {session_id}')
            
            except requests.Timeout:
                logger.error('[Chat Domain] Chat request timed out')
                yield json.dumps({'error': 'Request timed out'}).encode('utf-8')
            
            except Exception as e:
                logger.error(f'[Chat Domain] Error in chat stream for session {session_id}: {str(e)}', exc_info=True)
                yield json.dumps({
                    'error': 'Failed to process chat request',
                    'details': str(e)
                }).encode('utf-8')
            
            finally:
                # Clean up session from active sessions
                with sessions_lock:
                    if session_id in active_streaming_sessions:
                        del active_streaming_sessions[session_id]
                        logger.info(f'[Chat Domain] Session {session_id} cleaned up from active sessions')
                        logger.debug(f'[Chat Domain] Active sessions remaining: {len(active_streaming_sessions)}')
        
        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Session-Id': session_id
            }
        )
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f'[Chat Domain] Chat request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process chat request',
            'details': str(e)
        }), 500


@chat_bp.route('/chat/upload-file', methods=['POST'])
def upload_and_parse_file():
    """
    Upload and parse a document file (PDF or Word) to extract text content
    The extracted text will be used as context for chat messages
    
    Request: multipart/form-data with 'file' field
    Response: JSON with extracted text and metadata
    """
    logger.info('[Chat Domain] File upload request received')
    
    try:
        # Check if file is in request
        if 'file' not in request.files:
            logger.warning('[Chat Domain] No file provided in request')
            return jsonify({
                'success': False,
                'error': 'No file provided',
                'text': '',
                'metadata': {}
            }), 400
        
        file = request.files['file']
        
        # Check if filename is empty
        if file.filename == '':
            logger.warning('[Chat Domain] Empty filename provided')
            return jsonify({
                'success': False,
                'error': 'Empty filename',
                'text': '',
                'metadata': {}
            }), 400
        
        # Get file details
        filename = file.filename
        file_size = 0
        
        logger.info(
            '[Chat Domain] Processing uploaded file',
            extra={
                'file_name': filename,
                'content_type': file.content_type
            }
        )
        
        # Read file content
        try:
            file_content = file.read()
            file_size = len(file_content)
            
            logger.debug(
                '[Chat Domain] File content read successfully',
                extra={
                    'file_name': filename,
                    'file_size': file_size
                }
            )
        except Exception as read_error:
            logger.error(
                '[Chat Domain] Failed to read file content',
                extra={
                    'file_name': filename,
                    'error': str(read_error)
                },
                exc_info=True
            )
            return jsonify({
                'success': False,
                'error': f'Failed to read file: {str(read_error)}',
                'text': '',
                'metadata': {'filename': filename}
            }), 500
        
        # Check file size (limit to 10MB)
        max_file_size = 10 * 1024 * 1024  # 10MB
        if file_size > max_file_size:
            logger.warning(
                '[Chat Domain] File size exceeds limit',
                extra={
                    'file_name': filename,
                    'file_size': file_size,
                    'max_size': max_file_size
                }
            )
            return jsonify({
                'success': False,
                'error': f'File size exceeds limit of {max_file_size / 1024 / 1024}MB',
                'text': '',
                'metadata': {
                    'filename': filename,
                    'file_size': file_size
                }
            }), 400
        
        # Parse file using document parser
        try:
            from domains.document.parser import document_parser
            
            logger.info(
                '[Chat Domain] Starting file parsing',
                extra={
                    'file_name': filename,
                    'file_size': file_size
                }
            )
            
            # Check if parser is available
            if not document_parser.is_available():
                logger.error(
                    '[Chat Domain] Document parser libraries not available',
                    extra={'file_name': filename}
                )
                return jsonify({
                    'success': False,
                    'error': 'Document parsing libraries not available. Please install required packages.',
                    'text': '',
                    'metadata': {'filename': filename}
                }), 500
            
            # Parse the file
            parse_result = document_parser.parse_file(file_content, filename)
            
            if parse_result['success']:
                logger.info(
                    '[Chat Domain] File parsed successfully',
                    extra={
                        'file_name': filename,
                        'text_length': len(parse_result['text']),
                        'metadata': parse_result['metadata']
                    }
                )
                
                return jsonify({
                    'success': True,
                    'text': parse_result['text'],
                    'metadata': {
                        **parse_result['metadata'],
                        'file_size': file_size
                    },
                    'error': None
                }), 200
            else:
                logger.error(
                    '[Chat Domain] File parsing failed',
                    extra={
                        'file_name': filename,
                        'error': parse_result['error']
                    }
                )
                
                return jsonify({
                    'success': False,
                    'error': parse_result['error'],
                    'text': '',
                    'metadata': {
                        **parse_result['metadata'],
                        'file_size': file_size
                    }
                }), 400
        
        except ImportError as import_error:
            logger.error(
                '[Chat Domain] Failed to import document parser',
                extra={
                    'file_name': filename,
                    'error': str(import_error)
                },
                exc_info=True
            )
            return jsonify({
                'success': False,
                'error': 'Document parser not available',
                'text': '',
                'metadata': {'filename': filename}
            }), 500
        
        except Exception as parse_error:
            logger.error(
                '[Chat Domain] Error during file parsing',
                extra={
                    'file_name': filename,
                    'error': str(parse_error)
                },
                exc_info=True
            )
            return jsonify({
                'success': False,
                'error': f'Failed to parse file: {str(parse_error)}',
                'text': '',
                'metadata': {'filename': filename}
            }), 500
    
    except Exception as e:
        logger.error(
            '[Chat Domain] File upload request failed',
            extra={'error': str(e)},
            exc_info=True
        )
        return jsonify({
            'success': False,
            'error': f'File upload failed: {str(e)}',
            'text': '',
            'metadata': {}
        }), 500
