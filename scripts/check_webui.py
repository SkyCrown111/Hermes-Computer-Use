#!/usr/bin/env python3
import os, glob

# Check if hermes-webui exists
paths = [
    os.path.expanduser('~/.hermes/webui'),
    os.path.expanduser('~/.hermes/hermes-agent/web'),
    os.path.expanduser('~/.hermes/hermes-agent/webui'),
]

for p in paths:
    if os.path.exists(p):
        print(f"Found: {p}")
        for f in os.listdir(p):
            print(f"  {f}")
        # Check for tsx files
        for f in glob.glob(f"{p}/**/*.tsx", recursive=True):
            print(f"  TSX: {f}")
        for f in glob.glob(f"{p}/**/*.ts", recursive=True):
            print(f"  TS: {f}")
        for f in glob.glob(f"{p}/**/*.py", recursive=True):
            print(f"  PY: {f}")
    else:
        print(f"Not found: {p}")
