#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: assert-linux-package.sh <deb|rpm|apk|archlinux> <package>" >&2
  exit 64
fi

format="$1"
package_path="$2"
docker_bin="${EFFECT_BUILD_DOCKER_BIN:?EFFECT_BUILD_DOCKER_BIN must be an absolute Docker executable}"
if [[ "$docker_bin" != /* || ! -x "$docker_bin" ]]; then
  echo "EFFECT_BUILD_DOCKER_BIN must name an executable absolute path" >&2
  exit 64
fi
if [[ "$package_path" != /* || ! -f "$package_path" ]]; then
  echo "package path must be an existing absolute regular file" >&2
  exit 64
fi

case "$format" in
  deb)
    container_package="/acceptance/package"
    image="ubuntu@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316"
    oracle='set -eu; test "$(dpkg-deb --field /acceptance/package Package)" = "effect-build-acceptance"; test "$(dpkg-deb --field /acceptance/package Version)" = "1.2.3-1"; test "$(dpkg-deb --field /acceptance/package Architecture)" = "amd64"; test "$(dpkg-deb --field /acceptance/package Maintainer)" = "effect-build acceptance <acceptance@example.test>"; dpkg-deb --contents /acceptance/package | grep -E "^-rwxr-xr-x.*2009-11-10 23:00.*\./usr/bin/effect-build-acceptance$"; dpkg --install /acceptance/package; test "$(/usr/bin/effect-build-acceptance)" = effect-build-package-ok; dpkg --remove effect-build-acceptance; test ! -e /usr/bin/effect-build-acceptance'
    ;;
  rpm)
    container_package="/acceptance/package"
    image="fedora@sha256:7c63468daf71fdc5bda3699cd483b169bb995b5137265d5ffe8f04e2ce87fbb8"
    oracle='set -eu; test "$(rpm -qp --qf "%{NAME}|%{VERSION}|%{RELEASE}|%{ARCH}|%{LICENSE}" /acceptance/package)" = "effect-build-acceptance|1.2.3|1|x86_64|MIT"; test "$(rpm -qp --qf "%{BUILDTIME}" /acceptance/package)" = "1257894000"; rpm -qplv /acceptance/package | grep -E "^-rwxr-xr-x.* /usr/bin/effect-build-acceptance$"; rpm -ivh --nodeps /acceptance/package; test "$(/usr/bin/effect-build-acceptance)" = effect-build-package-ok; rpm -e effect-build-acceptance; test ! -e /usr/bin/effect-build-acceptance'
    ;;
  apk)
    container_package="/acceptance/package.apk"
    image="alpine@sha256:eafc1edb577d2e9b458664a15f23ea1c370214193226069eb22921169fc7e43f"
    oracle='set -eu; metadata="$(tar -xOzf /acceptance/package.apk .PKGINFO)"; printf "%s\n" "$metadata" | grep -Fqx "pkgname = effect-build-acceptance"; printf "%s\n" "$metadata" | grep -Fqx "pkgver = 1.2.3-r1"; printf "%s\n" "$metadata" | grep -Fqx "arch = x86_64"; printf "%s\n" "$metadata" | grep -Fqx "license = MIT"; tar -tvzf /acceptance/package.apk | grep -E "^-rwxr-xr-x.*2009-11-10 23:00:00 usr/bin/effect-build-acceptance$"; apk add --no-network --allow-untrusted /acceptance/package.apk; test "$(/usr/bin/effect-build-acceptance)" = effect-build-package-ok; apk del --no-network effect-build-acceptance; test ! -e /usr/bin/effect-build-acceptance'
    ;;
  archlinux)
    container_package="/acceptance/package.pkg.tar.zst"
    image="archlinux@sha256:c9dc8b5d1b06d8d50ace6d42b2c93fbb1e34c9e1332d1a2102936e497d3187ae"
    oracle='set -eu; metadata="$(bsdtar -xOf /acceptance/package.pkg.tar.zst .PKGINFO)"; printf "%s\n" "$metadata" | grep -Fqx "pkgname = effect-build-acceptance"; printf "%s\n" "$metadata" | grep -Fqx "pkgver = 1.2.3-1"; printf "%s\n" "$metadata" | grep -Fqx "arch = x86_64"; printf "%s\n" "$metadata" | grep -Fqx "license = MIT"; printf "%s\n" "$metadata" | grep -Fqx "builddate = 1257894000"; bsdtar -tvf /acceptance/package.pkg.tar.zst | grep -E "^-rwxr-xr-x.* usr/bin/effect-build-acceptance$"; pacman -Qlp /acceptance/package.pkg.tar.zst | grep -Fqx "effect-build-acceptance /usr/bin/effect-build-acceptance"; pacman -U --noconfirm /acceptance/package.pkg.tar.zst; test "$(/usr/bin/effect-build-acceptance)" = effect-build-package-ok; pacman -R --noconfirm effect-build-acceptance; test ! -e /usr/bin/effect-build-acceptance'
    ;;
  *)
    echo "unsupported package format: $format" >&2
    exit 64
    ;;
esac

"$docker_bin" run --rm --network none --mount "type=bind,src=$package_path,dst=$container_package,readonly" "$image" sh -c "$oracle"
