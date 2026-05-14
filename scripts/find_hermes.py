#!/usr/bin/env python3
import os

base = os.path.expanduser('~/.hermes/hermes-agent/src')

# List all Python files
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('.py'):
            print(os.path.join(root, f))
