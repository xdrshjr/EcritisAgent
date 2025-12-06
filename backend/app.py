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

# Document validation endpoint
@app.route('/api/document-validation', methods=['POST', 'GET'])
def document_validation():
    """
    Handle document validation requests with streaming support
    POST: Stream validation results from LLM
    GET: Health check for validation API
    """
    if request.method == 'GET':
        app.logger.info('Document validation API health check')
        
        try:
            config = config_loader.get_llm_config()
            
            if config is None:
                app.logger.info('Validation API health check: No model configured')
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
            app.logger.error(f'Validation API health check failed: {str(e)}', exc_info=True)
            return jsonify({'status': 'error', 'configured': False}), 500
    
    # POST request - handle validation
    start_time = datetime.now()
    app.logger.info(f'Document validation request received')
    
    try:
        # Parse request body
        data = request.get_json()
        content = data.get('content')
        chunk_index = data.get('chunkIndex', 0)
        total_chunks = data.get('totalChunks', 1)
        language = data.get('language', 'en')
        model_id = data.get('modelId')  # Get optional model ID
        
        if not content or not isinstance(content, str):
            app.logger.warning(f'Invalid content in validation request: {type(content)}')
            return jsonify({'error': 'Content is required and must be a string'}), 400
        
        # Normalize language parameter
        if language not in ['en', 'zh']:
            app.logger.warning(f'Unsupported language "{language}" received, defaulting to English')
            language = 'en'
        
        app.logger.info(f'Processing validation request: chunk {chunk_index + 1}/{total_chunks}, content length: {len(content)}, language: {language}, modelId: {model_id or "default"}, note: results will be accumulated and sorted by severity on frontend')
        
        # Get and validate LLM configuration with specified model ID
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            app.logger.error('LLM configuration not available - no model configured')
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use document validation features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            app.logger.error(f'LLM configuration validation failed: {validation.get("error")}')
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Prepare language-specific validation prompt
        if language == 'zh':
            app.logger.debug(f'Using Chinese validation prompt for chunk {chunk_index + 1}')
            system_content = '''你是一位专业的文档校验和编辑专家。你的任务是分析文档内容并识别以下四个类别的问题：

1. Grammar（语法）：语法错误、动词时态问题、主谓一致性问题
2. WordUsage（用词）：不当的词语选择、冗余、表达不清
3. Punctuation（标点）：缺失或不正确的标点符号
4. Logic（逻辑）：逻辑不一致、论述不清、缺少过渡

对于你发现的每个问题，请提供：
- id: 唯一标识符（使用格式："issue-{category}-{number}"）
- category: "Grammar"、"WordUsage"、"Punctuation" 或 "Logic" 之一
- severity: "high"、"medium" 或 "low"
- location: 问题所在位置的简要描述
- originalText: 文档中包含问题的确切文本片段（提取至少20-50个字符以提供上下文）
- issue: 问题的清晰描述
- suggestion: 改进的具体建议

请以以下准确结构返回有效的JSON对象：
{
  "issues": [
    {
      "id": "issue-grammar-1",
      "category": "Grammar",
      "severity": "high",
      "location": "第一段",
      "originalText": "文档中存在问题的确切文本",
      "issue": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "summary": {
    "totalIssues": 5,
    "grammarCount": 2,
    "wordUsageCount": 1,
    "punctuationCount": 1,
    "logicCount": 1
  }
}

重要提示：仅返回JSON对象，不要附加任何其他文本或解释。如果没有发现问题，请返回空的issues数组，所有计数设为0。originalText字段是必需的，以便在文档中进行高亮显示。请用中文描述所有的location、issue和suggestion字段。'''
        else:
            app.logger.debug(f'Using English validation prompt for chunk {chunk_index + 1}')
            system_content = '''You are an expert document validator and editor. Your task is to analyze document content and identify issues in four categories:

1. Grammar: grammatical errors, verb tense issues, subject-verb agreement
2. WordUsage: incorrect word choice, redundancy, unclear phrasing
3. Punctuation: missing or incorrect punctuation marks
4. Logic: logical inconsistencies, unclear arguments, missing transitions

For each issue you find, provide:
- id: a unique identifier (use format: "issue-{category}-{number}")
- category: one of "Grammar", "WordUsage", "Punctuation", or "Logic"
- severity: "high", "medium", or "low"
- location: a brief description of where the issue occurs
- originalText: the exact text snippet from the document that contains the issue (extract at least 20-50 characters for context)
- issue: a clear description of the problem
- suggestion: a specific recommendation for improvement

Return your response as a valid JSON object with this exact structure:
{
  "issues": [
    {
      "id": "issue-grammar-1",
      "category": "Grammar",
      "severity": "high",
      "location": "First paragraph",
      "originalText": "The exact text from document with the issue",
      "issue": "Description of the issue",
      "suggestion": "Specific suggestion to fix it"
    }
  ],
  "summary": {
    "totalIssues": 5,
    "grammarCount": 2,
    "wordUsageCount": 1,
    "punctuationCount": 1,
    "logicCount": 1
  }
}

Important: Return ONLY the JSON object, no additional text or explanations. If no issues are found, return an empty issues array with all counts set to 0. The originalText field is REQUIRED for each issue to enable document highlighting.'''
        
        system_message = {
            'role': 'system',
            'content': system_content
        }
        
        # Prepare language-specific user message
        if language == 'zh':
            user_content = f'请校验以下文档内容（第 {chunk_index + 1} 段，共 {total_chunks} 段）：\n\n{content}'
        else:
            user_content = f'Please validate the following document content (chunk {chunk_index + 1} of {total_chunks}):\n\n{content}'
        
        user_message = {
            'role': 'user',
            'content': user_content
        }
        
        app.logger.info(f'Prepared language-specific prompts: language={language}, system_prompt_length={len(system_content)}, user_prompt_length={len(user_content)}')
        
        messages = [system_message, user_message]
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        app.logger.debug(f'Sending validation request to LLM API: {endpoint}')
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        payload = {
            'model': config['modelName'],
            'messages': messages,
            'stream': True,
            'temperature': 0.3,  # Lower temperature for more consistent validation
            'max_tokens': 4000
        }
        
        # Make streaming request to LLM API
        def generate():
            try:
                app.logger.info(f'Starting LLM API validation streaming request for chunk {chunk_index}')
                
                with requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=config['timeout']
                ) as response:
                    
                    if response.status_code != 200:
                        error_text = response.text
                        app.logger.error(f'LLM API validation error: {response.status_code} - {error_text}')
                        yield json.dumps({
                            'error': f'LLM API error: {response.status_code}',
                            'details': error_text
                        }).encode('utf-8')
                        return
                    
                    app.logger.info(f'Streaming validation response started for chunk {chunk_index + 1}/{total_chunks}')
                    chunk_count = 0
                    total_bytes = 0
                    
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            chunk_count += 1
                            total_bytes += len(chunk)
                            yield chunk
                            
                            # Log progress periodically
                            if chunk_count % 10 == 0:
                                app.logger.debug(f'Validation stream progress: {chunk_count} stream chunks, {total_bytes} bytes (doc chunk {chunk_index + 1}/{total_chunks})')
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    app.logger.info(f'Validation stream completed for chunk {chunk_index + 1}/{total_chunks}: {chunk_count} stream chunks, {total_bytes} bytes in {duration:.2f}s - Results will be accumulated and sorted on frontend')
            
            except requests.Timeout:
                app.logger.error(f'Validation request timed out for chunk {chunk_index}')
                yield json.dumps({'error': 'Request timed out'}).encode('utf-8')
            
            except Exception as e:
                app.logger.error(f'Error in validation stream for chunk {chunk_index}: {str(e)}', exc_info=True)
                yield json.dumps({
                    'error': 'Failed to process validation request',
                    'details': str(e)
                }).encode('utf-8')
        
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
        app.logger.error(f'Validation request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process validation request',
            'details': str(e)
        }), 500

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

# Model configuration endpoints
@app.route('/api/model-configs', methods=['GET', 'POST'])
def model_configs():
    """
    Manage model configurations with persistent storage
    GET: Retrieve all model configurations
    POST: Save model configurations
    """
    if request.method == 'GET':
        app.logger.info('Model configurations retrieval requested')
        
        try:
            configs = config_loader.load_model_configs()
            
            app.logger.info(f'Returning {len(configs.get("models", []))} model configurations')
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('models', [])),
                'configPath': str(config_loader.config_path)
            })
        
        except Exception as e:
            app.logger.error(f'Failed to retrieve model configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve model configurations',
                'details': str(e)
            }), 500
    
    # POST request - save model configurations
    app.logger.info('Model configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            app.logger.warning('No data provided in model config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'models' not in data:
            app.logger.warning('Models array missing in request data')
            return jsonify({
                'success': False,
                'error': 'Models array is required'
            }), 400
        
        models = data.get('models', [])
        app.logger.debug(f'Saving {len(models)} model configurations')
        
        # Validate each model configuration
        for idx, model in enumerate(models):
            required_fields = ['id', 'name', 'apiUrl', 'apiKey', 'modelName']
            missing_fields = [field for field in required_fields if field not in model or not model[field]]
            
            if missing_fields:
                app.logger.warning(f'Model at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'Model at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            app.logger.debug(f'Model {idx}: {model.get("name")} ({model.get("modelName")})')
        
        # Add timestamps if not present
        from datetime import timezone
        current_time = datetime.now(timezone.utc).isoformat()
        for model in models:
            if 'updatedAt' not in model:
                model['updatedAt'] = current_time
            if 'createdAt' not in model:
                model['createdAt'] = current_time
        
        # Save to file
        config_data = {
            'models': models,
            'defaultModelId': data.get('defaultModelId')
        }
        
        with open(config_loader.config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        app.logger.info(f'Model configurations saved successfully: {len(models)} models', extra={
            'count': len(models),
            'path': str(config_loader.config_path),
            'defaultModelId': data.get('defaultModelId')
        })
        
        return jsonify({
            'success': True,
            'message': 'Model configurations saved successfully',
            'count': len(models),
            'configPath': str(config_loader.config_path)
        })
    
    except Exception as e:
        app.logger.error(f'Failed to save model configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save model configurations',
            'details': str(e)
        }), 500

# Agent-based document validation endpoint
@app.route('/api/agent-validation', methods=['POST'])
def agent_validation():
    """
    Handle agent-based document validation with streaming support
    Uses LangGraph agent to plan and execute document modifications
    """
    start_time = datetime.now()
    app.logger.info('Agent validation request received')
    
    try:
        # Parse request body
        data = request.get_json()
        user_command = data.get('command', '')
        document_content = data.get('content', '')
        language = data.get('language', 'en')
        model_id = data.get('modelId')
        
        if not user_command or not isinstance(user_command, str):
            app.logger.warning(f'Invalid command in agent validation request: {type(user_command)}')
            return jsonify({'error': 'Command is required and must be a string'}), 400
        
        if not document_content or not isinstance(document_content, str):
            app.logger.warning(f'Invalid content in agent validation request: {type(document_content)}')
            return jsonify({'error': 'Document content is required and must be a string'}), 400
        
        # Normalize language parameter
        if language not in ['en', 'zh']:
            app.logger.warning(f'Unsupported language "{language}" received, defaulting to English')
            language = 'en'
        
        app.logger.info(f'Processing agent validation request: command length: {len(user_command)}, content length: {len(document_content)}, language: {language}, modelId: {model_id or "default"}')
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            app.logger.error('LLM configuration not available - no model configured')
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use agent validation features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            app.logger.error(f'LLM configuration validation failed: {validation.get("error")}')
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Import agent module
        try:
            app.logger.debug('[Agent Import] Attempting to import DocumentAgent module', extra={
                'sys_path': sys.path[:3],  # Log first 3 paths for debugging
                'backend_dir': backend_dir,
                'cwd': os.getcwd(),
            })
            
            from agent.document_agent import DocumentAgent
            
            app.logger.info('[Agent Import] DocumentAgent module imported successfully')
            
        except ImportError as import_error:
            # Log detailed error information for debugging
            app.logger.error('[Agent Import] Failed to import DocumentAgent module', extra={
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
                language=language
            )
            app.logger.info(f'DocumentAgent initialized successfully')
        except Exception as agent_error:
            app.logger.error(f'Failed to initialize DocumentAgent: {str(agent_error)}', exc_info=True)
            return jsonify({
                'error': 'Failed to initialize agent',
                'details': str(agent_error)
            }), 500
        
        # Stream agent execution
        def generate():
            try:
                app.logger.info('[SSE] Starting agent workflow streaming')
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
                        app.logger.info('[SSE] Document update event', extra={
                            'event_type': event_type,
                            'step': result.get('step'),
                            'updated_content_length': len(result.get('updated_content', '')),
                            'event_message': result.get('message', ''),
                        })
                    elif event_type == 'tool_result':
                        app.logger.info('[SSE] Tool result event', extra={
                            'event_type': event_type,
                            'step': result.get('step'),
                            'tool': result.get('tool'),
                            'success': result.get('result', {}).get('success', result.get('result', {}).get('found', True)),
                        })
                    elif event_type == 'status':
                        app.logger.debug('[SSE] Status event', extra={
                            'event_type': event_type,
                            'phase': result.get('phase'),
                            'event_message': result.get('message', '')[:100],
                        })
                    elif event_type in ['todo_list', 'complete', 'error']:
                        app.logger.info('[SSE] Major event', extra={
                            'event_type': event_type,
                            'event_message': result.get('message', '')[:100],
                        })
                    
                    # Convert result to SSE format
                    sse_data = f"data: {json.dumps(result, ensure_ascii=False)}\n\n"
                    yield sse_data.encode('utf-8')
                    
                    # Log progress periodically
                    if chunk_count % 10 == 0:
                        app.logger.debug('[SSE] Agent stream progress', extra={
                            'chunks_sent': chunk_count,
                            'document_updates': document_updates_count,
                            'event_types': dict(event_types_count),
                        })
                
                duration = (datetime.now() - start_time).total_seconds()
                app.logger.info('[SSE] Agent workflow completed', extra={
                    'total_chunks': chunk_count,
                    'duration_seconds': f'{duration:.2f}',
                    'document_updates': document_updates_count,
                    'event_types_summary': dict(event_types_count),
                })
                
                # Send completion marker
                yield b"data: [DONE]\n\n"
                
            except Exception as e:
                app.logger.error('[SSE] Error in agent stream', extra={
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
        app.logger.error(f'Agent validation request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process agent validation request',
            'details': str(e)
        }), 500


# Agent list endpoint
@app.route('/api/agents', methods=['GET'])
def get_agents():
    """
    Get list of available agents with their capabilities
    
    Returns:
        JSON array of agent descriptors
    """
    app.logger.info('[Agents API] GET request received for agent list')
    
    try:
        app.logger.debug('[Agents API] Attempting to import agent_router module', extra={
            'sys_path_preview': sys.path[:3],
            'backend_dir': backend_dir,
        })
        
        from agent.agent_router import get_available_agents
        
        app.logger.debug('[Agents API] Successfully imported get_available_agents function')
        
        agents = get_available_agents()
        
        app.logger.info('[Agents API] Agent list retrieved successfully', extra={
            'agent_count': len(agents),
            'agent_types': [a['type'] for a in agents],
            'agent_names': [a['name'] for a in agents],
        })
        
        response_data = {
            'agents': agents,
            'count': len(agents),
        }
        
        app.logger.debug('[Agents API] Sending response', extra={
            'response_keys': list(response_data.keys()),
            'agent_count': len(agents),
        })
        
        return jsonify(response_data)
        
    except ImportError as import_error:
        app.logger.error('[Agents API] Failed to import agent router module', extra={
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
        app.logger.error('[Agents API] Failed to get agent list', extra={
            'error': str(error),
            'error_type': type(error).__name__,
        }, exc_info=True)
        
        return jsonify({
            'error': 'Failed to retrieve agent list',
            'details': str(error)
        }), 500


# Text processing endpoint (polish, rewrite, check)
@app.route('/api/text-processing', methods=['POST'])
def text_processing():
    """
    Text processing endpoint for polish, rewrite, and check operations
    
    POST body:
        - text: Text to process
        - type: 'polish', 'rewrite', or 'check'
        - modelId: Optional model ID to use
    
    Returns:
        - For 'polish' and 'rewrite': { result: string, type: string }
        - For 'check': { issues: array of { type, message, suggestion? } }
    """
    start_time = datetime.now()
    app.logger.info('[TextProcessing] Request received')
    
    try:
        data = request.get_json() or {}
        text = data.get('text', '')
        processing_type = data.get('type', '')
        model_id = data.get('modelId')
        
        if not text or not isinstance(text, str):
            app.logger.warning('[TextProcessing] Invalid text parameter', extra={
                'text_type': type(text).__name__,
                'has_text': bool(text),
            })
            return jsonify({'error': 'text is required and must be a string'}), 400
        
        if processing_type not in ['polish', 'rewrite', 'check']:
            app.logger.warning('[TextProcessing] Invalid type parameter', extra={
                'type': processing_type,
            })
            return jsonify({'error': 'type must be one of: polish, rewrite, check'}), 400
        
        app.logger.info('[TextProcessing] Processing request', extra={
            'type': processing_type,
            'text_length': len(text),
            'text_preview': text[:100] + '...' if len(text) > 100 else text,
            'model_id': model_id or 'default',
        })
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            app.logger.error('[TextProcessing] LLM configuration not available', extra={
                'requested_model_id': model_id,
            })
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use text processing features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            app.logger.error('[TextProcessing] LLM configuration validation failed', extra={
                'validation_error': validation.get('error'),
                'model_name': config.get('modelName', 'unknown'),
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        app.logger.info('[TextProcessing] LLM configuration validated', extra={
            'model_name': config['modelName'],
            'api_url': config['apiUrl'],
        })
        
        # Prepare prompt based on type
        if processing_type == 'polish':
            system_prompt = '你是一个专业的文本润色助手。请对用户提供的文本进行润色，保持原意不变，但使表达更加流畅、准确、优雅。只返回润色后的文本，不要添加任何解释或说明。'
            user_prompt = f'请润色以下文本：\n\n{text}'
        elif processing_type == 'rewrite':
            system_prompt = '你是一个专业的文本重写助手。请对用户提供的文本进行重写，保持原意不变，但改进表达方式，使文本更加清晰、有力、专业。只返回重写后的文本，不要添加任何解释或说明。'
            user_prompt = f'请重写以下文本：\n\n{text}'
        else:  # check
            system_prompt = '''你是一个专业的文本检查助手。请检查用户提供的文本，找出语法错误、拼写错误、表达问题等。

重要要求：
1. 必须返回纯JSON格式，不要使用markdown代码块，不要添加任何解释文字
2. JSON格式必须严格遵循以下结构：
{
  "issues": [
    {
      "type": "grammar|spelling|style|other",
      "message": "问题描述",
      "suggestion": "建议修改（可选）"
    }
  ]
}
3. type字段只能是以下值之一：grammar（语法）、spelling（拼写）、style（风格）、other（其他）
4. message字段是必填的，描述发现的问题
5. suggestion字段是可选的，提供修改建议
6. 如果没有问题，返回：{"issues": []}

请只返回JSON，不要添加任何其他内容。'''
            user_prompt = f'请检查以下文本，并以纯JSON格式返回结果：\n\n{text}'
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        app.logger.debug('[TextProcessing] Sending request to LLM API', extra={
            'endpoint': endpoint,
            'type': processing_type,
        })
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ]
        
        payload = {
            'model': config['modelName'],
            'messages': messages,
            'stream': False,
            'temperature': 0.7,
            'max_tokens': 2000
        }
        
        # Make request to LLM API
        app.logger.debug('[TextProcessing] Making LLM API request', extra={
            'model': config['modelName'],
            'messages_count': len(messages),
        })
        
        response = requests.post(endpoint, headers=headers, json=payload, timeout=120)
        
        if response.status_code != 200:
            app.logger.error('[TextProcessing] LLM API error', extra={
                'status_code': response.status_code,
                'response_preview': response.text[:200],
            })
            return jsonify({
                'error': 'LLM API request failed',
                'details': f'Status {response.status_code}: {response.text[:200]}'
            }), 500
        
        response_data = response.json()
        llm_content = response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        if not llm_content:
            app.logger.error('[TextProcessing] Empty response from LLM', extra={
                'response_data': response_data,
            })
            return jsonify({'error': 'Empty response from LLM'}), 500
        
        app.logger.debug('[TextProcessing] LLM response received', extra={
            'content_length': len(llm_content),
            'content_preview': llm_content[:100],
        })
        
        # Process response based on type
        if processing_type == 'check':
            # Try to parse JSON response with robust parsing
            app.logger.debug('[TextProcessing] Starting JSON parsing for check result', extra={
                'content_length': len(llm_content),
                'content_preview': llm_content[:150],
            })
            
            try:
                # Step 1: Clean the content
                cleaned_content = llm_content.strip()
                app.logger.debug('[TextProcessing] Step 1: Content cleaned', extra={
                    'original_length': len(llm_content),
                    'cleaned_length': len(cleaned_content),
                })
                
                # Step 2: Remove markdown code blocks if present
                if '```' in cleaned_content:
                    app.logger.debug('[TextProcessing] Step 2: Detected markdown code block, extracting JSON')
                    
                    # Method 1: Try to extract from ```json ... ``` or ``` ... ```
                    if '```json' in cleaned_content:
                        start_marker = '```json'
                        start_pos = cleaned_content.find(start_marker) + len(start_marker)
                        end_pos = cleaned_content.find('```', start_pos)
                        if end_pos != -1:
                            extracted = cleaned_content[start_pos:end_pos].strip()
                            if extracted:
                                cleaned_content = extracted
                                app.logger.debug('[TextProcessing] Step 2: Extracted JSON from ```json block', extra={
                                    'extracted_length': len(cleaned_content),
                                    'extracted_preview': cleaned_content[:200],
                                })
                    elif cleaned_content.startswith('```'):
                        # Method 2: Extract from generic ``` ... ```
                        start_pos = cleaned_content.find('```') + 3
                        # Skip language identifier if present (e.g., ```json)
                        if start_pos < len(cleaned_content):
                            # Check if there's a newline after ```
                            next_newline = cleaned_content.find('\n', start_pos)
                            if next_newline != -1:
                                start_pos = next_newline + 1
                        
                        end_pos = cleaned_content.rfind('```')
                        if end_pos != -1 and end_pos > start_pos:
                            extracted = cleaned_content[start_pos:end_pos].strip()
                            if extracted:
                                cleaned_content = extracted
                                app.logger.debug('[TextProcessing] Step 2: Extracted JSON from generic code block', extra={
                                    'extracted_length': len(cleaned_content),
                                    'extracted_preview': cleaned_content[:200],
                                })
                    
                    # If still contains ```, try to find JSON object boundaries
                    if '```' in cleaned_content:
                        app.logger.debug('[TextProcessing] Step 2: Still contains ```, trying to find JSON boundaries')
                        first_brace = cleaned_content.find('{')
                        last_brace = cleaned_content.rfind('}')
                        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                            cleaned_content = cleaned_content[first_brace:last_brace + 1]
                            app.logger.debug('[TextProcessing] Step 2: Extracted JSON using brace boundaries', extra={
                                'extracted_length': len(cleaned_content),
                            })
                
                # Step 3: Try to find JSON object in the content
                if not cleaned_content.startswith('{') and not cleaned_content.startswith('['):
                    app.logger.debug('[TextProcessing] Step 3: Content does not start with { or [, searching for JSON')
                    # Try to find JSON object boundaries
                    first_brace = cleaned_content.find('{')
                    last_brace = cleaned_content.rfind('}')
                    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                        cleaned_content = cleaned_content[first_brace:last_brace + 1]
                        app.logger.debug('[TextProcessing] Step 3: Found JSON boundaries', extra={
                            'first_brace': first_brace,
                            'last_brace': last_brace,
                        })
                
                # Step 4: Parse JSON
                app.logger.debug('[TextProcessing] Step 4: Attempting JSON parse', extra={
                    'content_to_parse': cleaned_content[:200],
                })
                check_result = json.loads(cleaned_content)
                
                # Step 5: Validate and extract issues
                app.logger.debug('[TextProcessing] Step 5: JSON parsed successfully, validating structure', extra={
                    'parsed_type': type(check_result).__name__,
                })
                
                issues = []
                if isinstance(check_result, dict):
                    if 'issues' in check_result:
                        issues = check_result['issues']
                        app.logger.debug('[TextProcessing] Step 5: Found issues in dict.issues')
                    elif 'result' in check_result and isinstance(check_result['result'], list):
                        issues = check_result['result']
                        app.logger.debug('[TextProcessing] Step 5: Found issues in dict.result')
                    else:
                        app.logger.warning('[TextProcessing] Step 5: Dict structure unexpected, keys: ' + str(list(check_result.keys())))
                elif isinstance(check_result, list):
                    issues = check_result
                    app.logger.debug('[TextProcessing] Step 5: Found issues as direct list')
                else:
                    app.logger.warning('[TextProcessing] Step 5: Unexpected parsed type, creating fallback issue')
                
                # Step 6: Validate and normalize issues
                validated_issues = []
                valid_types = ['grammar', 'spelling', 'style', 'other']
                
                for idx, issue in enumerate(issues):
                    if not isinstance(issue, dict):
                        app.logger.warning('[TextProcessing] Step 6: Issue {} is not a dict, skipping'.format(idx), extra={
                            'issue_type': type(issue).__name__,
                            'issue_value': str(issue)[:100],
                        })
                        continue
                    
                    # Normalize issue structure
                    issue_type = issue.get('type', 'other')
                    if issue_type not in valid_types:
                        app.logger.debug('[TextProcessing] Step 6: Issue {} has invalid type "{}", defaulting to "other"'.format(idx, issue_type))
                        issue_type = 'other'
                    
                    issue_message = issue.get('message', '')
                    if not issue_message:
                        # Try alternative field names
                        issue_message = issue.get('text', issue.get('description', issue.get('content', '')))
                    
                    if not issue_message:
                        app.logger.warning('[TextProcessing] Step 6: Issue {} has no message, skipping'.format(idx))
                        continue
                    
                    validated_issue = {
                        'type': issue_type,
                        'message': str(issue_message).strip(),
                    }
                    
                    # Add suggestion if present
                    suggestion = issue.get('suggestion', issue.get('suggest', issue.get('fix', '')))
                    if suggestion:
                        validated_issue['suggestion'] = str(suggestion).strip()
                    
                    validated_issues.append(validated_issue)
                    app.logger.debug('[TextProcessing] Step 6: Validated issue {}'.format(idx), extra={
                        'type': validated_issue['type'],
                        'message_preview': validated_issue['message'][:50],
                    })
                
                app.logger.info('[TextProcessing] Check completed successfully', extra={
                    'raw_issue_count': len(issues),
                    'validated_issue_count': len(validated_issues),
                    'duration': str(datetime.now() - start_time),
                })
                
                return jsonify({'issues': validated_issues})
                
            except json.JSONDecodeError as e:
                app.logger.warning('[TextProcessing] JSON parsing failed, attempting enhanced fallback parsing', extra={
                    'error': str(e),
                    'error_position': getattr(e, 'pos', None),
                    'content_preview': llm_content[:300],
                })
                
                # Enhanced fallback: Try multiple extraction methods
                fallback_issues = []
                
                # Method 1: Try to extract JSON from markdown code blocks more aggressively
                try:
                    enhanced_content = llm_content.strip()
                    
                    # Remove all markdown code block markers
                    if '```json' in enhanced_content:
                        start = enhanced_content.find('```json') + 7
                        end = enhanced_content.find('```', start)
                        if end != -1:
                            enhanced_content = enhanced_content[start:end].strip()
                    elif '```' in enhanced_content:
                        # Find first ``` and last ```
                        first_triple = enhanced_content.find('```')
                        if first_triple != -1:
                            # Skip language identifier
                            after_first = enhanced_content.find('\n', first_triple)
                            if after_first == -1:
                                after_first = first_triple + 3
                            else:
                                after_first += 1
                            
                            last_triple = enhanced_content.rfind('```')
                            if last_triple != -1 and last_triple > after_first:
                                enhanced_content = enhanced_content[after_first:last_triple].strip()
                    
                    # Try to find JSON object boundaries
                    first_brace = enhanced_content.find('{')
                    last_brace = enhanced_content.rfind('}')
                    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                        enhanced_content = enhanced_content[first_brace:last_brace + 1]
                        
                        # Try parsing again
                        try:
                            check_result = json.loads(enhanced_content)
                            if isinstance(check_result, dict) and 'issues' in check_result:
                                fallback_issues = check_result['issues']
                                app.logger.info('[TextProcessing] Enhanced fallback successfully parsed JSON', extra={
                                    'issue_count': len(fallback_issues),
                                })
                                # Validate and normalize issues (reuse existing logic)
                                validated_issues = []
                                valid_types = ['grammar', 'spelling', 'style', 'other']
                                
                                for idx, issue in enumerate(fallback_issues):
                                    if not isinstance(issue, dict):
                                        continue
                                    issue_type = issue.get('type', 'other')
                                    if issue_type not in valid_types:
                                        issue_type = 'other'
                                    issue_message = issue.get('message', '')
                                    if not issue_message:
                                        issue_message = issue.get('text', issue.get('description', issue.get('content', '')))
                                    if not issue_message:
                                        continue
                                    
                                    validated_issue = {
                                        'type': issue_type,
                                        'message': str(issue_message).strip(),
                                    }
                                    suggestion = issue.get('suggestion', issue.get('suggest', issue.get('fix', '')))
                                    if suggestion:
                                        validated_issue['suggestion'] = str(suggestion).strip()
                                    validated_issues.append(validated_issue)
                                
                                if validated_issues:
                                    app.logger.info('[TextProcessing] Enhanced fallback validation completed', extra={
                                        'validated_count': len(validated_issues),
                                    })
                                    return jsonify({'issues': validated_issues})
                        except json.JSONDecodeError:
                            app.logger.debug('[TextProcessing] Enhanced fallback JSON parse also failed')
                except Exception as fallback_error:
                    app.logger.debug('[TextProcessing] Enhanced fallback extraction failed', extra={
                        'error': str(fallback_error),
                    })
                
                # Method 2: Try to extract structured information from text
                lines = llm_content.split('\n')
                current_issue = None
                
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Look for issue indicators
                    if any(keyword in line.lower() for keyword in ['错误', '问题', '建议', '语法', '拼写', '表达']):
                        if current_issue:
                            fallback_issues.append(current_issue)
                        current_issue = {
                            'type': 'other',
                            'message': line,
                        }
                    elif current_issue:
                        if '建议' in line.lower() or 'suggestion' in line.lower():
                            current_issue['suggestion'] = line
                        else:
                            current_issue['message'] += ' ' + line
                
                if current_issue:
                    fallback_issues.append(current_issue)
                
                if fallback_issues:
                    app.logger.info('[TextProcessing] Fallback text parsing extracted {} issues'.format(len(fallback_issues)))
                    return jsonify({'issues': fallback_issues})
                
                # Final fallback: create a single issue from the response
                app.logger.warning('[TextProcessing] Using final fallback: single issue from raw content', extra={
                    'content_length': len(llm_content),
                    'content_preview': llm_content[:500],
                })
                return jsonify({
                    'issues': [{
                        'type': 'other',
                        'message': '检查结果解析失败，请检查后端日志获取详细信息。',
                        'suggestion': '原始响应前500字符：' + llm_content[:500],
                    }]
                })
        else:
            # For polish and rewrite, return the processed text
            app.logger.info('[TextProcessing] Processing completed', extra={
                'type': processing_type,
                'original_length': len(text),
                'result_length': len(llm_content),
                'duration': str(datetime.now() - start_time),
            })
            
            return jsonify({
                'result': llm_content.strip(),
                'type': processing_type,
            })
        
    except requests.exceptions.Timeout:
        app.logger.error('[TextProcessing] Request timeout', exc_info=True)
        return jsonify({'error': 'Request timeout'}), 504
    except requests.exceptions.RequestException as e:
        app.logger.error('[TextProcessing] Request exception', extra={
            'error': str(e),
        }, exc_info=True)
        return jsonify({'error': 'Request failed', 'details': str(e)}), 500
    except Exception as error:
        app.logger.error('[TextProcessing] Unexpected error', extra={
            'error': str(error),
            'error_type': type(error).__name__,
        }, exc_info=True)
        return jsonify({
            'error': 'Text processing failed',
            'details': str(error)
        }), 500


# Agent routing endpoint (unified entry point for agent mode)
@app.route('/api/agent-route', methods=['POST'])
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
    start_time = datetime.now()
    app.logger.info('[AgentRouter] Request received')
    
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
                app.logger.info('[AgentRouter] Received paragraphs array', extra={
                    'paragraph_count': len(document_content) if isinstance(document_content, list) else 0,
                })
            except (json.JSONDecodeError, TypeError) as e:
                app.logger.warning('[AgentRouter] Failed to parse paragraphs, falling back to string', extra={
                    'error': str(e),
                })
                document_content = document_content_raw
        else:
            document_content = document_content_raw
        
        if not user_request or not isinstance(user_request, str):
            app.logger.warning('[AgentRouter] Invalid request', extra={
                'request_type': type(user_request).__name__,
            })
            return jsonify({'error': 'request is required and must be a string'}), 400
        
        # Normalize language
        if language not in ['en', 'zh']:
            app.logger.warning(f'[AgentRouter] Unsupported language "{language}", defaulting to zh')
            language = 'zh'
        
        # Check if document content exists
        if isinstance(document_content, list):
            has_document = len(document_content) > 0
            content_length = len(document_content)
        else:
            has_document = bool(document_content and isinstance(document_content, str) and document_content.strip())
            content_length = len(document_content) if has_document and isinstance(document_content, str) else 0
        
        app.logger.info('[AgentRouter] Processing routing request', extra={
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
            app.logger.error('[AgentRouter] No LLM model configured')
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use agent features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        if not validation['valid']:
            app.logger.error('[AgentRouter] LLM configuration validation failed', extra={
                'error': validation.get('error')
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM config')}), 500
        
        # Import agent router
        try:
            from agent.agent_router import AgentRouter
            from agent.auto_writer_agent import AutoWriterAgent
            from agent.document_agent import DocumentAgent
        except ImportError as import_error:
            app.logger.error('[AgentRouter] Failed to import agent modules', extra={
                'error': str(import_error)
            }, exc_info=True)
            return jsonify({
                'error': 'Agent modules not available',
                'details': str(import_error)
            }), 500
        
        # Step 1: Route to appropriate agent
        app.logger.info('[AgentRouter] Starting agent routing with LLM')
        
        router = AgentRouter(
            api_key=config['apiKey'],
            api_url=config['apiUrl'],
            model_name=config['modelName'],
            language=language,
        )
        
        routing_result = router.route(user_request, has_document=has_document)
        
        app.logger.info('[AgentRouter] Routing completed', extra={
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
                
                app.logger.info('[AgentRouter] Sent routing result to client', extra={
                    'agent_type': routing_result['agent_type'],
                })
                
                # Execute the selected agent
                if selected_agent_type == 'auto_writer':
                    app.logger.info('[AgentRouter] Executing AutoWriterAgent')
                    
                    agent = AutoWriterAgent(
                        api_key=config['apiKey'],
                        api_url=config['apiUrl'],
                        model_name=config['modelName'],
                        language=language,
                    )
                    
                    for event in agent.run(user_request):
                        chunk_count += 1
                        event_type = event.get('type', 'unknown')
                        event_types[event_type] = event_types.get(event_type, 0) + 1
                        
                        # Log periodically
                        if event_type == 'content_chunk' and chunk_count % 20 == 0:
                            app.logger.debug('[AgentRouter AutoWriter] Streaming chunks', extra={
                                'total_chunks': chunk_count,
                                'content_chunks': event_types.get('content_chunk', 0),
                            })
                        
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
                elif selected_agent_type == 'document_modifier':
                    app.logger.info('[AgentRouter] Executing DocumentAgent')
                    
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
                    )
                    
                    for event in agent.run(user_request, document_content):
                        chunk_count += 1
                        event_type = event.get('type', 'unknown')
                        event_types[event_type] = event_types.get(event_type, 0) + 1
                        
                        # Log key events
                        if event_type in ['status', 'todo_list', 'complete', 'error']:
                            app.logger.info(f'[AgentRouter DocumentAgent] Event: {event_type}', extra={
                                'phase': event.get('phase'),
                                'event_message': event.get('message', '')[:100],
                            })
                        
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
                else:
                    app.logger.error('[AgentRouter] Unknown agent type', extra={
                        'agent_type': selected_agent_type,
                    })
                    error_event = {
                        'type': 'error',
                        'message': f'Unknown agent type: {selected_agent_type}',
                    }
                    yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
                    return
                
                app.logger.info('[AgentRouter] Agent execution stream finished', extra={
                    'agent_type': selected_agent_type,
                    'total_chunks': chunk_count,
                    'event_types': event_types,
                    'duration': f"{(datetime.now() - start_time).total_seconds():.2f}s"
                })
                
            except Exception as error:
                app.logger.error('[AgentRouter] Agent execution failed', extra={
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
        app.logger.error('[AgentRouter] Request failed', extra={
            'error': str(error)
        }, exc_info=True)
        return jsonify({
            'error': 'Agent routing failed',
            'details': str(error)
        }), 500


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


@app.route('/api/auto-writer-agent', methods=['POST'])
def auto_writer_agent():
    """
    AI Document Auto-Writer endpoint.

    Streams LangGraph agent status updates as SSE for the frontend auto writer.
    """
    start_time = datetime.now()
    app.logger.info('[AutoWriter] Request received')

    try:
        data = request.get_json() or {}
        user_prompt = data.get('prompt', '')
        language = data.get('language', 'zh')
        model_id = data.get('modelId')

        if not user_prompt or not isinstance(user_prompt, str):
            return jsonify({'error': 'prompt is required'}), 400

        config = config_loader.get_llm_config(model_id=model_id)
        if config is None:
            return jsonify({'error': 'No LLM model configured'}), 500

        validation = config_loader.validate_llm_config(config)
        if not validation['valid']:
            return jsonify({'error': validation.get('error', 'Invalid LLM config')}), 500

        try:
            from agent.auto_writer_agent import AutoWriterAgent
        except ImportError as import_error:
            app.logger.error('[AutoWriter] Failed to import agent', extra={
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
        )

        def generate():
            chunk_count = 0
            event_types = {}
            
            for event in agent.run(user_prompt):
                chunk_count += 1
                event_type = event.get('type', 'unknown')
                event_types[event_type] = event_types.get(event_type, 0) + 1
                
                # Log streaming events periodically
                if event_type == 'content_chunk':
                    if chunk_count % 20 == 0:  # Log every 20 chunks to avoid spam
                        app.logger.debug('[AutoWriter SSE] Streaming content chunks', extra={
                            'total_chunks': chunk_count,
                            'content_chunks': event_types.get('content_chunk', 0),
                            'draft_updates': event_types.get('article_draft', 0),
                        })
                elif event_type == 'article_draft':
                    app.logger.info('[AutoWriter SSE] Sending draft update', extra={
                        'chunk_count': chunk_count,
                        'html_length': len(event.get('html', '')),
                    })
                
                # Yield SSE event
                sse_data = f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                yield sse_data

            app.logger.info('[AutoWriter] Stream finished', extra={
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
        app.logger.error('[AutoWriter] Request failed', extra={'error': str(e)}, exc_info=True)
        return jsonify({
            'error': 'AutoWriter request failed',
            'details': str(e)
        }), 500

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

