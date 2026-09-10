# Skill — Domain-Oriented Folder Structure

## Objetivo

Eliminar pastas de utilitário (`api`, `infra`, `utils`, `common`, `helpers`, `shared` genérico) que agrupam por
camada técnica em vez de domínio. Toda pasta — raiz, módulo ou pasta filha dentro de um módulo — deve nomear um
domínio/capacidade de negócio, nunca um tipo de arquivo ou uma camada arquitetural isolada. Isso se aplica
recursivamente: a regra que vale para a raiz do repositório vale também para dentro de `backend/`, `mcp/`, `frontend/`.

## Sintoma a evitar

Uma pasta cujo nome descreve *como o código é escrito* (`infra`, `services`, `utils`, `handlers`) em vez de *o que
o código faz* (`ingestion`, `knowledge-graph`, `changeset-lifecycle`). Esse padrão tende a: (1) virar um bucket que
mistura domínios não relacionados (ex.: `infrastructure/` com `neo4j` e `ingestion` lado a lado, sem relação de
negócio entre si); (2) duplicar-se por acidente (scaffolding morto ao lado da pasta `src/` real); (3) crescer sem
fronteira clara de quem pode depender de quem.

## Regra

1. Pasta raiz ou pasta pai só existe se representar um **módulo de produto** ou um **domínio** dentro de um módulo.
2. Uma pasta técnica (`infra`, `adapters`, `drivers`) só é aceitável **aninhada dentro do domínio que ela serve**,
   nunca como pasta irmã genérica compartilhada por domínios não relacionados.
3. Nomear pela camada arquitetural (ex.: regras de negócio vs. persistência/dependências externas), não pela
   tecnologia (`neo4j-stuff`) nem pela capacidade isolada (`ingestion`, `knowledge-graph`) quando o que está em
   jogo é essa fronteira técnica. Motivação: o acoplamento real hoje está entre capacidades e tecnologias — código
   de regra de negócio importando driver de banco, SDK externo ou biblioteca de infraestrutura diretamente. Regras
   de negócio só podem depender de persistência e de dependências/bibliotecas externas através de interfaces
   (portas) definidas pela própria camada de negócio, nunca o inverso; nomear pela camada torna essa fronteira
   visível na estrutura de pastas em vez de depender só de disciplina de import.
4. Um "core" de domínio (ex.: `application`) nunca importa a pasta `infra` que fica dentro dele — a dependência
   é sempre de fora para dentro (infra depende do core via portas/interfaces), nunca o inverso. Aninhar `infra`
   dentro do domínio é uma decisão de **localização/coesão**, não uma licença para violar a direção de dependência
   já fixada em `.harness/docs/architecture/dependency-rules.md`.
5. Toda mudança de pasta que a Regra 4 acima implica é um "pacote de mudança": renomear pastas sem atualizar
   `shared/architecture/module-boundaries.test.ts`, `.harness/docs/architecture/dependency-rules.md`, os
   `workspaces` do `package.json` raiz e o `README.md` deixa a governança dessincronizada do código. Nenhuma
   migração de pasta é considerada concluída sem esses quatro arquivos atualizados juntos.
6. Scaffolding gerado antecipadamente (pasta criada "para depois") que fica vazia enquanto o código real mora em
   `<mesmo-nível>/src/` é proibido. Se a pasta não tem arquivo, ela não existe.

## Raiz do repositório

Only estes sete nomes são módulos de produto ou infraestrutura de agentes/governança — nada mais:

```text
.agents/      # operação de agentes, nunca importado por runtime
.harness/     # governança canônica (specs, rules, skills), nunca importado por runtime
backend/
engine/
frontend/
mcp/
shared/       # cross-cutting genuinamente compartilhado por 2+ módulos de produto
```

`shared/` só recebe algo que **hoje** é consumido por 2+ módulos de produto — decisão orientada por evidência de uso
(grep de import), não por expectativa futura. Regra de posicionamento para qualquer pasta que não seja um módulo
direto (`backend`/`frontend`/`engine`/`mcp`): se só um módulo consome, ela mora dentro desse módulo; se dois ou
mais módulos consomem, ela vai para `shared/`. Nunca uma pasta utilitária solta — sempre dentro do domínio/módulo
real que a usa.

Aplicando essa regra a `observability/`: hoje só `backend/api` importa `@combat-designer/observability` (confirmado
por grep no repositório inteiro) — nem `mcp/` nem `frontend/` importam esse pacote. Sem evidência de consumo
compartilhado, `observability/` não vai para `shared/`; vai para dentro de `backend/`, como parte da camada
`infrastructure/` daquele módulo (ver seção `backend/` abaixo). Se `mcp/` ou `frontend/` passarem a emitir
telemetria por esse pacote no futuro, essa decisão deve ser revisitada — não antes.

```text
shared/
└── architecture/        # já existente — verificadores de fronteira; único conteúdo hoje, por não haver
                          # nenhuma outra pasta com evidência de consumo por 2+ módulos
```

Como o pacote não muda de dono (continua só do backend), o nome `@combat-designer/observability` **não precisa
ser renomeado** — só o caminho muda. Isso simplifica a lista de consequências: `RULE 5` de
`module-boundaries.test.ts` (frontend não pode importar `@combat-designer/observability`) não precisa de nenhuma
edição, porque o nome do pacote continua o mesmo independente de onde ele mora fisicamente.

Consequência obrigatória mesmo assim: `observability/` sai da raiz, então o `allowed` set do teste `17.1 / 27.1`
perde a entrada `observability` (o teste já não vai encontrá-la lá — ela passa a existir só dentro de `backend/`);
a entry em `workspaces` no `package.json` raiz vira `backend/application/infrastructure/*` (ver seção `backend/`);
e `RULE 10` (`observability/ cannot depend on frontend/`) tem o path atualizado para
`backend/application/infrastructure/observability/`.

## `backend/`

Estado atual: quatro pastas irmãs (`api`, `application`, `contracts`, `infrastructure`) — `infrastructure` é uma
pasta técnica genérica que hoje mistura dois domínios sem relação direta (`ingestion` e `neo4j`), e `api` é uma
camada (bootstrap HTTP) tratada como se fosse um domínio.

Alvo: dois pacotes de topo. `contracts/` inalterado. Dentro de `application/`, a fronteira estrutural que importa
é `src/` (regras de negócio: use-cases + ports, zero dependência concreta) vs. `infrastructure/` (tudo que toca
banco, framework HTTP/middlewares, SDK externo ou telemetria) — uma única camada técnica nomeada, não uma pasta
de raiz do repositório nem uma bucket compartilhada entre domínios não relacionados na raiz: ela existe porque
todo o seu conteúdo serve exclusivamente o `backend`.

```text
backend/
├── contracts/                       # inalterado — já é organizado por domínio internamente
│   └── src/{fic,ingestion,mcp,observability,simulation,verification}/
└── application/
    ├── src/                         # core: use-cases + ports, zero dependência concreta (Rule 3 continua valendo)
    │   ├── use-cases/               # approve/apply/propose/withdraw-changeset, verify-combat, simulate-combat, ...
    │   └── ports/                   # simulation-port, mechanical-gate-port, combat-query-port, ...
    └── infrastructure/              # camada técnica única do backend: persistência, deps externas, middlewares
        ├── http/                    # ex-`backend/api` — bootstrap HTTP (node:http hoje, ver nota abaixo)
        │   └── src/{index.ts,server.ts}
        ├── ingestion/               # ex-`backend/infrastructure/ingestion`
        │   └── src/{pipeline.ts,normalizer.ts,cache.ts,limits.ts,version-check.ts,parsers/,exporters/,fixtures/}
        ├── knowledge-graph/         # ex-`backend/infrastructure/neo4j` — pacote @combat-designer/graph-adapter,
        │   │                        # nome mantido (caminho de pasta ≠ nome de pacote é aceitável, como já
        │   │                        # acontece hoje com `ingestion`/@combat-designer/ingestion)
        │   └── src/{client/,projector/,queries/,schema/,status/,adapter.ts}
        └── observability/           # ex-`observability/` (raiz) — só o backend consome hoje, ver "Raiz do repositório"
            └── src/{tracing,metrics,logging,health,adapters}/
```

Cada subpasta de `infrastructure/` continua sendo seu próprio pacote npm (`package.json` próprio) para manter
granularidade de build e teste — a consolidação é de **localização/agrupamento visual**, não uma fusão de pacotes
em um único `dist`. `backend/application/src` continua sem poder importar `neo4j-driver`/`pg`/framework HTTP
(RULE 3 do checker permanece válida apontando exatamente para esse path); é `infrastructure/*` que depende do
core via as portas que ele expõe, nunca o inverso.

Nota sobre `http/`: o bootstrap hoje usa `node:http` puro, não Fastify — apesar da "Decisão de stack" no `README.md`
dizer "API/orquestração: TypeScript + Fastify". É uma divergência pré-existente entre documentação e código,
fora do escopo desta migração estrutural (comportamento, não estrutura), mas deve ficar registrada, não escondida
atrás do nome da pasta. `backend/api/package.json` também declara `@combat-designer/application` como dependência
sem nunca importá-la em `server.ts` — dependência morta pré-existente, também fora de escopo aqui.

Consequência obrigatória: `dependency-rules.md` — a linha "Infrastructure" passa a apontar para
`backend/application/infrastructure/*` como uma única linha (a matriz de dependências permitidas/proibidas já era
a mesma para `ingestion` e `neo4j`; não há razão para duplicá-la em quatro linhas agora que os quatro moram sob o
mesmo nome de camada). O teste `17.5` troca os paths hardcoded de `backend/infrastructure/*` para
`backend/application/infrastructure/{ingestion,knowledge-graph}/*`. Os `workspaces` no `package.json` raiz trocam
`backend/infrastructure/*` por `backend/application/infrastructure/*` (não `backend/application/*` — `application/`
em si já é pego pelo glob `backend/*`, e `infrastructure/` não tem `package.json` próprio, é só uma pasta de
agrupamento). `tsconfig.json` `references` ganha uma entrada por pacote sob `infrastructure/`. Depois de qualquer
rename de pacote, rodar `npm install` na raiz para regenerar `package-lock.json` — sem isso `npm ci` quebra.

## `mcp/`

`gateway/` e `server/` já eram organizados por domínio dentro de `src/` (`auth`, `policy`, `workspace`, `routing`,
`orchestration`, `tools`...). O único problema encontrado era scaffolding morto: pastas de topo vazias com o mesmo
nome de subpastas dentro de `src/` (`mcp/gateway/auth/` vazia ao lado de `mcp/gateway/src/auth/` com código real).
Isso já foi removido como limpeza direta desta auditoria — nenhuma mudança estrutural adicional é necessária aqui.
Regra a manter daqui em diante: um domínio só existe uma vez por pacote; se `src/<domínio>` existe, não cria-se
`<domínio>/` irmão de `src/`.

## `frontend/`

Hoje vazio (apenas scaffolding: `app`, `components`, `features`, `hooks`, `services`, `state`, `types`, `tests`),
mas já nasce com o anti-padrão clássico de front-end: pastas horizontais por *tipo de arquivo* (`hooks/`, `services/`,
`state/`) compartilhadas por toda a aplicação em vez de por domínio. Como ainda não há código, a correção é gratuita
— não há migração, só adotar a estrutura correta desde o primeiro arquivo:

```text
frontend/
├── app/                    # roteamento/composição — não é domínio, é ponto de entrada; mantido por convenção Next.js
├── features/
│   ├── combat-explorer/    # ex.: browsing de attacks/hitboxes/cancels
│   │   └── {components,hooks,services,state,types}/
│   ├── changeset-review/   # propose/approve/apply/withdraw + gate report
│   │   └── {components,hooks,services,state,types}/
│   ├── director-chat/      # painel de chat com o LLM (MCP)
│   │   └── {components,hooks,services,state,types}/
│   └── project-workspace/  # upload de bundle, status de ingestão, workspace switching
│       └── {components,hooks,services,state,types}/
├── shared/                 # apenas o que 2+ features realmente reusam: design tokens, primitives de UI, client MCP
│   └── {components,hooks,services,state,types}/
└── tests/
```

Dentro de cada `features/<feature>/`, `hooks`/`services`/`state`/`types` deixam de ser pastas de raiz do frontend e
passam a ser subpastas locais ao domínio que as usa — a mesma regra recursiva da seção "Regra" acima. `frontend/shared`
só recebe algo quando um segundo feature precisar do mesmo código; nada entra lá por padrão ou "para o caso de".

## Checklist para aplicar a um novo módulo

- [ ] O nome da pasta descreve um domínio/capacidade, não uma camada (`services`, `utils`) nem uma tecnologia (`neo4j-stuff`)?
- [ ] Se existe uma pasta técnica (`infra`, `adapters`), ela está aninhada dentro do domínio que serve, e não é irmã de domínios não relacionados?
- [ ] A direção de dependência declarada em `dependency-rules.md` continua verdadeira após a mudança?
- [ ] `module-boundaries.test.ts`, `dependency-rules.md`, `package.json#workspaces`/`tsconfig#references` e `README.md` foram atualizados no mesmo commit?
- [ ] Nenhuma pasta vazia sobrevive ao lado de um `src/` com o mesmo nome de subpasta?