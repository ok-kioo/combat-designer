# SPEC 14 — Product UX, Navigation, Characters, Combos & Combat Workbench

## 1. Contexto e Objetivo

Esta especificação define a arquitetura de produto, navegação, domínio de personagens, gerenciamento de combos e workbench conversacional do **Combat Designer**, transformando a ferramenta em um ambiente de design e balanceamento de combate para jogos de ação (Unity / Action Combat).

### Invariantes e Autoridade Arquitetural
1. **Unity / Imported Data -> Canonical Combat Model -> Knowledge Graph -> Simulation / Analysis -> Mechanical Validation -> LLM / Combat Director -> Recommendation**.
2. **LLM != Autoridade Mecânica**: Simulações determinísticas e validações de regras mecânicas continuam rodando no backend/engine.
3. **Frontend != Autoridade de Autorização**: O backend valida tenancy, ownership e permissões em todas as rotas.
4. **Knowledge Graph != Persistência Canônica**: O grafo projeta o snapshot canônico; não substitui o armazenamento canônico.
5. **Observabilidade != UI de Produto**: Detalhes de infraestrutura (PostgreSQL, Neo4j, hashes brutos, trace IDs) permanecem na telemetria e nunca vazam para a UI.
6. **Recommendation != Mutação da Engine**: O sistema não modifica diretamente o projeto Unity.

---

## 2. Route Model — React Router e URLs canônicas

A decisão explícita de refatoração substitui as rotas apenas conceituais e o controle por visibilidade.
O frontend utiliza React 19 e React Router DOM 7 (versões exatas no lockfile), em modo declarativo,
com `BrowserRouter` em `frontend/app/bootstrap.tsx` e uma única árvore em `frontend/app/router.tsx`.
A camada de dados continua no `ApiClient`; não existe router próprio nem uma segunda camada de loaders.

### 2.1 Public Routes, Authentication Routes e Workspace Routes

| URL | Página real | Guard / contexto |
|---|---|---|
| `/` | `LandingPage` | Pública, autenticado ou anônimo |
| `/login` | `LoginPage` | `GuestOnlyRoute` |
| `/register` | `RegisterPage` | `GuestOnlyRoute` |
| `/workspaces` | `WorkspaceDashboard` | `RequireAuth`, nenhum projeto selecionado |
| `/workspaces/:workspaceId` | `WorkspaceOverview` | `RequireAuth` + `WorkspaceLayout` |
| `/workspaces/:workspaceId/characters` | `CharacterWorkbench` | Contexto do workspace |
| `/workspaces/:workspaceId/characters/:characterId` | `CharacterDetail` | Contexto + personagem da URL |
| `/workspaces/:workspaceId/attacks` | `AttackCatalog` | Contexto; filtros `character` e `q` |
| `/workspaces/:workspaceId/combos` | `ComboWorkbench` | Contexto; filtro `character` |
| `/workspaces/:workspaceId/analysis` | `AnalysisWorkbench` | Contexto |
| `/workspaces/:workspaceId/simulation` | `SimulationWorkbench` | Contexto |
| `/workspaces/:workspaceId/director` | `DirectorChat` | Contexto; `conversation` na query |
| `/workspaces/:workspaceId/import` | `ImportPage` | Contexto |
| `/workspaces/:workspaceId/help` | `HelpCenter` | Contexto |
| qualquer outra URL | `NotFound` | 404 explícito na aplicação |

### 2.2 Requisitos React Router (IDs estáveis)

- `UX.ROUTER.1`: O frontend MUST usar React Router como mecanismo canônico de navegação.
- `UX.ROUTER.2`: A árvore de rotas MUST ser a única fonte da página ativa.
- `UX.ROUTER.3`: Rotas de workspace MUST compartilhar `WorkspaceLayout` com `<Outlet />`.
- `UX.ROUTER.4`: Navegação MUST usar `Link`, `NavLink`, `Navigate` ou `useNavigate`, conforme a operação.
- `UX.ROUTER.5`: Transições de página MUST NOT depender de CSS ou alternância de visibilidade.
- `UX.ROUTER.6`: Identidades de workspace/personagem MUST vir de `useParams`; cache não seleciona projeto.
- `UX.ROUTER.7`: Refresh de URL válida MUST restaurar a página solicitada.
- `UX.ROUTER.8`: Back/Forward MUST funcionar pelo histórico gerenciado por React Router.
- `UX.ROUTER.9`: URLs desconhecidas MUST renderizar `NotFound`, nunca cair silenciosamente na landing.
- `UX.ROUTER.10`: Landing, Login, Register e Workspace MUST NOT ser árvores irmãs aguardando ocultação.

### 2.3 Route Guards, sessão e redirects

- `14.NAV.1` / `UX.AUTH.1`: A landing permanece acessível em `/` para anônimos e autenticados.
- `14.NAV.2` / `UX.AUTH.3`: Usuário autenticado vê “Ir para Meus Projetos”; sua sessão MUST NOT sobrescrever a URL pública.
- `14.NAV.3` / `UX.AUTH.2`: Login bem-sucedido estabelece sessão e navega com replace para `/workspaces`, salvo `returnTo` seguro. Nunca abre workspace default.
- `UX.AUTH.4`: `/workspaces` e descendentes exigem sessão; anônimos vão para `/login?returnTo=...` com replace.
- `UX.AUTH.5`: Bootstrap lê tokens existentes, valida com `GET /api/auth/me`, tenta `POST /api/auth/refresh` quando o access token expira, e só então monta a rota. Falha de rede na validação exibe estado de erro/retry; não exibe página protegida.
- `UX.AUTH.6`: `/login` e `/register` autenticados redirecionam para `/workspaces`. Essa regra MUST NOT afetar `/`.
- `UX.AUTH.7`: `POST /api/auth/register` devolve sessão e usuário; o cadastro estabelece sessão imediatamente e segue a mesma regra de destino do login.
- `UX.AUTH.8`: `returnTo` aceita somente caminho relativo interno de rota canônica de workspace. URLs externas, protocol-relative, barras invertidas, segmentos de travessia e rotas desconhecidas são rejeitados. O guard de workspace ainda verifica acesso no backend.
- `UX.AUTH.9`: Resposta 401 em uma requisição autenticada invalida a sessão local e ativa o guard; logout remove tokens e o contexto autenticado. Tokens e erros internos MUST NOT aparecer em mensagens de produto.
- `UX.AUTH.10`: Formulários têm labels, autocomplete, submit por Enter, senha apropriada, pending com submit desabilitado, erros inline genéricos e foco no erro.

### 2.4 Navigation State, Browser History, Deep Linking e Reload Behavior

- `UX.ROUTE.1`: Cada página de produto MUST ter rota real conforme a tabela.
- `UX.ROUTE.2`: A URL MUST representar a página ativa, sem `currentView` paralelo.
- `UX.ROUTE.3`: Back/Forward MUST restaurar página e filtros navegáveis.
- `UX.ROUTE.4`: Refresh MUST preservar rota válida e contexto após restaurar sessão.
- `UX.ROUTE.5`: Entrada direta, copiar/colar URL e abrir em nova aba MUST funcionar.
- `UX.ROUTE.6`: Apenas a página atual MUST estar montada no outlet.
- `14.NAV.4` / `UX.WS.3`: A rota raiz de workspace abre Overview, nunca Import.
- `14.NAV.5`: O servidor faz history fallback para o shell React, excluindo `/api`, `/api/*` e assets. Ele MUST NOT decidir qual página HTML renderizar.
- `UX.ROUTE.7`: 404 oferece Voltar e Ir para Meus Projetos. O fallback responde shell HTTP 200; o 404 é renderizado pela rota cliente. Assets inexistentes continuam HTTP 404 e APIs preservam status próprios.
- `UX.ROUTE.8`: Filtros compartilháveis usam query (`character`, `q`, `conversation`). Inputs transitórios e estado de submit não são rotas.

### 2.5 Workspace Context e autorização

- `UX.WS.1`: Dashboard lista projetos do usuário via `GET /api/workspaces`.
- `UX.WS.2`: Dashboard MUST NOT criar/selecionar workspace arbitrário, default ou demo automaticamente.
- `UX.WS.4`: WorkspaceLayout carrega `GET /api/workspaces/:workspaceId` uma vez ao entrar no contexto; navegação entre filhos compartilha o contexto, seleção de golpes e sidebar. Trocar ID da rota ou usuário invalida o contexto anterior.
- `UX.WS.5`: Carregamento, recurso indisponível, erro transitório e projeto arquivado são estados explícitos. 403/404 mostram a mesma mensagem segura: “Este projeto não está disponível ou você não possui acesso.”
- `UX.WS.6`: Guard é proteção de UX; backend continua autoridade de ownership e autorização para cada requisição. ID na URL nunca prova acesso.
- `UX.WS.7`: Projetos arquivados exibem estado de indisponibilidade para edição, com retorno ao dashboard e preservação do histórico.
- `UX.WS.8`: Criar, abrir, renomear e arquivar são ações explícitas. `PATCH /api/workspaces/:workspaceId` altera apenas nome validado, limitado a 120 caracteres, exige owner e rejeita projeto arquivado.
- `UX.WS.9`: Cadastro manual usa `POST /api/workspaces/:workspaceId/characters`; backend gera identidade/proveniência, valida nome e escopo, exige owner e rejeita workspace arquivado. Listagem/detalhes mantêm os contratos de leitura existentes.

### 2.6 Layouts, Responsive Navigation e Accessibility

- `UX.NAV.1`: Sidebar oferece Visão Geral, Personagens, Golpes, Combos, Análises, Simulação, Combat Director, Importar Dados e Ajuda.
- `UX.NAV.2` / `UX.A11Y.2`: `NavLink` indica rota ativa visualmente e com `aria-current`.
- `UX.NAV.3`: Navegação usa links semânticos; mutações e submissões usam botões.
- `UX.NAV.4`: CSS tem responsabilidade de apresentação, nunca de roteamento.
- `UX.NAV.5`: `PublicLayout` tem header e main/outlet; `AuthLayout` centraliza somente o formulário atual; `WorkspaceLayout` mantém sidebar, breadcrumbs e outlet.
- `UX.NAV.6`: Breadcrumbs exibem Meus Projetos, nome do projeto e seção; detalhes de personagem acrescentam seu nome. No mobile, navegação se reorganiza sem overflow horizontal do documento.
- `UX.A11Y.1`: Navegação e ações MUST ser acessíveis por teclado, com foco visível, labels, landmarks e headings hierárquicos.
- `UX.A11Y.3`: Loading/feedback usam status/aria-live apropriado; erros usam alert; dados não confiáveis são texto escapado pelo React.

### 2.7 Loading/Error/Empty States

- `UX.STATE.1`: Cada rota com dados MUST definir loading, success, empty e erro inline com recuperação. Listas vazias oferecem instrução apropriada; falha de fetch não equivale a lista vazia.
- `UX.STATE.2`: Bootstrap e contexto de workspace têm loading explícito; não piscam Landing/Login/Dashboard durante restauração.
- `UX.STATE.3`: Requisições de página descartam resultados após navegação/troca de recurso; dados de um workspace não podem reaparecer em outro.
- `UX.STATE.4`: Operações de criar/salvar/executar/enviar mostram pending, resultado ou erro e não anunciam sucesso antes da resposta da API.

### 2.8 Chat e preservação das capacidades

- `UX.CHAT.1`: Director tem viewport delimitado e histórico com scroll próprio.
- `UX.CHAT.2`: Composer permanece acessível na base enquanto o histórico rola; conversas têm scroll independente.
- `UX.CHAT.3`: Autoscroll acontece apenas a até 64px do fim; receber resposta MUST NOT interromper leitura anterior.
- `UX.CHAT.4`: `?conversation=:id` restaura mensagens persistidas e validadas pelo backend. Nova conversa é criação explícita; não seleciona conversa alheia/arbitrária.
- `UX.CHAT.5`: Seleção de golpes no catálogo permanece no contexto do workspace durante navegação ao Director. Respostas atrasadas são descartadas ao sair da conversa.
- `UX.DELIVERY.1`: `frontend/app/server.ts` mantém somente transporte: health, proxy, assets e shell/fallback. CSS, estado, handlers e páginas pertencem aos módulos de frontend.
- `UX.TEST.1`: Testes de navegação MUST executar o bundle/shell servidos, router real, bootstrap e páginas reais. Testes isolados de controllers não substituem essa evidência.
- `UX.TEST.2`: Regressões MUST impedir reintrodução de router CSS e páginas irmãs no shell; validar deep links, histórico, refresh, guardas e isolamento entre usuários.

---

## 3. Workspace Dashboard

### 3.1 Requisitos do Dashboard (14.DASH)
- `14.DASH.1`: Exibir lista de projetos pertencentes ao usuário autenticado (`GET /api/workspaces`).
- `14.DASH.2`: Permitir criação explícita de novo projeto com nome, descrição e engine alvo, sem seed automático. Permitir renomear via PATCH autenticado.
- `14.DASH.3`: Permitir arquivamento de projeto (`PUT /api/workspaces/:id/archive`), mantendo integridade histórica.
- `14.DASH.4`: Cards exibem nome, descrição, engine, última atualização e status (`active` / `archived`) do contrato real de listagem. KPIs de personagens, golpes, combos e análises são carregados na Visão Geral via `/overview`, sem contagens fabricadas no dashboard.
- `14.DASH.5`: Exclusão de qualquer menção a status de PostgreSQL, Neo4j, hash de snapshot ou revision hash na interface.

---

## 4. Workspace Overview (Visão Geral)

### 4.1 Requisitos da Home do Projeto (14.HOME)
- `14.HOME.1`: A aba inicial obrigatória do workspace é a **Visão Geral** (Overview).
- `14.HOME.2`: A home exibe KPIs reais derivados dos repositórios via Application Service (`GetWorkspaceOverview`):
  - Total de personagens cadastrados
  - Total de golpes (e golpes sem personagem associado)
  - Total de combos (criados manualmente vs descobertos por IA)
  - Dano médio e dano máximo de combos avaliados
  - Total de análises mecânicas realizadas e problemas detectados
- `14.HOME.3`: Exibir seção de Atividade Recente orientada a produto (ex: "Combo salvo", "Análise de Heavy Kick concluída", "Recomendação gerada").
- `14.HOME.4`: Exibir Ações Rápidas: "Encontrar combo", "Analisar golpe", "Criar combo manual", "Importar dados", "Perguntar ao Combat Director".
- `14.HOME.5`: Empty state instrutivo com CTA de importação quando o projeto ainda não contiver dados importados.

---

## 5. Modelo de Personagens (Character)

### 5.1 Entidade Character e Relação com Golpes (14.CHAR)
- `14.CHAR.1`: `Character` é entidade de primeira classe contendo: `id`, `workspace_id`, `name`, `display_name?`, `metadata`, `provenance`.
- `14.CHAR.2`: Cada ataque canônico possui `character_id: string | null` e `assignment_status: "ASSIGNED" | "UNASSIGNED"`.
- `14.CHAR.3`: Ataques sem personagem identificado na ingestão recebem `assignment_status = "UNASSIGNED"` e `character_id = null`.
- `14.CHAR.4`: É expressamente proibido criar personagens falsos como `character_id = "UNASSIGNED"` ou nós `(:Character { id: "UNASSIGNED" })` no Knowledge Graph.
- `14.CHAR.5`: O Knowledge Graph projeta explicitamente `(:Character {workspace_id, character_id, name})-[:HAS_ATTACK]->(:Attack)` para golpes associados.
- `14.CHAR.6`: Consultas de catálogo e busca de combos no Knowledge Graph respeitam estritamente o filtro de personagem.

---

## 6. Combos, Combo Builder e Métricas Desacopladas

### 6.1 Modelo de Combos (14.COMBO)
- `14.COMBO.1`: Entidade `Combo` possui: `id`, `workspace_id`, `character_id`, `name`, `source` (`USER_CREATED` | `AI_DISCOVERED` | `IMPORTED`), `steps: ComboStep[]`, `notes?`, `created_at`, `updated_at`.
- `14.COMBO.2`: Métricas de avaliação de combate são desacopladas em `ComboEvaluation`: `damage`, `hits`, `duration`, `simulation_id`, `project_revision`, `simulation_input_hash`, `computed_at`.
- `14.COMBO.3`: O Combo Builder exibe apenas golpes pertencentes ao personagem selecionado.
- `14.COMBO.4`: O backend valida e rejeita tentativas de salvar combos contendo ataques que não pertencem ao personagem indicado (`INVALID_COMBO_CHARACTER`).
- `14.COMBO.5`: Combos descobertos pela IA armazenam metadados de evidência: `simulation_id`, `project_revision`, `character_id`, `input_hash`, `evidence` e `discovered_at`.

---

## 7. Análises e Recomendações (Substituição de ChangeSets)

### 7.1 Modelo de Analysis (14.ANALYSIS)
- `14.ANALYSIS.1`: A UI expurga os termos "ChangeSet", "Apply ChangeSet", "Approve ChangeSet" e "GateResult".
- `14.ANALYSIS.2`: A unidade de entrega de valor visual é a **Analysis**:
  - `id`, `workspace_id`, `character_id?`, `subject`, `input`, `evidence`, `simulation_refs`, `findings`, `recommendations`, `created_at`, `project_revision`.
- `14.ANALYSIS.3`: Recomendações nascem como produto da análise mecânica e diagnósticos do Combat Director.
- `14.ANALYSIS.4`: `POST /api/workspaces/:workspace_id/analyses` representa uma solicitação de execução de análise pelo backend, não persistência de dados arbitrários enviados pelo cliente.

---

## 8. Chat Persistente e Isolamento

### 8.1 Persistência e Segurança do Chat (14.CHAT)
- `14.CHAT.1`: As conversas (`Conversation`) e mensagens (`ChatMessage`) persistem canonicamente em banco relacional SQLite embutido, sobrevivendo a reinicializações.
- `14.CHAT.2`: Isolamento estrito por `user_id` e `workspace_id`. Nenhuma mensagem é retornada sem validação prévia de autorização.
- `14.CHAT.3`: O layout do chat é delimitado pelo viewport (delimitado em `frontend/app/styles.css`, com adaptação mobile), com mensagens em container com `overflow-y: auto`, composer fixo na base e barra lateral de conversas com scroll independente.
- `14.CHAT.4`: Autoscroll ao receber nova mensagem é executado apenas se o usuário estiver próximo ao fim do scroll, respeitando leitura de mensagens anteriores.
- `14.CHAT.5`: **Regressão**: Eliminação estrita de mensagens falsas de confirmação como "Comando executado.", "Alteração aplicada." ou "Gate aprovado." em mensagens normais.

---

## 9. Onboarding, Ajuda e Importação Dedicada

### 9.1 Educação e Ferramentas (14.EDU)
- `14.EDU.1`: O Onboarding interativo é exibido automaticamente apenas no primeiro uso (`onboarding_version`, `completed_at`).
- `14.EDU.2`: A aba permanente **Ajuda** mantém documentação completa acessível e botão para reiniciar o tutorial a qualquer momento.
- `14.EDU.3`: A aba **Importar Dados** é dedicada à ingestão de arquivos JSON e scripts C# da Unity, exibindo resumo em linguagem de produto (personagens detectados, golpes, quarentena) sem vazar termos de infraestrutura interna.
