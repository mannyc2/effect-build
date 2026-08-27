#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: install-unix-tool.sh <uv|nfpm|syft|sbom-utility> <absolute-destination-directory>" >&2
  exit 64
fi
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "the pinned acceptance downloads are Linux x86_64 only" >&2
  exit 64
fi

tool="$1"
destination="$2"
if [[ "$destination" != /* ]]; then
  echo "destination must be absolute" >&2
  exit 64
fi

case "$tool" in
  uv)
    asset="uv-x86_64-unknown-linux-gnu.tar.gz"
    url="https://github.com/astral-sh/uv/releases/download/0.12.0/$asset"
    sha256="eaf842262aa1c418d8ecc5605f02ee1ebfd369124fa48548e85f9481a47831a9"
    member="uv-x86_64-unknown-linux-gnu/uv"
    binary="uv"
    ;;
  nfpm)
    asset="nfpm_2.47.0_Linux_x86_64.tar.gz"
    url="https://github.com/goreleaser/nfpm/releases/download/v2.47.0/$asset"
    sha256="0660ca602b2d2d2ae4781a06c692b3eeb9d437ffea05b831d76e41f4a3188783"
    member="nfpm"
    binary="nfpm"
    ;;
  syft)
    asset="syft_1.50.0_linux_amd64.tar.gz"
    url="https://github.com/anchore/syft/releases/download/v1.50.0/$asset"
    sha256="bf7b29ff57f06da30918266a0e1c2885a8f99784798d1bdb1628886aa015d788"
    member="syft"
    binary="syft"
    ;;
  sbom-utility)
    asset="sbom-utility-v0.19.2-linux-amd64.tar.gz"
    url="https://github.com/CycloneDX/sbom-utility/releases/download/v0.19.2/$asset"
    sha256="e0cd37e6e67b1d0e44dbb7b38e055a4e2ee66db590bb8e7f89e2d9b650f4490b"
    member="sbom-utility"
    binary="sbom-utility"
    ;;
  *)
    echo "unsupported tool: $tool" >&2
    exit 64
    ;;
esac

staging="$(mktemp -d)"
trap 'rm -rf -- "$staging"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$url" --output "$staging/$asset"
printf '%s  %s\n' "$sha256" "$staging/$asset" | sha256sum --check --strict --status
mkdir -p "$staging/extract" "$destination"
tar -xzf "$staging/$asset" -C "$staging/extract" -- "$member"
install -m 0755 "$staging/extract/$member" "$destination/$binary"
printf '%s\n' "$destination/$binary"
