"""
Search Service Domain Routes
Handles search service configuration and search operations
"""

import os
import sys
import json
import random
import logging
import requests
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

# Create blueprint for search service domain
search_service_bp = Blueprint('search_service', __name__, url_prefix='/api/search-services')


def _get_search_service_config_path():
    """
    Determine search service configuration file path based on environment
    Returns the path to search-service-configs.json
    """
    electron_user_data = os.environ.get('ELECTRON_USER_DATA')
    
    if electron_user_data:
        # Running in Electron - use the userData path provided by Electron
        config_dir = Path(electron_user_data)
        logger.debug('[Search Service Domain] Using Electron userData path for search service configs', extra={
            'path': str(config_dir)
        })
    elif getattr(sys, 'frozen', False):
        # Running as packaged executable (non-Electron)
        if sys.platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
        else:
            config_dir = Path.home() / '.config' / 'EcritisAgent'
        logger.debug('[Search Service Domain] Using packaged app config path for search service configs', extra={
            'path': str(config_dir)
        })
    else:
        # Running in development
        config_dir = Path(__file__).parent.parent.parent / 'userData'
        logger.debug('[Search Service Domain] Using development config path for search service configs', extra={
            'path': str(config_dir)
        })
    
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / 'search-service-configs.json'


@search_service_bp.route('/configs', methods=['GET', 'POST'])
def search_service_configs():
    """
    Manage search service configurations with persistent storage
    GET: Retrieve all search service configurations
    POST: Save search service configurations
    """
    if request.method == 'GET':
        logger.info('[Search Service Domain] Search service configurations retrieval requested')
        
        try:
            config_path = _get_search_service_config_path()
            
            # Check if file exists
            if not config_path.exists():
                logger.info('[Search Service Domain] Search service config file does not exist, creating default configuration')
                
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
                
                logger.info('[Search Service Domain] Default search service configuration created successfully', extra={
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
            
            logger.info(f'[Search Service Domain] Returning {len(configs.get("searchServices", []))} search service configurations', extra={
                'total_count': len(configs.get('searchServices', []))
            })
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('searchServices', [])),
                'configPath': str(config_path)
            })
        
        except Exception as e:
            logger.error(f'[Search Service Domain] Failed to retrieve search service configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve search service configurations',
                'details': str(e)
            }), 500
    
    # POST request - save search service configurations
    logger.info('[Search Service Domain] Search service configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            logger.warning('[Search Service Domain] No data provided in search service config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'searchServices' not in data:
            logger.warning('[Search Service Domain] searchServices array missing in request data')
            return jsonify({
                'success': False,
                'error': 'searchServices array is required'
            }), 400
        
        searchServices = data.get('searchServices', [])
        logger.debug(f'[Search Service Domain] Saving {len(searchServices)} search service configurations')
        
        # Validate each search service configuration
        for idx, service in enumerate(searchServices):
            required_fields = ['id', 'name', 'type', 'apiKeys']
            missing_fields = [field for field in required_fields if field not in service or (field != 'apiKeys' and not service[field])]
            
            if missing_fields:
                logger.warning(f'[Search Service Domain] Service at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            if not isinstance(service['apiKeys'], list) or len(service['apiKeys']) == 0:
                logger.warning(f'[Search Service Domain] Service at index {idx} has invalid apiKeys (must be non-empty array)')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} has invalid apiKeys (must be non-empty array)'
                }), 400
            
            # Log service info
            logger.debug(f'[Search Service Domain] Service {idx}: {service.get("name")} (type: {service.get("type")}, apiKeys: {len(service.get("apiKeys", []))})')
        
        # Add timestamps if not present
        current_time = datetime.now().isoformat()
        for service in searchServices:
            if 'updatedAt' not in service:
                service['updatedAt'] = current_time
            if 'createdAt' not in service:
                service['createdAt'] = current_time
        
        # Get configuration file path
        config_path = _get_search_service_config_path()
        
        # Save to file
        config_data = {
            'searchServices': searchServices,
            'defaultServiceId': data.get('defaultServiceId')
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f'[Search Service Domain] Search service configurations saved successfully: {len(searchServices)} services', extra={
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
        logger.error(f'[Search Service Domain] Failed to save search service configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save search service configurations',
            'details': str(e)
        }), 500


@search_service_bp.route('/search', methods=['POST'])
def search_service_search():
    """
    Search using configured search services (e.g., Tavily)
    
    POST body:
        - query: Search query string
        - maxResults: Number of results to return (default: 5)
        - serviceId: Optional service ID to use (default: uses default service)
    """
    start_time = datetime.now()
    logger.info('[Search Service Domain] Search request received')
    
    try:
        data = request.get_json() or {}
        search_query = data.get('query', '')
        max_results = data.get('maxResults', 5)
        service_id = data.get('serviceId')
        
        if not search_query or not isinstance(search_query, str) or not search_query.strip():
            logger.warning('[Search Service Domain] Invalid search query in request')
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
        
        logger.info(f'[Search Service Domain] Processing search request', extra={
            'query': search_query,
            'maxResults': max_results,
            'serviceId': service_id or 'default'
        })
        
        # Load search service configurations
        config_path = _get_search_service_config_path()
        
        if not config_path.exists():
            logger.warning('[Search Service Domain] Search service config file not found')
            return jsonify({
                'success': False,
                'error': 'Search service configuration not found. Please configure search services in settings.'
            }), 404
        
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        # Find the service to use
        services = configs.get('searchServices', [])
        if not services:
            logger.warning('[Search Service Domain] No search services configured')
            return jsonify({
                'success': False,
                'error': 'No search services configured. Please configure search services in settings.'
            }), 404
        
        # Select service
        selected_service = None
        if service_id:
            selected_service = next((s for s in services if s.get('id') == service_id), None)
            if not selected_service:
                logger.warning(f'[Search Service Domain] Service {service_id} not found, using default')
        
        if not selected_service:
            # Use default service
            default_service_id = configs.get('defaultServiceId')
            if default_service_id:
                selected_service = next((s for s in services if s.get('id') == default_service_id), None)
            
            if not selected_service:
                # Use first service
                selected_service = services[0]
        
        logger.info(f'[Search Service Domain] Using search service', extra={
            'serviceId': selected_service.get('id'),
            'serviceName': selected_service.get('name'),
            'serviceType': selected_service.get('type'),
            'apiKeyCount': len(selected_service.get('apiKeys', []))
        })
        
        # Get API keys
        api_keys = selected_service.get('apiKeys', [])
        if not api_keys:
            logger.error('[Search Service Domain] No API keys available for service')
            return jsonify({
                'success': False,
                'error': 'No API keys configured for the selected search service'
            }), 500
        
        # Select random API key
        selected_api_key = random.choice(api_keys)
        
        logger.debug(f'[Search Service Domain] Selected API key (index: {api_keys.index(selected_api_key)}/{len(api_keys)})')
        
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
            
            logger.debug(f'[Search Service Domain] Calling Tavily API', extra={
                'url': tavily_api_url,
                'query': search_query,
                'maxResults': max_results
            })
            
            response = requests.post(tavily_api_url, json=search_payload, timeout=15)
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f'[Search Service Domain] Tavily API error: {response.status_code} - {error_text}')
                return jsonify({
                    'success': False,
                    'error': f'Tavily API error: {response.status_code}',
                    'details': error_text
                }), response.status_code
            
            result_data = response.json()
            results = result_data.get('results', [])
            
            logger.info(f'[Search Service Domain] Tavily search completed', extra={
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
            logger.info(f'[Search Service Domain] Search completed in {duration:.2f}s', extra={
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
            logger.warning(f'[Search Service Domain] Unsupported service type: {service_type}')
            return jsonify({
                'success': False,
                'error': f'Unsupported search service type: {service_type}'
            }), 400
    
    except requests.Timeout:
        logger.error('[Search Service Domain] Search request timed out')
        return jsonify({
            'success': False,
            'error': 'Request timed out'
        }), 504
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f'[Search Service Domain] Search request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to perform search',
            'details': str(e)
        }), 500

