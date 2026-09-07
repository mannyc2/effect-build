from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import pathlib
import shutil
import subprocess
import sys
import tarfile
import zipfile
from email import policy
from email.message import Message
from email.parser import BytesParser


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def safe_member(name: str) -> bool:
    path = pathlib.PurePosixPath(name)
    return not path.is_absolute() and ".." not in path.parts and "\\" not in name and "\0" not in name


def metadata(contents: bytes, source: str) -> Message:
    document = BytesParser(policy=policy.default).parsebytes(contents)
    require(document["Metadata-Version"] is not None, f"{source} has no Metadata-Version")
    return document


def assert_identity(document: Message, source: str, distribution: str, version: str) -> None:
    require(document["Name"] == distribution, f"{source} Name is {document['Name']!r}, expected {distribution!r}")
    require(document["Version"] == version, f"{source} Version is {document['Version']!r}, expected {version!r}")


def assert_wheel_record(wheel: zipfile.ZipFile, record_path: str) -> None:
    rows = list(csv.reader(io.StringIO(wheel.read(record_path).decode("utf-8"))))
    require(len(rows) > 1, "wheel RECORD did not enumerate the wheel payload")
    information = wheel.infolist()
    member_list = [member.filename for member in information]
    names = set(member_list)
    files = {member.filename for member in information if not member.is_dir()}
    require(len(names) == len(member_list), "wheel contains duplicate member names")
    observed_record = False
    recorded: set[str] = set()
    for row in rows:
        require(len(row) == 3, f"wheel RECORD row does not have three fields: {row!r}")
        member, encoded_hash, encoded_size = row
        require(member in files, f"wheel RECORD names an absent or non-file member: {member}")
        require(member not in recorded, f"wheel RECORD repeats a member: {member}")
        recorded.add(member)
        if member == record_path:
            require(encoded_hash == "" and encoded_size == "", "wheel RECORD must leave its own hash and size empty")
            observed_record = True
            continue
        require(encoded_hash != "", f"wheel RECORD omitted the hash for {member}")
        require(encoded_size != "", f"wheel RECORD omitted the size for {member}")
        require(encoded_size.isdecimal(), f"wheel RECORD has a non-decimal size for {member}")
        algorithm, separator, expected_hash = encoded_hash.partition("=")
        require(separator == "=" and algorithm in hashlib.algorithms_available, f"unsupported RECORD hash: {encoded_hash}")
        contents = wheel.read(member)
        observed_hash = base64.urlsafe_b64encode(hashlib.new(algorithm, contents).digest()).rstrip(b"=").decode("ascii")
        require(observed_hash == expected_hash, f"wheel RECORD hash mismatch for {member}")
        require(len(contents) == int(encoded_size), f"wheel RECORD size mismatch for {member}")
    require(observed_record, "wheel RECORD did not enumerate itself")
    require(recorded == files, f"wheel RECORD omitted file members: {sorted(files - recorded)!r}")


def install_and_import(
    artifact: pathlib.Path,
    module: str,
    backend: str,
    distribution: str,
    version: str,
    kind: str,
    workdir: pathlib.Path,
) -> None:
    environment = workdir / kind
    subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True)
    executable = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    subprocess.run(
        [str(executable), "-m", "pip", "install", "--disable-pip-version-check", "--no-deps", str(artifact)],
        check=True,
    )
    completion = subprocess.run(
        [
            str(executable),
            "-c",
            (
                "import importlib.metadata as metadata; "
                f"import {module}; "
                f"package = metadata.distribution({distribution!r}); "
                f"print({module}.BACKEND); print(package.metadata['Name']); print(package.version)"
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    require(
        completion.stdout.splitlines() == [backend, distribution, version],
        f"{kind} installed or imported unexpected identity: {completion.stdout!r}",
    )
    print(f"{module}:{backend}:{kind}:ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", type=pathlib.Path, required=True)
    parser.add_argument("--sdist", type=pathlib.Path, required=True)
    parser.add_argument("--module", required=True)
    parser.add_argument("--backend", required=True)
    parser.add_argument("--distribution", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--workdir", type=pathlib.Path, required=True)
    arguments = parser.parse_args()
    shutil.rmtree(arguments.workdir, ignore_errors=True)
    arguments.workdir.mkdir(parents=True)

    normalized_distribution = arguments.distribution.replace("-", "_")
    require(
        arguments.wheel.name == f"{normalized_distribution}-{arguments.version}-py3-none-any.whl",
        f"unexpected exact wheel filename: {arguments.wheel.name}",
    )
    require(
        arguments.sdist.name == f"{normalized_distribution}-{arguments.version}.tar.gz",
        f"unexpected exact sdist filename: {arguments.sdist.name}",
    )

    with zipfile.ZipFile(arguments.wheel) as wheel:
        names = wheel.namelist()
        require(
            all(safe_member(name) for name in names),
            "wheel contains an unsafe absolute or parent-traversal member",
        )
        metadata_paths = [name for name in names if name.endswith(".dist-info/METADATA")]
        wheel_paths = [name for name in names if name.endswith(".dist-info/WHEEL")]
        record_paths = [name for name in names if name.endswith(".dist-info/RECORD")]
        require(len(metadata_paths) == 1, f"wheel must contain exactly one METADATA; observed {metadata_paths!r}")
        require(len(wheel_paths) == 1, f"wheel must contain exactly one WHEEL; observed {wheel_paths!r}")
        require(len(record_paths) == 1, f"wheel must contain exactly one RECORD; observed {record_paths!r}")
        require(names.count(f"{arguments.module}/__init__.py") == 1, "wheel import package is absent or duplicated")
        wheel_metadata = metadata(wheel.read(metadata_paths[0]), "wheel METADATA")
        assert_identity(wheel_metadata, "wheel METADATA", arguments.distribution, arguments.version)
        wheel_document = BytesParser(policy=policy.default).parsebytes(wheel.read(wheel_paths[0]))
        require(wheel_document["Wheel-Version"] == "1.0", "wheel WHEEL does not declare Wheel-Version 1.0")
        require(wheel_document.get_all("Tag") == ["py3-none-any"], "wheel WHEEL has unexpected compatibility tags")
        assert_wheel_record(wheel, record_paths[0])

    with tarfile.open(arguments.sdist, mode="r:gz") as source:
        names = source.getnames()
        require(len(names) == len(set(names)), "sdist contains duplicate member names")
        require(
            all(safe_member(name) for name in names),
            "sdist contains an unsafe absolute or parent-traversal member",
        )
        expected_root = f"{normalized_distribution}-{arguments.version}"
        require(
            all(name == expected_root or name.startswith(f"{expected_root}/") for name in names),
            f"sdist contains a member outside its exact root {expected_root!r}",
        )
        pyprojects = [name for name in names if name.endswith("/pyproject.toml")]
        modules = [name for name in names if name.endswith(f"/src/{arguments.module}/__init__.py")]
        require(len(pyprojects) == 1, f"sdist pyproject.toml is absent or duplicated: {pyprojects!r}")
        require(len(modules) == 1, f"sdist import package is absent or duplicated: {modules!r}")
        package_info_paths = [name for name in names if name.count("/") == 1 and name.endswith("/PKG-INFO")]
        require(
            len(package_info_paths) == 1,
            f"sdist must contain exactly one root PKG-INFO; observed {package_info_paths!r}",
        )
        package_info = source.extractfile(package_info_paths[0])
        require(package_info is not None, "sdist PKG-INFO is not a regular file")
        sdist_metadata = metadata(package_info.read(), "sdist PKG-INFO")
        assert_identity(sdist_metadata, "sdist PKG-INFO", arguments.distribution, arguments.version)

    install_and_import(
        arguments.wheel,
        arguments.module,
        arguments.backend,
        arguments.distribution,
        arguments.version,
        "wheel",
        arguments.workdir,
    )
    install_and_import(
        arguments.sdist,
        arguments.module,
        arguments.backend,
        arguments.distribution,
        arguments.version,
        "sdist",
        arguments.workdir,
    )


if __name__ == "__main__":
    main()
