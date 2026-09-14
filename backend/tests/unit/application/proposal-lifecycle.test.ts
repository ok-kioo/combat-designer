import { describe, it, expect, beforeEach } from "vitest";
import type {
  Proposal,
  Principal,
} from "@combat-designer/backend";
import type { ProposalRepositoryPort } from "../../../src/modules/proposal/domain/repository/proposal-repository-port.js";
import {
  createProposalUseCase,
  getProposalUseCase,
  withdrawProposalUseCase,
} from "../../../src/index.js";

class InMemoryProposalRepository implements ProposalRepositoryPort {
  private store = new Map<string, Proposal>();

  async save(proposal: Proposal): Promise<Proposal> {
    const key = `${proposal.workspace_id}:${proposal.proposal_id}`;
    this.store.set(key, JSON.parse(JSON.stringify(proposal)));
    return proposal;
  }

  async getById(workspaceId: string, proposalId: string): Promise<Proposal | null> {
    const key = `${workspaceId}:${proposalId}`;
    const found = this.store.get(key);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<Proposal | null> {
    for (const proposal of this.store.values()) {
      if (proposal.workspace_id === workspaceId && proposal.idempotency_key === idempotencyKey) {
        return JSON.parse(JSON.stringify(proposal));
      }
    }
    return null;
  }

  async update(proposal: Proposal): Promise<Proposal> {
    const key = `${proposal.workspace_id}:${proposal.proposal_id}`;
    this.store.set(key, JSON.parse(JSON.stringify(proposal)));
    return proposal;
  }
}

describe("Proposal Lifecycle & Consultative Boundaries", () => {
  let repo: InMemoryProposalRepository;

  beforeEach(() => {
    repo = new InMemoryProposalRepository();
  });

  const humanPrincipal: Principal = {
    principal_id: "human_lead",
    principal_type: "human",
    capabilities: ["combat:read", "combat:propose"],
    authorized_workspaces: ["ws-1"],
  };

  const llmPrincipal: Principal = {
    principal_id: "llm_combat_director",
    principal_type: "llm",
    capabilities: ["combat:read", "combat:query", "combat:simulate", "combat:propose"],
    authorized_workspaces: ["ws-1"],
  };

  it("proposes a proposal in 'proposed' status and preserves idempotency", async () => {
    const proposal1 = await createProposalUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Boost light attack damage",
        },
      ],
      idempotency_key: "idem-key-001",
    });

    expect(proposal1.status).toBe("ACTIVE");

    // Idempotent retry returns identical proposal
    const proposal2 = await createProposalUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Boost light attack damage",
        },
      ],
      idempotency_key: "idem-key-001",
    });

    expect(proposal2.proposal_id).toBe(proposal1.proposal_id);
  });

  it("retrieves a proposal by id", async () => {
    const proposal = await createProposalUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: humanPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 20,
          reason: "Manual adjustment",
        },
      ],
    });

    const retrieved = await getProposalUseCase(repo, "ws-1", proposal.proposal_id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.proposal_id).toBe(proposal.proposal_id);
    expect(retrieved?.status).toBe("ACTIVE");
  });

  it("withdraws a proposed proposal with a reason", async () => {
    const proposal = await createProposalUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: humanPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 20,
          reason: "Manual adjustment",
        },
      ],
    });

    const withdrawn = await withdrawProposalUseCase(
      repo,
      "ws-1",
      proposal.proposal_id,
      "Superseded by alternative design"
    );

    expect(withdrawn.status).toBe("WITHDRAWN");

    const retrieved = await getProposalUseCase(repo, "ws-1", proposal.proposal_id);
    expect(retrieved?.status).toBe("WITHDRAWN");
  });

  it("rejects proposal with empty mutations", async () => {
    await expect(
      createProposalUseCase(repo, {
        workspace_id: "ws-1",
        base_revision: "rev-1",
        target_revision: "rev-2",
        proposed_by: humanPrincipal.principal_id,
        mutations: [],
      })
    ).rejects.toThrow();
  });
});
