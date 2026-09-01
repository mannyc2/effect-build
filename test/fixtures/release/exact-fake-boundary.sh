#!/bin/sh
set -eu

tool=${0##*/}
case "$tool" in
  curl|npm) ;;
  *) exit 97 ;;
esac

: "${EFFECT_BUILD_FAKE_NODE:?}"
: "${EFFECT_BUILD_FAKE_BOUNDARY:?}"
: "${FAKE_RELEASE_STATE:?}"

export FAKE_RELEASE_BOUNDARY_TOOL="$tool"
exec "$EFFECT_BUILD_FAKE_NODE" "$EFFECT_BUILD_FAKE_BOUNDARY" "$@"
