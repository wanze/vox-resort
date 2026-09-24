#!/bin/sh
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  "$CLAUDE_PROJECT_DIR"/*.ts | "$CLAUDE_PROJECT_DIR"/*.tsx | "$CLAUDE_PROJECT_DIR"/*.css) ;;
  *) exit 0 ;;
esac
case "$f" in "$CLAUDE_PROJECT_DIR"/node_modules/*) exit 0 ;; esac
node "$CLAUDE_PROJECT_DIR/scripts/check-comments.ts" "$f" >&2 || exit 2
