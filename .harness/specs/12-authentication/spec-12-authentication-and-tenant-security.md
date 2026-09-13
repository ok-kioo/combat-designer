# Spec 12 — Authentication and Project Security (JWT)

Origem: auditoria de validação (2026) sobre a implementação de specs/08–09. Esta spec fecha uma lacuna

já **declarada como necessária pela própria spec 08** ("Workspace Authorization") mas nunca implementada:

`workspace_id` era tratado como prova de identidade quando na verdade nunca existiu um principal autenticado

por trás dele.

## Achado que motiva esta spec

`spec 08, seção "Workspace Authorization"` já diz: *"`workspace_id` enviado pelo cliente ... é uma declaração

de intenção/contexto, não uma prova de autorização"* e descreve que o MCP Gateway deveria validar contra

**"o conjunto de workspaces autorizados para o principal autenticado"**.

Na implementação auditada, isso não existe:

- `backend/src/infrastructure/http/server.ts`, método `isWorkspaceAuthorized`: lê o header

  `x-authorized-workspaces` — uma lista **auto-declarada pelo próprio cliente, sem assinatura** — e, pior,

**retorna `true` (autorizado) por padrão quando o header está ausente**. Qualquer request sem esse header

  passa livremente para qualquer `workspace_id`.

- `mcp/gateway/src/auth/authenticator.ts`: `GatewayAuthenticator.authenticate` só valida a **forma** do objeto

  `Principal` (schema Zod) recebido como argumento — não verifica nenhuma credencial, assinatura ou token. Quem

  chama a função escolhe o `Principal` que quiser.

Resultado: não existe isolamento de projeto real hoje — é bypassável tanto por omissão de header quanto por

forjar o header/objeto `Principal`. Toda a superfície de `workspace_id` (Postgres row-level, Neo4j property-level,

FIC `approved_by`, MCP tool authorization) depende de uma alegação não verificada.

## Objetivo

Introduzir uma fonte real de identidade (usuário autenticado via credenciais próprias) e derivar toda

autorização de projeto (workspace) a partir dela — nunca de um header ou campo enviado livremente pelo cliente.

## Modelo de identidade e propriedade

A unidade de identidade é o `User`. A unidade de organização do trabalho é o `Workspace`, tratado como **projeto de combate**.

```text
User 1 ─── N Workspace
```

O usuário autenticado pode criar, listar, selecionar e trabalhar em múltiplos projetos próprios. Um projeto não pode ser acessado por outro usuário na v1.

A autorização é baseada em propriedade direta (`Workspace.owner_user_id`), e não em memberships ou roles.

## Não-objetivos (v1)

- SSO/OAuth com provedores externos (Google, GitHub) — pode vir depois como método adicional de login, não substitui o mecanismo local nesta versão.

- Multi-factor authentication.

- Colaboração entre múltiplos usuários em um mesmo workspace. A v1 utiliza propriedade direta `User 1 ─── N Workspace`; compartilhamento, memberships e roles ficam para uma spec futura se houver necessidade real.

- Permissões granulares por recurso dentro de um workspace.

## Modelo de dados

### User (novo — Postgres)

```text
id                  (uuid, pk)
username            (unique, case-insensitive)
password_hash       (argon2id — nunca bcrypt puro sem custo configurável, nunca reversível)
display_name
created_at
last_login_at
status              active | disabled
```

Senha nunca é logada, nunca aparece em telemetria e nunca é enviada à LLM. `password_hash` e `password` entram na lista de redaction desde o primeiro commit desta spec.

### Workspace / Project ownership (novo — Postgres)

Nesta versão, `Workspace` representa um **projeto de combate pertencente a um usuário**, e não um tenant organizacional colaborativo.

A relação obrigatória é simples:

```text
User 1 ─── N Workspace
```

O modelo mínimo de `Workspace` deve possuir:

```text
id
owner_user_id       (fk -> User.id)
name
description
created_at
updated_at
status
```

Todo `Workspace` deve possuir exatamente um `owner_user_id` válido. A criação do workspace e a associação ao usuário autenticado devem ocorrer atomicamente.

Não implementar `workspace membership` nem roles `owner/editor/viewer` como requisito da v1. Colaboração entre múltiplos usuários fica fora do escopo desta spec e poderá ser introduzida em uma spec futura se houver necessidade real.

### RefreshToken (novo — Postgres)

```text

id                   (uuid, pk)

user_id

token_hash           (nunca o token em texto puro — mesmo em log de auditoria)

issued_at

expires_at

revoked_at           (nullable)

replaced_by           (nullable — rotação)

```

## Fluxo de autenticação

```text
POST /auth/register   { username, password, display_name }  -> 201 + User (sem senha no corpo de resposta)

POST /auth/login       { username, password }              -> 200 + { access_token, refresh_token }

POST /auth/refresh      { refresh_token }                    -> 200 + { access_token, refresh_token } (rotação)

POST /auth/logout       { refresh_token }                    -> 204 (revoga)
```

`access_token`: JWT assinado (HS256 no mínimo; RS256 se houver necessidade futura de verificação por serviço externo sem compartilhar segredo), expiração curta (15 min sugerido), claims mínimas:

```text
sub          (user_id)
username
iat / exp
```

O JWT identifica o usuário autenticado. Ele não deve conter uma lista de workspaces utilizada como fonte de autorização contínua. A propriedade do projeto é determinada pelo `Workspace.owner_user_id` no PostgreSQL.

`refresh_token`: opaco (não JWT), vida longa (7–30 dias), armazenado só como hash, rotacionado a cada uso (token antigo marcado `revoked_at` + `replaced_by` apontando para o novo — reuse de um refresh token já rotacionado revoga toda a família, sinal de token roubado).

## Autorização de projeto — derivada do usuário autenticado

`isWorkspaceAuthorized` (ou equivalente) e `GatewayAuthenticator.authenticate` devem mudar de "confiar no que o cliente declara" para "derivar a autorização do usuário autenticado".

1. Todo request HTTP autenticado carrega `Authorization: Bearer <access_token>`.

2. O servidor verifica assinatura + expiração do JWT. Falha de verificação -> `401 UNAUTHENTICATED`, sempre — nunca um fallback que segue como se não houvesse restrição.

3. `workspace_id` do request identifica o projeto que o usuário deseja acessar, mas **não prova propriedade**. O servidor deve carregar o `Workspace` e confirmar `workspace.owner_user_id == authenticated_user.id`.

4. O header `x-authorized-workspaces` é removido. Nenhum caminho de código deriva autorização de um header ou campo de payload não assinado.

5. **Regra de fail-closed obrigatória**: ausência de token válido nunca resulta em acesso concedido. O bug atual (`return true` quando o header está ausente) é a instância exata que esta regra proíbe — o substituto correto é `401`/`403` por padrão, nunca `true` por padrão.

6. Como o JWT identifica o usuário, a lista de workspaces não deve ser tratada como claim de autorização. A fonte de verdade para propriedade do projeto é o registro `Workspace.owner_user_id` no PostgreSQL.

MCP Gateway: `x-authorized-workspaces` sai também de lá. O `Principal` passado para `GatewayAuthenticator.authenticate` deixa de ser um objeto solto e passa a ser derivado do mesmo JWT verificado (MCP clients autenticam com o mesmo `access_token` emitido por `/auth/login`, via header `Authorization` na conexão MCP ou no handshake inicial, conforme o transporte usado).

## Impacto em specs existentes

- **SPEC 08 (Workspace/Project)**: a seção "Workspace Authorization" passa a apontar para esta spec como a implementação concreta. `Workspace` possui `owner_user_id` obrigatório referenciando `User.id`. Atualizar o FIC da SPEC 08 (`persistence.postgres_migrations`) para incluir `User`, `RefreshToken` e a coluna/foreign key `Workspace.owner_user_id`. `WorkspaceMembership` não faz parte da v1.

- **SPEC 06 (MCP)**: qualquer trecho que descreva `Principal` como validado somente por schema deve citar esta spec como a fonte real de verificação de identidade.

- **SPEC 00 (FIC)**: `approved_by`, quando utilizado, deve referenciar um `User.id` real em vez de texto livre.

- **SPEC 10 e SPEC 14 (Frontend Pages & Workspace Lifecycle)**: A interface web incorpora Landing Page pública, Dashboard de Projetos do usuário com gestão completa (criação via `POST /api/workspaces`, listagem via `GET /api/workspaces` e exclusão via `DELETE /api/workspaces/:workspace_id` restrita ao proprietário), além do Workspace Workbench contextualizado para trabalho profundo.

## Regras de segurança obrigatórias

- Hash de senha: Argon2id, parâmetros de custo revisáveis (não hardcoded sem possibilidade de aumento futuro).

- Nunca retornar se um `username` existe ou não em respostas de erro de login diferenciadas (evitar user enumeration

  — resposta genérica `INVALID_CREDENTIALS` tanto para username inexistente quanto para senha errada).

- Rate limit por IP e por `username` em `/auth/login` (mesma infraestrutura de limits já usada em specs/09).

- Todo `RefreshToken` revogado nunca reautoriza nada, mesmo antes de expirar.

- `access_token` nunca é persistido no servidor (é stateless por design); revogação de sessão ativa antes da

  expiração do access_token é um risco aceito e documentado (janela de 15 min) — não resolvido por esta spec,

  candidato a spec futura de token blocklist se houver necessidade real.

## Aceite

- Nenhuma rota autenticada aceita request sem `Authorization: Bearer` válido.

- `isWorkspaceAuthorized`/equivalente nunca retorna `true` por ausência de dado — todo caminho sem prova retorna negação.

- Request sem token para um `workspace_id` arbitrário deve retornar `401`/`403`, nunca `200`.

- Request autenticado por um usuário que não é `Workspace.owner_user_id` deve retornar `403`.

- Um usuário autenticado consegue criar e listar apenas seus próprios workspaces.

- `Workspace` sempre possui um `owner_user_id` válido.

- O frontend disponibiliza formulários de Login e Cadastro (`features/auth`), gerenciando a sessão e bloqueando o acesso à página de importação de golpes (Onboarding, script Unity e upload de bundles) até que o usuário esteja autenticado.

- O frontend exibe exclusivamente os workspaces de titularidade do usuário autenticado e utiliza terminologia de "Combat Analysis" e "Diagnósticos", reservando o conceito de Gate exclusivamente para a verificação de código no harness de desenvolvimento.

- `npm run validate-fic` cobrindo o FIC desta spec roda verde.

## Feature Impact Contract

```yaml

feature_id: authentication-project-security-012

title: JWT authentication + user-owned combat projects, replacing self-declared workspace header

status: proposed

domain_owner: authentication

approval:

  gate_run_id:

  gate_rule_set_version:

  model_revision:

  approved_by:

  approved_at:

  approval_evidence:

contracts:

  - name: user

    version: v1

    change: additive

  - name: refresh-token

    version: v1

    change: additive

  - name: mcp-principal

    version: v2

    change: breaking   # Principal deixa de ser aceito solto; precisa vir de um JWT verificado

data_sources: []

kg:

  nodes_changed: []

  relationships_added: []

simulation:

  states_added: []

gates:

  affected: []

persistence:

  postgres_migrations: [create User, create RefreshToken, add Workspace.owner_user_id foreign key]

  neo4j_migrations: []

gateway:

  changed: true

  detail: "Authorization: Bearer <jwt> substitui x-authorized-workspaces; GatewayAuthenticator passa a verificar assinatura e derivar o Principal do usuário autenticado"

authorization:

  changed: true

  detail: "isWorkspaceAuthorized deriva de JWT verificado + Workspace.owner_user_id; fail-closed por padrão"

security:

  changed: true

  detail: "corrige bypass de project isolation: default-allow quando header ausente"

audit:

  changed: true

  detail: "approved_by em aprovações de governança (FIC) passa a referenciar User.id real"

tests:

  integration: [login happy path, refresh rotation, refresh reuse detection, workspace access denied without token, workspace access denied for non-owner with valid token, workspace creation owned by authenticated user]

  fixtures: [usuário autenticado tentando acessar workspace de outro usuário]

rollback: não reintroduzir o header inseguro; rollback deve preservar autenticação real e fail-closed, mesmo que temporariamente reduza disponibilidade

risks: maior superfície de ataque nova (login/refresh) precisa de rate limit desde o primeiro deploy, não depois

```