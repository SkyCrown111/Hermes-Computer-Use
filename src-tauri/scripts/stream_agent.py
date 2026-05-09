#!/usr/bin/env python3
"""
Hermes Agent Stream Wrapper - Unified Message Protocol

This script wraps Hermes Agent's public APIs and outputs structured messages
using a unified prefix-based protocol for IPC with the hermes-app frontend.

Message Protocol:
    All output lines use format: PREFIX:JSON_DATA

    PREFIXES:
    - STATUS:   Agent status updates (thinking, streaming, complete, error)
    - TOKEN:    Streaming text tokens
    - REASONING: AI reasoning/thinking content
    - TOOL:     Tool call events (started, completed, error)
    - APPROVAL: Permission request for dangerous commands
    - CLARIFY:  User clarification question
    - SECRET:   Secret/API key capture request
    - SESSION:  Session creation event
    - USAGE:    Token usage statistics
    - DONE:     Final completion result
    - ERROR:    Error message

Usage:
    stream_agent.py --stdin  # Read JSON from stdin (recommended)
    stream_agent.py <query> [session_id]  # Legacy mode

Stdin JSON format:
    {
        "query": "user message",
        "session_id": "optional_session_id",
        "history": [{"role": "user", "content": "..."}, ...]
    }
"""
import sys
import json
import os
import time
import uuid
import base64
from typing import Dict, Any, Optional, List, Callable

# ============================================================================
# Constants
# ============================================================================

# IPC directories for file-based communication
APPROVAL_DIR = os.path.expanduser('~/.hermes/approvals')
CLARIFY_DIR = os.path.expanduser('~/.hermes/clarify')
SECRET_DIR = os.path.expanduser('~/.hermes/secrets')

# Message prefixes (unified protocol)
MSG_STATUS = 'STATUS'
MSG_TOKEN = 'TOKEN'
MSG_REASONING = 'REASONING'
MSG_TOOL = 'TOOL'
MSG_APPROVAL = 'APPROVAL'
MSG_CLARIFY = 'CLARIFY'
MSG_SECRET = 'SECRET'
MSG_SESSION = 'SESSION'
MSG_USAGE = 'USAGE'
MSG_DONE = 'DONE'
MSG_ERROR = 'ERROR'

# Tool event types
TOOL_STARTED = 'tool.started'
TOOL_COMPLETED = 'tool.completed'
TOOL_ERROR = 'tool.error'

# Default timeouts (seconds)
DEFAULT_APPROVAL_TIMEOUT = 300
DEFAULT_CLARIFY_TIMEOUT = 300
DEFAULT_SECRET_TIMEOUT = 300

# ============================================================================
# Message Output Helpers
# ============================================================================

def emit_message(prefix: str, data: Any) -> None:
    """Emit a structured message to stdout."""
    if isinstance(data, dict):
        json_str = json.dumps(data, ensure_ascii=False)
    elif isinstance(data, str):
        json_str = json.dumps(data, ensure_ascii=False)
    else:
        json_str = json.dumps(data, ensure_ascii=False)
    print(f'{prefix}:{json_str}', flush=True)


def emit_status(status: str, message: str) -> None:
    """Emit agent status update."""
    emit_message(MSG_STATUS, {'status': status, 'message': message})


def emit_token(token: str) -> None:
    """Emit streaming text token."""
    emit_message(MSG_TOKEN, token)


def emit_reasoning(text: str) -> None:
    """Emit reasoning/thinking content."""
    emit_message(MSG_REASONING, text)


def emit_tool(event_type: str, name: str, preview: str = '',
              args: Dict = None, duration: float = None, is_error: bool = False) -> None:
    """Emit tool call event."""
    # Truncate args for display
    args_snap = {}
    if args and isinstance(args, dict):
        for k, v in list(args.items())[:4]:
            s = str(v)
            args_snap[k] = s[:120] + ('...' if len(s) > 120 else '')

    emit_message(MSG_TOOL, {
        'event_type': event_type,
        'name': name,
        'preview': preview,
        'args': args_snap,
        'duration': duration,
        'is_error': is_error
    })


def emit_approval(id: str, command: str, description: str,
                  allow_permanent: bool = True, choices: List[str] = None) -> None:
    """Emit approval request."""
    if choices is None:
        choices = ['once', 'session', 'always', 'deny'] if allow_permanent else ['once', 'session', 'deny']
    emit_message(MSG_APPROVAL, {
        'id': id,
        'command': command,
        'description': description,
        'allow_permanent': allow_permanent,
        'choices': choices
    })


def emit_clarify(id: str, question: str, choices: List[str] = None,
                 is_open_ended: bool = False) -> None:
    """Emit clarification question."""
    emit_message(MSG_CLARIFY, {
        'id': id,
        'question': question,
        'choices': choices or [],
        'is_open_ended': is_open_ended
    })


def emit_secret(id: str, var_name: str, prompt: str,
                metadata: Dict = None) -> None:
    """Emit secret capture request."""
    emit_message(MSG_SECRET, {
        'id': id,
        'var_name': var_name,
        'prompt': prompt,
        'metadata': metadata or {}
    })


def emit_session(session_id: str, created_at: float) -> None:
    """Emit session creation event."""
    emit_message(MSG_SESSION, {
        'session_id': session_id,
        'created_at': created_at
    })


def emit_usage(prompt_tokens: int, completion_tokens: int) -> None:
    """Emit token usage statistics."""
    emit_message(MSG_USAGE, {
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'total_tokens': prompt_tokens + completion_tokens
    })


def emit_done(session_id: str, content: str, reasoning: str = '',
              prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
    """Emit completion result."""
    emit_message(MSG_DONE, {
        'session_id': session_id,
        'content': content,
        'reasoning': reasoning,
        'input_tokens': prompt_tokens,
        'output_tokens': completion_tokens
    })


def emit_error(error: str) -> None:
    """Emit error message."""
    emit_message(MSG_ERROR, {'error': error})

# ============================================================================
# IPC Helpers (File-based communication)
# ============================================================================

def ensure_ipc_dirs() -> None:
    """Ensure IPC directories exist."""
    for dir_path in [APPROVAL_DIR, CLARIFY_DIR, SECRET_DIR]:
        os.makedirs(dir_path, exist_ok=True)


def wait_for_response(response_file: str, request_file: str,
                      timeout: float, default_response: Any) -> Any:
    """Wait for response file to appear, then read and clean up."""
    start = time.time()
    while time.time() - start < timeout:
        if os.path.exists(response_file):
            try:
                with open(response_file, 'r') as f:
                    response = json.load(f)
                # Clean up files
                os.remove(response_file)
                if os.path.exists(request_file):
                    os.remove(request_file)
                return response
            except Exception:
                pass
        time.sleep(0.5)

    # Timeout - clean up request file
    if os.path.exists(request_file):
        os.remove(request_file)
    return default_response


def write_request(dir_path: str, id: str, data: Dict) -> tuple:
    """Write request file and return file paths."""
    request_file = os.path.join(dir_path, f'{id}.request')
    response_file = os.path.join(dir_path, f'{id}.response')

    # Clean up existing files
    for f in [request_file, response_file]:
        if os.path.exists(f):
            os.remove(f)

    # Write request
    with open(request_file, 'w') as f:
        json.dump(data, f, ensure_ascii=False)

    return request_file, response_file

# ============================================================================
# Callback Implementations
# ============================================================================

def create_token_callback() -> Callable:
    """Create token streaming callback."""
    def on_token(text: str) -> None:
        if text:
            emit_token(text)
    return on_token


def create_reasoning_callback() -> Callable:
    """Create reasoning callback."""
    def on_reasoning(text: str) -> None:
        if text:
            emit_reasoning(text)
    return on_reasoning


def create_tool_callback() -> Callable:
    """Create tool progress callback."""
    def on_tool(*args, **kwargs) -> None:
        event_type = args[0] if len(args) > 0 else TOOL_STARTED
        name = args[1] if len(args) > 1 else 'unknown'
        preview = args[2] if len(args) > 2 else ''
        args_dict = args[3] if len(args) > 3 else {}

        emit_tool(
            event_type=event_type,
            name=name,
            preview=preview,
            args=args_dict,
            duration=kwargs.get('duration'),
            is_error=kwargs.get('is_error', False)
        )
    return on_tool


def create_approval_callback() -> Callable:
    """Create approval request callback."""
    ensure_ipc_dirs()

    def on_approval(command: str, description: str, allow_permanent: bool = True) -> str:
        approval_id = str(uuid.uuid4())[:8]
        request_file, response_file = write_request(
            APPROVAL_DIR, approval_id,
            {
                'id': approval_id,
                'command': command,
                'description': description,
                'allow_permanent': allow_permanent
            }
        )

        # Emit approval event
        emit_approval(approval_id, command, description, allow_permanent)

        # Wait for response
        response = wait_for_response(
            response_file, request_file,
            DEFAULT_APPROVAL_TIMEOUT,
            {'choice': 'deny'}
        )
        return response.get('choice', 'deny')

    return on_approval


def create_clarify_callback() -> Callable:
    """Create clarification question callback."""
    ensure_ipc_dirs()

    def on_clarify(question: str, choices: List[str] = None) -> str:
        clarify_id = str(uuid.uuid4())[:8]
        is_open_ended = not choices
        request_file, response_file = write_request(
            CLARIFY_DIR, clarify_id,
            {
                'id': clarify_id,
                'question': question,
                'choices': choices or [],
                'is_open_ended': is_open_ended
            }
        )

        # Emit clarify event
        emit_clarify(clarify_id, question, choices, is_open_ended)

        # Wait for response
        response = wait_for_response(
            response_file, request_file,
            DEFAULT_CLARIFY_TIMEOUT,
            {'answer': 'The user did not respond. Use your best judgement.'}
        )
        return response.get('answer', '')

    return on_clarify


def create_secret_callback() -> Callable:
    """Create secret capture callback."""
    ensure_ipc_dirs()

    def on_secret(var_name: str, prompt: str, metadata: Dict = None) -> Dict:
        secret_id = str(uuid.uuid4())[:8]
        request_file, response_file = write_request(
            SECRET_DIR, secret_id,
            {
                'id': secret_id,
                'var_name': var_name,
                'prompt': prompt,
                'metadata': metadata or {}
            }
        )

        # Emit secret event
        emit_secret(secret_id, var_name, prompt, metadata)

        # Wait for response
        response = wait_for_response(
            response_file, request_file,
            DEFAULT_SECRET_TIMEOUT,
            {'value': ''}  # Empty = skipped
        )

        # If user provided value, store it securely
        if response.get('value'):
            try:
                from hermes_cli.config import save_env_value_secure
                save_env_value_secure(var_name, response['value'])
                return {
                    'success': True,
                    'stored_as': var_name,
                    'message': 'Secret stored securely'
                }
            except Exception as e:
                return {
                    'success': False,
                    'error': str(e),
                    'message': f'Failed to store secret: {e}'
                }
        else:
            return {
                'success': True,
                'skipped': True,
                'message': 'Secret entry was skipped'
            }

    return on_secret

# ============================================================================
# Argument Parsing
# ============================================================================

def parse_args() -> Dict:
    """Parse command line arguments or read from stdin."""
    if len(sys.argv) < 2:
        # Try reading from stdin
        try:
            stdin_data = sys.stdin.read()
            if stdin_data:
                data = json.loads(stdin_data)
                return {
                    'query': data.get('query', ''),
                    'session_id': data.get('session_id'),
                    'history': data.get('history', []),
                    'model_override': data.get('model_override'),
                }
        except Exception:
            pass
        emit_error('No query provided')
        sys.exit(1)

    if sys.argv[1] == '--stdin':
        # Read JSON from stdin
        try:
            stdin_data = sys.stdin.read()
            data = json.loads(stdin_data)
            return {
                'query': data.get('query', ''),
                'session_id': data.get('session_id'),
                'history': data.get('history', []),
                'model_override': data.get('model_override'),
            }
        except json.JSONDecodeError as e:
            emit_error(f'Invalid JSON input: {e}')
            sys.exit(1)
    else:
        # Legacy mode: command line arguments
        query = sys.argv[1]
        session_id = sys.argv[2] if len(sys.argv) > 2 else None
        return {
            'query': query,
            'session_id': session_id,
            'history': [],
            'model_override': None,
        }

# ============================================================================
# Runtime Configuration
# ============================================================================

def resolve_runtime_config() -> Dict:
    """Resolve model, provider, and API configuration."""
    config = {
        'model': 'astron-code-latest',
        'provider': None,
        'base_url': None,
        'api_key': None
    }

    # Try runtime_provider first
    try:
        from hermes_cli.runtime_provider import resolve_runtime_provider
        rt = resolve_runtime_provider()
        config['provider'] = rt.get('provider')
        config['base_url'] = rt.get('base_url')
        config['api_key'] = rt.get('api_key')
        print(f'DEBUG: Resolved via runtime_provider: provider={config["provider"]}, base_url={config["base_url"]}',
              file=sys.stderr)
    except Exception as e:
        print(f'DEBUG: runtime_provider failed: {e}', file=sys.stderr)

    # Read model from config.yaml
    try:
        import yaml
        config_path = os.path.expanduser('~/.hermes/config.yaml')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                yaml_config = yaml.safe_load(f)
                model_cfg = yaml_config.get('model', {})
                config['model'] = model_cfg.get('default') or model_cfg.get('name') or config['model']
                if not config['provider']:
                    config['provider'] = model_cfg.get('provider')
                if not config['base_url']:
                    config['base_url'] = model_cfg.get('base_url')
                if not config['api_key']:
                    config['api_key'] = model_cfg.get('api_key')
            print(f'DEBUG: Resolved model from config.yaml: model={config["model"]}',
                  file=sys.stderr)
    except Exception as e:
        print(f'DEBUG: Failed to read config: {e}', file=sys.stderr)

    return config

# ============================================================================
# Main Entry Point
# ============================================================================

def main() -> None:
    """Main entry point for stream agent."""
    args = parse_args()
    query = args['query']
    session_id = args['session_id']
    history = args['history']
    model_override = args.get('model_override')

    if not query:
        emit_error('Empty query')
        sys.exit(1)

    # Emit initial status
    emit_status('thinking', '正在连接 AI 服务...')

    # Resolve runtime configuration
    config = resolve_runtime_config()

    # Apply model_override if provided (takes precedence over config.yaml)
    if model_override:
        if isinstance(model_override, dict):
            if 'model' in model_override and model_override['model']:
                config['model'] = model_override['model']
                print(f'DEBUG: Model override: model={model_override["model"]}', file=sys.stderr)
            if 'provider' in model_override and model_override['provider']:
                config['provider'] = model_override['provider']
                print(f'DEBUG: Model override: provider={model_override["provider"]}', file=sys.stderr)

    print(f'DEBUG: Using model={config["model"]}, provider={config["provider"]}, base_url={config["base_url"]}',
          file=sys.stderr)
    print(f'DEBUG: History messages: {len(history)}', file=sys.stderr)

    # Import Hermes Agent modules
    try:
        hermes_src = os.path.expanduser('~/.hermes/hermes-agent/src')
        sys.path.insert(0, hermes_src)

        from run_agent import AIAgent
        from tools.terminal_tool import set_approval_callback
        from tools.skills_tool import set_secret_capture_callback
    except ImportError:
        # Try alternate path
        sys.path.insert(0, '/usr/local/lib/hermes-agent/src')
        from run_agent import AIAgent
        from tools.terminal_tool import set_approval_callback
        from tools.skills_tool import set_secret_capture_callback

    # Create callbacks
    on_token = create_token_callback()
    on_reasoning = create_reasoning_callback()
    on_tool = create_tool_callback()
    on_approval = create_approval_callback()
    on_clarify = create_clarify_callback()
    on_secret = create_secret_callback()

    # Set approval and secret callbacks on terminal_tool
    set_approval_callback(on_approval)
    set_secret_capture_callback(on_secret)

    # Build agent kwargs
    agent_kwargs = {
        'model': config['model'],
        'platform': 'cli',
        'quiet_mode': True,
        'session_id': session_id,
        'stream_delta_callback': on_token,
        'reasoning_callback': on_reasoning,
        'tool_progress_callback': on_tool,
        'clarify_callback': on_clarify,
    }

    if config['provider']:
        agent_kwargs['provider'] = config['provider']
    if config['base_url']:
        agent_kwargs['base_url'] = config['base_url']
    if config['api_key']:
        agent_kwargs['api_key'] = config['api_key']

    try:
        # Create agent
        agent = AIAgent(**agent_kwargs)

        # Emit session creation immediately
        emit_session(agent.session_id, time.time())

        # Emit streaming status
        emit_status('streaming', '正在接收响应...')

        # Convert history format
        conversation_history = []
        for msg in history:
            if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                conversation_history.append({
                    'role': msg['role'],
                    'content': msg['content']
                })

        print(f'DEBUG: Passing {len(conversation_history)} messages as conversation_history',
              file=sys.stderr)

        # Run conversation
        result = agent.run_conversation(
            user_message=query,
            conversation_history=conversation_history if conversation_history else None
        )

        # Debug result structure
        print(f'DEBUG: result keys: {result.keys() if isinstance(result, dict) else "not a dict"}',
              file=sys.stderr)

        # Extract result data
        final_content = result.get('final_response', '')
        final_reasoning = result.get('last_reasoning', '')
        input_tokens = result.get('input_tokens', 0)
        output_tokens = result.get('output_tokens', 0)

        # Emit usage
        emit_usage(input_tokens, output_tokens)

        # Emit completion
        emit_done(
            session_id=agent.session_id,
            content=final_content,
            reasoning=final_reasoning,
            prompt_tokens=input_tokens,
            completion_tokens=output_tokens
        )

        print('DEBUG: Completed successfully, exiting...', file=sys.stderr)

        # Explicitly exit with success code
        sys.exit(0)

    except KeyboardInterrupt:
        print('DEBUG: Interrupted by user', file=sys.stderr)
        emit_error('Interrupted by user')
        sys.exit(130)
    except Exception as e:
        print(f'DEBUG: Exception in main: {type(e).__name__}: {e}', file=sys.stderr)
        emit_error(str(e))
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        # Force flush all output before exit
        sys.stdout.flush()
        sys.stderr.flush()
        # Small delay to ensure all output is flushed
        time.sleep(0.1)


if __name__ == '__main__':
    try:
        main()
    except SystemExit as e:
        # Re-raise SystemExit to allow proper exit
        if e.code != 0:
            print(f'Exit with code: {e.code}', file=sys.stderr)
        sys.exit(e.code if e.code is not None else 0)
    except Exception as e:
        # Catch any unhandled exceptions and exit with error
        print(f'FATAL: {e}', file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()