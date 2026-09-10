# Feature Impact Contract (FIC) Registry

Este diretório armazena todos os contratos de impacto de funcionalidade (**Feature Impact Contracts**) do projeto Combat Designer.

## Princípio

Nenhuma funcionalidade pode transicionar para o status `released` sem:
1. Um arquivo FIC válido neste diretório;
2. `approval.gate_run_id` preenchido;
3. Um resultado do Mechanical Gate (`PASS`) vinculado à revisão do modelo e versão de regras;
4. Validação pelo CLI de verificação de FICs.

## FICs Registrados

| Feature ID | Título | Status | Owner | Arquivo |
|---|---|---|---|---|
| `spec-00-fic` | Feature Impact Contract Scaffolding & Enforcement | `verified` | Implementation Agent | [spec-00-fic.yaml](./spec-00-fic.yaml) |
| `spec-01-canonical-model` | Combat Canonical Model (Pure Domain Core) | `verified` | Implementation Agent | [spec-01-canonical-model.yaml](./spec-01-canonical-model.yaml) |
| `spec-02-engine-ingestion` | Engine Ingestion Pipeline (Unity Export Bundle MVP) | `verified` | Implementation Agent | [spec-02-engine-ingestion.yaml](./spec-02-engine-ingestion.yaml) |
| `spec-03-knowledge-graph` | Knowledge Graph Projection & Query Catalog | `verified` | Implementation Agent | [spec-03-knowledge-graph.yaml](./spec-03-knowledge-graph.yaml) |
| `spec-04-deterministic-simulator` | Deterministic Combat Simulator Engine & Application Port | `verified` | Implementation Agent | [spec-04-deterministic-simulator.yaml](./spec-04-deterministic-simulator.yaml) |
| `spec-05-mechanical-gate` | Mechanical Gate & Safety Invariants | `verified` | Implementation Agent | [spec-05-mechanical-gate.yaml](./spec-05-mechanical-gate.yaml) |
| `spec-06-mcp-llm-orchestration` | MCP Gateway + Server + LLM Orchestration | `verified` | Implementation Agent | [spec-06-mcp-llm-orchestration.yaml](./spec-06-mcp-llm-orchestration.yaml) |
| `spec-07-observability-operations` | Observability and Operations Stack | `verified` | Implementation Agent | [spec-07-observability-operations.yaml](./spec-07-observability-operations.yaml) |
| `domain-oriented-folder-structure` | Domain-Oriented Folder Structure Migration | `verified` | Platform Architecture | [domain-oriented-folder-structure.yaml](./domain-oriented-folder-structure.yaml) |

## Como Criar um Novo FIC

1. Copie o template:
   ```bash
   cp docs/feature-impacts/template.yaml docs/feature-impacts/<feature_id>.yaml
   ```
2. Preencha os campos obrigatórios e descreva todas as seções afetadas.
3. Valide o contrato:
   ```bash
   npm run validate-fic docs/feature-impacts/<feature_id>.yaml
   ```
