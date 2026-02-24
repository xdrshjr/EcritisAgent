"""
Agent Domain Routes
Handles agent routing, validation, list, and auto-writer functionality
"""

import logging
import json
import os
import sys
from datetime import datetime
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app

logger = logging.getLogger(__name__)

# Create blueprint for agent domain
agent_bp = Blueprint('agent', __name__, url_prefix='/api')

# Get backend directory for agent module imports
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


@agent_bp.route('/agent-validation', methods=['POST'])
def agent_validation():
    """
    Handle agent-based document validation with streaming support
    Uses LangGraph agent to plan and execute document modifications
    """
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Agent Domain] config_loader not found in app.config')
        return jsonify({
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    start_time = datetime.now()
    logger.info('[Agent Domain] Agent validation request received')
    
    try:
        # Parse request body
        data = request.get_json()
        user_command = data.get('command', '')
        document_content = data.get('content', '')
        language = data.get('language', 'en')
        model_id = data.get('modelId')
        
        if not user_command or not isinstance(user_command, str):
            logger.warning(f'[Agent Domain] Invalid command in agent validation request: {type(user_command)}')
            return jsonify({'error': 'Command is required and must be a string'}), 400
        
        if not document_content or not isinstance(document_content, str):
            logger.warning(f'[Agent Domain] Invalid content in agent validation request: {type(document_content)}')
            return jsonify({'error': 'Document content is required and must be a string'}), 400
        
        # Normalize language parameter
        if language not in ['en', 'zh']:
            logger.warning(f'[Agent Domain] Unsupported language "{language}" received, defaulting to English')
            language = 'en'
        
        logger.info(f'[Agent Domain] Processing agent validation request: command length: {len(user_command)}, content length: {len(document_content)}, language: {language}, modelId: {model_id or "default"}', extra={
            'command_length': len(user_command),
            'content_length': len(document_content),
            'language': language,
            'model_id': model_id,
        })
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            logger.error('[Agent Domain] LLM configuration not available - no model configured')
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use agent validation features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            logger.error(f'[Agent Domain] LLM configuration validation failed: {validation.get("error")}')
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Import agent module
        try:
            logger.debug('[Agent Domain] Attempting to import DocumentAgent module', extra={
                'sys_path': sys.path[:3],  # Log first 3 paths for debugging
                'backend_dir': backend_dir,
                'cwd': os.getcwd(),
            })
            
            from agent.document_agent import DocumentAgent
            
            logger.info('[Agent Domain] DocumentAgent module imported successfully')
            
        except ImportError as import_error:
            # Log detailed error information for debugging
            logger.error('[Agent Domain] Failed to import DocumentAgent module', extra={
                'error': str(import_error),
                'error_type': type(import_error).__name__,
                'sys_path': sys.path,
                'backend_dir': backend_dir,
                'cwd': os.getcwd(),
                'agent_dir_exists': os.path.exists(os.path.join(backend_dir, 'agent')),
                'agent_init_exists': os.path.exists(os.path.join(backend_dir, 'agent', '__init__.py')),
                'document_agent_exists': os.path.exists(os.path.join(backend_dir, 'agent', 'document_agent.py')),
            }, exc_info=True)
            
            return jsonify({
                'error': 'Agent module not available',
                'details': f'Failed to import agent module: {str(import_error)}. Please ensure LangGraph dependencies are installed and agent module is properly packaged.'
            }), 500
        
        # Initialize agent
        try:
            agent = DocumentAgent(
                api_key=config['apiKey'],
                api_url=config['apiUrl'],
                model_name=config['modelName'],
                language=language,
                call_config=config,
            )
            logger.info(f'[Agent Domain] DocumentAgent initialized successfully')
        except Exception as agent_error:
            logger.error(f'[Agent Domain] Failed to initialize DocumentAgent: {str(agent_error)}', exc_info=True)
            return jsonify({
                'error': 'Failed to initialize agent',
                'details': str(agent_error)
            }), 500
        
        # Stream agent execution
        def generate():
            try:
                logger.info('[Agent Domain] Starting agent workflow streaming')
                chunk_count = 0
                event_types_count = {}
                document_updates_count = 0
                
                for result in agent.run(user_command, document_content):
                    chunk_count += 1
                    event_type = result.get('type', 'unknown')
                    event_types_count[event_type] = event_types_count.get(event_type, 0) + 1
                    
                    # Log each event type
                    if event_type == 'document_update':
                        document_updates_count += 1
                        logger.info('[Agent Domain] Document update event', extra={
                            'event_type': event_type,
                            'step': result.get('step'),
                            'updated_content_length': len(result.get('updated_content', '')),
                            'event_message': result.get('message', ''),
                        })
                    elif event_type == 'tool_result':
                        logger.info('[Agent Domain] Tool result event', extra={
                            'event_type': event_type,
                            'step': result.get('step'),
                            'tool': result.get('tool'),
                            'success': result.get('result', {}).get('success', result.get('result', {}).get('found', True)),
                        })
                    elif event_type == 'status':
                        logger.debug('[Agent Domain] Status event', extra={
                            'event_type': event_type,
                            'phase': result.get('phase'),
                            'event_message': result.get('message', '')[:100],
                        })
                    elif event_type in ['todo_list', 'complete', 'error']:
                        logger.info('[Agent Domain] Major event', extra={
                            'event_type': event_type,
                            'event_message': result.get('message', '')[:100],
                        })
                    
                    # Convert result to SSE format
                    sse_data = f"data: {json.dumps(result, ensure_ascii=False)}\n\n"
                    yield sse_data.encode('utf-8')
                    
                    # Log progress periodically
                    if chunk_count % 10 == 0:
                        logger.debug('[Agent Domain] Agent stream progress', extra={
                            'chunks_sent': chunk_count,
                            'document_updates': document_updates_count,
                            'event_types': dict(event_types_count),
                        })
                
                duration = (datetime.now() - start_time).total_seconds()
                logger.info('[Agent Domain] Agent workflow completed', extra={
                    'total_chunks': chunk_count,
                    'duration_seconds': f'{duration:.2f}',
                    'document_updates': document_updates_count,
                    'event_types_summary': dict(event_types_count),
                })
                
                # Send completion marker
                yield b"data: [DONE]\n\n"
                
            except Exception as e:
                logger.error('[Agent Domain] Error in agent stream', extra={
                    'error': str(e),
                    'error_type': type(e).__name__,
                    'chunks_sent_before_error': chunk_count,
                }, exc_info=True)
                error_data = {
                    "type": "error",
                    "message": "Agent execution failed",
                    "error": str(e)
                }
                yield f"data: {json.dumps(error_data)}\n\n".encode('utf-8')
        
        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f'[Agent Domain] Agent validation request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process agent validation request',
            'details': str(e)
        }), 500


@agent_bp.route('/agents', methods=['GET'])
def get_agents():
    """
    Get list of available agents with their capabilities
    
    Returns:
        JSON array of agent descriptors
    """
    logger.info('[Agent Domain] GET request received for agent list')
    
    try:
        logger.debug('[Agent Domain] Attempting to import agent_router module', extra={
            'sys_path_preview': sys.path[:3],
            'backend_dir': backend_dir,
        })
        
        from agent.agent_router import get_available_agents
        
        logger.debug('[Agent Domain] Successfully imported get_available_agents function')
        
        agents = get_available_agents()
        
        logger.info('[Agent Domain] Agent list retrieved successfully', extra={
            'agent_count': len(agents),
            'agent_types': [a['type'] for a in agents],
            'agent_names': [a['name'] for a in agents],
        })
        
        response_data = {
            'agents': agents,
            'count': len(agents),
        }
        
        logger.debug('[Agent Domain] Sending response', extra={
            'response_keys': list(response_data.keys()),
            'agent_count': len(agents),
        })
        
        return jsonify(response_data)
        
    except ImportError as import_error:
        logger.error('[Agent Domain] Failed to import agent router module', extra={
            'error': str(import_error),
            'error_type': type(import_error).__name__,
            'sys_path': sys.path,
            'backend_dir': backend_dir,
            'agent_dir_exists': os.path.exists(os.path.join(backend_dir, 'agent')),
            'agent_router_exists': os.path.exists(os.path.join(backend_dir, 'agent', 'agent_router.py')),
        }, exc_info=True)
        
        return jsonify({
            'error': 'Agent router not available',
            'details': str(import_error)
        }), 500
        
    except Exception as error:
        logger.error('[Agent Domain] Failed to get agent list', extra={
            'error': str(error),
            'error_type': type(error).__name__,
        }, exc_info=True)
        
        return jsonify({
            'error': 'Failed to retrieve agent list',
            'details': str(error)
        }), 500


@agent_bp.route('/agent-route', methods=['POST'])
def agent_route():
    """
    Unified agent routing endpoint
    
    This endpoint:
    1. Analyzes user request using LLM
    2. Routes to appropriate agent (auto-writer or document-modifier)
    3. Streams agent execution results
    
    POST body:
        - request: User's command/request
        - content: Document content (optional, for document modifier)
        - language: Language for prompts ('en' or 'zh')
        - modelId: Optional model ID to use
    """
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Agent Domain] config_loader not found in app.config')
        return jsonify({
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    start_time = datetime.now()
    logger.info('[Agent Domain] Agent routing request received')
    
    try:
        data = request.get_json() or {}
        user_request = data.get('request', '')
        document_content_raw = data.get('content', '')
        content_type = data.get('content_type', 'html')
        language = data.get('language', 'zh')
        model_id = data.get('modelId')
        
        # Parse content based on type
        if content_type == 'paragraphs' and isinstance(document_content_raw, str):
            try:
                document_content = json.loads(document_content_raw)
                logger.info('[Agent Domain] Received paragraphs array', extra={
                    'paragraph_count': len(document_content) if isinstance(document_content, list) else 0,
                })
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning('[Agent Domain] Failed to parse paragraphs, falling back to string', extra={
                    'error': str(e),
                })
                document_content = document_content_raw
        else:
            document_content = document_content_raw
        
        if not user_request or not isinstance(user_request, str):
            logger.warning('[Agent Domain] Invalid request', extra={
                'request_type': type(user_request).__name__,
            })
            return jsonify({'error': 'request is required and must be a string'}), 400
        
        # Normalize language
        if language not in ['en', 'zh']:
            logger.warning(f'[Agent Domain] Unsupported language "{language}", defaulting to zh')
            language = 'zh'
        
        # Check if document content exists
        if isinstance(document_content, list):
            has_document = len(document_content) > 0
            content_length = len(document_content)
        else:
            has_document = bool(document_content and isinstance(document_content, str) and document_content.strip())
            content_length = len(document_content) if has_document and isinstance(document_content, str) else 0
        
        logger.info('[Agent Domain] Processing routing request', extra={
            'request_preview': user_request[:100] + '...' if len(user_request) > 100 else user_request,
            'has_document': has_document,
            'content_type': content_type,
            'content_length': content_length,
            'language': language,
            'model_id': model_id or 'default',
        })
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config(model_id=model_id)
        if config is None:
            logger.error('[Agent Domain] No LLM model configured')
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use agent features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        if not validation['valid']:
            logger.error('[Agent Domain] LLM configuration validation failed', extra={
                'error': validation.get('error')
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM config')}), 500
        
        # Import agent router
        try:
            from agent.agent_router import AgentRouter
            from agent.auto_writer_agent import AutoWriterAgent
            from agent.document_agent import DocumentAgent
        except ImportError as import_error:
            logger.error('[Agent Domain] Failed to import agent modules', extra={
                'error': str(import_error)
            }, exc_info=True)
            return jsonify({
                'error': 'Agent modules not available',
                'details': str(import_error)
            }), 500
        
        # Step 1: Route to appropriate agent
        logger.info('[Agent Domain] Starting agent routing with LLM')
        
        router = AgentRouter(
            api_key=config['apiKey'],
            api_url=config['apiUrl'],
            model_name=config['modelName'],
            language=language,
            call_config=config,
        )
        
        routing_result = router.route(user_request, has_document=has_document)
        
        logger.info('[Agent Domain] Routing completed', extra={
            'selected_agent': routing_result['agent_type'],
            'agent_name': routing_result['agent_name'],
            'confidence': routing_result['confidence'],
            'reasoning': routing_result['reasoning'][:100] + '...' if len(routing_result['reasoning']) > 100 else routing_result['reasoning'],
        })
        
        # Step 2: Execute selected agent
        selected_agent_type = routing_result['agent_type']
        
        def generate():
            """Generator for streaming agent execution"""
            chunk_count = 0
            event_types = {}
            
            try:
                # Send routing result first
                routing_event = {
                    'type': 'routing',
                    'agent_type': routing_result['agent_type'],
                    'agent_name': routing_result['agent_name'],
                    'confidence': routing_result['confidence'],
                    'reasoning': routing_result['reasoning'],
                }
                yield f"data: {json.dumps(routing_event, ensure_ascii=False)}\n\n"
                chunk_count += 1
                
                logger.info('[Agent Domain] Sent routing result to client', extra={
                    'agent_type': routing_result['agent_type'],
                })
                
                # Execute the selected agent
                if selected_agent_type == 'auto_writer':
                    logger.info('[Agent Domain] Executing AutoWriterAgent')
                    
                    agent = AutoWriterAgent(
                        api_key=config['apiKey'],
                        api_url=config['apiUrl'],
                        model_name=config['modelName'],
                        language=language,
                        call_config=config,
                    )
                    
                    # Check if image generation is enabled
                    # For auto-writer agent, default to True if not specified
                    enable_image_generation = data.get('enableImageGeneration', True)
                    
                    logger.info('[Agent Domain] AutoWriterAgent execution starting', extra={
                        'enable_image_generation': enable_image_generation,
                        'request_has_param': 'enableImageGeneration' in data,
                    })
                    
                    for event in agent.run(user_request, enable_image_generation=enable_image_generation):
                        chunk_count += 1
                        event_type = event.get('type', 'unknown')
                        event_types[event_type] = event_types.get(event_type, 0) + 1
                        
                        # Log periodically
                        if event_type == 'content_chunk' and chunk_count % 20 == 0:
                            logger.debug('[Agent Domain] AutoWriter streaming chunks', extra={
                                'total_chunks': chunk_count,
                                'content_chunks': event_types.get('content_chunk', 0),
                            })
                        
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
                elif selected_agent_type == 'document_modifier':
                    logger.info('[Agent Domain] Executing DocumentAgent')
                    
                    if not has_document:
                        error_event = {
                            'type': 'error',
                            'message': 'Document modifier requires a loaded document',
                            'error': 'No document content provided'
                        }
                        yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
                        return
                    
                    agent = DocumentAgent(
                        api_key=config['apiKey'],
                        api_url=config['apiUrl'],
                        model_name=config['modelName'],
                        language=language,
                        call_config=config,
                    )

                    for event in agent.run(user_request, document_content):
                        chunk_count += 1
                        event_type = event.get('type', 'unknown')
                        event_types[event_type] = event_types.get(event_type, 0) + 1
                        
                        # Log key events
                        if event_type in ['status', 'todo_list', 'complete', 'error']:
                            logger.info(f'[Agent Domain] DocumentAgent event: {event_type}', extra={
                                'phase': event.get('phase'),
                                'event_message': event.get('message', '')[:100],
                            })
                        
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
                else:
                    logger.error('[Agent Domain] Unknown agent type', extra={
                        'agent_type': selected_agent_type,
                    })
                    error_event = {
                        'type': 'error',
                        'message': f'Unknown agent type: {selected_agent_type}',
                    }
                    yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
                    return
                
                logger.info('[Agent Domain] Agent execution stream finished', extra={
                    'agent_type': selected_agent_type,
                    'total_chunks': chunk_count,
                    'event_types': event_types,
                    'duration': f"{(datetime.now() - start_time).total_seconds():.2f}s"
                })
                
            except Exception as error:
                logger.error('[Agent Domain] Agent execution failed', extra={
                    'agent_type': selected_agent_type,
                    'error': str(error),
                    'chunks_before_error': chunk_count,
                }, exc_info=True)
                
                error_event = {
                    'type': 'error',
                    'message': f'Agent execution failed: {str(error)}',
                    'error': str(error),
                }
                yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
            
            yield "data: [DONE]\n\n"
        
        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )
        
    except Exception as error:
        logger.error('[Agent Domain] Request failed', extra={
            'error': str(error)
        }, exc_info=True)
        return jsonify({
            'error': 'Agent routing failed',
            'details': str(error)
        }), 500


@agent_bp.route('/auto-writer-agent', methods=['POST'])
def auto_writer_agent():
    """
    AI Document Auto-Writer endpoint.

    Streams LangGraph agent status updates as SSE for the frontend auto writer.
    """
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Agent Domain] config_loader not found in app.config')
        return jsonify({
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    start_time = datetime.now()
    logger.info('[Agent Domain] Auto writer request received')

    try:
        data = request.get_json() or {}
        user_prompt = data.get('prompt', '')
        language = data.get('language', 'zh')
        model_id = data.get('modelId')
        # For auto-writer agent endpoint, default to True if not specified
        enable_image_generation = data.get('enableImageGeneration', True)
        # For network search, default to True if not specified
        enable_network_search = data.get('enableNetworkSearch', True)
        
        logger.info('[Agent Domain] Auto writer request received', extra={
            'enable_image_generation': enable_image_generation,
            'enable_network_search': enable_network_search,
            'request_has_param': 'enableImageGeneration' in data,
            'request_has_network_search_param': 'enableNetworkSearch' in data,
        })

        if not user_prompt or not isinstance(user_prompt, str):
            logger.warning('[Agent Domain] Invalid prompt in auto writer request', extra={
                'prompt_type': type(user_prompt).__name__,
            })
            return jsonify({'error': 'prompt is required'}), 400

        config = config_loader.get_llm_config(model_id=model_id)
        if config is None:
            logger.error('[Agent Domain] No LLM model configured')
            return jsonify({'error': 'No LLM model configured'}), 500

        validation = config_loader.validate_llm_config(config)
        if not validation['valid']:
            logger.error('[Agent Domain] LLM configuration validation failed', extra={
                'error': validation.get('error')
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM config')}), 500

        try:
            from agent.auto_writer_agent import AutoWriterAgent
        except ImportError as import_error:
            logger.error('[Agent Domain] Failed to import agent', extra={
                'error': str(import_error)
            }, exc_info=True)
            return jsonify({
                'error': 'AutoWriterAgent not available',
                'details': str(import_error)
            }), 500

        agent = AutoWriterAgent(
            api_key=config['apiKey'],
            api_url=config['apiUrl'],
            model_name=config['modelName'],
            language=language,
            call_config=config,
        )

        logger.info('[Agent Domain] Auto writer agent initialized', extra={
            'enable_image_generation': enable_image_generation,
        })

        def generate():
            chunk_count = 0
            event_types = {}
            
            for event in agent.run(
                user_prompt, 
                enable_image_generation=enable_image_generation,
                enable_network_search=enable_network_search
            ):
                chunk_count += 1
                event_type = event.get('type', 'unknown')
                event_types[event_type] = event_types.get(event_type, 0) + 1
                
                # Log streaming events periodically
                if event_type == 'content_chunk':
                    if chunk_count % 20 == 0:  # Log every 20 chunks to avoid spam
                        logger.debug('[Agent Domain] Streaming content chunks', extra={
                            'total_chunks': chunk_count,
                            'content_chunks': event_types.get('content_chunk', 0),
                            'draft_updates': event_types.get('article_draft', 0),
                        })
                elif event_type == 'article_draft':
                    logger.info('[Agent Domain] Sending draft update', extra={
                        'chunk_count': chunk_count,
                        'html_length': len(event.get('html', '')),
                    })
                
                # Yield SSE event
                sse_data = f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                yield sse_data

            logger.info('[Agent Domain] Stream finished', extra={
                'total_chunks': chunk_count,
                'event_types': event_types,
                'duration': f"{(datetime.now() - start_time).total_seconds():.2f}s"
            })
            yield "data: [DONE]\n\n"

        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )

    except Exception as e:
        logger.error('[Agent Domain] Request failed', extra={'error': str(e)}, exc_info=True)
        return jsonify({
            'error': 'AutoWriter request failed',
            'details': str(e)
        }), 500

