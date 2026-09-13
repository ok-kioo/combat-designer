import type {
  RawExtractionItem,
  CanonicalAttack,
  QuarantineRecord,
} from "@combat-designer/backend";

export interface NormalizationResult {
  attack?: CanonicalAttack;
  quarantine?: Omit<QuarantineRecord, "workspace_id" | "project_id" | "project_revision" | "quarantined_at">;
}

export function sanitizeText(raw: string): string {
  // Retain only alphanumeric, space, underscore, hyphen
  const filtered = raw
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return filtered;
}

export function normalizeRawItem(
  item: RawExtractionItem,
  projectId: string,
  engine: string
): NormalizationResult {
  const p = item.raw_payload;

  // 1. Raw name & Sanitization
  const rawLabel = String(
    p.attackName || p.name || p.m_Name || item.asset_id || ""
  ).trim();

  if (!rawLabel) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: "Missing attack name in raw extraction payload",
        parser_version: item.parser_version,
        raw_reference: p,
      },
    };
  }

  const sanitizedName = sanitizeText(rawLabel);
  if (!sanitizedName) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: `Attack name '${rawLabel}' contains no valid characters after sanitization`,
        parser_version: item.parser_version,
        raw_reference: p,
      },
    };
  }

  // 2. Qualified AttackId: {engine}:{project_id}:{local_id}
  const qualifiedId = `${engine}:${projectId}:${item.asset_id}`;

  // 3. Timing & Timeline fields
  const startup = Number(p.startupFrames ?? p.startup ?? 0);
  const active = Number(p.activeFrames ?? p.active ?? 0);
  const recovery = Number(p.recoveryFrames ?? p.recovery ?? 0);

  if (!Number.isInteger(startup) || startup < 0) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: `Invalid startup_frames: must be non-negative integer, got ${startup}`,
        parser_version: item.parser_version,
      },
    };
  }

  if (!Number.isInteger(active) || active <= 0) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: `Invalid active_frames: must be strictly greater than 0, got ${active}`,
        parser_version: item.parser_version,
      },
    };
  }

  if (!Number.isInteger(recovery) || recovery < 0) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: `Invalid recovery_frames: must be non-negative integer, got ${recovery}`,
        parser_version: item.parser_version,
      },
    };
  }

  const totalDuration = startup + active + recovery;

  // 4. Damage & Guard
  const damage = Number(p.damage ?? 0);
  const chipDamage = Number(p.chipDamage ?? p.chip_damage ?? 0);
  const guardBreakValue = Number(p.guardBreakValue ?? p.guard_break ?? 0);

  if (damage < 0) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: `Damage cannot be negative, got ${damage}`,
        parser_version: item.parser_version,
      },
    };
  }

  if (chipDamage < 0 || chipDamage > damage) {
    return {
      quarantine: {
        asset_id: item.asset_id,
        source_path: item.source_path,
        reason: `chip_damage (${chipDamage}) cannot be negative and cannot exceed damage (${damage})`,
        parser_version: item.parser_version,
      },
    };
  }

  const hitstun = Number(p.hitstunFrames ?? p.hitstun ?? 0);
  const hitstop = Number(p.hitstopFrames ?? p.hitstop ?? 0);
  const blockstun = Number(p.blockstunFrames ?? p.blockstun ?? 0);

  // 5. Invuln & Armor Windows validation
  const invulnWindows: { start: number; end: number }[] = [];
  if (Array.isArray(p.invulnWindows)) {
    for (const w of p.invulnWindows) {
      if (typeof w === "object" && w !== null) {
        const start = Number((w as Record<string, unknown>).start ?? 0);
        const end = Number((w as Record<string, unknown>).end ?? 0);
        if (start >= end || end > totalDuration) {
          return {
            quarantine: {
              asset_id: item.asset_id,
              source_path: item.source_path,
              reason: `Invuln window [${start}, ${end}) is invalid for total duration ${totalDuration}`,
              parser_version: item.parser_version,
            },
          };
        }
        invulnWindows.push({ start, end });
      }
    }
  }

  // Check overlapping invuln windows
  invulnWindows.sort((a, b) => a.start - b.start);
  for (let i = 1; i < invulnWindows.length; i++) {
    if (invulnWindows[i].start < invulnWindows[i - 1].end) {
      return {
        quarantine: {
          asset_id: item.asset_id,
          source_path: item.source_path,
          reason: `Overlapping invuln windows: [${invulnWindows[i - 1].start}, ${invulnWindows[i - 1].end}) and [${invulnWindows[i].start}, ${invulnWindows[i].end})`,
          parser_version: item.parser_version,
        },
      };
    }
  }

  // 6. Resource Costs
  const resourceCosts: { resource_type: string; amount: number; cost_frame: number }[] = [];
  if (Array.isArray(p.resourceCosts)) {
    for (const c of p.resourceCosts) {
      if (typeof c === "object" && c !== null) {
        const rc = c as Record<string, unknown>;
        const amount = Number(rc.amount ?? 0);
        if (amount < 0) {
          return {
            quarantine: {
              asset_id: item.asset_id,
              source_path: item.source_path,
              reason: `Resource cost cannot be negative: ${amount}`,
              parser_version: item.parser_version,
            },
          };
        }
        resourceCosts.push({
          resource_type: String(rc.resourceType ?? rc.resource_type ?? "stamina"),
          amount,
          cost_frame: Number(rc.costFrame ?? rc.cost_frame ?? 0),
        });
      }
    }
  }

  // 7. Cancels
  const cancels: CanonicalAttack["cancels"] = [];
  if (Array.isArray(p.cancels)) {
    for (const c of p.cancels) {
      if (typeof c === "object" && c !== null) {
        const cr = c as Record<string, unknown>;
        const start = Number(cr.start ?? cr.min_frame ?? 0);
        const end = Number(cr.end ?? cr.max_frame ?? 0);
        if (start >= end || end > totalDuration) {
          return {
            quarantine: {
              asset_id: item.asset_id,
              source_path: item.source_path,
              reason: `Cancel window [${start}, ${end}) exceeds attack duration ${totalDuration}`,
              parser_version: item.parser_version,
            },
          };
        }
        cancels.push({
          source_attack: qualifiedId,
          target_action: String(cr.targetAction ?? cr.target_action ?? ""),
          window: { start, end },
          condition: (cr.condition as "on_hit" | "on_block" | "on_whiff" | "always") || "on_hit",
          resource_cost: cr.resourceCost ? (cr.resourceCost as any) : undefined,
        });
      }
    }
  }

  // 8. Hitboxes
  const hitboxes: CanonicalAttack["hitboxes"] = [];
  if (Array.isArray(p.hitboxes)) {
    for (const h of p.hitboxes) {
      if (typeof h === "object" && h !== null) {
        const hb = h as Record<string, unknown>;
        const activeWindow = (hb.activeWindow as Record<string, unknown>) || {};
        const start = Number(activeWindow.start ?? startup);
        const end = Number(activeWindow.end ?? startup + active);
        if (start >= end || end > totalDuration) {
          return {
            quarantine: {
              asset_id: item.asset_id,
              source_path: item.source_path,
              reason: `Hitbox active window [${start}, ${end}) exceeds duration ${totalDuration}`,
              parser_version: item.parser_version,
            },
          };
        }
        hitboxes.push({
          id: String(hb.id || `${item.asset_id}_hb`),
          attack_id: qualifiedId,
          hitbox_type: (hb.hitboxType as any) || "strike",
          shape: (hb.shape as any) || { shape_type: "box", width: 100, height: 50 },
          active_window: { start, end },
          damage_multiplier_permille: Number(hb.damageMultiplierPermille ?? 1000),
          knockback_x: Number(hb.knockbackX ?? 0),
          knockback_y: Number(hb.knockbackY ?? 0),
          launch: Boolean(hb.launch ?? false),
        });
      }
    }
  }

  // 9. Tags (deduplicated and sorted for determinism)
  const tagList: string[] = [];
  if (Array.isArray(p.tags)) {
    for (const t of p.tags) {
      if (typeof t === "string" && t.trim()) {
        tagList.push(t.trim());
      }
    }
  }
  const uniqueSortedTags = Array.from(new Set(tagList)).sort();
  const rawCharId = p.characterId ?? p.character_id ?? p.character ?? p.characterName;
  const characterId = typeof rawCharId === "string" && rawCharId.trim().length > 0 ? sanitizeText(rawCharId) : null;
  const assignmentStatus = characterId ? ("ASSIGNED" as const) : ("UNASSIGNED" as const);

  return {
    attack: {
      id: qualifiedId,
      name: {
        name: sanitizedName,
        raw_label: rawLabel,
        untrusted_text: true,
      },
      startup_frames: startup,
      active_frames: active,
      recovery_frames: recovery,
      damage,
      hitstun_frames: hitstun,
      hitstop_frames: hitstop,
      blockstun_frames: blockstun,
      chip_damage: chipDamage,
      guard_break_value: guardBreakValue,
      invuln_windows: invulnWindows,
      armor_windows: [],
      resource_costs: resourceCosts,
      hitboxes,
      cancels,
      tags: uniqueSortedTags,
      character_id: characterId,
      assignment_status: assignmentStatus,
      provenance: {
        engine,
        project_revision: item.project_revision,
        source_path: item.source_path,
        asset_id: item.asset_id,
        parser_version: item.parser_version,
        confidence_permille: 1000,
        status: "canonical",
      },
    },
  };
}
