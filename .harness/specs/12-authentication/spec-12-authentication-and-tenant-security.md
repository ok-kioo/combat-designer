# Spec 12 — Authentication and Tenant Security (JWT)

Origem: auditoria de validação (2026) sobre a implementação de specs/08–09. Esta spec fecha uma lacuna
já **declarada como necessária pela própria spec 08** ("Workspace Authorization") mas nunca implementada:
`workspace_id` era tratado como prova de identidade quando na verdade nunca existiu um principal autenticado
por trás dele.

## Achado que motiva esta spec

`spec 08, seção "Workspace Authorization"` já diz: *"`workspace_id` enviado pelo cliente ... é uma declaração
de intenção/contexto, não uma prova de autorização"* e descreve que o MCP Gateway deveria validar contra
*"o conjunto de workspaces autorizados para o principal autenticado"*.

Na implementação auditada, isso não existe:

- `backend/src/infrastructure/http/server.ts`, método `isWorkspaceAuthorized`: lê o header
  `x-authorized-workspaces` — uma lista **auto-declarada pelo próprio cliente, sem assinatura** — e, pior,
  **retorna `true` (autorizado) por padrão quando o header está ausente**. Qualquer request sem esse header
  passa livremente para qualquer `workspace_id`.
- `mcp/gateway/src/auth/authenticator.ts`: `GatewayAuthenticator.authenticate` só valida a **forma** do objeto
  `Principal` (schema Zod) recebido como argumento — não verifica nenhuma credencial, assinatura ou token. Quem
  chama a função escolhe o `Principal` que quiser.

Resultado: não existe isolamento de tenant real hoje — é bypassável tanto por omissão de header quanto por
forjar o header/objeto `Principal`. Toda a superfície de `workspace_id` (Postgres row-level, Neo4j property-level,
FIC `approved_by`, MCP tool authorization) depende de uma alegação não verificada.

## Objetivo

Introduzir uma fonte real de identidade (usuário autenticado via credenciais próprias) e derivar toda
autorização de workspace a partir dela — nunca de um header ou campo enviado livremente pelo cliente.

## Não-objetivos (v1)

- SSO/OAuth com provedores externos (Google, GitHub) — pode vir depois como método adicional de login, não
  substitui o mecanismo local nesta versão.
- Multi-factor authentication.
- Permissões granulares por recurso dentro de um workspace (roles `owner`/`editor`/`viewer` bastam nesta versão;
  ACL fina por Attack/ChangeSet fica para uma spec futura se houver demanda real).

## Modelo de dados

### User (novo — Postgres)

```text
id                  (uuid, pk)
email               (unique, citext)
password_hash       (argon2id — nunca bcrypt puro sem custo configurável, nunca reversível)
display_name
created_at
last_login_at
status               active | disabled
```

Senha nunca é logada, nunca aparece em telemetria (`backend/src/infrastructure/provider/observability`
já marca campos sensíveis — `password_hash` e `password` entram na lista de redaction desde o primeiro commit
desta spec, não depois).

### WorkspaceMembership (novo — Postgres)

```text
workspace_id        (fk -> Workspace.id)
user_id              (fk -> User.id)
role                 owner | editor | viewer
added_at
```

Um `Workspace` sem nenhum `owner` é um estado inválido — `WorkspaceMembership` é criado atomicamente com a
criação do `Workspace` (o criador vira `owner` na mesma transação).

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
POST /auth/register   { email, password, display_name }  -> 201 + User (sem senha no corpo de resposta)
POST /auth/login       { email, password }                 -> 200 + { access_token, refresh_token }
POST /auth/refresh      { refresh_token }                    -> 200 + { access_token, refresh_token } (rotação)
POST /auth/logout       { refresh_token }                    -> 204 (revoga)
```

`access_token`: JWT assinado (HS256 no mínimo; RS256 se houver necessidade futura de verificação por serviço
externo sem compartilhar segredo), expiração curta (15 min sugerido), claims mínimas:

```text
sub          (user_id)
email
workspaces   [{ workspace_id, role }]   -- snapshot no momento da emissão, não fonte de verdade contínua
iat / exp
```

`refresh_token`: opaco (não JWT), vida longa (7–30 dias), armazenado só como hash, rotacionado a cada uso
(token antigo marcado `revoked_at` + `replaced_by` apontando para o novo — reuse de um refresh token já
rotacionado revoga toda a família, sinal de token roubado).

## Autorização de workspace — substituição do header

`isWorkspaceAuthorized` (`backend/src/infrastructure/http/server.ts`) e `GatewayAuthenticator.authenticate`
(`mcp/gateway/src/auth/authenticator.ts`) mudam de "confiar no que o cliente declara" para "derivar do token
verificado":

1. Todo request HTTP autenticado carrega `Authorization: Bearer <access_token>`.
2. O servidor verifica assinatura + expiração do JWT. Falha de verificação -> `401 UNAUTHENTICATED`, sempre —
   nunca um fallback que segue como se não houvesse restrição.
3. `workspace_id` do request é validado contra as claims `workspaces` do token **e** revalidado contra
   `WorkspaceMembership` no banco (as claims são um snapshot; revogação de acesso a um workspace deve valer
   antes do token expirar, então toda operação de escrita — não necessariamente toda leitura de baixo risco —
   confirma contra o banco, não só contra o JWT).
4. O header `x-authorized-workspaces` é removido. Nenhum caminho de código deriva autorização de um header ou
   campo de payload não assinado.
5. **Regra de fail-closed obrigatória**: ausência de token válido nunca resulta em acesso concedido. O bug
   atual (`return true` quando o header está ausente) é a instância exata que esta regra proíbe — o substituto
   correto é `401`/`403` por padrão, nunca `true` por padrão.

MCP Gateway: `x-authorized-workspaces` sai também de lá; o `Principal` passado para
`GatewayAuthenticator.authenticate` deixa de ser um objeto solto e passa a ser derivado do mesmo JWT verificado
(MCP clients autenticam com o mesmo `access_token` emitido por `/auth/login`, via header `Authorization` na
conexão MCP ou no handshake inicial, conforme o transporte usado).

## Impacto em specs existentes

- **spec 08 (Workspace/Tenant)**: a seção "Workspace Authorization" deixa de ser uma declaração de intenção não
  implementada e passa a apontar para esta spec como a implementação concreta. `Workspace` ganha relação
  obrigatória com `WorkspaceMembership`/`User` — atualizar o FIC embutido em spec 08 (`persistence.
  postgres_migrations`) para incluir as tabelas `User`, `WorkspaceMembership`, `RefreshToken`.
- **spec 06 (MCP)**: qualquer trecho que descreva `Principal` como validado só por schema precisa citar esta
  spec como a fonte real de verificação de identidade.
- **spec 00 (FIC)**: campo `approved_by` em qualquer FIC/GateResult passa a ser um `user_id` de um `User` real,
  não texto livre — aprovação humana rastreável de verdade, não uma string que qualquer um preenche.
- **spec 07/09 (observability/security)**: `password_hash`, `password`, `access_token`, `refresh_token` entram
  na lista de redaction de log/telemetria; rate limit de `/auth/login` e `/auth/refresh` é obrigatório (força
  bruta de senha e replay de refresh token são o novo perímetro de ataque introduzido por esta spec).

## Regras de segurança obrigatórias

- Hash de senha: Argon2id, parâmetros de custo revisáveis (não hardcoded sem possibilidade de aumento futuro).
- Nunca retornar se um `email` existe ou não em respostas de erro de login diferenciadas (evitar user enumeration
  — resposta genérica `INVALID_CREDENTIALS` tanto para email inexistente quanto para senha errada).
- Rate limit por IP e por `email` em `/auth/login` (mesma infraestrutura de limits já usada em specs/09).
- Todo `RefreshToken` revogado nunca reautoriza nada, mesmo antes de expirar.
- `access_token` nunca é persistido no servidor (é stateless por design); revogação de sessão ativa antes da
  expiração do access_token é um risco aceito e documentado (janela de 15 min) — não resolvido por esta spec,
  candidato a spec futura de token blocklist se houver necessidade real.

## Aceite

- Nenhuma rota autenticada aceita request sem `Authorization: Bearer` válido.
- `isWorkspaceAuthorized`/equivalente nunca retorna `true` por ausência de dado — todo caminho sem prova
  retorna negação.
- Teste de regressão cobrindo exatamente o bug encontrado: request sem header/token para um `workspace_id`
  arbitrário deve retornar `401`/`403`, nunca `200`.
- `npm run validate-fic` cobrindo o FIC desta spec (abaixo) roda verde.

## Feature Impact Contract

```yaml
feature_id: authentication-tenant-security-012
title: JWT authentication + real workspace membership, replacing self-declared workspace header
status: proposed
domain_owner: workspace
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
  - name: workspace-membership
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
  postgres_migrations: [create User, create WorkspaceMembership, create RefreshToken, add owner constraint on Workspace]
  neo4j_migrations: []
gateway:
  changed: true
  detail: "Authorization: Bearer <jwt> substitui x-authorized-workspaces; GatewayAuthenticator passa a verificar assinatura, não só forma"
authorization:
  changed: true
  detail: "isWorkspaceAuthorized deriva de JWT verificado + WorkspaceMembership; fail-closed por padrão"
security:
  changed: true
  detail: "corrige bypass de tenant isolation: default-allow quando header ausente"
audit:
  changed: true
  detail: "approved_by em FIC/GateResult passa a referenciar User.id real"
tests:
  integration: [login happy path, refresh rotation, refresh reuse detection, workspace access denied without token, workspace access denied for non-member with valid token]
  fixtures: [user sem membership tentando acessar workspace de outro usuário]
rollback: reverter exige reintroduzir o header inseguro — não fazer rollback sem plano de comunicação, pois volta a expor o bug
risks: maior superfície de ataque nova (login/refresh) precisa de rate limit desde o primeiro deploy, não depois
```
