"""
System Domain Routes
Handles system-level operations like health checks, logs, and filesystem utilities
"""

import os
import sys
import logging
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

# Create blueprint for system domain
system_bp = Blueprint('system', __name__)


def _get_log_file_path():
    """
    Determine log file path based on environment
    Returns the path to flask_backend.log
    Supports Electron, packaged, and development environments
    """
    # Determine log directory
    if getattr(sys, 'frozen', False):
        # Running as packaged executable
        if sys.platform == 'win32':
            log_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent' / 'logs'
        else:
            log_dir = Path.home() / '.config' / 'EcritisAgent' / 'logs'
        logger.debug('[System Domain] Using packaged app log path', extra={
            'path': str(log_dir)
        })
    else:
        # Running in development
        log_dir = Path(__file__).parent.parent / 'logs'
        logger.debug('[System Domain] Using development log path', extra={
            'path': str(log_dir)
        })
    
    # Create log directory if it doesn't exist
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Return log file path
    log_file = log_dir / 'flask_backend.log'
    return log_file


@system_bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    Returns service status and basic information
    """
    logger.debug('[System Domain] Health check requested')
    
    try:
        log_file_path = _get_log_file_path()
        
        response_data = {
            'status': 'ok',
            'service': 'EcritisAgent Flask Backend',
            'timestamp': datetime.utcnow().isoformat(),
            'log_file': str(log_file_path)
        }
        
        logger.info('[System Domain] Health check completed successfully', extra={
            'status': 'ok',
            'log_file': str(log_file_path)
        })
        
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f'[System Domain] Health check failed: {str(e)}', exc_info=True)
        return jsonify({
            'status': 'error',
            'service': 'EcritisAgent Flask Backend',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }), 500


@system_bp.route('/api/logs', methods=['GET'])
def get_logs():
    """
    Return recent log file content
    Useful for debugging and monitoring
    
    Query parameters:
        - lines: Optional number of lines to retrieve (default: 100)
    """
    logger.debug('[System Domain] Log file content requested')
    
    try:
        lines = request.args.get('lines', 100, type=int)
        log_file_path = _get_log_file_path()
        
        if not log_file_path.exists():
            logger.warning('[System Domain] Log file does not exist', extra={
                'path': str(log_file_path)
            })
            return jsonify({
                'error': 'Log file not found',
                'path': str(log_file_path)
            }), 404
        
        # Read last N lines from log file
        with open(log_file_path, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        logger.info(f'[System Domain] Returning {len(recent_lines)} log lines', extra={
            'requested_lines': lines,
            'total_lines': len(all_lines),
            'returned_lines': len(recent_lines),
            'log_file': str(log_file_path)
        })
        
        return jsonify({
            'log_file': str(log_file_path),
            'total_lines': len(all_lines),
            'returned_lines': len(recent_lines),
            'content': ''.join(recent_lines)
        })
    
    except Exception as e:
        logger.error(f'[System Domain] Failed to read log file: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to read log file',
            'details': str(e)
        }), 500

