"""
combat_designer_exporter.py
Lightweight exporter script for Unreal Engine 5.x.
Runs locally in Unreal Editor Python environment to discover combat DataAssets,
extract raw combat parameters, compute sha256 checksums, and package into ExportBundle.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Dict, Any, Union


EXPORTER_VERSION = "1.0.0"
PARSER_VERSION = "1.0.0"
FORMAT = "unreal-json"


def compute_sha256(content: Union[str, bytes]) -> str:
    if isinstance(content, str):
        content = content.encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def compute_canonical_bundle_hash(checksums: Dict[str, str]) -> str:
    sorted_keys = sorted(checksums.keys())
    canonical_lines = [f"{k}:{checksums[k]}" for k in sorted_keys]
    canonical_str = "\n".join(canonical_lines)
    return compute_sha256(canonical_str)


def build_manifest(
    project_id: str,
    project_revision: str,
    workspace_id: str,
    file_contents: Dict[str, Union[str, bytes]],
    engine_version: str = "5.4"
) -> Dict[str, Any]:
    checksums = {}
    for path, content in file_contents.items():
        checksums[path] = compute_sha256(content)

    bundle_hash = compute_canonical_bundle_hash(checksums)

    manifest = {
        "schema_version": "1.0.0",
        "engine": "unreal",
        "engine_version": engine_version,
        "project_id": project_id,
        "project_revision": project_revision,
        "exporter_version": EXPORTER_VERSION,
        "parser_version": PARSER_VERSION,
        "format": FORMAT,
        "workspace_id": workspace_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "asset_count": len(file_contents),
        "checksums": checksums,
        "bundle_hash": bundle_hash,
    }
    return manifest
