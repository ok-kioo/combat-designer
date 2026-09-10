import type { GraphDriver, GraphSession, GraphQueryResult, GraphRecord } from "./driver.js";

export interface InMemoryNode {
  id: string;
  labels: Set<string>;
  properties: Record<string, unknown>;
}

export interface InMemoryRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, unknown>;
}

/**
 * An in-memory graph store and driver implementing Neo4j semantics for local testing
 * and environments where live Neo4j daemon is not spun up.
 * Enforces composite key uniqueness constraints (workspace_id + entity_id),
 * transactional merges, and workspace isolation.
 */
export class InMemoryGraphDriver implements GraphDriver {
  private nodes = new Map<string, InMemoryNode>();
  private relationships = new Map<string, InMemoryRelationship>();
  private constraints = new Set<string>();
  private nextId = 1;

  session(): GraphSession {
    return {
      run: async (query: string, parameters: Record<string, unknown> = {}): Promise<GraphQueryResult> => {
        return this.executeQuery(query, parameters);
      },
      close: async () => {},
    };
  }

  async verifyConnectivity(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.clear();
  }

  clear(): void {
    this.nodes.clear();
    this.relationships.clear();
    this.constraints.clear();
    this.nextId = 1;
  }

  getAllNodes(): InMemoryNode[] {
    return Array.from(this.nodes.values());
  }

  getAllRelationships(): InMemoryRelationship[] {
    return Array.from(this.relationships.values());
  }

  private createRecord(data: Record<string, unknown>): GraphRecord {
    return {
      get(key: string) {
        return data[key];
      },
      toObject() {
        return data;
      },
    };
  }

  private executeQuery(query: string, params: Record<string, unknown>): GraphQueryResult {
    const trimmed = query.trim();

    // 1. DDL: Constraints and Indexes
    if (trimmed.startsWith("CREATE CONSTRAINT") || trimmed.startsWith("CREATE INDEX")) {
      this.constraints.add(trimmed);
      return { records: [] };
    }

    // 2. Query Projection Metadata
    if (trimmed.includes("MATCH (m:ProjectionMetadata") || trimmed.includes("WHERE m.workspace_id = $workspace_id")) {
      const ws = params.workspace_id as string;
      const projId = params.project_id as string;
      const match = Array.from(this.nodes.values()).find(
        (n) =>
          n.labels.has("ProjectionMetadata") &&
          n.properties.workspace_id === ws &&
          n.properties.project_id === projId
      );
      if (match) {
        return { records: [this.createRecord({ m: match.properties })] };
      }
      return { records: [] };
    }

    // 3. MERGE ProjectionMetadata
    if (trimmed.includes("MERGE (m:ProjectionMetadata")) {
      const ws = params.workspace_id as string;
      const projId = params.project_id as string;
      const key = `Metadata:${ws}:${projId}`;
      let node = Array.from(this.nodes.values()).find(
        (n) =>
          n.labels.has("ProjectionMetadata") &&
          n.properties.workspace_id === ws &&
          n.properties.project_id === projId
      );
      if (!node) {
        node = {
          id: key,
          labels: new Set(["ProjectionMetadata"]),
          properties: {},
        };
        this.nodes.set(key, node);
      }
      // Only update defined params
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          node.properties[k] = v;
        }
      }
      if (!node.properties.status) {
        node.properties.status = "CURRENT";
      }

      // Parse inline SET clauses like SET m.graph_schema_version = '0.9.0' or SET m.status = 'ERROR' or SET m.foo = $foo
      const setMatches = trimmed.matchAll(/m\.([a-zA-Z0-9_]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s,\)]+))/g);
      for (const match of setMatches) {
        const prop = match[1];
        let val: unknown;
        if (match[2] !== undefined) {
          val = match[2];
        } else if (match[3] !== undefined) {
          val = match[3];
        } else if (match[4] !== undefined) {
          const raw = match[4];
          if (raw.startsWith("$")) {
            val = params[raw.slice(1)];
          } else if (raw === "true") {
            val = true;
          } else if (raw === "false") {
            val = false;
          } else if (!isNaN(Number(raw))) {
            val = Number(raw);
          } else {
            val = raw;
          }
        }
        if (prop && val !== undefined) {
          node.properties[prop] = val;
        }
      }

      return { records: [this.createRecord({ m: node.properties })] };
    }

    // 4. MERGE Attack and subcomponents
    if (trimmed.includes("MERGE (a:Attack")) {
      const ws = params.workspace_id as string;
      const atkId = params.attack_id as string;
      const attackNodeKey = `Attack:${ws}:${atkId}`;

      let atkNode = Array.from(this.nodes.values()).find(
        (n) =>
          n.labels.has("Attack") &&
          n.properties.workspace_id === ws &&
          n.properties.attack_id === atkId
      );

      if (!atkNode) {
        atkNode = {
          id: attackNodeKey,
          labels: new Set(["Attack"]),
          properties: {},
        };
        this.nodes.set(attackNodeKey, atkNode);
      }

      Object.assign(atkNode.properties, {
        workspace_id: ws,
        attack_id: atkId,
        name: params.name,
        raw_label: params.raw_label,
        untrusted_text: params.untrusted_text,
        startup_frames: params.startup_frames,
        active_frames: params.active_frames,
        recovery_frames: params.recovery_frames,
        total_duration: params.total_duration,
        damage: params.damage,
        chip_damage: params.chip_damage,
        guard_break_value: params.guard_break_value,
        hitstun_frames: params.hitstun_frames,
        hitstop_frames: params.hitstop_frames,
        blockstun_frames: params.blockstun_frames,
        tags: params.tags,
        project_id: params.project_id,
        project_revision: params.project_revision,
        engine: params.engine,
      });

      // Hitboxes
      if (Array.isArray(params.hitboxes)) {
        for (const hb of params.hitboxes as any[]) {
          const hbKey = `Hitbox:${ws}:${hb.id}`;
          let hbNode = this.nodes.get(hbKey);
          if (!hbNode) {
            hbNode = { id: hbKey, labels: new Set(["Hitbox"]), properties: {} };
            this.nodes.set(hbKey, hbNode);
          }
          Object.assign(hbNode.properties, {
            workspace_id: ws,
            hitbox_id: hb.id,
            attack_id: atkId,
            hitbox_type: hb.hitbox_type,
            raw_label: hb.raw_label || hb.id,
            untrusted_text: true,
            active_start: hb.active_window.start,
            active_end: hb.active_window.end,
            damage_multiplier_permille: hb.damage_multiplier_permille,
            knockback_x: hb.knockback_x,
            knockback_y: hb.knockback_y,
            launch: hb.launch,
          });

          // Rel: Attack -> Hitbox
          const relKey = `HAS_HITBOX:${attackNodeKey}:${hbKey}`;
          if (!this.relationships.has(relKey)) {
            this.relationships.set(relKey, {
              id: relKey,
              type: "HAS_HITBOX",
              startNodeId: attackNodeKey,
              endNodeId: hbKey,
              properties: { workspace_id: ws },
            });
          }
        }
      }

      // Cancels
      if (Array.isArray(params.cancels)) {
        for (let i = 0; i < (params.cancels as any[]).length; i++) {
          const c = (params.cancels as any[])[i];
          const cancelId = `${atkId}_cancel_${i}`;
          const cancelKey = `CancelRule:${ws}:${cancelId}`;
          let cNode = this.nodes.get(cancelKey);
          if (!cNode) {
            cNode = { id: cancelKey, labels: new Set(["CancelRule"]), properties: {} };
            this.nodes.set(cancelKey, cNode);
          }
          Object.assign(cNode.properties, {
            workspace_id: ws,
            cancel_id: cancelId,
            source_attack: atkId,
            target_action: c.target_action,
            raw_label: c.raw_label || c.target_action,
            untrusted_text: true,
            start_frame: c.window.start,
            end_frame: c.window.end,
            condition: c.condition,
          });

          // Rel: Attack -> CancelRule
          const relKey1 = `HAS_CANCEL:${attackNodeKey}:${cancelKey}`;
          if (!this.relationships.has(relKey1)) {
            this.relationships.set(relKey1, {
              id: relKey1,
              type: "HAS_CANCEL",
              startNodeId: attackNodeKey,
              endNodeId: cancelKey,
              properties: { workspace_id: ws },
            });
          }

          // Rel: CancelRule -> Target Attack
          const targetAtkKey = `Attack:${ws}:${c.target_action}`;
          const relKey2 = `CANCELS_TO:${cancelKey}:${targetAtkKey}`;
          this.relationships.set(relKey2, {
            id: relKey2,
            type: "CANCELS_TO",
            startNodeId: cancelKey,
            endNodeId: targetAtkKey,
            properties: { workspace_id: ws },
          });
        }
      }

      // Resources
      if (Array.isArray(params.resource_costs)) {
        for (let i = 0; i < (params.resource_costs as any[]).length; i++) {
          const rc = (params.resource_costs as any[])[i];
          const resId = `${atkId}_res_${rc.resource_type}`;
          const resKey = `Resource:${ws}:${resId}`;
          let rNode = this.nodes.get(resKey);
          if (!rNode) {
            rNode = { id: resKey, labels: new Set(["Resource"]), properties: {} };
            this.nodes.set(resKey, rNode);
          }
          Object.assign(rNode.properties, {
            workspace_id: ws,
            resource_id: resId,
            resource_type: rc.resource_type,
            amount: rc.amount,
            cost_frame: rc.cost_frame,
          });

          const relKey = `CONSUMES:${attackNodeKey}:${resKey}`;
          if (!this.relationships.has(relKey)) {
            this.relationships.set(relKey, {
              id: relKey,
              type: "CONSUMES",
              startNodeId: attackNodeKey,
              endNodeId: resKey,
              properties: { workspace_id: ws },
            });
          }
        }
      }

      // Provenance
      if (params.provenance && typeof params.provenance === "object") {
        const prov = params.provenance as any;
        const provId = `prov_${prov.engine}_${prov.asset_id}`;
        const provKey = `Provenance:${ws}:${provId}`;
        let pNode = this.nodes.get(provKey);
        if (!pNode) {
          pNode = { id: provKey, labels: new Set(["Provenance"]), properties: {} };
          this.nodes.set(provKey, pNode);
        }
        Object.assign(pNode.properties, {
          workspace_id: ws,
          provenance_id: provId,
          engine: prov.engine,
          project_revision: prov.project_revision,
          source_path: prov.source_path,
          asset_id: prov.asset_id,
          parser_version: prov.parser_version,
          confidence_permille: prov.confidence_permille,
          status: prov.status,
        });

        const relKey = `HAS_PROVENANCE:${attackNodeKey}:${provKey}`;
        if (!this.relationships.has(relKey)) {
          this.relationships.set(relKey, {
            id: relKey,
            type: "HAS_PROVENANCE",
            startNodeId: attackNodeKey,
            endNodeId: provKey,
            properties: { workspace_id: ws },
          });
        }
      }

      return { records: [this.createRecord({ a: atkNode.properties })] };
    }

    // 5. Q01 — Cancel Options
    if (trimmed.includes("Q01_CANCEL_OPTIONS") || (trimmed.includes("HAS_CANCEL") && trimmed.includes("CANCELS_TO") && !trimmed.includes("Q02") && !trimmed.includes("Q03") && !trimmed.includes("launch") && !trimmed.includes("nodes(path)"))) {
      const ws = params.workspace_id as string;
      const atkId = params.attack_id as string;
      const sourceKey = `Attack:${ws}:${atkId}`;

      const records: GraphRecord[] = [];
      for (const rel1 of this.relationships.values()) {
        if (rel1.type === "HAS_CANCEL" && rel1.startNodeId === sourceKey && rel1.properties.workspace_id === ws) {
          const cancelNode = this.nodes.get(rel1.endNodeId);
          if (!cancelNode) continue;
          for (const rel2 of this.relationships.values()) {
            if (rel2.type === "CANCELS_TO" && rel2.startNodeId === cancelNode.id && rel2.properties.workspace_id === ws) {
              const targetNode = this.nodes.get(rel2.endNodeId);
              records.push(
                this.createRecord({
                  source_attack: atkId,
                  cancel_rule: cancelNode.properties,
                  target_attack_id: targetNode?.properties?.attack_id || cancelNode.properties.target_action,
                  target_attack: targetNode?.properties || { attack_id: cancelNode.properties.target_action },
                })
              );
            }
          }
        }
      }
      return { records };
    }

    // 6. Q02 — Paths to Launcher
    if (trimmed.includes("Q02_PATHS_TO_LAUNCHER") || (trimmed.includes("launch") && trimmed.includes("HAS_HITBOX"))) {
      const ws = params.workspace_id as string;
      const startAtkId = params.attack_id as string;
      const maxDepth = Number(params.max_depth || 5);

      const records: GraphRecord[] = [];
      const visited = new Set<string>();

      const dfs = (currentAtkId: string, currentPath: string[], depth: number) => {
        if (depth > maxDepth) return;
        const atkKey = `Attack:${ws}:${currentAtkId}`;
        const atkNode = this.nodes.get(atkKey);

        // Check if current attack has a launcher hitbox (reachable via cancels, depth > 0)
        if (atkNode && depth > 0) {
          for (const rel of this.relationships.values()) {
            if (rel.type === "HAS_HITBOX" && rel.startNodeId === atkKey && rel.properties.workspace_id === ws) {
              const hb = this.nodes.get(rel.endNodeId);
              if (hb && hb.properties.launch === true) {
                records.push(
                  this.createRecord({
                    path: [...currentPath],
                    path_attacks: [...currentPath],
                    launcher_attack_id: currentAtkId,
                    launcher_id: currentAtkId,
                    depth,
                  })
                );
                break;
              }
            }
          }
        }

        // Traverse cancels
        for (const rel1 of this.relationships.values()) {
          if (rel1.type === "HAS_CANCEL" && rel1.startNodeId === atkKey && rel1.properties.workspace_id === ws) {
            const cancelNode = this.nodes.get(rel1.endNodeId);
            if (!cancelNode) continue;
            const targetAtk = cancelNode.properties.target_action as string;
            if (!visited.has(targetAtk)) {
              visited.add(targetAtk);
              dfs(targetAtk, [...currentPath, targetAtk], depth + 1);
              visited.delete(targetAtk);
            }
          }
        }
      };

      visited.add(startAtkId);
      dfs(startAtkId, [startAtkId], 0);
      return { records };
    }

    // 7. Q03 — Action Cycles
    if (trimmed.includes("Q03_CYCLES") || trimmed.includes("action_cycles")) {
      const ws = params.workspace_id as string;
      const maxDepth = Math.min(Number(params.max_depth || 6), 10);
      const maxResults = Math.min(Number(params.max_results || 50), 100);

      const records: GraphRecord[] = [];
      const attacksInWorkspace = Array.from(this.nodes.values()).filter(
        (n) => n.labels.has("Attack") && n.properties.workspace_id === ws
      );

      const foundCycleKeys = new Set<string>();

      for (const rootAtk of attacksInWorkspace) {
        const rootId = rootAtk.properties.attack_id as string;
        const stack: string[] = [rootId];

        const findCycles = (currentId: string, depth: number) => {
          if (records.length >= maxResults || depth > maxDepth) return;
          const currentKey = `Attack:${ws}:${currentId}`;

          for (const rel1 of this.relationships.values()) {
            if (rel1.type === "HAS_CANCEL" && rel1.startNodeId === currentKey && rel1.properties.workspace_id === ws) {
              const cNode = this.nodes.get(rel1.endNodeId);
              if (!cNode) continue;
              const nextId = cNode.properties.target_action as string;

              if (nextId === rootId && stack.length > 1) {
                const cycle = [...stack, rootId];
                const cycleKey = cycle.join("->");
                if (!foundCycleKeys.has(cycleKey)) {
                  foundCycleKeys.add(cycleKey);
                  records.push(
                    this.createRecord({
                      cycle,
                      length: stack.length,
                    })
                  );
                }
                return;
              }

              if (!stack.includes(nextId)) {
                stack.push(nextId);
                findCycles(nextId, depth + 1);
                stack.pop();
              }
            }
          }
        };

        findCycles(rootId, 0);
      }

      return { records };
    }

    // 8. Q04 — Impact Analysis
    if (trimmed.includes("Q04_IMPACT_ANALYSIS") || trimmed.includes("impact_analysis")) {
      const ws = params.workspace_id as string;
      const atkId = params.attack_id as string;
      const rootKey = `Attack:${ws}:${atkId}`;

      const directlyConnected = new Set<string>();
      const affectedAttacks = new Set<string>();

      for (const rel of this.relationships.values()) {
        if (rel.properties.workspace_id !== ws) continue;
        if (rel.startNodeId === rootKey) {
          directlyConnected.add(rel.endNodeId);
          if (rel.type === "HAS_CANCEL") {
            const cNode = this.nodes.get(rel.endNodeId);
            if (cNode) {
              affectedAttacks.add(cNode.properties.target_action as string);
            }
          }
        }
        if (rel.endNodeId === rootKey) {
          directlyConnected.add(rel.startNodeId);
          if (rel.type === "CANCELS_TO") {
            const cNode = this.nodes.get(rel.startNodeId);
            if (cNode) {
              affectedAttacks.add(cNode.properties.source_attack as string);
            }
          }
        }
      }

      return {
        records: [
          this.createRecord({
            attack_id: atkId,
            affected_attacks: Array.from(affectedAttacks),
            total_connected_entities: directlyConnected.size,
          }),
        ],
      };
    }

    // 9. Q05 — Provenance
    if (trimmed.includes("Q05_PROVENANCE") || trimmed.includes("HAS_PROVENANCE")) {
      const ws = params.workspace_id as string;
      const atkId = params.attack_id as string;
      const rootKey = `Attack:${ws}:${atkId}`;

      for (const rel of this.relationships.values()) {
        if (rel.type === "HAS_PROVENANCE" && rel.startNodeId === rootKey && rel.properties.workspace_id === ws) {
          const provNode = this.nodes.get(rel.endNodeId);
          if (provNode) {
            return {
              records: [
                this.createRecord({
                  attack_id: atkId,
                  provenance: provNode.properties,
                }),
              ],
            };
          }
        }
      }
      return { records: [] };
    }

    // 10. Q06 — Scenarios
    if (trimmed.includes("Q06_SCENARIOS") || trimmed.includes("Scenario")) {
      const ws = params.workspace_id as string;
      const records = Array.from(this.nodes.values())
        .filter((n) => n.labels.has("Scenario") && n.properties.workspace_id === ws)
        .map((n) => this.createRecord({ scenario: n.properties }));
      return { records };
    }

    return { records: [] };
  }
}
