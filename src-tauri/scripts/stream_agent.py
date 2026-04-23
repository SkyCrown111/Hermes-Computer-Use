#!/usr/bin/env python3
"""Hermes Agent Stream Wrapper - Real-time streaming with tool/reasoning callbacks

This script is bundled with hermes-app and calls Hermes Agent's public APIs.
No modification to Hermes Agent itself is required.
"""
import sys
import json
import os
import threading
import time
import uuid

# Add hermes-agent to path
sys.path.insert(0, os.path.expanduser('~/.hermes/hermes-agent/src'))

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

def main():
    if len(sys.argv) < 2:
        print('ERROR:No query provided')
        sys.exit(1)

    query = sys.argv[1]
    session_id = sys.argv[2] if len(sys.argv) > 2 else None

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
        """Handle dangerous command approval request.

        Uses file-based communication with GUI:
        1. Write approval request to file
        2. Emit APPROVAL event to frontend
        3. Wait for response file
        4. Return the choice

        Returns: 'once', 'session', 'always', or 'deny'
        """
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

    # Create agent with streaming callbacks (all public APIs)
    try:
        agent = AIAgent(
            model='qianfan-code-latest',
            platform='cli',
            quiet_mode=True,
            session_id=session_id,
            stream_delta_callback=on_token,
            reasoning_callback=on_reasoning,
            tool_progress_callback=on_tool,
        )

        result = agent.run_conversation(user_message=query)

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
