export const GRAPH_SCHEMA_VERSION = "1.0.0";
export const PROJECTOR_VERSION = "1.0.0";

export const NODE_LABELS = {
  Attack: "Attack",
  Hitbox: "Hitbox",
  CombatState: "CombatState",
  CancelRule: "CancelRule",
  Resource: "Resource",
  Archetype: "Archetype",
  Scenario: "Scenario",
  Provenance: "Provenance",
  ProjectionMetadata: "ProjectionMetadata",
} as const;

export const RELATIONSHIP_TYPES = {
  HAS_HITBOX: "HAS_HITBOX",
  HAS_CANCEL: "HAS_CANCEL",
  CANCELS_TO: "CANCELS_TO",
  TRANSITIONS_TO: "TRANSITIONS_TO",
  CONSUMES: "CONSUMES",
  COUNTERS: "COUNTERS",
  HAS_PROVENANCE: "HAS_PROVENANCE",
  BELONGS_TO_ARCHETYPE: "BELONGS_TO_ARCHETYPE",
  TARGETS: "TARGETS",
  EQUIVALENT_TO: "EQUIVALENT_TO",
} as const;

/**
 * Cypher DDL statements to create uniqueness constraints on composite keys (workspace_id + entity_id).
 * Compatible with Neo4j 5.x.
 */
export const GRAPH_CONSTRAINTS = [
  `CREATE CONSTRAINT attack_workspace_unique IF NOT EXISTS
   FOR (a:Attack) REQUIRE (a.workspace_id, a.attack_id) IS UNIQUE`,

  `CREATE CONSTRAINT hitbox_workspace_unique IF NOT EXISTS
   FOR (h:Hitbox) REQUIRE (h.workspace_id, h.hitbox_id) IS UNIQUE`,

  `CREATE CONSTRAINT cancel_workspace_unique IF NOT EXISTS
   FOR (c:CancelRule) REQUIRE (c.workspace_id, c.cancel_id) IS UNIQUE`,

  `CREATE CONSTRAINT state_workspace_unique IF NOT EXISTS
   FOR (s:CombatState) REQUIRE (s.workspace_id, s.state_id) IS UNIQUE`,

  `CREATE CONSTRAINT resource_workspace_unique IF NOT EXISTS
   FOR (r:Resource) REQUIRE (r.workspace_id, r.resource_id) IS UNIQUE`,

  `CREATE CONSTRAINT archetype_workspace_unique IF NOT EXISTS
   FOR (arc:Archetype) REQUIRE (arc.workspace_id, arc.archetype_id) IS UNIQUE`,

  `CREATE CONSTRAINT scenario_workspace_unique IF NOT EXISTS
   FOR (sc:Scenario) REQUIRE (sc.workspace_id, sc.scenario_id) IS UNIQUE`,

  `CREATE CONSTRAINT provenance_workspace_unique IF NOT EXISTS
   FOR (p:Provenance) REQUIRE (p.workspace_id, p.provenance_id) IS UNIQUE`,

  `CREATE CONSTRAINT projection_metadata_unique IF NOT EXISTS
   FOR (m:ProjectionMetadata) REQUIRE (m.workspace_id, m.project_id) IS UNIQUE`,
];

export const GRAPH_INDEXES = [
  `CREATE INDEX attack_workspace_idx IF NOT EXISTS
   FOR (a:Attack) ON (a.workspace_id)`,

  `CREATE INDEX hitbox_workspace_idx IF NOT EXISTS
   FOR (h:Hitbox) ON (h.workspace_id)`,

  `CREATE INDEX cancel_workspace_idx IF NOT EXISTS
   FOR (c:CancelRule) ON (c.workspace_id)`,
];
