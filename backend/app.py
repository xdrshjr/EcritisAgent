"""
Flask Backend for AIDocMaster
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
            log_dir = Path(os.environ.get('APPDATA', '')) / 'AIDocMaster' / 'logs'
        else:
            log_dir = Path.home() / '.config' / 'AIDocMaster' / 'logs'
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
        if getattr(sys, 'frozen', False):
            # Running as packaged executable
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'AIDocMaster'
            else:
                config_dir = Path.home() / '.config' / 'AIDocMaster'
        else:
            # Running in development - look in parent directory
            config_dir = Path(__file__).parent.parent / 'userData'
        
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
        app.logger.debug(f'Getting model by ID: {model_id}')
        
        configs = self.load_model_configs()
        models = configs.get('models', [])
        
        if not models:
            app.logger.warning('No models configured')
            return None
        
        # Find model by ID
        model = next(
            (m for m in models if m.get('id') == model_id),
            None
        )
        
        if model:
            if not model.get('isEnabled', True):
                app.logger.warning(f'Model {model_id} is disabled')
                return None
            app.logger.info(f'Found model by ID: {model.get("name")} ({model.get("modelName")})')
            return model
        
        app.logger.warning(f'Model with ID {model_id} not found')
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
            app.logger.info(f'Getting LLM configuration for specific model: {model_id}')
        else:
            app.logger.info('Getting LLM configuration from default model')
        
        try:
            # Get model from user configuration or persistent storage
            if model_id:
                selected_model = self.get_model_by_id(model_id)
                if not selected_model:
                    app.logger.warning(f'Specified model {model_id} not found, falling back to default')
                    selected_model = self.get_default_model()
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
                    'hasApiKey': bool(config['apiKey'])
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

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    app.logger.debug('Health check requested')
    return jsonify({
        'status': 'ok',
        'service': 'AIDocMaster Flask Backend',
        'timestamp': datetime.utcnow().isoformat(),
        'log_file': str(log_file_path)
    })

# Chat completion endpoint
@app.route('/api/chat', methods=['POST', 'GET'])
def chat():
    """
    Handle chat completion requests with streaming support
    POST: Stream chat completions from LLM
    GET: Health check for chat API
    """
    if request.method == 'GET':
        app.logger.info('Chat API health check')
        
        try:
            config = config_loader.get_llm_config()
            
            if config is None:
                app.logger.info('Chat API health check: No model configured')
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
            app.logger.error(f'Chat API health check failed: {str(e)}', exc_info=True)
            return jsonify({'status': 'error', 'configured': False}), 500
    
    # POST request - handle chat completion
    start_time = datetime.now()
    app.logger.info('Chat request received')
    
    try:
        # Parse request body
        data = request.get_json()
        messages = data.get('messages', [])
        
        if not messages or not isinstance(messages, list):
            app.logger.warning(f'Invalid messages in chat request: {type(messages)}')
            return jsonify({'error': 'Messages array is required and must not be empty'}), 400
        
        app.logger.debug(f'Processing chat request with {len(messages)} messages')
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config()
        
        if config is None:
            app.logger.error('LLM configuration not available - no model configured')
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use chat features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            app.logger.error(f'LLM configuration validation failed: {validation.get("error")}')
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Prepare system message
        system_message = {
            'role': 'system',
            'content': 'You are a helpful AI assistant for DocAIMaster, an AI-powered document editing and validation tool. You help users with document-related questions, provide guidance on using the tool, and assist with document editing tasks. Be concise, friendly, and professional.'
        }
        
        full_messages = [system_message] + messages
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        app.logger.debug(f'Sending request to LLM API: {endpoint}')
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        payload = {
            'model': config['modelName'],
            'messages': full_messages,
            'stream': True,
            'temperature': 0.7,
            'max_tokens': 2000
        }
        
        # Make streaming request to LLM API
        def generate():
            try:
                app.logger.info('Starting LLM API streaming request')
                
                with requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=config['timeout']
                ) as response:
                    
                    if response.status_code != 200:
                        error_text = response.text
                        app.logger.error(f'LLM API error: {response.status_code} - {error_text}')
                        yield json.dumps({
                            'error': f'LLM API error: {response.status_code}',
                            'details': error_text
                        }).encode('utf-8')
                        return
                    
                    app.logger.info('Streaming chat response started')
                    chunk_count = 0
                    
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            chunk_count += 1
                            yield chunk
                            
                            # Log progress periodically
                            if chunk_count % 10 == 0:
                                app.logger.debug(f'Chat stream progress: {chunk_count} chunks')
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    app.logger.info(f'Chat stream completed: {chunk_count} chunks in {duration:.2f}s')
            
            except requests.Timeout:
                app.logger.error('Chat request timed out')
                yield json.dumps({'error': 'Request timed out'}).encode('utf-8')
            
            except Exception as e:
                app.logger.error(f'Error in chat stream: {str(e)}', exc_info=True)
                yield json.dumps({
                    'error': 'Failed to process chat request',
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
        app.logger.error(f'Chat request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process chat request',
            'details': str(e)
        }), 500

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
    app.logger.info('Starting Flask Backend for AIDocMaster')
    app.logger.info(f'Port: {port}')
    app.logger.info(f'Environment: {"Production" if getattr(sys, "frozen", False) else "Development"}')
    app.logger.info(f'Python version: {sys.version}')
    app.logger.info(f'Log file: {log_file_path}')
    app.logger.info('=' * 80)
    
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

