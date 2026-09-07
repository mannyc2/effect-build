#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: assert-sbom-documents.sh <absolute-document-directory>" >&2
  exit 64
fi

documents="$1"
docker_bin="${EFFECT_BUILD_DOCKER_BIN:?EFFECT_BUILD_DOCKER_BIN must be an absolute Docker executable}"
utility="${EFFECT_BUILD_SBOM_UTILITY_BIN:?EFFECT_BUILD_SBOM_UTILITY_BIN must be an absolute sbom-utility executable}"
for executable in "$docker_bin" "$utility"; do
  if [[ "$executable" != /* || ! -x "$executable" ]]; then
    echo "required executable is missing or non-absolute: $executable" >&2
    exit 64
  fi
done
if [[ "$documents" != /* || ! -d "$documents" ]]; then
  echo "document directory must be an existing absolute directory" >&2
  exit 64
fi
for document in acceptance.spdx.json acceptance.cdx.json file-subject.spdx.json invalid.spdx.json invalid.cdx.json; do
  if [[ ! -f "$documents/$document" ]]; then
    echo "required SBOM oracle document is missing: $documents/$document" >&2
    exit 64
  fi
done

image="ubuntu@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316"
oracle='set -eu
utility=/acceptance/sbom-utility
documents=/acceptance/documents
test "$($utility version --quiet)" = "sbom-utility version v0.19.2"
$utility validate --quiet --input-file "$documents/acceptance.spdx.json"
echo "spdx-valid:ok"
$utility validate --quiet --input-file "$documents/acceptance.cdx.json"
echo "cyclonedx-valid:ok"
$utility validate --quiet --input-file "$documents/file-subject.spdx.json"
echo "file-subject-spdx-valid:ok"
set +e
$utility validate --quiet --input-file "$documents/invalid.spdx.json" >/tmp/invalid-spdx.out 2>&1
status=$?
set -e
test "$status" -eq 2
test -s /tmp/invalid-spdx.out
echo "spdx-invalid-exit-2:ok"
set +e
$utility validate --quiet --input-file "$documents/invalid.cdx.json" >/tmp/invalid-cdx.out 2>&1
status=$?
set -e
test "$status" -eq 2
test -s /tmp/invalid-cdx.out
echo "cyclonedx-invalid-exit-2:ok"'

"$docker_bin" run --rm --network none \
  --mount "type=bind,src=$utility,dst=/acceptance/sbom-utility,readonly" \
  --mount "type=bind,src=$documents,dst=/acceptance/documents,readonly" \
  "$image" sh -c "$oracle"
