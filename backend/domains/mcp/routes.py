"""
MCP Domain Routes
Handles MCP server configuration management
"""

import os
import sys
import json
import logging
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

# Create blueprint for MCP domain
mcp_bp = Blueprint('mcp', __name__, url_prefix='/api')


def _get_mcp_config_path():
    """
    Determine MCP configuration file path based on environment
    Returns the path to mcp-configs.json
    """
    electron_user_data = os.environ.get('ELECTRON_USER_DATA')
    
    if electron_user_data:
        # Running in Electron - use the userData path provided by Electron
        config_dir = Path(electron_user_data)
        logger.debug('[MCP Domain] Using Electron userData path for MCP configs', extra={
            'path': str(config_dir)
        })
    elif getattr(sys, 'frozen', False):
        # Running as packaged executable (non-Electron)
        if sys.platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
        else:
            config_dir = Path.home() / '.config' / 'EcritisAgent'
        logger.debug('[MCP Domain] Using packaged app config path for MCP configs', extra={
            'path': str(config_dir)
        })
    else:
        # Running in development
        config_dir = Path(__file__).parent.parent.parent / 'userData'
        logger.debug('[MCP Domain] Using development config path for MCP configs', extra={
            'path': str(config_dir)
        })
    
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / 'mcp-configs.json'


@mcp_bp.route('/mcp-configs', methods=['GET', 'POST'])
def mcp_configs():
    """
    Manage MCP (Model Context Protocol) server configurations with persistent storage
    GET: Retrieve all MCP configurations
    POST: Save MCP configurations
    """
    if request.method == 'GET':
        logger.info('[MCP Domain] MCP configurations retrieval requested')
        
        try:
            config_path = _get_mcp_config_path()
            
            # Check if file exists
            if not config_path.exists():
                logger.info('[MCP Domain] MCP config file does not exist, creating default configuration')
                
                # Create default MCP configuration
                current_time = datetime.now().isoformat()
                default_config = {
                    'mcpServers': [
                        {
                            'id': f'mcp_{datetime.now().timestamp()}',
                            'name': 'tavily-ai-tavily-mcp',
                            'command': 'npx',
                            'args': ['-y', 'tavily-mcp@latest'],
                            'env': {
                                # Example: 'TAVILY_API_KEY': 'your-api-key-here'
                            },
                            'isEnabled': False,
                            'createdAt': current_time,
                            'updatedAt': current_time
                        },
                        {
                            'id': f'mcp_{datetime.now().timestamp() + 1}',
                            'name': 'caiyili-baidu-search-mcp',
                            'command': 'npx',
                            'args': ['baidu-search-mcp', '--max-result=5', '--fetch-content-count=2', '--max-content-length=2000'],
                            'env': {},
                            'isEnabled': False,
                            'createdAt': current_time,
                            'updatedAt': current_time
                        }
                    ]
                }
                
                # Save default configuration
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, indent=2, ensure_ascii=False)
                
                logger.info('[MCP Domain] Default MCP configuration created successfully', extra={
                    'count': len(default_config['mcpServers']),
                    'path': str(config_path)
                })
                
                return jsonify({
                    'success': True,
                    'data': default_config,
                    'count': len(default_config['mcpServers']),
                    'configPath': str(config_path)
                })
            
            # Load existing configuration
            with open(config_path, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            # CRITICAL: Force all MCP servers to be disabled on load
            # This ensures MCP functionality is always closed by default when entering the software
            enabled_mcps = [mcp for mcp in configs.get('mcpServers', []) if mcp.get('isEnabled', False)]
            
            if enabled_mcps:
                logger.info('[MCP Domain] Disabling all enabled MCP servers on load (default closed state)', extra={
                    'enabled_count': len(enabled_mcps),
                    'enabled_mcp_names': [mcp.get('name', 'unknown') for mcp in enabled_mcps]
                })
                
                # Force all MCPs to be disabled
                current_time = datetime.now().isoformat()
                for mcp in configs.get('mcpServers', []):
                    if mcp.get('isEnabled', False):
                        mcp['isEnabled'] = False
                        mcp['updatedAt'] = current_time
                
                # Save the updated configuration to ensure persistence
                logger.debug('[MCP Domain] Saving MCP configurations with all servers disabled', extra={
                    'total_count': len(configs.get('mcpServers', []))
                })
                
                try:
                    with open(config_path, 'w', encoding='utf-8') as f:
                        json.dump(configs, f, indent=2, ensure_ascii=False)
                    logger.info('[MCP Domain] MCP configurations saved with all servers disabled', extra={
                        'total_count': len(configs.get('mcpServers', []))
                    })
                except Exception as save_error:
                    logger.warning(f'[MCP Domain] Failed to save MCP configurations after disabling servers: {str(save_error)}')
            else:
                logger.debug('[MCP Domain] All MCP servers are already disabled, no action needed', extra={
                    'total_count': len(configs.get('mcpServers', []))
                })
            
            logger.info(f'[MCP Domain] Returning {len(configs.get("mcpServers", []))} MCP configurations (all disabled)', extra={
                'total_count': len(configs.get('mcpServers', [])),
                'all_disabled': True
            })
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('mcpServers', [])),
                'configPath': str(config_path)
            })
        
        except Exception as e:
            logger.error(f'[MCP Domain] Failed to retrieve MCP configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve MCP configurations',
                'details': str(e)
            }), 500
    
    # POST request - save MCP configurations
    logger.info('[MCP Domain] MCP configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            logger.warning('[MCP Domain] No data provided in MCP config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'mcpServers' not in data:
            logger.warning('[MCP Domain] mcpServers array missing in request data')
            return jsonify({
                'success': False,
                'error': 'mcpServers array is required'
            }), 400
        
        mcpServers = data.get('mcpServers', [])
        logger.debug(f'[MCP Domain] Saving {len(mcpServers)} MCP configurations')
        
        # Validate each MCP configuration
        for idx, mcp in enumerate(mcpServers):
            required_fields = ['id', 'name', 'command', 'args']
            missing_fields = [field for field in required_fields if field not in mcp or (field != 'args' and not mcp[field])]
            
            if missing_fields:
                logger.warning(f'[MCP Domain] MCP at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'MCP at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            if not isinstance(mcp['args'], list):
                logger.warning(f'[MCP Domain] MCP at index {idx} has invalid args (must be array)')
                return jsonify({
                    'success': False,
                    'error': f'MCP at index {idx} has invalid args (must be array)'
                }), 400
            
            # Log environment variables if present
            env_var_count = len(mcp.get('env', {})) if isinstance(mcp.get('env'), dict) else 0
            logger.debug(f'[MCP Domain] MCP {idx}: {mcp.get("name")} (command: {mcp.get("command")}, env vars: {env_var_count})')
        
        # Add timestamps if not present
        current_time = datetime.now().isoformat()
        for mcp in mcpServers:
            if 'updatedAt' not in mcp:
                mcp['updatedAt'] = current_time
            if 'createdAt' not in mcp:
                mcp['createdAt'] = current_time
        
        # Get configuration file path
        config_path = _get_mcp_config_path()
        
        # Save to file
        config_data = {
            'mcpServers': mcpServers
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f'[MCP Domain] MCP configurations saved successfully: {len(mcpServers)} servers', extra={
            'count': len(mcpServers),
            'path': str(config_path)
        })
        
        return jsonify({
            'success': True,
            'message': 'MCP configurations saved successfully',
            'count': len(mcpServers),
            'configPath': str(config_path)
        })
    
    except Exception as e:
        logger.error(f'[MCP Domain] Failed to save MCP configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save MCP configurations',
            'details': str(e)
        }), 500

