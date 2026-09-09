using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Collections.Generic;

#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
#endif

namespace CombatDesigner.Exporters.Unity
{
    /// <summary>
    /// Lightweight exporter script for Unity.
    /// Runs locally inside the user's Unity Editor to discover, checksum,
    /// and package combat ScriptableObjects into a standardized Export Bundle.
    /// </summary>
    public static class CombatDesignerExporter
    {
        public const string ExporterVersion = "1.0.0";
        public const string ParserVersion = "1.0.0";
        public const string Format = "unity-yaml-scriptable-object";

        [System.Serializable]
        public class ExportManifest
        {
            public string schema_version = "1.0.0";
            public string engine = "unity";
            public string engine_version = "2026.1";
            public string project_id = "default_project";
            public string project_revision = "git_head";
            public string exporter_version = ExporterVersion;
            public string parser_version = ParserVersion;
            public string format = Format;
            public string workspace_id = "default_workspace";
            public string exported_at;
            public int asset_count;
            public Dictionary<string, string> checksums = new Dictionary<string, string>();
            public string bundle_hash;
        }

        public static string ComputeSha256(byte[] bytes)
        {
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(bytes);
                var sb = new StringBuilder();
                foreach (byte b in hash)
                {
                    sb.Append(b.ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static string ComputeCanonicalBundleHash(Dictionary<string, string> checksums)
        {
            var keys = new List<string>(checksums.Keys);
            keys.Sort(StringComparer.Ordinal);

            var sb = new StringBuilder();
            for (int i = 0; i < keys.Count; i++)
            {
                if (i > 0) sb.Append("\n");
                sb.Append(keys[i]).Append(":").Append(checksums[keys[i]]);
            }

            return ComputeSha256(Encoding.UTF8.GetBytes(sb.ToString()));
        }

        public static ExportManifest BuildManifest(
            string projectId,
            string projectRevision,
            string workspaceId,
            Dictionary<string, byte[]> fileContents)
        {
            var manifest = new ExportManifest
            {
                project_id = projectId,
                project_revision = projectRevision,
                workspace_id = workspaceId,
                exported_at = DateTime.UtcNow.ToString("o"),
                asset_count = fileContents.Count
            };

            foreach (var kvp in fileContents)
            {
                string hash = ComputeSha256(kvp.Value);
                manifest.checksums[kvp.Key] = hash;
            }

            manifest.bundle_hash = ComputeCanonicalBundleHash(manifest.checksums);
            return manifest;
        }
    }
}
