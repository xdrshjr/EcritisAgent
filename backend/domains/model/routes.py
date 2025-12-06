"""
Model Domain Routes
Handles LLM model configuration management
"""

import logging
import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app

logger = logging.getLogger(__name__)

# Create blueprint for model domain
model_bp = Blueprint('model', __name__, url_prefix='/api')


@model_bp.route('/model-configs', methods=['GET', 'POST'])
def model_configs():
    """
    Manage model configurations with persistent storage
    GET: Retrieve all model configurations
    POST: Save model configurations
    """
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Model Domain] config_loader not found in app.config')
        return jsonify({
            'success': False,
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    if request.method == 'GET':
        logger.info('[Model Domain] Model configurations retrieval requested')
        
        try:
            configs = config_loader.load_model_configs()
            
            logger.info(f'[Model Domain] Returning {len(configs.get("models", []))} model configurations')
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('models', [])),
                'configPath': str(config_loader.config_path)
            })
        
        except Exception as e:
            logger.error(f'[Model Domain] Failed to retrieve model configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve model configurations',
                'details': str(e)
            }), 500
    
    # POST request - save model configurations
    logger.info('[Model Domain] Model configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            logger.warning('[Model Domain] No data provided in model config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'models' not in data:
            logger.warning('[Model Domain] Models array missing in request data')
            return jsonify({
                'success': False,
                'error': 'Models array is required'
            }), 400
        
        models = data.get('models', [])
        logger.debug(f'[Model Domain] Saving {len(models)} model configurations')
        
        # Validate each model configuration
        for idx, model in enumerate(models):
            required_fields = ['id', 'name', 'apiUrl', 'apiKey', 'modelName']
            missing_fields = [field for field in required_fields if field not in model or not model[field]]
            
            if missing_fields:
                logger.warning(f'[Model Domain] Model at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'Model at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            logger.debug(f'[Model Domain] Model {idx}: {model.get("name")} ({model.get("modelName")})')
        
        # Add timestamps if not present
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
        
        logger.info(f'[Model Domain] Model configurations saved successfully: {len(models)} models', extra={
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
        logger.error(f'[Model Domain] Failed to save model configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save model configurations',
            'details': str(e)
        }), 500

