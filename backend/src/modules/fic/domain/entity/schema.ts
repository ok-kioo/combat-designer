import { z } from "zod";

export const SUPPORTED_CATEGORIES = [
  "domain",
  "simulation",
  "verification",
  "ingestion",
  "graph",
  "gateway",
  "authorization",
  "capability",
  "security",
  "audit",
  "tool-policy",
  "workspace",
  "observability",
  "infrastructure",
  "api",
  "ui",
] as const;

export type SupportedCategory = (typeof SUPPORTED_CATEGORIES)[number];

export const FicStatusEnum = z.enum([
  "proposed",
  "designed",
  "implementing",
  "verified",
  "released",
]);
export type FicStatus = z.infer<typeof FicStatusEnum>;

export const ContractChangeEnum = z.enum(["none", "additive", "breaking"]);

export const ContractItemSchema = z.object({
  name: z.string().min(1, "Contract name must not be empty"),
  version: z.string().min(1, "Contract version must not be empty"),
  change: ContractChangeEnum,
});

export const ApprovalSchema = z.object({
  gate_run_id: z.string().nullable().optional(),
  gate_rule_set_version: z.string().nullable().optional(),
  model_revision: z.string().nullable().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
  approval_evidence: z.string().nullable().optional(),
});

export const KgImpactSchema = z.object({
  nodes_added: z.array(z.string()).default([]),
  nodes_changed: z.array(z.string()).default([]),
  relationships_added: z.array(z.string()).default([]),
}).default({});

export const SimulationImpactSchema = z.object({
  states_added: z.array(z.string()).default([]),
  transitions_added: z.array(z.string()).default([]),
  timing_rules_changed: z.array(z.string()).default([]),
}).default({});

export const GatesImpactSchema = z.object({
  added: z.array(z.string()).default([]),
  changed: z.array(z.string()).default([]),
  affected: z.array(z.string()).default([]),
}).default({});

export const GatewayImpactSchema = z.object({
  capabilities_added: z.array(z.string()).default([]),
  capabilities_changed: z.array(z.string()).default([]),
  tools_added: z.array(z.string()).default([]),
  tools_changed: z.array(z.string()).default([]),
  policy_changed: z.array(z.string()).default([]),
  registry_changed: z.array(z.string()).default([]),
}).default({});

export const AuthorizationImpactSchema = z.object({
  principals_affected: z.array(z.string()).default([]),
  workspace_rules_changed: z.array(z.string()).default([]),
}).default({});

export const SecurityImpactSchema = z.object({
  threats_addressed: z.array(z.string()).default([]),
  invariants_affected: z.array(z.string()).default([]),
}).default({});

export const AuditImpactSchema = z.object({
  events_added: z.array(z.string()).default([]),
  events_changed: z.array(z.string()).default([]),
}).default({});

export const McpImpactSchema = z.object({
  tools_added: z.array(z.string()).default([]),
  resources_added: z.array(z.string()).default([]),
}).default({});

export const ApiImpactSchema = z.object({
  endpoints_added: z.array(z.string()).default([]),
  endpoints_changed: z.array(z.string()).default([]),
}).default({});

export const PersistenceImpactSchema = z.object({
  postgres_migrations: z.array(z.string()).default([]),
  neo4j_migrations: z.array(z.string()).default([]),
}).default({});

export const TestsImpactSchema = z.object({
  unit: z.array(z.string()).default([]),
  integration: z.array(z.string()).default([]),
  property: z.array(z.string()).default([]),
  fixtures: z.array(z.string()).default([]),
  e2e: z.array(z.string()).default([]),
  gateway: z.array(z.string()).default([]),
}).default({});

export const ObservabilityImpactSchema = z.object({
  metrics: z.array(z.string()).default([]),
  traces: z.array(z.string()).default([]),
  logs: z.array(z.string()).default([]),
}).default({});

export const FeatureImpactContractSchema = z
  .object({
    feature_id: z.string().min(1, "feature_id is required"),
    title: z.string().min(1, "title is required"),
    owner: z.string().min(1, "owner is required"),
    status: FicStatusEnum,
    intent: z.string().min(1, "intent is required"),
    non_goals: z.union([z.string(), z.array(z.string())]).default(""),
    domain_owner: z.string().min(1, "domain_owner is required"),
    approval: ApprovalSchema.default({}),
    contracts: z.array(ContractItemSchema).default([]),
    categories: z.array(z.string()).optional(),
    data_sources: z.array(z.string()).default([]),
    kg: KgImpactSchema.optional().default({}),
    simulation: SimulationImpactSchema.optional().default({}),
    gates: GatesImpactSchema.optional().default({}),
    gateway: GatewayImpactSchema.optional().default({}),
    authorization: AuthorizationImpactSchema.optional().default({}),
    security: SecurityImpactSchema.optional().default({}),
    audit: AuditImpactSchema.optional().default({}),
    mcp: McpImpactSchema.optional().default({}),
    api: ApiImpactSchema.optional().default({}),
    persistence: PersistenceImpactSchema.optional().default({}),
    tests: TestsImpactSchema.optional().default({}),
    observability: ObservabilityImpactSchema.optional().default({}),
    rollback: z.string().default(""),
    risks: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    // Validation Rule: released status requires gate_run_id
    if (data.status === "released") {
      if (!data.approval?.gate_run_id || data.approval.gate_run_id.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approval", "gate_run_id"],
          message: "A released feature must have approval.gate_run_id populated with a valid gate run identifier.",
        });
      }
    }

    // Validation Rule: Check categories if specified
    if (data.categories && Array.isArray(data.categories)) {
      for (let i = 0; i < data.categories.length; i++) {
        const cat = data.categories[i];
        if (!SUPPORTED_CATEGORIES.includes(cat as SupportedCategory)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["categories", i],
            message: `Unknown impact category '${cat}'. Must be one of: ${SUPPORTED_CATEGORIES.join(", ")}`,
          });
        }
      }
    }
  });

export type FeatureImpactContract = z.infer<typeof FeatureImpactContractSchema>;
