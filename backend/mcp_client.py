"""
MCP Client for EcritisAgent
Handles communication with MCP (Model Context Protocol) servers
Executes tool calls and processes results
"""

import json
import logging
import subprocess
import time
import threading
from typing import Dict, List, Any, Optional, Generator
from datetime import datetime

# Get logger
logger = logging.getLogger(__name__)


def get_mcp_tool_descriptions(enabled_tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate detailed descriptions for MCP tools to be sent to LLM
    
    Args:
        enabled_tools: List of enabled MCP tool configurations
        
    Returns:
        List of tool descriptions with name, description, and parameters
    """
    tool_descriptions = []
    
    for tool in enabled_tools:
        tool_name = tool.get('name', 'unknown')
        command = tool.get('command', '')
        args = tool.get('args', [])
        
        # Generate description based on tool name and command
        description = ""
        parameters = {}
        
        if 'tavily' in tool_name.lower():
            description = "Tavily AI Search - A powerful AI search engine that provides accurate, up-to-date information from the web. Use this for queries requiring current information, news, recent events, or web searches."
            parameters = {
                "query": {
                    "type": "string",
                    "description": "The search query to find information about"
                }
            }
        elif 'baidu' in tool_name.lower() or 'search' in tool_name.lower():
            description = "Web Search Tool - Search the internet for current information, news, and real-time data. Useful for queries about recent events, current facts, or information not in the AI's training data."
            parameters = {
                "query": {
                    "type": "string",
                    "description": "The search query to look up"
                }
            }
        else:
            # Generic description for unknown tools
            description = f"External tool: {tool_name}. Command: {command} {' '.join(args)}"
            parameters = {
                "query": {
                    "type": "string",
                    "description": "Input parameter for the tool"
                }
            }
        
        tool_descriptions.append({
            "name": tool_name,
            "description": description,
            "parameters": parameters,
            "command": command,
            "args": args
        })
    
    logger.debug('[MCP Tool Descriptions] Generated tool descriptions', extra={
        'tool_count': len(tool_descriptions),
        'tools': [t['name'] for t in tool_descriptions]
    })
    
    return tool_descriptions


class MCPToolCall:
    """
    Represents a single MCP tool call with its parameters and result
    """
    def __init__(self, tool_name: str, parameters: Dict[str, Any]):
        self.tool_name = tool_name
        self.parameters = parameters
        self.result: Optional[Any] = None
        self.error: Optional[str] = None
        self.status: str = 'pending'  # pending, running, success, error
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            'tool_name': self.tool_name,
            'parameters': self.parameters,
            'result': self.result,
            'error': self.error,
            'status': self.status,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
        }


class MCPClient:
    """
    Client for interacting with MCP servers
    Manages tool execution and result processing
    """
    
    def __init__(self, enabled_tools: List[Dict[str, Any]]):
        """
        Initialize MCP client with enabled tools
        
        Args:
            enabled_tools: List of enabled MCP tool configurations
        """
        self.enabled_tools = enabled_tools
        self.tool_map = {tool['name']: tool for tool in enabled_tools}
        
        logger.info('[MCP Client] Initialized with tools', extra={
            'tool_count': len(enabled_tools),
            'tool_names': [t['name'] for t in enabled_tools],
        })
    
    def has_tools(self) -> bool:
        """Check if any tools are available"""
        return len(self.enabled_tools) > 0
    
    def get_tool_names(self) -> List[str]:
        """Get list of available tool names"""
        return list(self.tool_map.keys())
    
    def _read_line_with_timeout(self, process: subprocess.Popen, timeout: int = 30) -> Optional[bytes]:
        """
        Read a line from process stdout with timeout
        
        Args:
            process: The subprocess to read from
            timeout: Timeout in seconds
            
        Returns:
            Line read from stdout as bytes, or None if timeout/error
        """
        import time
        
        # Set a deadline
        deadline = time.time() + timeout
        result = [None]
        error = [None]
        finished = [False]
        
        def read_line():
            try:
                line = process.stdout.readline()
                result[0] = line
                finished[0] = True
            except Exception as e:
                error[0] = e
                finished[0] = True
                logger.warning(f'[MCP Client] Error reading from process: {e}')
        
        thread = threading.Thread(target=read_line)
        thread.daemon = True
        thread.start()
        
        # Wait with polling to allow for interruption
        while time.time() < deadline:
            if finished[0]:
                break
            time.sleep(0.1)  # Poll every 100ms
        
        if not finished[0]:
            logger.warning('[MCP Client] Read timeout - process may be hung', extra={
                'timeout': timeout,
                'thread_alive': thread.is_alive(),
            })
            return None
        
        if error[0]:
            logger.error(f'[MCP Client] Error during read: {error[0]}')
            return None
        
        return result[0]
    
    def execute_tool(self, tool_call: MCPToolCall) -> MCPToolCall:
        """
        Execute a single tool call via MCP server communication
        
        Args:
            tool_call: Tool call to execute
            
        Returns:
            Updated tool call with results
        """
        tool_name = tool_call.tool_name
        
        if tool_name not in self.tool_map:
            logger.error('[MCP Client] Tool not found', extra={
                'tool_name': tool_name,
                'available_tools': list(self.tool_map.keys()),
            })
            tool_call.status = 'error'
            tool_call.error = f'Tool "{tool_name}" not found'
            return tool_call
        
        tool_config = self.tool_map[tool_name]
        
        tool_call.status = 'running'
        tool_call.started_at = datetime.now().isoformat()
        
        logger.info('[MCP Client] Executing tool via MCP server', extra={
            'tool_name': tool_name,
            'parameters': tool_call.parameters,
            'command': tool_config['command'],
            'command_args': tool_config.get('args', []),
        })
        
        try:
            # Execute tool via MCP server using JSON-RPC over stdio
            tool_call.result = self._execute_mcp_tool_via_stdio(tool_config, tool_call.parameters)
            
            tool_call.status = 'success'
            tool_call.completed_at = datetime.now().isoformat()
            
            logger.info('[MCP Client] Tool execution successful', extra={
                'tool_name': tool_name,
                'result_preview': str(tool_call.result)[:200],
            })
            
        except Exception as e:
            tool_call.status = 'error'
            tool_call.error = str(e)
            tool_call.completed_at = datetime.now().isoformat()
            
            logger.error('[MCP Client] Tool execution failed', extra={
                'tool_name': tool_name,
                'error': str(e),
            }, exc_info=True)
        
        return tool_call
    
    def _execute_mcp_tool_via_stdio(self, tool_config: Dict[str, Any], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute MCP tool by communicating with the MCP server via JSON-RPC over stdio
        
        Args:
            tool_config: Tool configuration with command, args, and env
            parameters: Parameters to pass to the tool
            
        Returns:
            Tool execution result
        """
        command = tool_config.get('command', '')
        args = tool_config.get('args', [])
        env = tool_config.get('env', {})
        tool_name = tool_config.get('name', 'unknown')
        
        logger.info('[MCP Client] Starting MCP server communication', extra={
            'command': command,
            'command_args': args,
            'has_env': bool(env),
            'env_keys': list(env.keys()) if env else [],
            'tool_name': tool_name,
        })
        
        try:
            # Prepare environment variables
            import os
            import shutil
            process_env = os.environ.copy()
            process_env.update(env)
            
            # Debug: Log PATH to understand environment
            logger.debug('[MCP Client] Environment check', extra={
                'has_path': 'PATH' in process_env,
                'path_sample': process_env.get('PATH', '')[:200] if 'PATH' in process_env else 'N/A',
            })
            
            # Resolve command path (especially important on Windows)
            resolved_command = command
            if not os.path.isabs(command):
                # Try to find the command in PATH
                found_command = shutil.which(command, path=process_env.get('PATH'))
                if found_command:
                    resolved_command = found_command
                    logger.debug('[MCP Client] Resolved command path', extra={
                        'original': command,
                        'resolved': resolved_command,
                    })
                else:
                    # On Windows, also try with .cmd and .bat extensions
                    if os.name == 'nt':
                        for ext in ['.cmd', '.bat', '.exe']:
                            found_command = shutil.which(command + ext, path=process_env.get('PATH'))
                            if found_command:
                                resolved_command = found_command
                                logger.debug('[MCP Client] Resolved command with extension', extra={
                                    'original': command,
                                    'resolved': resolved_command,
                                    'extension': ext,
                                })
                                break
                    
                    # If still not found, log warning
                    if resolved_command == command:
                        logger.warning('[MCP Client] Command not found in PATH, will attempt to execute anyway', extra={
                            'command': command,
                            'path_dirs': process_env.get('PATH', '').split(os.pathsep)[:5],  # First 5 PATH dirs
                        })
            
            # Construct full command
            full_command = [resolved_command] + args
            
            logger.debug('[MCP Client] Launching MCP server process', extra={
                'full_command': ' '.join(full_command),
                'env_keys': list(env.keys()),
                'platform': os.name,
            })
            
            # Start MCP server process with shell=True on Windows for better compatibility
            use_shell = os.name == 'nt'  # Use shell on Windows
            
            process = subprocess.Popen(
                full_command if not use_shell else ' '.join(full_command),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=process_env,
                shell=use_shell
            )
            
            # Set timeout for each read operation (30 seconds)
            read_timeout = 300
            
            # Step 1: Send initialize request
            init_request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "EcritisAgent",
                        "version": "1.0.0"
                    }
                }
            }
            
            logger.debug('[MCP Client] Sending initialize request')
            request_bytes = (json.dumps(init_request) + '\n').encode('utf-8')
            process.stdin.write(request_bytes)
            process.stdin.flush()
            
            # Give server a moment to process (especially on first run when downloading)
            time.sleep(0.5)
            
            # Check if process is still alive
            if process.poll() is not None:
                stderr_output = process.stderr.read() if process.stderr else ''
                logger.error('[MCP Client] MCP server process died after initialize', extra={
                    'exit_code': process.poll(),
                    'stderr': stderr_output[:500],
                })
                raise Exception(f'MCP server process exited with code {process.poll()}. stderr: {stderr_output[:200]}')
            
            # Read initialize response with timeout
            init_response_bytes = self._read_line_with_timeout(process, read_timeout)
            if not init_response_bytes:
                # Try to read stderr to see if there were any errors
                stderr_output = ''
                try:
                    if process.stderr:
                        # Non-blocking read of stderr
                        stderr_bytes = process.stderr.read(1024)  # Read up to 1KB
                        if stderr_bytes:
                            stderr_output = stderr_bytes.decode('utf-8', errors='replace')
                except Exception as e:
                    logger.debug(f'[MCP Client] Could not read stderr: {e}')
                
                logger.error('[MCP Client] Timeout waiting for initialize response', extra={
                    'stderr_preview': stderr_output[:500] if stderr_output else 'no stderr output',
                    'process_poll': process.poll(),
                })
                raise Exception(f'Timeout waiting for initialize response from MCP server. stderr: {stderr_output[:200]}')
            
            init_response = init_response_bytes.decode('utf-8', errors='replace')
            logger.debug('[MCP Client] Received initialize response', extra={
                'response_preview': init_response[:200] if init_response else 'empty',
            })
            
            # Step 2: Send initialized notification
            initialized_notification = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }
            
            logger.debug('[MCP Client] Sending initialized notification')
            notification_bytes = (json.dumps(initialized_notification) + '\n').encode('utf-8')
            process.stdin.write(notification_bytes)
            process.stdin.flush()
            
            # Step 3: List available tools
            list_tools_request = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {}
            }
            
            logger.debug('[MCP Client] Requesting tools list')
            list_request_bytes = (json.dumps(list_tools_request) + '\n').encode('utf-8')
            process.stdin.write(list_request_bytes)
            process.stdin.flush()
            
            # Read tools list response with timeout
            tools_response_bytes = self._read_line_with_timeout(process, read_timeout)
            if not tools_response_bytes:
                raise Exception('Timeout waiting for tools list from MCP server')
            
            tools_response = tools_response_bytes.decode('utf-8', errors='replace')
            logger.debug('[MCP Client] Received tools list', extra={
                'response_preview': tools_response[:200] if tools_response else 'empty',
            })
            
            try:
                tools_data = json.loads(tools_response) if tools_response else {}
                available_tools = tools_data.get('result', {}).get('tools', [])
                logger.info('[MCP Client] Available tools from MCP server', extra={
                    'tool_count': len(available_tools),
                    'tool_names': [t.get('name') for t in available_tools],
                })
            except json.JSONDecodeError as e:
                logger.warning('[MCP Client] Failed to parse tools list', extra={'error': str(e)})
                available_tools = []
            
            # Step 4: Call the actual tool
            # For Tavily, the tool name is typically "search" or similar
            # We'll try to find the appropriate tool or use the first available one
            target_tool_name = None
            if available_tools:
                # Try to find a search-related tool
                for tool in available_tools:
                    tool_name_lower = tool.get('name', '').lower()
                    if 'search' in tool_name_lower or 'tavily' in tool_name_lower:
                        target_tool_name = tool.get('name')
                        break
                
                # If no search tool found, use the first available tool
                if not target_tool_name and available_tools:
                    target_tool_name = available_tools[0].get('name')
            
            if not target_tool_name:
                raise Exception('No tools available from MCP server')
            
            logger.info('[MCP Client] Calling tool', extra={
                'tool_name': target_tool_name,
                'parameters': parameters,
            })
            
            # Prepare tool call request
            tool_call_request = {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": target_tool_name,
                    "arguments": parameters
                }
            }
            
            tool_request_bytes = (json.dumps(tool_call_request) + '\n').encode('utf-8')
            process.stdin.write(tool_request_bytes)
            process.stdin.flush()
            
            # Read tool call response with timeout (may take longer for actual search)
            tool_response_bytes = self._read_line_with_timeout(process, read_timeout)
            if not tool_response_bytes:
                raise Exception('Timeout waiting for tool execution response from MCP server')
            
            tool_response = tool_response_bytes.decode('utf-8', errors='replace')
            logger.debug('[MCP Client] Received tool response', extra={
                'response_length': len(tool_response) if tool_response else 0,
                'response_preview': tool_response[:300] if tool_response else 'empty',
            })
            
            # Parse tool response
            try:
                response_data = json.loads(tool_response) if tool_response else {}
                
                # Check for JSON-RPC error
                if 'error' in response_data:
                    error_info = response_data['error']
                    raise Exception(f"MCP server error: {error_info.get('message', 'Unknown error')}")
                
                # Extract result
                result = response_data.get('result', {})
                
                logger.info('[MCP Client] Tool execution successful', extra={
                    'has_result': bool(result),
                    'result_keys': list(result.keys()) if isinstance(result, dict) else 'not a dict',
                })
                
                # Return the result in a standardized format
                return {
                    'success': True,
                    'data': result,
                    'raw_response': response_data,
                }
                
            except json.JSONDecodeError as e:
                logger.error('[MCP Client] Failed to parse tool response', extra={
                    'error': str(e),
                    'raw_response': tool_response[:500] if tool_response else 'empty',
                })
                raise Exception(f'Failed to parse tool response: {str(e)}')
            
        except FileNotFoundError as e:
            error_msg = f'Command "{command}" not found. '
            if command.lower() in ['npx', 'npm', 'node']:
                error_msg += 'Please ensure Node.js and npm are installed and added to your system PATH. '
                error_msg += 'You may need to restart the application after installing Node.js.'
            
            logger.error('[MCP Client] MCP server command not found', extra={
                'original_command': command,
                'resolved_command': resolved_command if 'resolved_command' in locals() else 'not resolved',
                'full_command_attempted': ' '.join(full_command) if 'full_command' in locals() else 'not constructed',
                'error': str(e),
                'suggestion': error_msg,
            }, exc_info=True)
            raise Exception(error_msg) from e
            
        except Exception as e:
            logger.error('[MCP Client] MCP tool execution failed', extra={
                'error': str(e),
                'error_type': type(e).__name__,
            }, exc_info=True)
            raise
        
        finally:
            # Clean up process
            try:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=2)
            except Exception as e:
                logger.warning('[MCP Client] Error cleaning up MCP process', extra={
                    'error': str(e),
                })
            
            logger.debug('[MCP Client] MCP server process cleaned up')


def analyze_user_query_for_tools(
    user_message: str,
    tool_descriptions: List[Dict[str, Any]],
    llm_client,
) -> Optional[List[Dict[str, Any]]]:
    """
    Analyze user query using LLM to determine if MCP tools should be called
    
    Args:
        user_message: User's message
        tool_descriptions: List of available tool descriptions with metadata
        llm_client: LLM client for analysis (ChatOpenAI instance or similar)
        
    Returns:
        List of tool calls to make, or None if no tools needed
    """
    logger.info('[MCP Tool Analysis] Starting LLM-based tool analysis', extra={
        'message_preview': user_message[:100],
        'tool_count': len(tool_descriptions),
        'tools': [t['name'] for t in tool_descriptions],
    })
    
    if not tool_descriptions:
        logger.info('[MCP Tool Analysis] No tools available, skipping analysis')
        return None
    
    # Format tool descriptions for LLM
    tool_info = []
    for tool in tool_descriptions:
        tool_info.append(f"""
Tool: {tool['name']}
Description: {tool['description']}
Parameters: {json.dumps(tool['parameters'], indent=2)}
""")
    
    tools_text = "\n".join(tool_info)
    
    # Create a comprehensive prompt for the LLM to analyze if tools are needed
    tool_analysis_prompt = f"""You are an AI assistant with access to external tools. Your task is to analyze the user's query and determine if any tools should be called to provide an accurate, helpful response.

AVAILABLE TOOLS:
{tools_text}

USER QUERY: {user_message}

INSTRUCTIONS:
1. Analyze if the user's query requires external data, current information, web search, or real-time information
2. If you can answer confidently from your training data without external tools, no tools are needed
3. If the query requires current events, recent news, real-time data, or information you're unsure about, use the appropriate tool
4. Select the most appropriate tool based on the query type

Respond with ONLY a valid JSON object in this exact format:
{{
  "needs_tools": true or false,
  "reasoning": "Brief explanation of why tools are or aren't needed",
  "tool_calls": [
    {{
      "tool_name": "exact-tool-name-from-available-tools",
      "parameters": {{"query": "specific search query or input"}}
    }}
  ]
}}

If no tools are needed, set "needs_tools" to false and "tool_calls" to an empty array [].
IMPORTANT: Return ONLY the JSON object, no additional text before or after."""

    try:
        if llm_client is None:
            logger.warning('[MCP Tool Analysis] No LLM client provided, using fallback heuristic')
            # Fallback to simple heuristic if no LLM client
            return _fallback_tool_analysis(user_message, tool_descriptions)
        
        # Import LangChain message types
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
        except ImportError:
            logger.warning('[MCP Tool Analysis] LangChain not available, using fallback heuristic')
            return _fallback_tool_analysis(user_message, tool_descriptions)
        
        logger.debug('[MCP Tool Analysis] Calling LLM for tool selection', extra={
            'prompt_length': len(tool_analysis_prompt),
            'model': getattr(llm_client, 'model_name', 'unknown'),
        })
        
        # Call LLM for analysis
        messages = [
            SystemMessage(content="You are a tool selection assistant. Analyze queries and decide which tools to use. Always respond with valid JSON only."),
            HumanMessage(content=tool_analysis_prompt)
        ]
        
        response = llm_client.invoke(messages)
        response_content = response.content if hasattr(response, 'content') else str(response)
        
        logger.debug('[MCP Tool Analysis] Received LLM response', extra={
            'response_length': len(response_content),
            'response_preview': response_content[:200],
        })
        
        # Parse JSON response
        # Handle potential markdown code blocks
        json_str = response_content.strip()
        if json_str.startswith('```'):
            # Remove markdown code block markers
            lines = json_str.split('\n')
            json_str = '\n'.join(lines[1:-1]) if len(lines) > 2 else json_str
            json_str = json_str.replace('```json', '').replace('```', '').strip()
        
        analysis_result = json.loads(json_str)
        
        logger.info('[MCP Tool Analysis] LLM analysis completed', extra={
            'needs_tools': analysis_result.get('needs_tools', False),
            'reasoning': analysis_result.get('reasoning', ''),
            'tool_count': len(analysis_result.get('tool_calls', [])),
        })
        
        if analysis_result.get('needs_tools') and analysis_result.get('tool_calls'):
            tool_calls = analysis_result['tool_calls']
            logger.info('[MCP Tool Analysis] Tools selected by LLM', extra={
                'tool_calls': tool_calls,
            })
            return tool_calls
        else:
            logger.info('[MCP Tool Analysis] LLM determined no tools needed', extra={
                'reasoning': analysis_result.get('reasoning', 'No reason provided')
            })
            return None
            
    except json.JSONDecodeError as e:
        logger.error('[MCP Tool Analysis] Failed to parse LLM response as JSON', extra={
            'error': str(e),
            'response_preview': response_content[:500] if 'response_content' in locals() else 'N/A',
        }, exc_info=True)
        # Fallback to heuristic
        logger.info('[MCP Tool Analysis] Falling back to heuristic analysis')
        return _fallback_tool_analysis(user_message, tool_descriptions)
        
    except Exception as e:
        logger.error('[MCP Tool Analysis] Failed to analyze query with LLM', extra={
            'error': str(e),
            'error_type': type(e).__name__,
        }, exc_info=True)
        # Fallback to heuristic
        logger.info('[MCP Tool Analysis] Falling back to heuristic analysis')
        return _fallback_tool_analysis(user_message, tool_descriptions)


def _fallback_tool_analysis(
    user_message: str,
    tool_descriptions: List[Dict[str, Any]]
) -> Optional[List[Dict[str, Any]]]:
    """
    Fallback heuristic-based tool analysis when LLM is unavailable
    
    Args:
        user_message: User's message
        tool_descriptions: List of available tool descriptions
        
    Returns:
        List of tool calls to make, or None if no tools needed
    """
    logger.debug('[MCP Tool Analysis] Using fallback heuristic method')
    
    # Keywords that suggest need for external search
    search_keywords = [
        'latest', 'current', 'news', 'search', 'find', 'what is', 'who is',
        'when did', 'where is', 'how to', 'recent', 'today', 'now',
        'yesterday', 'this week', 'this month', 'update', 'new',
    ]
    
    needs_search = any(keyword in user_message.lower() for keyword in search_keywords)
    
    if needs_search and tool_descriptions:
        # Prefer search tools (tavily, baidu, etc.)
        search_tool = next(
            (t for t in tool_descriptions if 'search' in t['name'].lower() or 'tavily' in t['name'].lower()),
            tool_descriptions[0]  # Use first available tool if no search tool found
        )
        
        tool_calls = [
            {
                'tool_name': search_tool['name'],
                'parameters': {
                    'query': user_message,
                }
            }
        ]
        
        logger.info('[MCP Tool Analysis] Fallback heuristic selected tools', extra={
            'tool_calls': tool_calls,
        })
        
        return tool_calls
    else:
        logger.info('[MCP Tool Analysis] Fallback heuristic - no tools needed')
        return None


def format_tool_results_for_llm(tool_calls: List[MCPToolCall]) -> str:
    """
    Format tool execution results for inclusion in LLM prompt
    
    Args:
        tool_calls: List of executed tool calls
        
    Returns:
        Formatted string for LLM context
    """
    if not tool_calls:
        return ""
    
    results_text = "\n\n===EXTERNAL TOOL SEARCH RESULTS===\n"
    results_text += "The following information was retrieved from external sources to answer the user's query.\n"
    results_text += "Please synthesize this information into a comprehensive, accurate response.\n\n"
    
    for i, tool_call in enumerate(tool_calls, 1):
        results_text += f"\n--- Tool {i}: {tool_call.tool_name} ---\n"
        results_text += f"Query Parameters: {json.dumps(tool_call.parameters, ensure_ascii=False)}\n"
        results_text += f"Execution Status: {tool_call.status}\n\n"
        
        if tool_call.status == 'success' and tool_call.result:
            result_data = tool_call.result
            
            # Extract and format the actual search results
            if isinstance(result_data, dict):
                # Handle MCP response format
                if 'data' in result_data:
                    actual_data = result_data['data']
                    
                    # Check if it's a Tavily-style response with content
                    if isinstance(actual_data, dict) and 'content' in actual_data:
                        content_items = actual_data['content']
                        if isinstance(content_items, list) and content_items:
                            results_text += "Search Results:\n"
                            for idx, item in enumerate(content_items, 1):
                                if isinstance(item, dict):
                                    item_type = item.get('type', 'unknown')
                                    if item_type == 'text':
                                        results_text += f"\n{item.get('text', '')}\n"
                                    else:
                                        results_text += f"\nResult {idx}: {json.dumps(item, ensure_ascii=False, indent=2)}\n"
                        else:
                            results_text += f"Data: {json.dumps(actual_data, ensure_ascii=False, indent=2)}\n"
                    else:
                        results_text += f"Retrieved Data:\n{json.dumps(actual_data, ensure_ascii=False, indent=2)}\n"
                else:
                    # Handle direct result format
                    results_text += f"Result Data:\n{json.dumps(result_data, ensure_ascii=False, indent=2)}\n"
            else:
                results_text += f"Result: {str(result_data)}\n"
                
        elif tool_call.status == 'error':
            results_text += f"Error: {tool_call.error}\n"
            results_text += "Note: This tool call failed. Please inform the user that you couldn't retrieve external information.\n"
    
    results_text += "\n===END OF SEARCH RESULTS===\n\n"
    results_text += "IMPORTANT INSTRUCTIONS:\n"
    results_text += "1. Synthesize the above search results into a clear, comprehensive answer\n"
    results_text += "2. Extract key facts and information from the search results\n"
    results_text += "3. Present the information in a well-structured, easy-to-understand format\n"
    results_text += "4. If sources/URLs are available in the results, include them as references\n"
    results_text += "5. Answer in the user's language (the language of their original question)\n\n"
    
    logger.debug('[MCP Results] Formatted tool results for LLM', extra={
        'tool_count': len(tool_calls),
        'results_length': len(results_text),
    })
    
    return results_text

