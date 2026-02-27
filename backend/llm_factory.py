"""
LLM Factory — Protocol-aware LLM client creation.

Provides two layers:
1. LangChain-based: ``create_llm_client`` for agent workflows.
2. Raw HTTP-based: ``build_http_request`` + ``iter_anthropic_as_openai_sse``
   for the chat route's streaming pass-through.
"""

import json
import logging
import requests as _requests

logger = logging.getLogger(__name__)


def create_llm_client(call_config: dict, *, temperature: float = 0.7, streaming: bool = False, **kwargs):
    """
    Create a LangChain chat model based on the protocol field in call_config.

    Args:
        call_config: Dict with keys: apiKey, apiUrl, modelName, protocol,
                     and optionally extraHeaders, defaultParams.
        temperature: LLM temperature override.
        streaming: Whether to enable streaming.
        **kwargs: Extra keyword args forwarded to the LangChain constructor.

    Returns:
        A LangChain BaseChatModel instance (ChatOpenAI or ChatAnthropic).
    """
    protocol = call_config.get('protocol', 'openai')
    api_key = call_config.get('apiKey', '')
    api_url = call_config.get('apiUrl', '')
    model_name = call_config.get('modelName', '')
    extra_headers = call_config.get('extraHeaders') or {}
    default_params = call_config.get('defaultParams') or {}

    if protocol == 'anthropic':
        return _create_anthropic_client(
            api_key=api_key,
            api_url=api_url,
            model_name=model_name,
            extra_headers=extra_headers,
            default_params=default_params,
            temperature=temperature,
            streaming=streaming,
            **kwargs,
        )

    # Default: OpenAI-compatible protocol
    if protocol != 'openai':
        logger.warning(f'Unknown protocol "{protocol}", falling back to OpenAI')

    return _create_openai_client(
        api_key=api_key,
        api_url=api_url,
        model_name=model_name,
        temperature=temperature,
        streaming=streaming,
        **kwargs,
    )


def _create_openai_client(*, api_key, api_url, model_name, temperature, streaming, **kwargs):
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=api_url.rstrip('/') if api_url else None,
        temperature=temperature,
        streaming=streaming,
        **kwargs,
    )


def _create_anthropic_client(*, api_key, api_url, model_name, extra_headers, default_params, temperature, streaming, **kwargs):
    try:
        from langchain_anthropic import ChatAnthropic
    except ImportError:
        logger.error(
            'langchain-anthropic is not installed. '
            'Install it with: pip install langchain-anthropic'
        )
        raise

    # Merge default_params into kwargs (temperature/top_p from provider template)
    merged_kwargs = {**kwargs}
    if default_params.get('top_p') is not None:
        merged_kwargs.setdefault('top_p', default_params['top_p'])

    # Use temperature from default_params if caller didn't override the default 0.7
    effective_temp = temperature
    if 'temperature' in default_params and temperature == 0.7:
        effective_temp = default_params['temperature']

    init_kwargs = dict(
        model=model_name,
        api_key=api_key,
        temperature=effective_temp,
        streaming=streaming,
        **merged_kwargs,
    )

    # Anthropic base_url (strip /v1 suffix if present — ChatAnthropic adds it)
    if api_url:
        base = api_url.rstrip('/')
        if base.endswith('/v1'):
            base = base[:-3]
        init_kwargs['anthropic_api_url'] = base

    # Inject extra headers (e.g., User-Agent for Kimi)
    if extra_headers:
        init_kwargs['default_headers'] = extra_headers

    return ChatAnthropic(**init_kwargs)


# ── Raw-HTTP helpers (used by chat/routes.py for streaming) ─────────────────


def build_http_request(config: dict, messages: list, *, stream: bool = True, temperature: float = 0.7):
    """
    Build (endpoint, headers, payload) for a raw HTTP streaming request.

    Returns:
        Tuple of (endpoint_url, headers_dict, payload_dict, protocol_str).
    """
    protocol = config.get('protocol', 'openai')
    api_url = config.get('apiUrl', '').rstrip('/')
    api_key = config.get('apiKey', '')
    model_name = config.get('modelName', '')
    extra_headers = config.get('extraHeaders') or {}
    default_params = config.get('defaultParams') or {}

    if protocol == 'anthropic':
        return _build_anthropic_http(
            api_url=api_url,
            api_key=api_key,
            model_name=model_name,
            messages=messages,
            extra_headers=extra_headers,
            default_params=default_params,
            stream=stream,
            temperature=temperature,
        )

    # OpenAI-compatible
    return _build_openai_http(
        api_url=api_url,
        api_key=api_key,
        model_name=model_name,
        messages=messages,
        stream=stream,
        temperature=temperature,
    )


def _build_openai_http(*, api_url, api_key, model_name, messages, stream, temperature):
    endpoint = f"{api_url}/chat/completions"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    }
    payload = {
        'model': model_name,
        'messages': messages,
        'stream': stream,
        'temperature': temperature,
    }
    return endpoint, headers, payload, 'openai'


def _build_anthropic_http(*, api_url, api_key, model_name, messages, extra_headers, default_params, stream, temperature):
    # Anthropic Messages API endpoint
    base = api_url.rstrip('/')
    if not base.endswith('/v1/messages'):
        if base.endswith('/v1'):
            base += '/messages'
        else:
            base += '/v1/messages'
    endpoint = base

    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
    }
    headers.update(extra_headers)

    # Separate system message from user/assistant messages
    system_text = ''
    api_messages = []
    for m in messages:
        if m['role'] == 'system':
            system_text += m['content'] + '\n'
        else:
            api_messages.append({'role': m['role'], 'content': m['content']})

    # Ensure first message is from user (Anthropic requirement)
    if api_messages and api_messages[0]['role'] != 'user':
        api_messages.insert(0, {'role': 'user', 'content': '...'})

    effective_temp = default_params.get('temperature', temperature)
    payload = {
        'model': model_name,
        'messages': api_messages,
        'max_tokens': 8192,
        'stream': stream,
        'temperature': effective_temp,
    }
    if system_text.strip():
        payload['system'] = system_text.strip()
    if 'top_p' in default_params:
        payload['top_p'] = default_params['top_p']

    return endpoint, headers, payload, 'anthropic'


def iter_anthropic_as_openai_sse(response):
    """
    Convert an Anthropic streaming response into OpenAI-compatible SSE chunks.

    Reads line-by-line from a ``requests.Response`` with ``stream=True`` and
    yields bytes in OpenAI ``data: {...}\\n\\n`` format so the frontend can
    consume the stream without modification.
    """
    msg_id = ''
    model = ''

    for raw_line in response.iter_lines(decode_unicode=True):
        if not raw_line:
            continue

        # Anthropic sends "event: <type>" and "data: <json>" lines.
        # We only need the data lines.
        if raw_line.startswith('event:'):
            continue

        if not raw_line.startswith('data:'):
            continue

        data_str = raw_line[len('data:'):].strip()
        if data_str == '[DONE]':
            yield b'data: [DONE]\n\n'
            return

        try:
            evt = json.loads(data_str)
        except json.JSONDecodeError:
            continue

        evt_type = evt.get('type', '')

        if evt_type == 'message_start':
            msg = evt.get('message', {})
            msg_id = msg.get('id', '')
            model = msg.get('model', '')
            continue

        if evt_type == 'content_block_delta':
            delta = evt.get('delta', {})
            text = delta.get('text', '')
            if not text:
                continue
            openai_chunk = {
                'id': msg_id,
                'object': 'chat.completion.chunk',
                'model': model,
                'choices': [{
                    'index': 0,
                    'delta': {'content': text},
                    'finish_reason': None,
                }],
            }
            yield f"data: {json.dumps(openai_chunk, ensure_ascii=False)}\n\n".encode('utf-8')

        elif evt_type == 'message_delta':
            stop = evt.get('delta', {}).get('stop_reason')
            if stop:
                openai_chunk = {
                    'id': msg_id,
                    'object': 'chat.completion.chunk',
                    'model': model,
                    'choices': [{
                        'index': 0,
                        'delta': {},
                        'finish_reason': 'stop',
                    }],
                }
                yield f"data: {json.dumps(openai_chunk, ensure_ascii=False)}\n\n".encode('utf-8')

        elif evt_type == 'message_stop':
            yield b'data: [DONE]\n\n'
            return


# ── Proxy-resilient HTTP helper ─────────────────────────────────────────────


def llm_post(url: str, *, headers: dict, json: dict, stream: bool = True, timeout=None):
    """
    ``requests.post`` wrapper that automatically retries without proxy
    when a ProxyError occurs.  Useful for Chinese LLM APIs (e.g. Kimi)
    that are accessible directly but may fail through a VPN/proxy.
    """
    try:
        return _requests.post(url, headers=headers, json=json, stream=stream, timeout=timeout)
    except _requests.exceptions.ProxyError:
        logger.warning('Proxy error, retrying without proxy', extra={'url': url})
        return _requests.post(
            url, headers=headers, json=json, stream=stream, timeout=timeout,
            proxies={'http': None, 'https': None},
        )
