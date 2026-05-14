#!/usr/bin/env python3
"""
Database Cleanup Script for Hermes Agent
Fixes malformed Markdown links and JSON artifacts in message content.

Run this script via WSL:
    wsl python3 ~/.hermes/scripts/cleanup_messages.py
"""

import sqlite3
import re
import os
import json
from datetime import datetime

def clean_message_content(content: str) -> str:
    """
    Clean malformed patterns from message content.
    Uses generic patterns to catch all similar issues.
    """
    if not content:
        return content

    result = content

    # Pattern 1: Generic malformed Markdown links [xxx](http://xxx)
    # This catches [msg.id](http://msg.id), [e.target](http://e.target), etc.
    result = re.sub(
        r'\[[\w.]+\]\(https?://[\w.]+\)',
        '',
        result
    )

    # Pattern 2: More specific - variable-like patterns in brackets with http
    # Catches [msg.tools.map](http://msg.tools.map), etc.
    result = re.sub(
        r'\[(?:msg|e|errors|sessionSearchResults|data|result|response|item|row|val|key|obj|arr|str|num|idx|index|count|len|length)[\w.]*\]\(https?://[\w.]+\)',
        '',
        result
    )

    # Pattern 3: Any bracket content that matches the URL path
    result = re.sub(
        r'\[([a-zA-Z_][\w.]*)\]\(https?://\1\)',
        '',
        result
    )

    # Pattern 4: npm error blocks
    result = re.sub(r'^npm error.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+at async.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+\{.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+\}.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+errno.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+code.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+syscall.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+path.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+dest.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+The operation.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+It is likely.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+If you believe.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+permissions.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+the command.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error\s+A complete log.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error$', '', result, flags=re.MULTILINE)

    # Pattern 5: File listing artifacts
    result = re.sub(r'^-rwxrwxrwx.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^drwxrwxrwx.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^total\s+\d+.*$', '', result, flags=re.MULTILINE)

    # Pattern 6: Chinese debug messages
    result = re.sub(r'^生成.*架构图.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^架构图生成完成.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^继续检查状态.*$', '', result, flags=re.MULTILINE)

    # Pattern 7: Tool execution messages
    result = re.sub(r'^Tool result:.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^Running tool:.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^Executing:.*$', '', result, flags=re.MULTILINE)

    # Pattern 8: JSON output objects
    result = re.sub(r'\{"output":\s*"[\s\S]*?",\s*"exit_code"', '', result)
    result = re.sub(r'\{"bytes_written":\s*\d+[\s\S]*?\}', '', result)
    result = re.sub(r'\{"success":\s*(true|false)[\s\S]*?"screenshot_path"[\s\S]*?\}', '', result)
    result = re.sub(r'"exit_code":\s*\d+', '', result)
    result = re.sub(r'"error":\s*(null|"[^"]*")', '', result)
    result = re.sub(r'\{[\s\S]*?"output"[\s\S]*?\}', '', result)

    # Pattern 9: Remaining JSON fragments
    result = re.sub(r'^\s*,\s*"[^"]+"\s*:\s*[\d\[\{][^\n]*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'\}\s*\{', '\n', result)
    result = re.sub(r'\}\s*,\s*"[^"]+"\s*:\s*[\d\[\{]', '}', result)
    result = re.sub(r'\[\s*\{[^}]*"tool"[^}]*\}[\s\S]*?\]', '', result)
    result = re.sub(r',\s*\d+\s*,\s*\}', '', result)
    result = re.sub(r',\s*\}', '}', result)
    result = re.sub(r'\{\s*\}', '', result)
    result = re.sub(r'\[\s*\]', '', result)
    result = re.sub(r'^\s*\d+\s*,?\s*$', '', result, flags=re.MULTILINE)
    result = re.sub(r',\s*$', '', result, flags=re.MULTILINE)

    # Clean up extra whitespace
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.strip()

    return result


def cleanup_database(dry_run: bool = True):
    """
    Clean up all malformed content in the database.

    Args:
        dry_run: If True, only show what would be changed without making changes.
    """
    db_path = os.path.expanduser("~/.hermes/state.db")

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get all messages
    cursor.execute("""
        SELECT id, session_id, role, content, timestamp
        FROM messages
        ORDER BY timestamp ASC
    """)
    messages = cursor.fetchall()

    print(f"Found {len(messages)} messages to check")
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will update database)'}")
    print("-" * 60)

    updated_count = 0
    total_cleaned_chars = 0

    for msg in messages:
        original_content = msg['content'] or ''
        cleaned_content = clean_message_content(original_content)

        if cleaned_content != original_content:
            chars_removed = len(original_content) - len(cleaned_content)
            total_cleaned_chars += chars_removed
            updated_count += 1

            # Show preview
            preview_orig = original_content[:100].replace('\n', ' ')
            preview_clean = cleaned_content[:100].replace('\n', ' ')

            print(f"\nMessage ID: {msg['id']}")
            print(f"Session: {msg['session_id']}")
            print(f"Role: {msg['role']}")
            print(f"Chars removed: {chars_removed}")
            print(f"Original: {preview_orig}...")
            print(f"Cleaned:  {preview_clean}...")

            if not dry_run:
                cursor.execute(
                    "UPDATE messages SET content = ? WHERE id = ?",
                    (cleaned_content, msg['id'])
                )

    print("\n" + "=" * 60)
    print(f"Summary:")
    print(f"  Messages checked: {len(messages)}")
    print(f"  Messages updated: {updated_count}")
    print(f"  Total chars removed: {total_cleaned_chars}")

    if not dry_run:
        conn.commit()
        print("\nDatabase updated successfully!")
    else:
        print("\nRun with --live to apply changes")

    conn.close()


def main():
    import sys

    dry_run = True
    if len(sys.argv) > 1 and sys.argv[1] == '--live':
        dry_run = False

    print("=" * 60)
    print("Hermes Database Cleanup Script")
    print("=" * 60)
    print()

    cleanup_database(dry_run=dry_run)


if __name__ == '__main__':
    main()
