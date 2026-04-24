#!/usr/bin/env python3
"""Hermes Agent Stream Wrapper - Real-time streaming with tool/reasoning callbacks

This script is bundled with hermes-app and calls Hermes Agent's public APIs.
No modification to Hermes Agent itself is required.

Usage:
    stream_agent.py <query> [session_id]  # Legacy mode (no history)
    stream_agent.py --stdin               # New mode (reads JSON from stdin)

Stdin JSON format:
    {
        "query": "user message",
        "session_id": "optional_session_id",
        "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    }
"""
import sys
import json
import os
import time
import uuid

# Add hermes-agent to path
hermes_src = os.path.expanduser('~/.hermes/hermes-agent/src')
sys.path.insert(0, hermes_src)

try:
    from run_agent import AIAgent
    from tools.terminal_tool import set_approval_callback
except ImportError:
    # Try alternate path
    sys.path.insert(0, '/usr/local/lib/hermes-agent/src')
    from run_agent import AIAgent
    from tools.terminal_tool import set_approval_callback

# Approval state directory (for GUI communication)
APPROVAL_DIR = os.path.expanduser('~/.hermes/approvals')

def ensure_approval_dir():
    os.makedirs(APPROVAL_DIR, exist_ok=True)

def parse_args():
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
                    'history': data.get('history', [])
                }
        except Exception:
            pass
        print('ERROR:No query provided')
        sys.exit(1)

    if sys.argv[1] == '--stdin':
        # Read JSON from stdin
        try:
            stdin_data = sys.stdin.read()
            data = json.loads(stdin_data)
            return {
                'query': data.get('query', ''),
                'session_id': data.get('session_id'),
                'history': data.get('history', [])
            }
        except json.JSONDecodeError as e:
            print(f'ERROR:Invalid JSON input: {e}')
            sys.exit(1)
    else:
        # Legacy mode: command line arguments
        query = sys.argv[1]
        session_id = sys.argv[2] if len(sys.argv) > 2 else None
        return {
            'query': query,
            'session_id': session_id,
            'history': []
        }

def main():
    args = parse_args()
    query = args['query']
    session_id = args['session_id']
    history = args['history']

    if not query:
        print('ERROR:Empty query')
        sys.exit(1)

    ensure_approval_dir()

    def on_token(text):
        if text:
            print(f'TOKEN:{text}', flush=True)

    def on_reasoning(text):
        if text:
            print(f'REASONING:{text}', flush=True)

    def on_tool(*args, **kwargs):
        event_type = args[0] if len(args) > 0 else 'tool.started'
        name = args[1] if len(args) > 1 else 'unknown'
        preview = args[2] if len(args) > 2 else ''
        args_dict = args[3] if len(args) > 3 else {}

        # Truncate args for display
        args_snap = {}
        if isinstance(args_dict, dict):
            for k, v in list(args_dict.items())[:4]:
                s = str(v)
                args_snap[k] = s[:120] + ('...' if len(s) > 120 else '')

        tool_data = json.dumps({
            'event_type': event_type,
            'name': name,
            'preview': preview,
            'args': args_snap,
            'duration': kwargs.get('duration'),
            'is_error': kwargs.get('is_error', False)
        }, ensure_ascii=False)
        print(f'TOOL:{tool_data}', flush=True)

    def on_approval(command, description, allow_permanent=True):
        """Handle dangerous command approval request."""
        approval_id = str(uuid.uuid4())[:8]
        request_file = os.path.join(APPROVAL_DIR, f'{approval_id}.request')
        response_file = os.path.join(APPROVAL_DIR, f'{approval_id}.response')

        # Clean up any existing files
        for f in [request_file, response_file]:
            if os.path.exists(f):
                os.remove(f)

        # Write request
        request_data = {
            'id': approval_id,
            'command': command,
            'description': description,
            'allow_permanent': allow_permanent,
            'choices': ['once', 'session', 'always', 'deny'] if allow_permanent else ['once', 'session', 'deny']
        }
        with open(request_file, 'w') as f:
            json.dump(request_data, f, ensure_ascii=False)

        # Emit approval event to frontend
        approval_json = json.dumps(request_data, ensure_ascii=False)
        print(f'APPROVAL:{approval_json}', flush=True)

        # Wait for response (poll file)
        timeout = 300  # 5 minutes
        start = time.time()
        while time.time() - start < timeout:
            if os.path.exists(response_file):
                try:
                    with open(response_file, 'r') as f:
                        response = json.load(f)
                    # Clean up
                    os.remove(response_file)
                    os.remove(request_file)
                    return response.get('choice', 'deny')
                except Exception:
                    pass
            time.sleep(0.5)

        # Timeout - clean up and deny
        if os.path.exists(request_file):
            os.remove(request_file)
        return 'deny'

    # Set approval callback on terminal_tool (public API)
    set_approval_callback(on_approval)

    # Resolve model and provider using Hermes runtime
    model = 'astron-code-latest'
    provider = None
    base_url = None
    api_key = None

    try:
        from hermes_cli.runtime_provider import resolve_runtime_provider
        rt = resolve_runtime_provider()
        model = rt.get('model', model)
        provider = rt.get('provider')
        base_url = rt.get('base_url')
        api_key = rt.get('api_key')
        print(f'DEBUG: Resolved via runtime_provider: model={model}, provider={provider}', file=sys.stderr)
    except Exception as e:
        print(f'DEBUG: runtime_provider failed: {e}', file=sys.stderr)
        try:
            import yaml
            config_path = os.path.expanduser('~/.hermes/config.yaml')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
                    model = config.get('model', {}).get('default') or \
                            config.get('model', {}).get('name') or \
                            model
                    provider = config.get('model', {}).get('provider')
                    base_url = config.get('model', {}).get('base_url')
                    print(f'DEBUG: Resolved via config.yaml: model={model}, provider={provider}', file=sys.stderr)
        except Exception as e2:
            print(f'DEBUG: Failed to read config: {e2}', file=sys.stderr)

    print(f'DEBUG: Using model={model}, provider={provider}, base_url={base_url}', file=sys.stderr)
    print(f'DEBUG: History messages: {len(history)}', file=sys.stderr)

    # Create agent with streaming callbacks (all public APIs)
    try:
        agent_kwargs = dict(
            model=model,
            platform='cli',
            quiet_mode=True,
            session_id=session_id,
            stream_delta_callback=on_token,
            reasoning_callback=on_reasoning,
            tool_progress_callback=on_tool,
        )

        if provider:
            agent_kwargs['provider'] = provider
        if base_url:
            agent_kwargs['base_url'] = base_url
        if api_key:
            agent_kwargs['api_key'] = api_key

        agent = AIAgent(**agent_kwargs)

        # Emit session ID immediately so frontend can add session to list
        session_created_data = {
            'session_id': agent.session_id,
            'created_at': time.time(),
        }
        print(f'SESSION:{json.dumps(session_created_data, ensure_ascii=False)}', flush=True)

        # Convert history to the format expected by run_conversation
        conversation_history = []
        for msg in history:
            if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                conversation_history.append({
                    'role': msg['role'],
                    'content': msg['content']
                })

        print(f'DEBUG: Passing {len(conversation_history)} messages as conversation_history', file=sys.stderr)

        # Run conversation with history for context continuity
        result = agent.run_conversation(
            user_message=query,
            conversation_history=conversation_history if conversation_history else None
        )

        # Debug: print result structure
        print(f'DEBUG: result keys: {result.keys() if isinstance(result, dict) else "not a dict"}', file=sys.stderr)

        # Output final result
        final_data = {
            'session_id': agent.session_id,
            'content': result.get('final_response', ''),
            'messages': result.get('messages', []),
            'input_tokens': result.get('input_tokens', 0),
            'output_tokens': result.get('output_tokens', 0),
            'reasoning': result.get('last_reasoning', ''),
        }
        print(f'DONE:{json.dumps(final_data, ensure_ascii=False)}', flush=True)

    except Exception as e:
        print(f'ERROR:{str(e)}', flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
