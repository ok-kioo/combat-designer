# CombatDesignerExporter.gd
# Lightweight exporter script for Godot Engine (4.x).
# Runs locally in the Godot editor to discover combat .tres resources,
# extract raw combat data, compute sha256 checksums, and package into ExportBundle.

@tool
extends EditorScript

const EXPORTER_VERSION = "1.0.0"
const PARSER_VERSION = "1.0.0"
const FORMAT = "godot-tres"

class ExportManifest:
	var schema_version: String = "1.0.0"
	var engine: String = "godot"
	var engine_version: String = "4.3"
	var project_id: String = "default_project"
	var project_revision: String = "git_head"
	var exporter_version: String = EXPORTER_VERSION
	var parser_version: String = PARSER_VERSION
	var format: String = FORMAT
	var workspace_id: String = "default_workspace"
	var exported_at: String = ""
	var asset_count: int = 0
	var checksums: Dictionary = {}
	var bundle_hash: String = ""

	func to_dict() -> Dictionary:
		return {
			"schema_version": schema_version,
			"engine": engine,
			"engine_version": engine_version,
			"project_id": project_id,
			"project_revision": project_revision,
			"exporter_version": exporter_version,
			"parser_version": parser_version,
			"format": format,
			"workspace_id": workspace_id,
			"exported_at": exported_at,
			"asset_count": asset_count,
			"checksums": checksums,
			"bundle_hash": bundle_hash
		}

static func compute_sha256(content: PackedByteArray) -> String:
	var ctx = HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(content)
	return ctx.finish().hex_encode()

static func compute_canonical_bundle_hash(checksums: Dictionary) -> String:
	var keys = checksums.keys()
	keys.sort()
	var canonical_str = ""
	for i in range(keys.size()):
		if i > 0:
			canonical_str += "\n"
		canonical_str += str(keys[i]) + ":" + str(checksums[keys[i]])
	return compute_sha256(canonical_str.to_utf8_buffer())

static func build_manifest(project_id: String, project_rev: String, workspace_id: String, files: Dictionary) -> Dictionary:
	var manifest = ExportManifest.new()
	manifest.project_id = project_id
	manifest.project_revision = project_rev
	manifest.workspace_id = workspace_id
	manifest.exported_at = Time.get_datetime_string_from_system(true) + "Z"
	manifest.asset_count = files.size()
	for file_path in files.keys():
		var data: PackedByteArray
		if files[file_path] is PackedByteArray:
			data = files[file_path]
		else:
			data = str(files[file_path]).to_utf8_buffer()
		manifest.checksums[file_path] = compute_sha256(data)
	manifest.bundle_hash = compute_canonical_bundle_hash(manifest.checksums)
	return manifest.to_dict()
