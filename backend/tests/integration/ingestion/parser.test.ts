import { describe, it, expect } from "vitest";
import { parseUnityYaml } from "../../../src/infrastructure/provider/ingestion/parsers/unity-yaml.js";
import { normalizeRawItem } from "../../../src/infrastructure/provider/ingestion/normalizer.js";

const VALID_UNITY_YAML = `
%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_Name: LightAttack
  attackId: light_attack_01
  attackName: Quick Jab
  startupFrames: 4
  activeFrames: 2
  recoveryFrames: 8
  damage: 40
  chipDamage: 5
  guardBreakValue: 10
  tags:
    - light
    - jab
`;

describe("SPEC 02 — Unity YAML Parser & Normalizer", () => {
  it("valid Unity YAML → ACCEPT", () => {
    const res = parseUnityYaml(
      VALID_UNITY_YAML,
      "assets/light.asset",
      "unity",
      "rev-01",
      "1.0.0"
    );
    expect(res.item).toBeDefined();
    expect(res.quarantine).toBeUndefined();
    expect(res.item?.asset_id).toBe("light_attack_01");
    expect(res.item?.untrusted_text).toBe(true);

    const norm = normalizeRawItem(res.item!, "core-proj", "unity");
    expect(norm.attack).toBeDefined();
    expect(norm.quarantine).toBeUndefined();
    expect(norm.attack?.id).toBe("unity:core-proj:light_attack_01");
    expect(norm.attack?.startup_frames).toBe(4);
    expect(norm.attack?.active_frames).toBe(2);
    expect(norm.attack?.damage).toBe(40);
    expect(norm.attack?.name.name).toBe("Quick Jab");
    expect(norm.attack?.name.untrusted_text).toBe(true);
  });

  it("malformed YAML → QUARANTINED", () => {
    const malformed = `
    key: [unclosed bracket
    another: {
    `;
    const res = parseUnityYaml(
      malformed,
      "assets/broken.asset",
      "unity",
      "rev-01",
      "1.0.0"
    );
    expect(res.item).toBeUndefined();
    expect(res.quarantine).toBeDefined();
    expect(res.quarantine?.reason).toContain("YAML parse error");
  });

  it("unsupported object (lacks combat timing/damage) → QUARANTINED", () => {
    const audioAsset = `
    MonoBehaviour:
      m_Name: BgmTrack
      attackId: bgm_sound_01
      volume: 0.8
      pitch: 1.0
    `;
    const res = parseUnityYaml(
      audioAsset,
      "assets/sound.asset",
      "unity",
      "rev-01",
      "1.0.0"
    );
    expect(res.item).toBeUndefined();
    expect(res.quarantine).toBeDefined();
    expect(res.quarantine?.reason).toContain("Unsupported object");
  });

  it("missing asset identity → QUARANTINED", () => {
    const nameless = `
    MonoBehaviour:
      startupFrames: 5
      activeFrames: 2
      damage: 10
    `;
    const res = parseUnityYaml(
      nameless,
      "assets/nameless.asset",
      "unity",
      "rev-01",
      "1.0.0"
    );
    expect(res.item).toBeUndefined();
    expect(res.quarantine).toBeDefined();
    expect(res.quarantine?.reason).toContain("Missing asset identity");
  });

  it("complete provenance attached during normalization", () => {
    const res = parseUnityYaml(
      VALID_UNITY_YAML,
      "assets/light.asset",
      "unity",
      "rev-999",
      "1.0.0"
    );
    const norm = normalizeRawItem(res.item!, "my-game", "unity");
    const prov = norm.attack?.provenance;
    expect(prov).toBeDefined();
    expect(prov?.engine).toBe("unity");
    expect(prov?.project_revision).toBe("rev-999");
    expect(prov?.source_path).toBe("assets/light.asset");
    expect(prov?.asset_id).toBe("light_attack_01");
    expect(prov?.parser_version).toBe("1.0.0");
    expect(prov?.confidence_permille).toBe(1000);
    expect(prov?.status).toBe("canonical");
  });

  it("invalid active_frames (0) → QUARANTINED during normalization", () => {
    const badTiming = `
    MonoBehaviour:
      m_Name: ZeroActive
      attackId: zero_active_01
      startupFrames: 5
      activeFrames: 0
      recoveryFrames: 10
      damage: 50
    `;
    const res = parseUnityYaml(badTiming, "assets/bad.asset", "unity", "rev-01", "1.0.0");
    const norm = normalizeRawItem(res.item!, "proj", "unity");
    expect(norm.attack).toBeUndefined();
    expect(norm.quarantine).toBeDefined();
    expect(norm.quarantine?.reason).toContain("active_frames: must be strictly greater than 0");
  });

  it("chip_damage > damage → QUARANTINED during normalization", () => {
    const badDamage = `
    MonoBehaviour:
      m_Name: BadDamage
      attackId: bad_damage_01
      startupFrames: 5
      activeFrames: 2
      recoveryFrames: 10
      damage: 30
      chipDamage: 50
    `;
    const res = parseUnityYaml(badDamage, "assets/bad_dmg.asset", "unity", "rev-01", "1.0.0");
    const norm = normalizeRawItem(res.item!, "proj", "unity");
    expect(norm.attack).toBeUndefined();
    expect(norm.quarantine).toBeDefined();
    expect(norm.quarantine?.reason).toContain("chip_damage (50) cannot be negative and cannot exceed damage (30)");
  });
});
