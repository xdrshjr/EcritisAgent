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
# MCP configuration endpoints - migrated to domains/mcp/routes.py
# Image service configuration endpoints - migrated to domains/image_service/routes.py
# Image search endpoint - migrated to domains/image_service/routes.py
# Search service configuration endpoints - migrated to domains/search_service/routes.py
# Search service search endpoint - migrated to domains/search_service/routes.py


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

