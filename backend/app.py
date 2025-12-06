"""
Flask Backend for EcritisAgent
Handles all LLM API calls with comprehensive logging and error handling
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime
from flask import Flask, request, Response, jsonify, stream_with_context
from flask_cors import CORS
from pathlib import Path
from logging.handlers import RotatingFileHandler

# Ensure backend directory is in Python path for module imports
# This is critical for both development and packaged (Electron) modes
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
    print(f"[Python Path] Added backend directory to sys.path: {backend_dir}")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Register domain blueprints (DDD architecture)
# Import domain routes
try:
    from domains.chat.routes import chat_bp
    from domains.document.routes import document_bp
    from domains.agent.routes import agent_bp
    from domains.model.routes import model_bp
    from domains.mcp.routes import mcp_bp
    from domains.image_service.routes import image_service_bp
    from domains.search_service.routes import search_service_bp
    from domains.system.routes import system_bp
    
    # Register all domain blueprints
    app.register_blueprint(chat_bp)
    app.register_blueprint(document_bp)
    app.register_blueprint(agent_bp)
    app.register_blueprint(model_bp)
    app.register_blueprint(mcp_bp)
    app.register_blueprint(image_service_bp)
    app.register_blueprint(search_service_bp)
    app.register_blueprint(system_bp)
    
    print("[Domain Registration] All domain blueprints registered successfully")
except ImportError as e:
    print(f"[Domain Registration] Warning: Failed to import domain blueprints: {e}")
    print("[Domain Registration] Continuing with legacy routes from app.py")

# Configure logging
def setup_logging():
    """
    Setup comprehensive logging with file rotation and proper formatting
    Supports multiple log levels: DEBUG, INFO, WARNING, ERROR
    """
    # Determine log directory
    if getattr(sys, 'frozen', False):
        # Running as packaged executable
        if sys.platform == 'win32':
            log_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent' / 'logs'
        else:
            log_dir = Path.home() / '.config' / 'EcritisAgent' / 'logs'
    else:
        # Running in development
        log_dir = Path(__file__).parent / 'logs'
    
    # Create log directory if it doesn't exist
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Configure log file with rotation (max 10MB per file, keep 5 backups)
    log_file = log_dir / 'flask_backend.log'
    
    # Create formatter with detailed information
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # File handler with rotation
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    
    # Console handler for stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)  # Set to DEBUG to see all log levels in console
    console_handler.setFormatter(formatter)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Configure Flask app logger
    app.logger.setLevel(logging.DEBUG)
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
    
    app.logger.info('=' * 80)
    app.logger.info('Flask Backend Logging Initialized')
    app.logger.info(f'Log file location: {log_file}')
    app.logger.info(f'Console log level: DEBUG')
    app.logger.info(f'File log level: DEBUG')
    app.logger.info('=' * 80)
    
    return log_file

# Initialize logging
log_file_path = setup_logging()

# Configuration loader
class ConfigLoader:
    """
    Loads LLM configuration from file system
    Supports both packaged and development modes
    """
    
    def __init__(self):
        self.config_file = 'model-configs.json'
        self.config_path = self._get_config_path()
        app.logger.info(f'ConfigLoader initialized with path: {self.config_path}')
        
        # Initialize default model configuration if file doesn't exist
        self._ensure_default_config()
    
    def _get_config_path(self):
        """Determine configuration file path based on environment"""
        # CRITICAL FIX: Check for ELECTRON_USER_DATA environment variable first
        # This ensures Flask backend reads from the same location as Electron main process
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        
        if electron_user_data:
            # Running in Electron - use the userData path provided by Electron
            config_dir = Path(electron_user_data)
            app.logger.info(f'Using Electron userData path for model configs: {config_dir}', extra={
                'source': 'ELECTRON_USER_DATA environment variable',
                'path': str(config_dir)
            })
        elif getattr(sys, 'frozen', False):
            # Running as packaged executable (non-Electron)
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
            app.logger.info(f'Using packaged app config path: {config_dir}', extra={
                'source': 'APPDATA or home directory',
                'path': str(config_dir)
            })
        else:
            # Running in development - look in parent directory
            config_dir = Path(__file__).parent.parent / 'userData'
            app.logger.info(f'Using development config path: {config_dir}', extra={
                'source': 'Development mode',
                'path': str(config_dir)
            })
        
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / self.config_file
    
    def _ensure_default_config(self):
        """Ensure default model configuration exists on first run"""
        try:
            if not self.config_path.exists():
                app.logger.info('Model config file does not exist, creating default configuration')
                
                # Get current UTC timestamp
                from datetime import timezone
                current_time = datetime.now(timezone.utc)
                
                # Create IDs for two default models
                qwen_model_id = f'model_{current_time.timestamp()}'
                deepseek_model_id = f'model_{current_time.timestamp() + 1}'
                
                # Create default model configuration with two models
                default_config = {
                    'models': [
                        {
                            'id': qwen_model_id,
                            'name': 'Qwen Max',
                            'apiUrl': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                            'apiKey': 'sk-a5f209d824d54b6883fbc397f9fb4e28',
                            'modelName': 'qwen-max-latest',
                            'isDefault': True,
                            'isEnabled': True,
                            'createdAt': current_time.isoformat(),
                            'updatedAt': current_time.isoformat()
                        },
                        {
                            'id': deepseek_model_id,
                            'name': 'DeepSeek V3',
                            'apiUrl': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                            'apiKey': 'sk-a5f209d824d54b6883fbc397f9fb4e28',
                            'modelName': 'deepseek-v3',
                            'isDefault': False,
                            'isEnabled': True,
                            'createdAt': current_time.isoformat(),
                            'updatedAt': current_time.isoformat()
                        }
                    ],
                    'defaultModelId': qwen_model_id
                }
                
                # Save default configuration
                with open(self.config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, indent=2, ensure_ascii=False)
                
                app.logger.info('Default model configuration created successfully', extra={
                    'models': ['qwen-max-latest', 'deepseek-v3'],
                    'defaultModel': 'qwen-max-latest',
                    'apiUrl': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    'path': str(self.config_path)
                })
            else:
                app.logger.debug('Model config file already exists, skipping default initialization')
        
        except Exception as e:
            app.logger.error(f'Failed to create default model configuration: {str(e)}', exc_info=True)
    
    def load_model_configs(self):
        """Load model configurations from file"""
        app.logger.debug(f'Loading model configs from: {self.config_path}')
        
        try:
            if not self.config_path.exists():
                app.logger.info('Model config file does not exist, returning empty config')
                return {'models': []}
            
            with open(self.config_path, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            app.logger.info(f'Model configurations loaded successfully, count: {len(configs.get("models", []))}')
            return configs
        
        except Exception as e:
            app.logger.error(f'Failed to load model configurations: {str(e)}', exc_info=True)
            return {'models': []}
    
    def get_default_model(self):
        """Get default enabled model from configurations"""
        app.logger.debug('Getting default model configuration')
        
        configs = self.load_model_configs()
        models = configs.get('models', [])
        
        if not models:
            app.logger.warning('No models configured')
            return None
        
        # Find default enabled model
        default_model = next(
            (m for m in models if m.get('isDefault') and m.get('isEnabled', True)),
            None
        )
        
        if default_model:
            app.logger.info(f'Found default model: {default_model.get("name")} ({default_model.get("modelName")})')
            return default_model
        
        # Fallback to first enabled model
        first_enabled = next(
            (m for m in models if m.get('isEnabled', True)),
            None
        )
        
        if first_enabled:
            app.logger.info(f'Using first enabled model as fallback: {first_enabled.get("name")}')
            return first_enabled
        
        app.logger.warning('No enabled models found')
        return None
    
    def get_model_by_id(self, model_id):
        """Get model by ID from configurations"""
        app.logger.info(f'[ModelSelection] Getting model by ID: {model_id}', extra={
            'requestedModelId': model_id,
            'configPath': str(self.config_path)
        })
        
        configs = self.load_model_configs()
        models = configs.get('models', [])
        
        app.logger.info(f'[ModelSelection] Loaded {len(models)} models from config file', extra={
            'totalModels': len(models),
            'availableModelIds': [m.get('id') for m in models],
            'availableModelNames': [m.get('name') for m in models],
            'configPath': str(self.config_path)
        })
        
        if not models:
            app.logger.warning('[ModelSelection] No models configured in config file')
            return None
        
        # Find model by ID
        model = next(
            (m for m in models if m.get('id') == model_id),
            None
        )
        
        if model:
            if not model.get('isEnabled', True):
                app.logger.warning(f'[ModelSelection] Model {model_id} is disabled', extra={
                    'modelId': model_id,
                    'modelName': model.get('name'),
                    'isEnabled': model.get('isEnabled')
                })
                return None
            app.logger.info(f'[ModelSelection] Successfully found and selected model by ID', extra={
                'modelId': model_id,
                'modelName': model.get('name'),
                'displayName': model.get('name'),
                'modelApiName': model.get('modelName'),
                'apiUrl': model.get('apiUrl'),
                'isEnabled': model.get('isEnabled')
            })
            return model
        
        app.logger.warning(f'[ModelSelection] Model with ID {model_id} not found in config', extra={
            'requestedModelId': model_id,
            'availableModelIds': [m.get('id') for m in models],
            'totalModelsInConfig': len(models)
        })
        return None
    
    def get_llm_config(self, model_id=None):
        """
        Get LLM configuration for API calls
        Uses user-configured models from persistent storage
        No longer depends on environment variables
        
        Args:
            model_id: Optional model ID to use specific model. If None, uses default model.
        """
        if model_id:
            app.logger.info(f'[ModelSelection] Getting LLM configuration for specific model: {model_id}', extra={
                'requestedModelId': model_id,
                'source': 'User Selection',
                'configPath': str(self.config_path)
            })
        else:
            app.logger.info('[ModelSelection] Getting LLM configuration from default model', extra={
                'source': 'Default Model',
                'configPath': str(self.config_path)
            })
        
        try:
            # Get model from user configuration or persistent storage
            if model_id:
                selected_model = self.get_model_by_id(model_id)
                if not selected_model:
                    app.logger.warning(f'[ModelSelection] Specified model {model_id} not found, falling back to default', extra={
                        'requestedModelId': model_id,
                        'fallbackReason': 'Model not found or disabled',
                        'configPath': str(self.config_path)
                    })
                    selected_model = self.get_default_model()
                    if selected_model:
                        app.logger.info(f'[ModelSelection] Using default model as fallback: {selected_model.get("name")} ({selected_model.get("modelName")})', extra={
                            'fallbackModelId': selected_model.get('id'),
                            'fallbackModelName': selected_model.get('name'),
                            'fallbackModelApiName': selected_model.get('modelName')
                        })
            else:
                selected_model = self.get_default_model()
            
            if selected_model:
                config = {
                    'apiKey': selected_model.get('apiKey', ''),
                    'apiUrl': selected_model.get('apiUrl', ''),
                    'modelName': selected_model.get('modelName', ''),
                    'timeout': 120  # 120 seconds timeout
                }
                
                app.logger.info(f'Using model: {config["modelName"]} at {config["apiUrl"]}', extra={
                    'source': 'User Settings',
                    'modelId': selected_model.get('id'),
                    'modelDisplayName': selected_model.get('name'),
                    'modelName': config['modelName'],
                    'apiUrl': config['apiUrl'],
                    'hasApiKey': bool(config['apiKey']),
                    'wasRequested': model_id is not None,
                    'requestedModelId': model_id
                })
                return config
            
            # No model configured - return None to trigger error
            app.logger.error('No LLM model configured in user settings', extra={
                'source': 'User Settings',
                'suggestion': 'Please configure a model in Settings dialog'
            })
            return None
        
        except Exception as e:
            app.logger.error(f'Error loading LLM configuration: {str(e)}', exc_info=True)
            return None
    
    def validate_llm_config(self, config):
        """Validate LLM configuration"""
        if not config.get('apiKey'):
            app.logger.error('LLM API key is missing')
            return {'valid': False, 'error': 'LLM API key is not configured'}
        
        if not config.get('apiUrl'):
            app.logger.error('LLM API URL is missing')
            return {'valid': False, 'error': 'LLM API URL is not configured'}
        
        if not config.get('modelName'):
            app.logger.error('LLM model name is missing')
            return {'valid': False, 'error': 'LLM model name is not configured'}
        
        return {'valid': True}

# Initialize config loader
config_loader = ConfigLoader()

# Store config_loader in app.config for domain routes to access
app.config['config_loader'] = config_loader

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    app.logger.debug('Health check requested')
    return jsonify({
        'status': 'ok',
        'service': 'EcritisAgent Flask Backend',
        'timestamp': datetime.utcnow().isoformat(),
        'log_file': str(log_file_path)
    })

# Chat completion endpoint - migrated to domains/chat/routes.py
# Document validation endpoint - migrated to domains/document/routes.py

# Get log file content endpoint
@app.route('/api/logs', methods=['GET'])
def get_logs():
    """
    Return recent log file content
    Useful for debugging and monitoring
    """
    app.logger.debug('Log file content requested')
    
    try:
        lines = request.args.get('lines', 100, type=int)
        
        if not log_file_path.exists():
            app.logger.warning('Log file does not exist')
            return jsonify({
                'error': 'Log file not found',
                'path': str(log_file_path)
            }), 404
        
        # Read last N lines from log file
        with open(log_file_path, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        app.logger.info(f'Returning {len(recent_lines)} log lines')
        
        return jsonify({
            'log_file': str(log_file_path),
            'total_lines': len(all_lines),
            'returned_lines': len(recent_lines),
            'content': ''.join(recent_lines)
        })
    
    except Exception as e:
        app.logger.error(f'Failed to read log file: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to read log file',
            'details': str(e)
        }), 500

# Model configuration endpoints - migrated to domains/model/routes.py
# Agent-based document validation endpoint - migrated to domains/agent/routes.py
# Agent list endpoint - migrated to domains/agent/routes.py
# Agent routing endpoint - migrated to domains/agent/routes.py


# MCP configuration endpoints
@app.route('/api/mcp-configs', methods=['GET', 'POST'])
def mcp_configs():
    """
    Manage MCP (Model Context Protocol) server configurations with persistent storage
    GET: Retrieve all MCP configurations
    POST: Save MCP configurations
    """
    if request.method == 'GET':
        app.logger.info('MCP configurations retrieval requested')
        
        try:
            # Determine configuration file path
            # Use same config path logic as model configs
            electron_user_data = os.environ.get('ELECTRON_USER_DATA')
            
            if electron_user_data:
                # Running in Electron - use the userData path provided by Electron
                config_dir = Path(electron_user_data)
                app.logger.debug(f'Using Electron userData path for MCP configs: {config_dir}')
            elif getattr(sys, 'frozen', False):
                # Running as packaged executable (non-Electron)
                if sys.platform == 'win32':
                    config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
                else:
                    config_dir = Path.home() / '.config' / 'EcritisAgent'
            else:
                # Running in development
                config_dir = Path(__file__).parent.parent / 'userData'
            
            config_dir.mkdir(parents=True, exist_ok=True)
            config_path = config_dir / 'mcp-configs.json'
            
            # Check if file exists
            if not config_path.exists():
                app.logger.info('MCP config file does not exist, creating default configuration')
                
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
                
                app.logger.info('Default MCP configuration created successfully', extra={
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
                app.logger.info('Disabling all enabled MCP servers on load (default closed state)', extra={
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
                app.logger.debug('Saving MCP configurations with all servers disabled', extra={
                    'total_count': len(configs.get('mcpServers', []))
                })
                
                try:
                    with open(config_path, 'w', encoding='utf-8') as f:
                        json.dump(configs, f, indent=2, ensure_ascii=False)
                    app.logger.info('MCP configurations saved with all servers disabled', extra={
                        'total_count': len(configs.get('mcpServers', []))
                    })
                except Exception as save_error:
                    app.logger.warning(f'Failed to save MCP configurations after disabling servers: {str(save_error)}')
            else:
                app.logger.debug('All MCP servers are already disabled, no action needed', extra={
                    'total_count': len(configs.get('mcpServers', []))
                })
            
            app.logger.info(f'Returning {len(configs.get("mcpServers", []))} MCP configurations (all disabled)', extra={
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
            app.logger.error(f'Failed to retrieve MCP configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve MCP configurations',
                'details': str(e)
            }), 500
    
    # POST request - save MCP configurations
    app.logger.info('MCP configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            app.logger.warning('No data provided in MCP config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'mcpServers' not in data:
            app.logger.warning('mcpServers array missing in request data')
            return jsonify({
                'success': False,
                'error': 'mcpServers array is required'
            }), 400
        
        mcpServers = data.get('mcpServers', [])
        app.logger.debug(f'Saving {len(mcpServers)} MCP configurations')
        
        # Validate each MCP configuration
        for idx, mcp in enumerate(mcpServers):
            required_fields = ['id', 'name', 'command', 'args']
            missing_fields = [field for field in required_fields if field not in mcp or (field != 'args' and not mcp[field])]
            
            if missing_fields:
                app.logger.warning(f'MCP at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'MCP at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            if not isinstance(mcp['args'], list):
                app.logger.warning(f'MCP at index {idx} has invalid args (must be array)')
                return jsonify({
                    'success': False,
                    'error': f'MCP at index {idx} has invalid args (must be array)'
                }), 400
            
            # Log environment variables if present
            env_var_count = len(mcp.get('env', {})) if isinstance(mcp.get('env'), dict) else 0
            app.logger.debug(f'MCP {idx}: {mcp.get("name")} (command: {mcp.get("command")}, env vars: {env_var_count})')
        
        # Add timestamps if not present
        current_time = datetime.now().isoformat()
        for mcp in mcpServers:
            if 'updatedAt' not in mcp:
                mcp['updatedAt'] = current_time
            if 'createdAt' not in mcp:
                mcp['createdAt'] = current_time
        
        # Determine configuration file path
        # Use same config path logic as model configs
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        
        if electron_user_data:
            # Running in Electron - use the userData path provided by Electron
            config_dir = Path(electron_user_data)
            app.logger.debug(f'Using Electron userData path for MCP configs: {config_dir}')
        elif getattr(sys, 'frozen', False):
            # Running as packaged executable (non-Electron)
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
        else:
            # Running in development
            config_dir = Path(__file__).parent.parent / 'userData'
        
        config_dir.mkdir(parents=True, exist_ok=True)
        config_path = config_dir / 'mcp-configs.json'
        
        # Save to file
        config_data = {
            'mcpServers': mcpServers
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        app.logger.info(f'MCP configurations saved successfully: {len(mcpServers)} servers', extra={
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
        app.logger.error(f'Failed to save MCP configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save MCP configurations',
            'details': str(e)
        }), 500


# Image service configuration endpoints
@app.route('/api/image-services/configs', methods=['GET', 'POST'])
def image_service_configs():
    """
    Manage image service configurations with persistent storage
    GET: Retrieve all image service configurations
    POST: Save image service configurations
    """
    if request.method == 'GET':
        app.logger.info('[ImageService] Image service configurations retrieval requested')
        
        try:
            # Determine configuration file path
            # Use same config path logic as model configs
            electron_user_data = os.environ.get('ELECTRON_USER_DATA')
            
            if electron_user_data:
                # Running in Electron - use the userData path provided by Electron
                config_dir = Path(electron_user_data)
                app.logger.debug(f'[ImageService] Using Electron userData path for image service configs: {config_dir}')
            elif getattr(sys, 'frozen', False):
                # Running as packaged executable (non-Electron)
                if sys.platform == 'win32':
                    config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
                else:
                    config_dir = Path.home() / '.config' / 'EcritisAgent'
            else:
                # Running in development
                config_dir = Path(__file__).parent.parent / 'userData'
            
            config_dir.mkdir(parents=True, exist_ok=True)
            config_path = config_dir / 'image-service-configs.json'
            
            # Check if file exists
            if not config_path.exists():
                app.logger.info('[ImageService] Image service config file does not exist, creating default configuration')
                
                # Create default image service configuration with Unsplash
                current_time = datetime.now().isoformat()
                default_api_keys = [
                    'pNt91wUHTHCzruNDxcJcP5POjKb-qV_RSIE4ZXDvMk4',
                    'fKuy32Nf8HRuRyFYPyaORvdZ0hc-oeQ-xb9zPz2Baeo',
                ]
                
                default_service_id = f'image_service_{datetime.now().timestamp()}'
                default_config = {
                    'imageServices': [
                        {
                            'id': default_service_id,
                            'name': 'Unsplash',
                            'type': 'unsplash',
                            'apiKeys': default_api_keys,
                            'isDefault': True,
                            'isDeletable': False,
                            'createdAt': current_time,
                            'updatedAt': current_time
                        }
                    ],
                    'defaultServiceId': default_service_id
                }
                
                # Save default configuration
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, indent=2, ensure_ascii=False)
                
                app.logger.info('[ImageService] Default image service configuration created successfully', extra={
                    'count': len(default_config['imageServices']),
                    'path': str(config_path)
                })
                
                return jsonify({
                    'success': True,
                    'data': default_config,
                    'count': len(default_config['imageServices']),
                    'configPath': str(config_path)
                })
            
            # Load existing configuration
            with open(config_path, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            app.logger.info(f'[ImageService] Returning {len(configs.get("imageServices", []))} image service configurations', extra={
                'total_count': len(configs.get('imageServices', []))
            })
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('imageServices', [])),
                'configPath': str(config_path)
            })
        
        except Exception as e:
            app.logger.error(f'[ImageService] Failed to retrieve image service configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve image service configurations',
                'details': str(e)
            }), 500
    
    # POST request - save image service configurations
    app.logger.info('[ImageService] Image service configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            app.logger.warning('[ImageService] No data provided in image service config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'imageServices' not in data:
            app.logger.warning('[ImageService] imageServices array missing in request data')
            return jsonify({
                'success': False,
                'error': 'imageServices array is required'
            }), 400
        
        imageServices = data.get('imageServices', [])
        app.logger.debug(f'[ImageService] Saving {len(imageServices)} image service configurations')
        
        # Validate each image service configuration
        for idx, service in enumerate(imageServices):
            required_fields = ['id', 'name', 'type', 'apiKeys']
            missing_fields = [field for field in required_fields if field not in service or (field != 'apiKeys' and not service[field])]
            
            if missing_fields:
                app.logger.warning(f'[ImageService] Service at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            if not isinstance(service['apiKeys'], list) or len(service['apiKeys']) == 0:
                app.logger.warning(f'[ImageService] Service at index {idx} has invalid apiKeys (must be non-empty array)')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} has invalid apiKeys (must be non-empty array)'
                }), 400
            
            # Log service info
            app.logger.debug(f'[ImageService] Service {idx}: {service.get("name")} (type: {service.get("type")}, apiKeys: {len(service.get("apiKeys", []))})')
        
        # Add timestamps if not present
        current_time = datetime.now().isoformat()
        for service in imageServices:
            if 'updatedAt' not in service:
                service['updatedAt'] = current_time
            if 'createdAt' not in service:
                service['createdAt'] = current_time
        
        # Determine configuration file path
        # Use same config path logic as model configs
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        
        if electron_user_data:
            # Running in Electron - use the userData path provided by Electron
            config_dir = Path(electron_user_data)
            app.logger.debug(f'[ImageService] Using Electron userData path for image service configs: {config_dir}')
        elif getattr(sys, 'frozen', False):
            # Running as packaged executable (non-Electron)
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
        else:
            # Running in development
            config_dir = Path(__file__).parent.parent / 'userData'
        
        config_dir.mkdir(parents=True, exist_ok=True)
        config_path = config_dir / 'image-service-configs.json'
        
        # Save to file
        config_data = {
            'imageServices': imageServices,
            'defaultServiceId': data.get('defaultServiceId')
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        app.logger.info(f'[ImageService] Image service configurations saved successfully: {len(imageServices)} services', extra={
            'count': len(imageServices),
            'path': str(config_path)
        })
        
        return jsonify({
            'success': True,
            'message': 'Image service configurations saved successfully',
            'count': len(imageServices),
            'configPath': str(config_path)
        })
    
    except Exception as e:
        app.logger.error(f'[ImageService] Failed to save image service configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save image service configurations',
            'details': str(e)
        }), 500


# Image search endpoint
@app.route('/api/image-services/search', methods=['POST'])
def image_service_search():
    """
    Search images using configured image services (e.g., Unsplash)
    
    POST body:
        - query: Search query string
        - perPage: Number of results to return (default: 3)
        - serviceId: Optional service ID to use (default: uses default service)
    """
    start_time = datetime.now()
    app.logger.info('[ImageService] Image search request received')
    
    try:
        data = request.get_json() or {}
        search_query = data.get('query', '')
        per_page = data.get('perPage', 3)
        page = data.get('page', 1)
        service_id = data.get('serviceId')
        
        if not search_query or not isinstance(search_query, str) or not search_query.strip():
            app.logger.warning('[ImageService] Invalid search query in request')
            return jsonify({
                'success': False,
                'error': 'Search query is required and must be a non-empty string'
            }), 400
        
        # Validate per_page
        try:
            per_page = int(per_page)
            if per_page < 1 or per_page > 30:
                per_page = 3
        except (ValueError, TypeError):
            per_page = 3
        
        # Validate page
        try:
            page = int(page)
            if page < 1:
                page = 1
        except (ValueError, TypeError):
            page = 1
        
        app.logger.info(f'[ImageService] Processing image search request', extra={
            'query': search_query,
            'perPage': per_page,
            'page': page,
            'serviceId': service_id or 'default'
        })
        
        # Load image service configurations
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        
        if electron_user_data:
            config_dir = Path(electron_user_data)
        elif getattr(sys, 'frozen', False):
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
        else:
            config_dir = Path(__file__).parent.parent / 'userData'
        
        config_path = config_dir / 'image-service-configs.json'
        
        if not config_path.exists():
            app.logger.warning('[ImageService] Image service config file not found')
            return jsonify({
                'success': False,
                'error': 'Image service configuration not found. Please configure image services in settings.'
            }), 404
        
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        # Find the service to use
        services = configs.get('imageServices', [])
        if not services:
            app.logger.warning('[ImageService] No image services configured')
            return jsonify({
                'success': False,
                'error': 'No image services configured. Please configure image services in settings.'
            }), 404
        
        # Select service
        selected_service = None
        if service_id:
            selected_service = next((s for s in services if s.get('id') == service_id), None)
            if not selected_service:
                app.logger.warning(f'[ImageService] Service {service_id} not found, using default')
        
        if not selected_service:
            # Use default service
            default_service_id = configs.get('defaultServiceId')
            if default_service_id:
                selected_service = next((s for s in services if s.get('id') == default_service_id), None)
            
            if not selected_service:
                # Use first service
                selected_service = services[0]
        
        app.logger.info(f'[ImageService] Using image service', extra={
            'serviceId': selected_service.get('id'),
            'serviceName': selected_service.get('name'),
            'serviceType': selected_service.get('type'),
            'apiKeyCount': len(selected_service.get('apiKeys', []))
        })
        
        # Get API keys
        api_keys = selected_service.get('apiKeys', [])
        if not api_keys:
            app.logger.error('[ImageService] No API keys available for service')
            return jsonify({
                'success': False,
                'error': 'No API keys configured for the selected image service'
            }), 500
        
        # Select random API key
        import random
        selected_api_key = random.choice(api_keys)
        
        app.logger.debug(f'[ImageService] Selected API key (index: {api_keys.index(selected_api_key)}/{len(api_keys)})')
        
        # Search based on service type
        service_type = selected_service.get('type', 'unsplash')
        
        if service_type == 'unsplash':
            # Search Unsplash API
            unsplash_api_url = 'https://api.unsplash.com/search/photos'
            
            search_params = {
                'query': search_query.strip(),
                'per_page': per_page,
                'page': page,
                'client_id': selected_api_key
            }
            
            app.logger.debug(f'[ImageService] Calling Unsplash API', extra={
                'url': unsplash_api_url,
                'query': search_query,
                'perPage': per_page,
                'page': page
            })
            
            response = requests.get(unsplash_api_url, params=search_params, timeout=10)
            
            if response.status_code != 200:
                error_text = response.text
                app.logger.error(f'[ImageService] Unsplash API error: {response.status_code} - {error_text}')
                return jsonify({
                    'success': False,
                    'error': f'Unsplash API error: {response.status_code}',
                    'details': error_text
                }), response.status_code
            
            result_data = response.json()
            results = result_data.get('results', [])
            total = result_data.get('total', 0)
            total_pages = result_data.get('total_pages', 1)
            
            app.logger.info(f'[ImageService] Unsplash search completed', extra={
                'query': search_query,
                'resultCount': len(results),
                'total': total,
                'totalPages': total_pages,
                'currentPage': page
            })
            
            # Format results
            images = []
            for idx, photo in enumerate(results):
                image_data = {
                    'id': photo.get('id', f'unsplash_{idx}'),
                    'url': photo.get('urls', {}).get('regular', photo.get('urls', {}).get('small', '')),
                    'description': photo.get('description') or photo.get('alt_description') or 'No description',
                    'author': photo.get('user', {}).get('name', 'Unknown'),
                }
                images.append(image_data)
            
            duration = (datetime.now() - start_time).total_seconds()
            app.logger.info(f'[ImageService] Image search completed in {duration:.2f}s', extra={
                'query': search_query,
                'imageCount': len(images),
                'page': page,
                'totalPages': total_pages
            })
            
            return jsonify({
                'success': True,
                'images': images,
                'count': len(images),
                'total': total,
                'totalPages': total_pages,
                'page': page,
                'query': search_query,
                'service': selected_service.get('name')
            })
        else:
            app.logger.warning(f'[ImageService] Unsupported service type: {service_type}')
            return jsonify({
                'success': False,
                'error': f'Unsupported image service type: {service_type}'
            }), 400
    
    except requests.Timeout:
        app.logger.error('[ImageService] Image search request timed out')
        return jsonify({
            'success': False,
            'error': 'Request timed out'
        }), 504
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        app.logger.error(f'[ImageService] Image search request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to search images',
            'details': str(e)
        }), 500


# Search service configuration endpoints
@app.route('/api/search-services/configs', methods=['GET', 'POST'])
def search_service_configs():
    """
    Manage search service configurations with persistent storage
    GET: Retrieve all search service configurations
    POST: Save search service configurations
    """
    if request.method == 'GET':
        app.logger.info('[SearchService] Search service configurations retrieval requested')
        
        try:
            # Determine configuration file path
            # Use same config path logic as model configs
            electron_user_data = os.environ.get('ELECTRON_USER_DATA')
            
            if electron_user_data:
                # Running in Electron - use the userData path provided by Electron
                config_dir = Path(electron_user_data)
                app.logger.debug(f'[SearchService] Using Electron userData path for search service configs: {config_dir}')
            elif getattr(sys, 'frozen', False):
                # Running as packaged executable (non-Electron)
                if sys.platform == 'win32':
                    config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
                else:
                    config_dir = Path.home() / '.config' / 'EcritisAgent'
            else:
                # Running in development
                config_dir = Path(__file__).parent.parent / 'userData'
            
            config_dir.mkdir(parents=True, exist_ok=True)
            config_path = config_dir / 'search-service-configs.json'
            
            # Check if file exists
            if not config_path.exists():
                app.logger.info('[SearchService] Search service config file does not exist, creating default configuration')
                
                # Create default search service configuration with Tavily
                current_time = datetime.now().isoformat()
                default_api_keys = [
                    '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',
                    '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',
                ]
                
                default_service_id = f'search_service_{datetime.now().timestamp()}'
                default_config = {
                    'searchServices': [
                        {
                            'id': default_service_id,
                            'name': 'Tavily Search',
                            'type': 'tavily',
                            'apiKeys': default_api_keys,
                            'isDefault': True,
                            'isDeletable': False,
                            'createdAt': current_time,
                            'updatedAt': current_time
                        }
                    ],
                    'defaultServiceId': default_service_id
                }
                
                # Save default configuration
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, indent=2, ensure_ascii=False)
                
                app.logger.info('[SearchService] Default search service configuration created successfully', extra={
                    'count': len(default_config['searchServices']),
                    'path': str(config_path)
                })
                
                return jsonify({
                    'success': True,
                    'data': default_config,
                    'count': len(default_config['searchServices']),
                    'configPath': str(config_path)
                })
            
            # Load existing configuration
            with open(config_path, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            app.logger.info(f'[SearchService] Returning {len(configs.get("searchServices", []))} search service configurations', extra={
                'total_count': len(configs.get('searchServices', []))
            })
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('searchServices', [])),
                'configPath': str(config_path)
            })
        
        except Exception as e:
            app.logger.error(f'[SearchService] Failed to retrieve search service configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve search service configurations',
                'details': str(e)
            }), 500
    
    # POST request - save search service configurations
    app.logger.info('[SearchService] Search service configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            app.logger.warning('[SearchService] No data provided in search service config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'searchServices' not in data:
            app.logger.warning('[SearchService] searchServices array missing in request data')
            return jsonify({
                'success': False,
                'error': 'searchServices array is required'
            }), 400
        
        searchServices = data.get('searchServices', [])
        app.logger.debug(f'[SearchService] Saving {len(searchServices)} search service configurations')
        
        # Validate each search service configuration
        for idx, service in enumerate(searchServices):
            required_fields = ['id', 'name', 'type', 'apiKeys']
            missing_fields = [field for field in required_fields if field not in service or (field != 'apiKeys' and not service[field])]
            
            if missing_fields:
                app.logger.warning(f'[SearchService] Service at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            if not isinstance(service['apiKeys'], list) or len(service['apiKeys']) == 0:
                app.logger.warning(f'[SearchService] Service at index {idx} has invalid apiKeys (must be non-empty array)')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} has invalid apiKeys (must be non-empty array)'
                }), 400
            
            # Log service info
            app.logger.debug(f'[SearchService] Service {idx}: {service.get("name")} (type: {service.get("type")}, apiKeys: {len(service.get("apiKeys", []))})')
        
        # Add timestamps if not present
        current_time = datetime.now().isoformat()
        for service in searchServices:
            if 'updatedAt' not in service:
                service['updatedAt'] = current_time
            if 'createdAt' not in service:
                service['createdAt'] = current_time
        
        # Determine configuration file path
        # Use same config path logic as model configs
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        
        if electron_user_data:
            # Running in Electron - use the userData path provided by Electron
            config_dir = Path(electron_user_data)
            app.logger.debug(f'[SearchService] Using Electron userData path for search service configs: {config_dir}')
        elif getattr(sys, 'frozen', False):
            # Running as packaged executable (non-Electron)
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
        else:
            # Running in development
            config_dir = Path(__file__).parent.parent / 'userData'
        
        config_dir.mkdir(parents=True, exist_ok=True)
        config_path = config_dir / 'search-service-configs.json'
        
        # Save to file
        config_data = {
            'searchServices': searchServices,
            'defaultServiceId': data.get('defaultServiceId')
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        app.logger.info(f'[SearchService] Search service configurations saved successfully: {len(searchServices)} services', extra={
            'count': len(searchServices),
            'path': str(config_path)
        })
        
        return jsonify({
            'success': True,
            'message': 'Search service configurations saved successfully',
            'count': len(searchServices),
            'configPath': str(config_path)
        })
    
    except Exception as e:
        app.logger.error(f'[SearchService] Failed to save search service configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save search service configurations',
            'details': str(e)
        }), 500


# Search endpoint
@app.route('/api/search-services/search', methods=['POST'])
def search_service_search():
    """
    Search using configured search services (e.g., Tavily)
    
    POST body:
        - query: Search query string
        - maxResults: Number of results to return (default: 5)
        - serviceId: Optional service ID to use (default: uses default service)
    """
    start_time = datetime.now()
    app.logger.info('[SearchService] Search request received')
    
    try:
        data = request.get_json() or {}
        search_query = data.get('query', '')
        max_results = data.get('maxResults', 5)
        service_id = data.get('serviceId')
        
        if not search_query or not isinstance(search_query, str) or not search_query.strip():
            app.logger.warning('[SearchService] Invalid search query in request')
            return jsonify({
                'success': False,
                'error': 'Search query is required and must be a non-empty string'
            }), 400
        
        # Validate max_results
        try:
            max_results = int(max_results)
            if max_results < 1 or max_results > 20:
                max_results = 5
        except (ValueError, TypeError):
            max_results = 5
        
        app.logger.info(f'[SearchService] Processing search request', extra={
            'query': search_query,
            'maxResults': max_results,
            'serviceId': service_id or 'default'
        })
        
        # Load search service configurations
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        
        if electron_user_data:
            config_dir = Path(electron_user_data)
        elif getattr(sys, 'frozen', False):
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
        else:
            config_dir = Path(__file__).parent.parent / 'userData'
        
        config_path = config_dir / 'search-service-configs.json'
        
        if not config_path.exists():
            app.logger.warning('[SearchService] Search service config file not found')
            return jsonify({
                'success': False,
                'error': 'Search service configuration not found. Please configure search services in settings.'
            }), 404
        
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        # Find the service to use
        services = configs.get('searchServices', [])
        if not services:
            app.logger.warning('[SearchService] No search services configured')
            return jsonify({
                'success': False,
                'error': 'No search services configured. Please configure search services in settings.'
            }), 404
        
        # Select service
        selected_service = None
        if service_id:
            selected_service = next((s for s in services if s.get('id') == service_id), None)
            if not selected_service:
                app.logger.warning(f'[SearchService] Service {service_id} not found, using default')
        
        if not selected_service:
            # Use default service
            default_service_id = configs.get('defaultServiceId')
            if default_service_id:
                selected_service = next((s for s in services if s.get('id') == default_service_id), None)
            
            if not selected_service:
                # Use first service
                selected_service = services[0]
        
        app.logger.info(f'[SearchService] Using search service', extra={
            'serviceId': selected_service.get('id'),
            'serviceName': selected_service.get('name'),
            'serviceType': selected_service.get('type'),
            'apiKeyCount': len(selected_service.get('apiKeys', []))
        })
        
        # Get API keys
        api_keys = selected_service.get('apiKeys', [])
        if not api_keys:
            app.logger.error('[SearchService] No API keys available for service')
            return jsonify({
                'success': False,
                'error': 'No API keys configured for the selected search service'
            }), 500
        
        # Select random API key
        import random
        selected_api_key = random.choice(api_keys)
        
        app.logger.debug(f'[SearchService] Selected API key (index: {api_keys.index(selected_api_key)}/{len(api_keys)})')
        
        # Search based on service type
        service_type = selected_service.get('type', 'tavily')
        
        if service_type == 'tavily':
            # Search Tavily API
            tavily_api_url = 'https://api.tavily.com/search'
            
            search_payload = {
                'api_key': selected_api_key,
                'query': search_query.strip(),
                'max_results': max_results,
                'search_depth': 'basic'
            }
            
            app.logger.debug(f'[SearchService] Calling Tavily API', extra={
                'url': tavily_api_url,
                'query': search_query,
                'maxResults': max_results
            })
            
            response = requests.post(tavily_api_url, json=search_payload, timeout=15)
            
            if response.status_code != 200:
                error_text = response.text
                app.logger.error(f'[SearchService] Tavily API error: {response.status_code} - {error_text}')
                return jsonify({
                    'success': False,
                    'error': f'Tavily API error: {response.status_code}',
                    'details': error_text
                }), response.status_code
            
            result_data = response.json()
            results = result_data.get('results', [])
            
            app.logger.info(f'[SearchService] Tavily search completed', extra={
                'query': search_query,
                'resultCount': len(results)
            })
            
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
            
            duration = (datetime.now() - start_time).total_seconds()
            app.logger.info(f'[SearchService] Search completed in {duration:.2f}s', extra={
                'query': search_query,
                'resultCount': len(formatted_results),
                'service': selected_service.get('name')
            })
            
            return jsonify({
                'success': True,
                'results': formatted_results,
                'count': len(formatted_results),
                'query': search_query,
                'service': selected_service.get('name')
            })
        else:
            app.logger.warning(f'[SearchService] Unsupported service type: {service_type}')
            return jsonify({
                'success': False,
                'error': f'Unsupported search service type: {service_type}'
            }), 400
    
    except requests.Timeout:
        app.logger.error('[SearchService] Search request timed out')
        return jsonify({
            'success': False,
            'error': 'Request timed out'
        }), 504
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        app.logger.error(f'[SearchService] Search request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to perform search',
            'details': str(e)
        }), 500


# Auto-writer agent endpoint - migrated to domains/agent/routes.py

# Error handlers
@app.errorhandler(404)
def not_found(error):
    app.logger.warning(f'404 error: {request.path}')
    return jsonify({'error': 'Route not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f'500 error: {str(error)}', exc_info=True)
    return jsonify({'error': 'Internal server error'}), 500

# Main entry point
if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    app.logger.info('=' * 80)
    app.logger.info('Starting Flask Backend for EcritisAgent')
    app.logger.info(f'Port: {port}')
    app.logger.info(f'Environment: {"Production" if getattr(sys, "frozen", False) else "Development"}')
    app.logger.info(f'Python version: {sys.version}')
    app.logger.info(f'Log file: {log_file_path}')
    app.logger.info('=' * 80)
    
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

