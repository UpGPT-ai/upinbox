#!/usr/bin/env bash
# generate-changelog.sh
#
# Auto-generates a changelog from `git log` since the most recent tag (or from
# the first commit if no tags exist). Commits are grouped by Conventional Commit
# type prefix:
#
#   feat       -> Added
#   fix        -> Fixed
#   perf       -> Performance
#   refactor   -> Changed
#   docs       -> Documentation
#   test       -> Tests
#   chore      -> Internal
#   (other)    -> Other
#
# BREAKING CHANGE notes (footer or `!` after the type, e.g. `feat!: ...`) are
# surfaced into a dedicated section at the top.
#
# Usage:
#   ./scripts/generate-changelog.sh                 # print to stdout
#   ./scripts/generate-changelog.sh > CHANGELOG.md  # write to file
#   ./scripts/generate-changelog.sh v1.2.0          # changelog since v1.2.0
#
# Uses only POSIX shell, `date`, and `git`. No external deps.

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repository root so the script works from any cwd.
# ---------------------------------------------------------------------------
if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "error: not inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Determine the range: from (last tag or first commit) to HEAD.
# Allow override via CLI arg ($1 = "from" ref).
# ---------------------------------------------------------------------------
FROM_REF="${1:-}"

if [ -z "$FROM_REF" ]; then
  if FROM_REF="$(git describe --tags --abbrev=0 2>/dev/null)"; then
    : # use last tag
  else
    FROM_REF="$(git rev-list --max-parents=0 HEAD | tail -n 1)"
  fi
fi

# Validate ref exists.
if ! git rev-parse --verify --quiet "$FROM_REF" >/dev/null; then
  echo "error: ref '$FROM_REF' not found" >&2
  exit 1
fi

# Range string: if FROM_REF is the first commit and equal to HEAD's root, use
# everything; otherwise use FROM_REF..HEAD (exclusive of FROM_REF).
HEAD_SHA="$(git rev-parse HEAD)"
FROM_SHA="$(git rev-parse "$FROM_REF")"

if [ "$FROM_SHA" = "$HEAD_SHA" ]; then
  RANGE="$FROM_REF"      # single commit / nothing new
else
  RANGE="${FROM_REF}..HEAD"
fi

# ---------------------------------------------------------------------------
# Pull commits. Use a record separator unlikely to appear in messages.
# Format:  <short-sha>\x1f<subject>\x1f<body>\x1e
# ---------------------------------------------------------------------------
RS=$'\x1e'   # record separator (between commits)
FS=$'\x1f'   # field separator (within a commit)

# Try the range first; if it's a single-commit "range", fall back to that commit.
if [ "$FROM_SHA" = "$HEAD_SHA" ]; then
  COMMITS_RAW="$(git log -1 --pretty=format:"%h${FS}%s${FS}%b${RS}" "$HEAD_SHA" || true)"
else
  COMMITS_RAW="$(git log --no-merges --pretty=format:"%h${FS}%s${FS}%b${RS}" "$RANGE" || true)"
fi

# ---------------------------------------------------------------------------
# Buckets — collect formatted bullet lines per group.
# ---------------------------------------------------------------------------
ADDED=""
FIXED=""
PERFORMANCE=""
CHANGED=""
DOCUMENTATION=""
TESTS=""
INTERNAL=""
OTHER=""
BREAKING=""

append() {
  # $1 = current bucket value, $2 = line to add
  if [ -z "$1" ]; then
    printf '%s' "$2"
  else
    printf '%s\n%s' "$1" "$2"
  fi
}

# ---------------------------------------------------------------------------
# Parse each commit record.
# ---------------------------------------------------------------------------
# Split COMMITS_RAW on the record separator.
OLD_IFS="$IFS"
IFS="$RS"
# shellcheck disable=SC2086
set -- $COMMITS_RAW
IFS="$OLD_IFS"

for record in "$@"; do
  # Strip leading newlines that git may emit between records.
  record="${record#$'\n'}"
  [ -z "$record" ] && continue

  # Split fields.
  sha="${record%%${FS}*}"
  rest="${record#*${FS}}"
  subject="${rest%%${FS}*}"
  body="${rest#*${FS}}"
  # If there was no body, `body` may equal `subject`; normalize.
  if [ "$body" = "$subject" ]; then
    body=""
  fi

  # Parse "type(scope)!: description" from the subject.
  # Use parameter expansion / case for portability.
  raw_type=""
  scope=""
  bang=""
  description="$subject"

  # Pull "type(scope)?!?:" prefix if present.
  case "$subject" in
    *:\ *)
      prefix="${subject%%:\ *}"
      description="${subject#*:\ }"

      # Detect "!" before colon.
      case "$prefix" in
        *!) bang="!"; prefix="${prefix%!}" ;;
      esac

      # Detect "(scope)".
      case "$prefix" in
        *\(*\))
          raw_type="${prefix%%(*}"
          scope_part="${prefix#*(}"
          scope="${scope_part%)}"
          ;;
        *)
          raw_type="$prefix"
          ;;
      esac
      ;;
    *)
      # No conventional prefix — treat as "Other".
      raw_type=""
      description="$subject"
      ;;
  esac

  # Lowercase the type (POSIX-safe).
  type_lc="$(printf '%s' "$raw_type" | tr '[:upper:]' '[:lower:]')"

  # Build the bullet line.
  if [ -n "$scope" ]; then
    bullet="- **${scope}**: ${description} (${sha})"
  else
    bullet="- ${description} (${sha})"
  fi

  # Route into buckets.
  case "$type_lc" in
    feat)     ADDED="$(append "$ADDED" "$bullet")" ;;
    fix)      FIXED="$(append "$FIXED" "$bullet")" ;;
    perf)     PERFORMANCE="$(append "$PERFORMANCE" "$bullet")" ;;
    refactor) CHANGED="$(append "$CHANGED" "$bullet")" ;;
    docs)     DOCUMENTATION="$(append "$DOCUMENTATION" "$bullet")" ;;
    test)     TESTS="$(append "$TESTS" "$bullet")" ;;
    chore)    INTERNAL="$(append "$INTERNAL" "$bullet")" ;;
    "")       OTHER="$(append "$OTHER" "$bullet")" ;;
    *)        OTHER="$(append "$OTHER" "$bullet")" ;;
  esac

  # ---- BREAKING CHANGES ---------------------------------------------------
  # Two signals:
  #   1. "!" after type, e.g. "feat!: drop node 14 support"
  #   2. A "BREAKING CHANGE:" footer (or "BREAKING-CHANGE:") in the body.
  if [ -n "$bang" ]; then
    BREAKING="$(append "$BREAKING" "- ${description} (${sha})")"
  fi

  if [ -n "$body" ]; then
    # Extract each line that starts with BREAKING CHANGE: or BREAKING-CHANGE:.
    # Use a portable while-read loop.
    printf '%s\n' "$body" | while IFS= read -r line; do
      case "$line" in
        "BREAKING CHANGE:"*|"BREAKING-CHANGE:"*)
          note="${line#*:}"
          # Trim leading space.
          note="${note# }"
          printf '%s\n' "- ${note} (${sha})"
          ;;
      esac
    done > /tmp/.changelog_breaking_$$ || true

    if [ -s /tmp/.changelog_breaking_$$ ]; then
      while IFS= read -r b_line; do
        BREAKING="$(append "$BREAKING" "$b_line")"
      done < /tmp/.changelog_breaking_$$
    fi
    rm -f /tmp/.changelog_breaking_$$
  fi
done

# ---------------------------------------------------------------------------
# Emit the changelog (Markdown).
# ---------------------------------------------------------------------------
TODAY="$(date +%Y-%m-%d)"

# Heading uses the new HEAD short sha as the "version" placeholder, unless a
# tag is checked out at HEAD.
HEAD_LABEL=""
if HEAD_LABEL="$(git describe --tags --exact-match HEAD 2>/dev/null)"; then
  :
else
  HEAD_LABEL="$(git rev-parse --short HEAD)"
fi

printf '# Changelog\n\n'
printf '## %s — %s\n' "$HEAD_LABEL" "$TODAY"
printf '_Changes since %s_\n\n' "$FROM_REF"

emit_section() {
  # $1 = heading, $2 = body
  if [ -n "$2" ]; then
    printf '### %s\n%s\n\n' "$1" "$2"
  fi
}

emit_section "BREAKING CHANGES" "$BREAKING"
emit_section "Added"            "$ADDED"
emit_section "Fixed"            "$FIXED"
emit_section "Changed"          "$CHANGED"
emit_section "Performance"      "$PERFORMANCE"
emit_section "Documentation"    "$DOCUMENTATION"
emit_section "Tests"            "$TESTS"
emit_section "Internal"         "$INTERNAL"
emit_section "Other"            "$OTHER"

# Empty-changelog hint.
if [ -z "$BREAKING$ADDED$FIXED$CHANGED$PERFORMANCE$DOCUMENTATION$TESTS$INTERNAL$OTHER" ]; then
  printf '_No changes since %s._\n' "$FROM_REF"
fi
