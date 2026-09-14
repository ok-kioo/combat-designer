# Spec 10 — Frontend Application and LLM Input Integration

## Status: READY FOR IMPLEMENTATION

## Overview

O **SPEC 10** formaliza a interface de aplicação frontend do Combat Designer e o contrato de entrada/orquestração estruturada para a integração com LLMs no backend.

O sistema dispõe de motores de domínio determinísticos (Rust crates), pipeline de ingestão segura (SPECs 02, 08 e 09), Knowledge Graph (SPEC 03), simulador determinístico (SPEC 04), mechanical gate (SPEC 05), MCP gateway/server (SPEC 06) e observabilidade (SPEC 07).

O SPEC 10 constrói as páginas e serviços do frontend necessários para consumir a totalidade das capacidades do backend e transforma o **Director Chat** em um canal canônico de entrada estruturada (`LlmPromptContextEnvelope`) para a orquestração de LLMs.

---

## 1. Princípios Arquiteturais & Invariantes

1. **Zero Direct Canonical Mutation from Frontend**:
   - O frontend nunca acessa bancos de dados (`pg`, `neo4j-driver`) diretamente.
   - O frontend nunca muta estado canônico diretamente. Toda mutação passa exclusivamente pela API HTTP (`/api/workspaces/:workspace_id/*`) ou pelo pipeline de upload de bundles (SPEC 08/09).
2. **Escopo Estrito de Workspace**:
   - Todas as páginas, requisições HTTP e payloads de chat são estritamente isolados pelo `workspace_id` ativo.
   - Requisições sem autorização ou com incompatibilidade de workspace recebem `403 Forbidden` no backend.
3. **Contrato de Entrada para LLM (`LlmPromptContextEnvelope`)**:
   - A integração com LLMs no backend não opera sobre texto arbitrário e solto. O chat do frontend constrói um envelope estruturado contendo:
     - `workspace_id`: Contexto de isolamento do tenant.
     - `snapshot_hash`: Hash canônico da revisão atual.
     - `selected_attack_ids`: Conjunto de ataques selecionados no catálogo pelo designer.
     - `active_analysis_id`: Identificador da análise ativa em inspeção (se houver).
     - `user_prompt`: Mensagem em linguagem natural digitada pelo usuário.
4. **Preservação de Fatos e Defesa contra Alucinação**:
   - Resultados determinísticos de simulação, diagnósticos e findings (`AnalysisResult`) exibidos no frontend ou devolvidos pelo backend não podem ser inventados ou sobrescritos por respostas geradas pelo LLM.
   - Dados textuais não estruturados em exibições de ferramentas e assets continuam marcados com `untrusted_text: true`.
5. **Acesso Condicionado à Autenticação (Login Obrigatório para Importação e Workspaces)**:
   - O usuário só pode visualizar e acessar a página de importação de golpes (Onboarding, script C# da Unity e upload de bundles) e interagir com dados de workspace após autenticar-se com seu usuário e senha (ou cadastrar uma nova conta).
   - Usuários não autenticados são bloqueados pela tela de autenticação (`AuthGuard`).
6. **Alinhamento Arquitetural: Análise de Combate e Diagnósticos (Sem Gate no Produto)**:
   - O frontend expõe funcionalidades sob o modelo de **"Combat Analysis"**, **"Diagnósticos de Combate"** ou **"Simulação & Análise"**, focando nas propriedades de combate (frame data, stun loops, burst DPS, counterplay) e na inspeção de **Findings** com evidências determinísticas.
   - O conceito de "Gate Mecânico" e vereditos de aprovação pertencem exclusivamente ao **harness de desenvolvimento** e são proibidos na interface do usuário do produto.

---

## 2. Superfície da API HTTP do Backend

### 2.1 Rotas de Autenticação e Gestão de Workspaces (Global)

| Método | Endpoint | Responsabilidade | Resposta de Sucesso |
|---|---|---|---|
| `POST` | `/api/auth/register` | Cadastro de novo usuário (`username`, `password`, `display_name`) | `201 Created` (`user`, `access_token`, `refresh_token`) |
| `POST` | `/api/auth/login` | Autenticação por credenciais locais | `200 OK` (`user`, `access_token`, `refresh_token`) |
| `POST` | `/api/auth/refresh` | Rotação transparente de Refresh Token | `200 OK` (`access_token`, `refresh_token`) |
| `POST` | `/api/auth/logout` | Revogação de sessão ativa | `204 No Content` |
| `GET` | `/api/auth/me` | Dados do usuário autenticado a partir do token | `200 OK` (`user`) |
| `GET` | `/api/workspaces` | Listagem dos projetos pertencentes ao usuário logado | `200 OK` (`workspaces: WorkspaceSummary[]`) |
| `POST` | `/api/workspaces` | Criação de novo projeto vinculado ao usuário | `201 Created` (`workspace: WorkspaceSummary`) |
| `DELETE` | `/api/workspaces/:workspace_id` | Exclusão de projeto do usuário proprietário (SPEC 14) | `204 No Content` |

### 2.2 Rotas Operacionais de Workspace (`/api/workspaces/:workspace_id/*`)

O servidor HTTP do backend (`ApiServer`) disponibiliza as seguintes rotas REST sob `/api/workspaces/:workspace_id/`:

| Método | Endpoint | Responsabilidade | Resposta de Sucesso |
|---|---|---|---|
| `POST` | `/bundles` | Upload de bundle de exportação e ingestão (requer autenticação) | `201 Created` |
| `GET` | `/status` | Status do projeto, revisão e histórico | `200 OK` |
| `GET` | `/attacks` | Listagem/busca de ataques no workspace | `200 OK` (`attacks: AttackSummary[]`) |
| `GET` | `/attacks/:attack_id` | Detalhes de um ataque específico | `200 OK` (`attack: AttackSummary`) |
| `POST` | `/simulations` | Execução de simulação determinística | `200 OK` (`simulation: SimulationOutput`) |
| `POST` | `/analyses` | Execução de análise de combate e diagnósticos | `200 OK` (`analysis: AnalysisResult`) |
| `GET` | `/analyses` | Listagem de análises do workspace | `200 OK` (`analyses: AnalysisSummary[]`) |
| `GET` | `/analyses/:analysis_id` | Detalhes de análise e lista de Findings | `200 OK` (`analysis: AnalysisResult`) |
| `POST` | `/chat` | Conversação do Diretor de Combate com LLM | `200 OK` (`DirectorChatResponse`) |

> [!WARNING]
> Rotas legadas de Gate (`POST /verifications`) e de ChangeSet (`/changesets/*`) foram classificadas como `CODE_LEGACY_RUNTIME_GATE` / `MUST_REMOVE_NOW` e desconectadas do runtime.

---

## 3. Páginas e Componentes do Frontend

A aplicação frontend organiza-se segundo a arquitetura de páginas e fluxo de navegação formalizados na **SPEC 14**:
1. **Landing Page pública (`#landing`)**: Apresentação da plataforma, pilares técnicos (Rust core, Gemini, análise determinística) e CTAs.
2. **Dashboard de Projetos (`#dashboard`)**: Gestão de workspaces do usuário (listar, criar, excluir com confirmação).
3. **Workspace Workbench (`#workspace/:workspace_id`)**: Área de trabalho contextualizada no projeto selecionado, contendo as seguintes features:

### 3.1 Combat Explorer & Project Ingestion (`features/combat-explorer` & `features/project-workspace`)
- Layout principal contextualizado pelo projeto ativo com seletor de abas e botão de retorno `← Meus Projetos`.
- Aba de Ingestão: Download do script C# `CombatExporter.cs` para Unity, upload/colagem do JSON da engine, hash SHA-256 e inspeção de quarentena/conflitos. **Acesso bloqueado até login**.
- Coluna direita: **DirectorChat** (chat interativo com o Diretor de Combate).

### 3.2 Attack Catalog (`features/catalog`)
- Descoberta e inspeção de ataques do workspace ativo.
- Filtros por busca de texto, tags (`light`, `heavy`, `special`, etc.) e tamanho mínimo da janela de cancel.
- Exibição gráfica dos dados de frame: Startup, Active, Recovery, Duração Total, Dano e Janelas de Cancel.
- Ação **"Add to LLM Context"**: Permite ao designer selecionar um ou mais ataques para alimentar o envelope de contexto do chat.

### 3.3 Simulation & Analysis Workbench (`features/simulation-workbench`)
- Bancada de testes para execução de simulações determinísticas e inspeção de diagnósticos mecânicos de combate.
- Configuração de cenários (atores, HP inicial, ataques equipados) e orçamentos (`max_frames`, `max_iterations`/fuel).
- Timeline determinística passo-a-passo (eventos de dano, block, transições de estado, hash final).
- Inspetor de Diagnósticos de Combate com lista de **Findings** estruturados por severidade (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`), status da análise (`COMPLETED`, `INCONCLUSIVE`, `BUDGET_EXCEEDED`, `STALE`) e inspeção de evidências frame a frame.

### 3.4 Feature Histórica: ChangeSet Review (`features/changeset-review` — CODE_LEGACY_PRODUCT_DIRECTION)
- O fluxo de auditoria com botões "Approve" e "Apply" pertencia à direção de produto descontinuada em que o sistema tentava mutar a engine de jogo.
- Em conformidade com a SPEC 14 (`14.ANALYSIS.1`), a UI expurga termos de ChangeSet e Apply. O designer agora interage diretamente com **Analyses**, **Findings** e **Recomendações Consultivas**.

### 3.5 Director Chat & LLM Input Engine (`features/director-chat`)
- Constrói o `LlmPromptContextEnvelope` contendo a intenção do usuário e o estado canônico selecionado no frontend.
- Envia requisições para `POST /api/workspaces/:workspace_id/chat`.
- **Alinhamento com a SPEC 13**:
  - Ciclo de estados de processamento explícitos: `IDLE`, `SUBMITTING`, `ANALYZING`, `CALLING_TOOL`, `PROCESSING_RESULT`, `FORMULATING`, `COMPLETED`, `ERROR`, `CANCELLED`.
  - Exibição de atividades públicas humanizadas (`PublicActivity`, ex: "● Consultando frame data...", "● Simulando cenário..."), sem expor internals de ferramentas ou dados de infraestrutura.
  - Renderização completa de Markdown com sanitização rigorosa contra XSS (bloqueio de `<script>`, `<iframe>`, `javascript:`, etc.).
  - Buffering de streaming para evitar quebras visuais de Markdown incompleto.
  - Suporte a cancelamento de requisições em andamento.
  - Proibição absoluta de mensagens falsas como "Comando executado." ou falsas alterações.
  - Validação via suíte de testes de UI `13.UI.1` a `13.UI.13`.

### 3.6 Autenticação e Gestão de Sessão (`features/auth`)
- **Login View / Modal (`features/auth/components/LoginForm.ts`)**:
  - Campos: `username` e `password`.
  - Estados: `idle`, `submitting`, `error`.
  - Tratamento e feedback de erros: credenciais inválidas (`401 INVALID_CREDENTIALS`), rate limit atingido (`429 RATE_LIMITED`), validação de campos vazios.
  - Link/ação para alternar para visualização de Cadastro.
- **Register View / Modal (`features/auth/components/RegisterForm.ts`)**:
  - Campos: `username`, `password`, `display_name` (opcional).
  - Validação de política de senha: mínimo 8 caracteres, pelo menos uma letra maiúscula, um número e um caractere especial.
  - Tratamento e feedback de erros: `USERNAME_ALREADY_EXISTS` (`409 Conflict`), senhas fracas.
  - Auto-login e inicialização de sessão após registro com sucesso.
- **Barra de Sessão & Perfil (`features/auth/components/UserSessionBar.ts`)**:
  - Exibição da identidade do usuário (`display_name` ou `username`) no cabeçalho superior.
  - Seletor dinâmico de projetos: lista apenas os workspaces cujo `owner_user_id` corresponde ao usuário autenticado (`GET /api/workspaces`).
  - Ação modal de "Criar Novo Projeto": permite criar um novo workspace associado ao usuário.
  - Ação de **Logout**: revoga sessão no backend (`POST /api/auth/logout`), limpa tokens no cliente (`localStorage` / memória) e bloqueia visualização de dados privados.
- **Route Guard / Proteção de Não-Autenticado (`AuthGuard`)**:
  - Quando não há token de acesso válido, o Combat Explorer bloqueia interações e renderiza a tela com formulário de login/cadastro.
  - `ApiClient` intercepta automaticamente erros `401 TOKEN_EXPIRED`, tenta a renovação via `POST /api/auth/refresh`; em caso de falha (`INVALID_TOKEN`, token revogado), redireciona imediatamente para o fluxo de reautenticação.

---

## 4. Testes e Critérios de Aceitação

A validação de SPEC 10 exige:
1. **Testes de Integração de Rotas HTTP do Backend (`10.T.1` a `10.T.10`)**:
   - Cobertura de rotas de ataques, simulações, análises, propostas consultivas, autenticação e chat.
   - Verificação de barreira de workspace (`403 Forbidden` em chamadas cruzadas de tenant).
2. **Testes de Unidade e Interação do Frontend (`10.UI.1` a `10.UI.8`)**:
   - `AttackCatalog`: listagem, filtragem e seleção para contexto do LLM.
   - `SimulationWorkbench`: execução de simulação, timeline e renderização de veredito de gate.
   - `ProposalReview`: diff de mutações, revisão consultiva e retirada de proposta; sem aprovação/aplicação runtime.
   - `DirectorChat`: construção do envelope de contexto e comunicação com endpoint de chat.
   - `CombatExplorer`: navegação entre abas preservando workspace ativo.
3. **Testes de Autenticação e Sessão no Frontend (`10.UI.9` a `10.UI.14`)**:
   - `10.UI.9`: Renderização e validação de formulário de login com campos obrigatórios.
   - `10.UI.10`: Exibição de erro para credenciais inválidas (`401`) sem quebrar layout.
   - `10.UI.11`: Validação de senha forte e criação de usuário no formulário de cadastro.
   - `10.UI.12`: Persistência de `access_token` no `ApiClient` e anexo de cabeçalho `Authorization: Bearer`.
   - `10.UI.13`: Seletor de workspace filtrado pelos projetos próprios do usuário autenticado.
   - `10.UI.14`: Fluxo de logout revogando tokens e retornando ao estado não-autenticado.
4. **Feature Impact Contract**:
   - `spec-10-frontend-application.yaml` válido com `feature_id: frontend-application-001`.
   - `npm run validate-fic` aprovando 15/15 runtime FICs.
5. **Regressão Zero**:
   - 100% dos testes anteriores (SPECs 00–09, 11–13) passando sem erros.
