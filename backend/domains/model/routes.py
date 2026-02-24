"""
Model Domain Routes
Handles LLM model configuration management (multi-type storage)
"""

import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app

logger = logging.getLogger(__name__)

# Create blueprint for model domain
model_bp = Blueprint('model', __name__, url_prefix='/api')


def _get_config_loader():
    """Helper to get config_loader from Flask app config."""
    loader = current_app.config.get('config_loader')
    if not loader:
        logger.error('[Model Domain] config_loader not found in app.config')
    return loader


def _validate_model(model: dict, idx: int):
    """Validate a single model dict. Returns error string or None."""
    model_type = model.get('type', 'custom')
    base_required = ['id', 'name', 'apiKey']

    if model_type == 'standard':
        required = base_required + ['providerId', 'apiUrl', 'modelName']
    elif model_type == 'codingPlan':
        required = base_required + ['serviceId']
    else:  # custom
        required = base_required + ['apiUrl', 'modelName']

    missing = [f for f in required if f not in model or not model[f]]
    if missing:
        return f'Model at index {idx} (type={model_type}) is missing: {", ".join(missing)}'
    return None


# ── Merged endpoint (backward-compatible) ────────────────────────────────────

@model_bp.route('/model-configs', methods=['GET', 'POST'])
def model_configs():
    """
    GET:  Retrieve ALL model configurations (merged from three type files).
    POST: Save model configurations (dispatches to correct type files).
    """
    config_loader = _get_config_loader()
    if not config_loader:
        return jsonify({'success': False, 'error': 'Config loader not available'}), 500

    if request.method == 'GET':
        try:
            # Support ?type= query parameter for filtered loading
            model_type = request.args.get('type', 'all')
            valid_types = ('standard', 'codingPlan', 'custom', 'all')
            if model_type not in valid_types:
                return jsonify({'success': False, 'error': f'Invalid type. Must be one of: {valid_types}'}), 400

            if model_type == 'all':
                configs = config_loader.load_model_configs()
            else:
                configs = config_loader.load_models_by_type(model_type)

            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('models', [])),
                'type': model_type,
            })
        except Exception as e:
            logger.error(f'[Model Domain] Failed to retrieve configs: {e}', exc_info=True)
            return jsonify({'success': False, 'error': str(e)}), 500

    # POST – save (dispatches by type)
    try:
        data = request.get_json()
        if not data or 'models' not in data:
            return jsonify({'success': False, 'error': 'models array is required'}), 400

        # If a top-level "type" is given, save only to that file
        target_type = data.get('type')
        models = data['models']
        current_time = datetime.now(timezone.utc).isoformat()

        for idx, model in enumerate(models):
            # Use the explicit target type or fall back to per-model type
            if target_type:
                model['type'] = target_type
            elif 'type' not in model:
                model['type'] = 'custom'
            err = _validate_model(model, idx)
            if err:
                return jsonify({'success': False, 'error': err}), 400
            model.setdefault('updatedAt', current_time)
            model.setdefault('createdAt', current_time)

        if target_type and target_type in ('standard', 'codingPlan', 'custom'):
            config_loader.save_models_by_type(target_type, {
                'models': models,
                'defaultModelId': data.get('defaultModelId'),
            })
            label = target_type
        else:
            config_loader.save_model_configs({
                'models': models,
                'defaultModelId': data.get('defaultModelId'),
            })
            label = 'all'

        return jsonify({
            'success': True,
            'message': f'{label.capitalize()} model configurations saved successfully',
            'count': len(models),
        })
    except Exception as e:
        logger.error(f'[Model Domain] Failed to save configs: {e}', exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Default model endpoint (must be registered before the variable route) ────

@model_bp.route('/model-configs/default', methods=['POST'])
def set_default_model():
    """Set the global default model (cross-file)."""
    config_loader = _get_config_loader()
    if not config_loader:
        return jsonify({'success': False, 'error': 'Config loader not available'}), 500

    try:
        data = request.get_json()
        model_id = data.get('modelId') if data else None
        if not model_id:
            return jsonify({'success': False, 'error': 'modelId is required'}), 400

        config_loader.set_default_model(model_id)
        return jsonify({
            'success': True,
            'message': f'Default model set to {model_id}',
        })
    except Exception as e:
        logger.error(f'[Model Domain] Failed to set default model: {e}', exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Per-type endpoints ───────────────────────────────────────────────────────

@model_bp.route('/model-configs/<model_type>', methods=['GET', 'POST'])
def model_configs_by_type(model_type: str):
    """
    GET:  Retrieve model configurations for a specific type.
    POST: Save model configurations for a specific type.
    """
    valid_types = ('standard', 'codingPlan', 'custom')
    if model_type not in valid_types:
        return jsonify({'success': False, 'error': f'Invalid type. Must be one of: {valid_types}'}), 400

    config_loader = _get_config_loader()
    if not config_loader:
        return jsonify({'success': False, 'error': 'Config loader not available'}), 500

    if request.method == 'GET':
        try:
            data = config_loader.load_models_by_type(model_type)
            return jsonify({
                'success': True,
                'data': data,
                'count': len(data.get('models', [])),
            })
        except Exception as e:
            logger.error(f'[Model Domain] Failed to load {model_type}: {e}', exc_info=True)
            return jsonify({'success': False, 'error': str(e)}), 500

    # POST
    try:
        data = request.get_json()
        if not data or 'models' not in data:
            return jsonify({'success': False, 'error': 'models array is required'}), 400

        models = data['models']
        current_time = datetime.now(timezone.utc).isoformat()

        for idx, model in enumerate(models):
            model['type'] = model_type  # enforce type
            err = _validate_model(model, idx)
            if err:
                return jsonify({'success': False, 'error': err}), 400
            model.setdefault('updatedAt', current_time)
            model.setdefault('createdAt', current_time)

        config_loader.save_models_by_type(model_type, {
            'models': models,
            'defaultModelId': data.get('defaultModelId'),
        })

        return jsonify({
            'success': True,
            'message': f'{model_type} model configurations saved',
            'count': len(models),
        })
    except Exception as e:
        logger.error(f'[Model Domain] Failed to save {model_type}: {e}', exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Provider templates endpoint ──────────────────────────────────────────────

@model_bp.route('/providers', methods=['GET'])
def get_providers():
    """Return the read-only provider/service templates from providers.json."""
    config_loader = _get_config_loader()
    if not config_loader:
        return jsonify({'success': False, 'error': 'Config loader not available'}), 500

    try:
        providers = config_loader.load_providers()
        return jsonify({
            'success': True,
            'data': providers,
        })
    except Exception as e:
        logger.error(f'[Model Domain] Failed to load providers: {e}', exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
