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
    Loads LLM configuration from file system.
    Supports three model types stored in separate JSON files:
      - standard-models.json   (Standard API providers)
      - coding-plan-models.json (Coding Plan services)
      - custom-models.json     (Fully custom / legacy models)
    Also loads read-only provider templates from backend/config/providers.json.
    """

    # File names for each model type
    TYPE_FILES = {
        'standard': 'standard-models.json',
        'codingPlan': 'coding-plan-models.json',
        'custom': 'custom-models.json',
    }
    LEGACY_FILE = 'model-configs.json'
    PROVIDERS_FILE = 'providers.json'

    def __init__(self):
        self.user_data_dir = self._get_user_data_dir()
        # Keep legacy config_path for backward-compat with routes that reference it
        self.config_path = self.user_data_dir / self.TYPE_FILES['custom']
        self.providers_path = Path(__file__).parent / 'config' / self.PROVIDERS_FILE
        app.logger.info(f'ConfigLoader initialized – userData: {self.user_data_dir}')

        # Run migration from single-file to multi-file (if needed)
        self._check_and_migrate()

        # Ensure at least the custom-models file exists so first-run works
        self._ensure_default_config()

    # ── Path resolution ─────────────────────────────────────────────────────

    def _get_user_data_dir(self) -> Path:
        """Determine the user data directory based on environment."""
        electron_user_data = os.environ.get('ELECTRON_USER_DATA')
        if electron_user_data:
            config_dir = Path(electron_user_data)
            app.logger.info(f'Using Electron userData path: {config_dir}')
        elif getattr(sys, 'frozen', False):
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
            else:
                config_dir = Path.home() / '.config' / 'EcritisAgent'
            app.logger.info(f'Using packaged app config path: {config_dir}')
        else:
            config_dir = Path(__file__).parent.parent / 'userData'
            app.logger.info(f'Using development config path: {config_dir}')
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir

    def _type_path(self, model_type: str) -> Path:
        """Return the JSON file path for a given model type."""
        filename = self.TYPE_FILES.get(model_type)
        if not filename:
            raise ValueError(f'Unknown model type: {model_type}')
        return self.user_data_dir / filename

    # ── Migration ───────────────────────────────────────────────────────────

    def _check_and_migrate(self):
        """Migrate legacy model-configs.json → custom-models.json (one-time)."""
        legacy_path = self.user_data_dir / self.LEGACY_FILE
        custom_path = self._type_path('custom')

        if not legacy_path.exists() or custom_path.exists():
            return  # nothing to migrate

        try:
            app.logger.info('Starting migration from model-configs.json to multi-file storage')
            with open(legacy_path, 'r', encoding='utf-8') as f:
                legacy_data = json.load(f)

            # Tag every model as "custom"
            models = legacy_data.get('models', [])
            for m in models:
                m['type'] = 'custom'

            # Write custom-models.json
            custom_data = {
                'models': models,
                'defaultModelId': legacy_data.get('defaultModelId'),
            }
            with open(custom_path, 'w', encoding='utf-8') as f:
                json.dump(custom_data, f, indent=2, ensure_ascii=False)

            # Create empty files for the other two types
            for t in ('standard', 'codingPlan'):
                p = self._type_path(t)
                if not p.exists():
                    with open(p, 'w', encoding='utf-8') as f:
                        json.dump({'models': [], 'defaultModelId': None}, f, indent=2)

            # Backup legacy file
            backup_path = legacy_path.with_suffix('.json.bak')
            legacy_path.rename(backup_path)
            app.logger.info(f'Migration complete – {len(models)} models moved to custom-models.json, old file backed up')
        except Exception as e:
            app.logger.error(f'Migration failed (legacy file kept untouched): {e}', exc_info=True)

    # ── First-run default config ────────────────────────────────────────────

    def _ensure_default_config(self):
        """Create default custom model configs on very first run (no files at all)."""
        custom_path = self._type_path('custom')
        if custom_path.exists():
            return

        try:
            from datetime import timezone
            now = datetime.now(timezone.utc)
            qwen_id = f'model_{now.timestamp()}'
            ds_id = f'model_{now.timestamp() + 1}'

            default_config = {
                'models': [
                    {
                        'id': qwen_id,
                        'type': 'custom',
                        'name': 'Qwen Max',
                        'apiUrl': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                        'apiKey': 'sk-a5f209d824d54b6883fbc397f9fb4e28',
                        'modelName': 'qwen-max-latest',
                        'isDefault': True,
                        'isEnabled': True,
                        'createdAt': now.isoformat(),
                        'updatedAt': now.isoformat(),
                    },
                    {
                        'id': ds_id,
                        'type': 'custom',
                        'name': 'DeepSeek V3',
                        'apiUrl': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                        'apiKey': 'sk-a5f209d824d54b6883fbc397f9fb4e28',
                        'modelName': 'deepseek-v3',
                        'isDefault': False,
                        'isEnabled': True,
                        'createdAt': now.isoformat(),
                        'updatedAt': now.isoformat(),
                    },
                ],
                'defaultModelId': qwen_id,
            }

            with open(custom_path, 'w', encoding='utf-8') as f:
                json.dump(default_config, f, indent=2, ensure_ascii=False)

            # Also create empty files for the other two types
            for t in ('standard', 'codingPlan'):
                p = self._type_path(t)
                if not p.exists():
                    with open(p, 'w', encoding='utf-8') as f:
                        json.dump({'models': [], 'defaultModelId': None}, f, indent=2)

            app.logger.info('Default model configuration created (first run)')
        except Exception as e:
            app.logger.error(f'Failed to create default config: {e}', exc_info=True)

    # ── Providers (read-only templates) ─────────────────────────────────────

    def load_providers(self) -> dict:
        """Load provider/service templates from backend/config/providers.json."""
        try:
            if not self.providers_path.exists():
                app.logger.warning(f'providers.json not found at {self.providers_path}')
                return {'standard': [], 'codingPlan': []}
            with open(self.providers_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            app.logger.error(f'Failed to load providers.json: {e}', exc_info=True)
            return {'standard': [], 'codingPlan': []}

    def _get_provider_for_model(self, model: dict):
        """Resolve the provider/service template for a given model record."""
        providers = self.load_providers()
        model_type = model.get('type', 'custom')

        if model_type == 'standard':
            for p in providers.get('standard', []):
                if p['id'] == model.get('providerId'):
                    return p
        elif model_type == 'codingPlan':
            for s in providers.get('codingPlan', []):
                if s['id'] == model.get('serviceId'):
                    return s
        return None

    # ── Per-type CRUD ───────────────────────────────────────────────────────

    def load_models_by_type(self, model_type: str) -> dict:
        """Load model configs for a single type (returns {models, defaultModelId})."""
        p = self._type_path(model_type)
        try:
            if not p.exists():
                return {'models': [], 'defaultModelId': None}
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            app.logger.error(f'Failed to load {model_type} models: {e}', exc_info=True)
            return {'models': [], 'defaultModelId': None}

    def save_models_by_type(self, model_type: str, data: dict):
        """Save model configs for a single type."""
        p = self._type_path(model_type)
        try:
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            app.logger.info(f'Saved {len(data.get("models", []))} {model_type} models')
        except Exception as e:
            app.logger.error(f'Failed to save {model_type} models: {e}', exc_info=True)
            raise

    # ── Merged views (backward-compatible) ──────────────────────────────────

    def load_model_configs(self) -> dict:
        """Load ALL model configs merged from the three type files.
        Returns the same shape as the old single-file format: {models, defaultModelId}."""
        all_models = []
        default_id = None

        for t in ('standard', 'codingPlan', 'custom'):
            data = self.load_models_by_type(t)
            all_models.extend(data.get('models', []))
            if data.get('defaultModelId') and not default_id:
                default_id = data['defaultModelId']

        app.logger.debug(f'Loaded {len(all_models)} total models across all types')
        return {'models': all_models, 'defaultModelId': default_id}

    def load_all_models(self) -> dict:
        """Alias for load_model_configs (clearer name for new code)."""
        return self.load_model_configs()

    def save_model_configs(self, data: dict):
        """Save a merged model config list by dispatching each model to its type file.
        Keeps backward compatibility with the old single-file save path."""
        # Bucket models by type
        buckets = {'standard': [], 'codingPlan': [], 'custom': []}
        for m in data.get('models', []):
            t = m.get('type', 'custom')
            buckets.setdefault(t, []).append(m)

        default_id = data.get('defaultModelId')

        for t, models in buckets.items():
            # Only one file should hold the defaultModelId
            file_default = default_id if any(m.get('id') == default_id for m in models) else None
            self.save_models_by_type(t, {'models': models, 'defaultModelId': file_default})

    # ── Default model (cross-file) ──────────────────────────────────────────

    def get_default_model(self):
        """Get the global default enabled model across all type files."""
        configs = self.load_model_configs()
        models = configs.get('models', [])

        if not models:
            app.logger.warning('No models configured')
            return None

        # Prefer explicit default
        default = next(
            (m for m in models if m.get('isDefault') and m.get('isEnabled', True)),
            None,
        )
        if default:
            app.logger.info(f'Found default model: {default.get("name")}')
            return default

        # Fallback to first enabled model (standard > codingPlan > custom priority)
        for t in ('standard', 'codingPlan', 'custom'):
            first = next(
                (m for m in models if m.get('type', 'custom') == t and m.get('isEnabled', True)),
                None,
            )
            if first:
                app.logger.info(f'Using first enabled {t} model as fallback: {first.get("name")}')
                return first

        app.logger.warning('No enabled models found')
        return None

    def set_default_model(self, model_id: str):
        """Set a model as global default, clearing default in other files."""
        for t in self.TYPE_FILES:
            data = self.load_models_by_type(t)
            changed = False
            for m in data.get('models', []):
                if m.get('id') == model_id:
                    m['isDefault'] = True
                    data['defaultModelId'] = model_id
                    changed = True
                elif m.get('isDefault'):
                    m['isDefault'] = False
                    changed = True
            if data.get('defaultModelId') and data['defaultModelId'] != model_id:
                if not any(m.get('id') == model_id for m in data.get('models', [])):
                    data['defaultModelId'] = None
                    changed = True
            if changed:
                self.save_models_by_type(t, data)

    # ── Model lookup by ID ──────────────────────────────────────────────────

    def get_model_by_id(self, model_id):
        """Get an enabled model by ID from any type file."""
        configs = self.load_model_configs()
        models = configs.get('models', [])

        if not models:
            app.logger.warning('[ModelSelection] No models configured')
            return None

        model = next((m for m in models if m.get('id') == model_id), None)

        if model:
            if not model.get('isEnabled', True):
                app.logger.warning(f'[ModelSelection] Model {model_id} is disabled')
                return None
            app.logger.info(f'[ModelSelection] Found model: {model.get("name")} (type={model.get("type")})')
            return model

        app.logger.warning(f'[ModelSelection] Model {model_id} not found')
        return None

    # ── LLM config for API calls ────────────────────────────────────────────

    def get_llm_config(self, model_id=None):
        """
        Build the LLM config dict needed by chat / agent callers.
        For codingPlan models, resolves apiUrl, modelName, extraHeaders from providers.json.
        """
        if model_id:
            selected = self.get_model_by_id(model_id)
            if not selected:
                app.logger.warning(f'Model {model_id} not found, falling back to default')
                selected = self.get_default_model()
        else:
            selected = self.get_default_model()

        if not selected:
            app.logger.error('No LLM model configured')
            return None

        model_type = selected.get('type', 'custom')

        if model_type == 'codingPlan':
            provider = self._get_provider_for_model(selected)
            if not provider:
                app.logger.error(f'Provider template not found for serviceId={selected.get("serviceId")}')
                return None
            config = {
                'apiKey': selected.get('apiKey', ''),
                'apiUrl': provider.get('apiUrl', ''),
                'modelName': provider.get('model', ''),
                'timeout': 120,
                'protocol': provider.get('protocol', 'openai'),
                'extraHeaders': provider.get('extraHeaders', {}),
                'defaultParams': provider.get('defaultParams', {}),
            }
        else:
            # standard or custom — both have apiUrl and modelName on the record
            protocol = 'openai'
            if model_type == 'standard':
                provider = self._get_provider_for_model(selected)
                if provider:
                    protocol = provider.get('protocol', 'openai')
            config = {
                'apiKey': selected.get('apiKey', ''),
                'apiUrl': selected.get('apiUrl', ''),
                'modelName': selected.get('modelName', ''),
                'timeout': 120,
                'protocol': protocol,
            }

        app.logger.info(f'Using model: {config["modelName"]} at {config["apiUrl"]} (type={model_type})')
        return config

    def validate_llm_config(self, config):
        """Validate LLM configuration dict."""
        if not config.get('apiKey'):
            return {'valid': False, 'error': 'LLM API key is not configured'}
        if not config.get('apiUrl'):
            return {'valid': False, 'error': 'LLM API URL is not configured'}
        if not config.get('modelName'):
            return {'valid': False, 'error': 'LLM model name is not configured'}
        return {'valid': True}

# Initialize config loader
config_loader = ConfigLoader()

# Store config_loader in app.config for domain routes to access
app.config['config_loader'] = config_loader

# Health check endpoint - migrated to domains/system/routes.py
# Get log file content endpoint - migrated to domains/system/routes.py
# Chat completion endpoint - migrated to domains/chat/routes.py
# Document validation endpoint - migrated to domains/document/routes.py

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

