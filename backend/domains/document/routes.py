"""
Document Domain Routes
Handles document validation and text processing operations
"""

import logging
import json
import requests
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app
from datetime import datetime

logger = logging.getLogger(__name__)

# Create blueprint for document domain
document_bp = Blueprint('document', __name__, url_prefix='/api')


@document_bp.route('/document-validation', methods=['POST', 'GET'])
def document_validation():
    """
    Handle document validation requests with streaming support
    POST: Stream validation results from LLM
    GET: Health check for validation API
    """
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Document Domain] config_loader not found in app.config')
        return jsonify({
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    if request.method == 'GET':
        logger.info('[Document Domain] Document validation API health check')
        
        try:
            config = config_loader.get_llm_config()
            
            if config is None:
                logger.info('[Document Domain] Validation API health check: No model configured')
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
            logger.error(f'[Document Domain] Validation API health check failed: {str(e)}', exc_info=True)
            return jsonify({'status': 'error', 'configured': False}), 500
    
    # POST request - handle validation
    start_time = datetime.now()
    logger.info('[Document Domain] Document validation request received')
    
    try:
        # Parse request body
        data = request.get_json()
        content = data.get('content')
        chunk_index = data.get('chunkIndex', 0)
        total_chunks = data.get('totalChunks', 1)
        language = data.get('language', 'en')
        model_id = data.get('modelId')  # Get optional model ID
        
        if not content or not isinstance(content, str):
            logger.warning(f'[Document Domain] Invalid content in validation request: {type(content)}')
            return jsonify({'error': 'Content is required and must be a string'}), 400
        
        # Normalize language parameter
        if language not in ['en', 'zh']:
            logger.warning(f'[Document Domain] Unsupported language "{language}" received, defaulting to English')
            language = 'en'
        
        logger.info(f'[Document Domain] Processing validation request: chunk {chunk_index + 1}/{total_chunks}, content length: {len(content)}, language: {language}, modelId: {model_id or "default"}, note: results will be accumulated and sorted by severity on frontend', extra={
            'chunk_index': chunk_index,
            'total_chunks': total_chunks,
            'content_length': len(content),
            'language': language,
            'model_id': model_id,
        })
        
        # Get and validate LLM configuration with specified model ID
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            logger.error('[Document Domain] LLM configuration not available - no model configured', extra={
                'requested_model_id': model_id,
            })
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use document validation features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            logger.error(f'[Document Domain] LLM configuration validation failed: {validation.get("error")}', extra={
                'validation_error': validation.get('error'),
                'model_name': config.get('modelName', 'unknown'),
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Prepare language-specific validation prompt
        if language == 'zh':
            logger.debug(f'[Document Domain] Using Chinese validation prompt for chunk {chunk_index + 1}')
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
            logger.debug(f'[Document Domain] Using English validation prompt for chunk {chunk_index + 1}')
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
        
        logger.info(f'[Document Domain] Prepared language-specific prompts: language={language}, system_prompt_length={len(system_content)}, user_prompt_length={len(user_content)}', extra={
            'language': language,
            'system_prompt_length': len(system_content),
            'user_prompt_length': len(user_content),
        })
        
        messages = [system_message, user_message]
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        logger.debug(f'[Document Domain] Sending validation request to LLM API: {endpoint}')
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        payload = {
            'model': config['modelName'],
            'messages': messages,
            'stream': True,
            'temperature': 0.3  # Lower temperature for more consistent validation
        }
        
        logger.info('[Document Domain] [LLM Request] Removed max_tokens limit to allow unlimited response length', extra={
            'model': config['modelName'],
            'chunk_index': chunk_index,
            'note': 'Document validation responses will not be truncated by token limits'
        })
        
        # Make streaming request to LLM API
        def generate():
            try:
                logger.info(f'[Document Domain] Starting LLM API validation streaming request for chunk {chunk_index}')
                
                from llm_factory import llm_post
                with llm_post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=config['timeout']
                ) as response:
                    
                    if response.status_code != 200:
                        error_text = response.text
                        logger.error(f'[Document Domain] LLM API validation error: {response.status_code} - {error_text}')
                        yield json.dumps({
                            'error': f'LLM API error: {response.status_code}',
                            'details': error_text
                        }).encode('utf-8')
                        return
                    
                    logger.info(f'[Document Domain] Streaming validation response started for chunk {chunk_index + 1}/{total_chunks}')
                    chunk_count = 0
                    total_bytes = 0
                    
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            chunk_count += 1
                            total_bytes += len(chunk)
                            yield chunk
                            
                            # Log progress periodically
                            if chunk_count % 10 == 0:
                                logger.debug(f'[Document Domain] Validation stream progress: {chunk_count} stream chunks, {total_bytes} bytes (doc chunk {chunk_index + 1}/{total_chunks})')
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    logger.info(f'[Document Domain] Validation stream completed for chunk {chunk_index + 1}/{total_chunks}: {chunk_count} stream chunks, {total_bytes} bytes in {duration:.2f}s - Results will be accumulated and sorted on frontend', extra={
                        'chunk_index': chunk_index,
                        'total_chunks': total_chunks,
                        'chunk_count': chunk_count,
                        'total_bytes': total_bytes,
                        'duration': duration,
                    })
            
            except requests.Timeout:
                logger.error(f'[Document Domain] Validation request timed out for chunk {chunk_index}')
                yield json.dumps({'error': 'Request timed out'}).encode('utf-8')
            
            except Exception as e:
                logger.error(f'[Document Domain] Error in validation stream for chunk {chunk_index}: {str(e)}', exc_info=True)
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
        logger.error(f'[Document Domain] Validation request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process validation request',
            'details': str(e)
        }), 500


@document_bp.route('/text-processing', methods=['POST'])
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
    # Get config_loader from Flask app config
    config_loader = current_app.config.get('config_loader')
    if not config_loader:
        logger.error('[Document Domain] config_loader not found in app.config')
        return jsonify({
            'error': 'Configuration error',
            'details': 'Config loader not available'
        }), 500
    
    start_time = datetime.now()
    logger.info('[Document Domain] [TextProcessing] Request received')
    
    try:
        data = request.get_json() or {}
        text = data.get('text', '')
        processing_type = data.get('type', '')
        model_id = data.get('modelId')
        
        if not text or not isinstance(text, str):
            logger.warning('[Document Domain] [TextProcessing] Invalid text parameter', extra={
                'text_type': type(text).__name__,
                'has_text': bool(text),
            })
            return jsonify({'error': 'text is required and must be a string'}), 400
        
        if processing_type not in ['polish', 'rewrite', 'check']:
            logger.warning('[Document Domain] [TextProcessing] Invalid type parameter', extra={
                'type': processing_type,
            })
            return jsonify({'error': 'type must be one of: polish, rewrite, check'}), 400
        
        logger.info('[Document Domain] [TextProcessing] Processing request', extra={
            'type': processing_type,
            'text_length': len(text),
            'text_preview': text[:100] + '...' if len(text) > 100 else text,
            'model_id': model_id or 'default',
        })
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config(model_id=model_id)
        
        if config is None:
            logger.error('[Document Domain] [TextProcessing] LLM configuration not available', extra={
                'requested_model_id': model_id,
            })
            return jsonify({
                'error': 'No LLM model configured',
                'details': 'Please configure a model in Settings to use text processing features.'
            }), 500
        
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            logger.error('[Document Domain] [TextProcessing] LLM configuration validation failed', extra={
                'validation_error': validation.get('error'),
                'model_name': config.get('modelName', 'unknown'),
            })
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        logger.info('[Document Domain] [TextProcessing] LLM configuration validated', extra={
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
        logger.debug('[Document Domain] [TextProcessing] Sending request to LLM API', extra={
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
            'temperature': 0.7
        }
        
        logger.info('[Document Domain] [TextProcessing] [LLM Request] Removed max_tokens limit to allow unlimited response length', extra={
            'model': config['modelName'],
            'processing_type': processing_type,
            'note': 'Text processing responses will not be truncated by token limits'
        })
        
        # Make request to LLM API
        logger.debug('[Document Domain] [TextProcessing] Making LLM API request', extra={
            'model': config['modelName'],
            'messages_count': len(messages),
        })
        
        from llm_factory import llm_post
        response = llm_post(endpoint, headers=headers, json=payload, stream=False, timeout=120)
        
        if response.status_code != 200:
            logger.error('[Document Domain] [TextProcessing] LLM API error', extra={
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
            logger.error('[Document Domain] [TextProcessing] Empty response from LLM', extra={
                'response_data': response_data,
            })
            return jsonify({'error': 'Empty response from LLM'}), 500
        
        logger.debug('[Document Domain] [TextProcessing] LLM response received', extra={
            'content_length': len(llm_content),
            'content_preview': llm_content[:100],
        })
        
        # Process response based on type
        if processing_type == 'check':
            # Try to parse JSON response with robust parsing
            logger.debug('[Document Domain] [TextProcessing] Starting JSON parsing for check result', extra={
                'content_length': len(llm_content),
                'content_preview': llm_content[:150],
            })
            
            try:
                # Step 1: Clean the content
                cleaned_content = llm_content.strip()
                logger.debug('[Document Domain] [TextProcessing] Step 1: Content cleaned', extra={
                    'original_length': len(llm_content),
                    'cleaned_length': len(cleaned_content),
                })
                
                # Step 2: Remove markdown code blocks if present
                if '```' in cleaned_content:
                    logger.debug('[Document Domain] [TextProcessing] Step 2: Detected markdown code block, extracting JSON')
                    
                    # Method 1: Try to extract from ```json ... ``` or ``` ... ```
                    if '```json' in cleaned_content:
                        start_marker = '```json'
                        start_pos = cleaned_content.find(start_marker) + len(start_marker)
                        end_pos = cleaned_content.find('```', start_pos)
                        if end_pos != -1:
                            extracted = cleaned_content[start_pos:end_pos].strip()
                            if extracted:
                                cleaned_content = extracted
                                logger.debug('[Document Domain] [TextProcessing] Step 2: Extracted JSON from ```json block', extra={
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
                                logger.debug('[Document Domain] [TextProcessing] Step 2: Extracted JSON from generic code block', extra={
                                    'extracted_length': len(cleaned_content),
                                    'extracted_preview': cleaned_content[:200],
                                })
                    
                    # If still contains ```, try to find JSON object boundaries
                    if '```' in cleaned_content:
                        logger.debug('[Document Domain] [TextProcessing] Step 2: Still contains ```, trying to find JSON boundaries')
                        first_brace = cleaned_content.find('{')
                        last_brace = cleaned_content.rfind('}')
                        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                            cleaned_content = cleaned_content[first_brace:last_brace + 1]
                            logger.debug('[Document Domain] [TextProcessing] Step 2: Extracted JSON using brace boundaries', extra={
                                'extracted_length': len(cleaned_content),
                            })
                
                # Step 3: Try to find JSON object in the content
                if not cleaned_content.startswith('{') and not cleaned_content.startswith('['):
                    logger.debug('[Document Domain] [TextProcessing] Step 3: Content does not start with { or [, searching for JSON')
                    # Try to find JSON object boundaries
                    first_brace = cleaned_content.find('{')
                    last_brace = cleaned_content.rfind('}')
                    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                        cleaned_content = cleaned_content[first_brace:last_brace + 1]
                        logger.debug('[Document Domain] [TextProcessing] Step 3: Found JSON boundaries', extra={
                            'first_brace': first_brace,
                            'last_brace': last_brace,
                        })
                
                # Step 4: Parse JSON
                logger.debug('[Document Domain] [TextProcessing] Step 4: Attempting JSON parse', extra={
                    'content_to_parse': cleaned_content[:200],
                })
                check_result = json.loads(cleaned_content)
                
                # Step 5: Validate and extract issues
                logger.debug('[Document Domain] [TextProcessing] Step 5: JSON parsed successfully, validating structure', extra={
                    'parsed_type': type(check_result).__name__,
                })
                
                issues = []
                if isinstance(check_result, dict):
                    if 'issues' in check_result:
                        issues = check_result['issues']
                        logger.debug('[Document Domain] [TextProcessing] Step 5: Found issues in dict.issues')
                    elif 'result' in check_result and isinstance(check_result['result'], list):
                        issues = check_result['result']
                        logger.debug('[Document Domain] [TextProcessing] Step 5: Found issues in dict.result')
                    else:
                        logger.warning('[Document Domain] [TextProcessing] Step 5: Dict structure unexpected, keys: ' + str(list(check_result.keys())))
                elif isinstance(check_result, list):
                    issues = check_result
                    logger.debug('[Document Domain] [TextProcessing] Step 5: Found issues as direct list')
                else:
                    logger.warning('[Document Domain] [TextProcessing] Step 5: Unexpected parsed type, creating fallback issue')
                
                # Step 6: Validate and normalize issues
                validated_issues = []
                valid_types = ['grammar', 'spelling', 'style', 'other']
                
                for idx, issue in enumerate(issues):
                    if not isinstance(issue, dict):
                        logger.warning('[Document Domain] [TextProcessing] Step 6: Issue {} is not a dict, skipping'.format(idx), extra={
                            'issue_type': type(issue).__name__,
                            'issue_value': str(issue)[:100],
                        })
                        continue
                    
                    # Normalize issue structure
                    issue_type = issue.get('type', 'other')
                    if issue_type not in valid_types:
                        logger.debug('[Document Domain] [TextProcessing] Step 6: Issue {} has invalid type "{}", defaulting to "other"'.format(idx, issue_type))
                        issue_type = 'other'
                    
                    issue_message = issue.get('message', '')
                    if not issue_message:
                        # Try alternative field names
                        issue_message = issue.get('text', issue.get('description', issue.get('content', '')))
                    
                    if not issue_message:
                        logger.warning('[Document Domain] [TextProcessing] Step 6: Issue {} has no message, skipping'.format(idx))
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
                    logger.debug('[Document Domain] [TextProcessing] Step 6: Validated issue {}'.format(idx), extra={
                        'type': validated_issue['type'],
                        'message_preview': validated_issue['message'][:50],
                    })
                
                logger.info('[Document Domain] [TextProcessing] Check completed successfully', extra={
                    'raw_issue_count': len(issues),
                    'validated_issue_count': len(validated_issues),
                    'duration': str(datetime.now() - start_time),
                })
                
                return jsonify({'issues': validated_issues})
                
            except json.JSONDecodeError as e:
                logger.warning('[Document Domain] [TextProcessing] JSON parsing failed, attempting enhanced fallback parsing', extra={
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
                                logger.info('[Document Domain] [TextProcessing] Enhanced fallback successfully parsed JSON', extra={
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
                                    logger.info('[Document Domain] [TextProcessing] Enhanced fallback validation completed', extra={
                                        'validated_count': len(validated_issues),
                                    })
                                    return jsonify({'issues': validated_issues})
                        except json.JSONDecodeError:
                            logger.debug('[Document Domain] [TextProcessing] Enhanced fallback JSON parse also failed')
                except Exception as fallback_error:
                    logger.debug('[Document Domain] [TextProcessing] Enhanced fallback extraction failed', extra={
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
                    logger.info('[Document Domain] [TextProcessing] Fallback text parsing extracted {} issues'.format(len(fallback_issues)))
                    return jsonify({'issues': fallback_issues})
                
                # Final fallback: create a single issue from the response
                logger.warning('[Document Domain] [TextProcessing] Using final fallback: single issue from raw content', extra={
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
            logger.info('[Document Domain] [TextProcessing] Processing completed', extra={
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
        logger.error('[Document Domain] [TextProcessing] Request timeout', exc_info=True)
        return jsonify({'error': 'Request timeout'}), 504
    except requests.exceptions.RequestException as e:
        logger.error('[Document Domain] [TextProcessing] Request exception', extra={
            'error': str(e),
        }, exc_info=True)
        return jsonify({'error': 'Request failed', 'details': str(e)}), 500
    except Exception as error:
        logger.error('[Document Domain] [TextProcessing] Unexpected error', extra={
            'error': str(error),
            'error_type': type(error).__name__,
        }, exc_info=True)
        return jsonify({
            'error': 'Text processing failed',
            'details': str(error)
        }), 500

