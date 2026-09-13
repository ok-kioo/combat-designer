import { describe, it, expect, beforeEach } from "vitest";
import type {
  ChangeSetProposal,
  Principal,
} from "@combat-designer/backend";
import type { ChangeSetRepositoryPort } from "../../../src/modules/changeset/domain/repository/changeset-repository-port.js";
import {
  proposeChangesetUseCase,
  getChangesetUseCase,
  withdrawChangesetUseCase,
} from "../../../src/index.js";

class InMemoryChangeSetRepository implements ChangeSetRepositoryPort {
  private store = new Map<string, ChangeSetProposal>();

  async save(proposal: ChangeSetProposal): Promise<ChangeSetProposal> {
    const key = `${proposal.workspace_id}:${proposal.changeset_id}`;
    this.store.set(key, JSON.parse(JSON.stringify(proposal)));
    return proposal;
  }

  async getById(workspaceId: string, changesetId: string): Promise<ChangeSetProposal | null> {
    const key = `${workspaceId}:${changesetId}`;
    const found = this.store.get(key);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<ChangeSetProposal | null> {
    for (const proposal of this.store.values()) {
      if (proposal.workspace_id === workspaceId && proposal.idempotency_key === idempotencyKey) {
        return JSON.parse(JSON.stringify(proposal));
      }
    }
    return null;
  }

  async update(proposal: ChangeSetProposal): Promise<ChangeSetProposal> {
    const key = `${proposal.workspace_id}:${proposal.changeset_id}`;
    this.store.set(key, JSON.parse(JSON.stringify(proposal)));
    return proposal;
  }
}

describe("ChangeSet Lifecycle & Consultative Boundaries", () => {
  let repo: InMemoryChangeSetRepository;

  beforeEach(() => {
    repo = new InMemoryChangeSetRepository();
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

  it("proposes a changeset in 'proposed' status and preserves idempotency", async () => {
    const proposal1 = await proposeChangesetUseCase(repo, {
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

    expect(proposal1.status).toBe("proposed");

    // Idempotent retry returns identical proposal
    const proposal2 = await proposeChangesetUseCase(repo, {
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

    expect(proposal2.changeset_id).toBe(proposal1.changeset_id);
  });

  it("retrieves a proposal by id", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
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

    const retrieved = await getChangesetUseCase(repo, "ws-1", proposal.changeset_id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.changeset_id).toBe(proposal.changeset_id);
    expect(retrieved?.status).toBe("proposed");
  });

  it("withdraws a proposed changeset with a reason", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
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

    const withdrawn = await withdrawChangesetUseCase(
      repo,
      "ws-1",
      proposal.changeset_id,
      "Superseded by alternative design"
    );

    expect(withdrawn.status).toBe("withdrawn");

    const retrieved = await getChangesetUseCase(repo, "ws-1", proposal.changeset_id);
    expect(retrieved?.status).toBe("withdrawn");
  });

  it("rejects proposal with empty mutations", async () => {
    await expect(
      proposeChangesetUseCase(repo, {
        workspace_id: "ws-1",
        base_revision: "rev-1",
        target_revision: "rev-2",
        proposed_by: humanPrincipal.principal_id,
        mutations: [],
      })
    ).rejects.toThrow();
  });
});
