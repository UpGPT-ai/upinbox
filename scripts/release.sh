#!/usr/bin/env bash
#
# release.sh — Cut a new release of upinbox-sprint1.
#
# Usage:
#   ./scripts/release.sh patch
#   ./scripts/release.sh minor
#   ./scripts/release.sh major
#
# What it does:
#   1. Verifies the working tree is clean and we are on `main`.
#   2. Runs `npm run build` and `npm test`. Aborts on any failure.
#   3. Bumps the version in package.json via `npm version <bump> --no-git-tag-version`.
#   4. Commits the bump as `chore(release): vX.Y.Z`.
#   5. Creates an annotated git tag `vX.Y.Z`.
#   6. Prints next steps (push tags, create GitHub release, deploy).
#
set -euo pipefail

# ---------- Colors ----------
if [ -t 1 ]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[0;33m'
  BLUE=$'\033[0;34m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; RESET=""
fi

info()    { printf "%s[INFO]%s  %s\n"  "$BLUE"   "$RESET" "$1"; }
ok()      { printf "%s[ OK ]%s  %s\n"  "$GREEN"  "$RESET" "$1"; }
warn()    { printf "%s[WARN]%s  %s\n"  "$YELLOW" "$RESET" "$1"; }
fail()    { printf "%s[FAIL]%s  %s\n"  "$RED"    "$RESET" "$1" >&2; }
heading() { printf "\n%s%s==> %s%s\n"  "$BOLD"   "$BLUE" "$1" "$RESET"; }

die() {
  fail "$1"
  exit 1
}

# ---------- Arg parsing ----------
if [ "$#" -ne 1 ]; then
  die "Usage: $0 patch|minor|major"
fi

BUMP="$1"
case "$BUMP" in
  patch|minor|major) ;;
  *) die "Invalid bump type '$BUMP'. Must be one of: patch, minor, major." ;;
esac

# ---------- Locate repo root ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

START_TS="$(date +%s)"
START_HUMAN="$(date '+%Y-%m-%d %H:%M:%S %Z')"

heading "Release starting (bump: $BUMP) at $START_HUMAN"
info "Repo root: $REPO_ROOT"

# ---------- Preflight: git ----------
heading "Preflight checks"

if ! command -v git >/dev/null 2>&1; then
  die "git is not installed or not on PATH."
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die "Not inside a git repository."
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  die "Must be on 'main' branch. Currently on '$CURRENT_BRANCH'."
fi
ok "On main branch."

if [ -n "$(git status --porcelain)" ]; then
  fail "Working tree is not clean. Commit or stash your changes first."
  git status --short
  exit 1
fi
ok "Working tree clean."

# ---------- Preflight: package.json ----------
if [ ! -f package.json ]; then
  die "package.json not found at $REPO_ROOT."
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
info "Current version: v$CURRENT_VERSION"

# ---------- Build ----------
heading "Running build"
BUILD_START="$(date +%s)"
if ! npm run build; then
  die "Build failed. Aborting release."
fi
BUILD_END="$(date +%s)"
ok "Build succeeded in $((BUILD_END - BUILD_START))s."

# ---------- Tests ----------
heading "Running tests"
TEST_START="$(date +%s)"
if ! npm test; then
  die "Tests failed. Aborting release."
fi
TEST_END="$(date +%s)"
ok "Tests passed in $((TEST_END - TEST_START))s."

# ---------- Bump version ----------
heading "Bumping version ($BUMP)"
RAW_VERSION="$(npm version "$BUMP" --no-git-tag-version)"
# npm prints e.g. "v1.2.3" — strip leading 'v' if present, then re-add for tag.
NEW_VERSION="${RAW_VERSION#v}"
TAG="v$NEW_VERSION"
ok "Version bumped: v$CURRENT_VERSION -> $TAG"

# ---------- Commit ----------
heading "Committing release"
git add package.json
if [ -f package-lock.json ]; then
  git add package-lock.json
fi
if [ -f npm-shrinkwrap.json ]; then
  git add npm-shrinkwrap.json
fi

COMMIT_MSG="chore(release): $TAG"
if ! git commit -m "$COMMIT_MSG"; then
  die "git commit failed."
fi
ok "Committed: $COMMIT_MSG"

# ---------- Tag ----------
heading "Tagging release"
TAG_MSG="Release $TAG ($(date '+%Y-%m-%d'))"
if ! git tag -a "$TAG" -m "$TAG_MSG"; then
  die "git tag failed."
fi
ok "Tag created: $TAG"

# ---------- Done ----------
END_TS="$(date +%s)"
ELAPSED=$((END_TS - START_TS))

heading "Release $TAG ready (took ${ELAPSED}s)"

printf "\n%s%sNext steps:%s\n" "$BOLD" "$GREEN" "$RESET"
printf "  %s1.%s Push the commit and tag:\n"        "$BOLD" "$RESET"
printf "       %sgit push origin main --follow-tags%s\n" "$YELLOW" "$RESET"
printf "  %s2.%s Create a GitHub release:\n"        "$BOLD" "$RESET"
printf "       %sgh release create %s --generate-notes%s\n" "$YELLOW" "$TAG" "$RESET"
printf "  %s3.%s Deploy to production:\n"           "$BOLD" "$RESET"
printf "       %s./scripts/deploy-production.sh%s\n" "$YELLOW" "$RESET"
printf "\n"
ok "Done."
