# ⚔️ Combat Designer

> Workbench multi-serviço para designers de combate: importa dados de engines de jogo, simula e analisa combate de forma determinística, e conta com um Combat Director consultivo que recomenda ajustes sem nunca mutar o projeto original.

<!-- Opcional: imagem, logo ou screenshot principal -->

## 📋 Sobre o projeto

O Combat Designer organiza dados de combate por usuário autenticado e workspace, importa dados de engines de jogo, expõe simulação e análise determinísticas, e ajuda o **Combat Director** (um agente orientado a LLM) a produzir recomendações e propostas não-mutantes de design.

O fluxo do produto é:

```text
Usuário
  -> Autenticação JWT
  -> Propriedade de workspace
  -> Domínio canônico de combate
  -> Persistência em PostgreSQL (quando DATABASE_URL está configurado)
  -> Projeção em grafo de conhecimento Neo4j (quando configurado)
  -> Simulação determinística
  -> Análise de combate e achados (findings)
  -> Recomendação / proposta do Combat Director
```

O runtime de produto não trata vereditos de desenvolvimento como estados de combate visíveis ao usuário: a simulação responde "o que acontece", a análise produz achados e evidências, e o Combat Director explica, recomenda e pode redigir propostas — mas nunca muta um projeto de engine diretamente.

Explicando de forma simples:

* **O que o projeto faz:** oferece um workbench único para importar dados de combate de um game engine, rodar simulações determinísticas, gerar análises com achados e evidências, e conversar com um Combat Director que sugere ajustes de balanceamento;
* **Para quem foi desenvolvido:** designers de combate (jogos de luta / ação) que trabalham com Unity, Godot ou Unreal e precisam validar e balancear ataques e combos fora do editor do engine;
* **Qual problema resolve:** a falta de uma ferramenta determinística e auditável para testar balanceamento de combate, com apoio de IA à decisão sem o risco de a IA alterar o projeto original;
* **Principais diferenciais:**
  * Motor de simulação puro e determinístico, escrito em Rust, isolado do restante da aplicação;
  * Separação clara entre simulação (o que acontece), análise (achados e evidências) e Combat Director (explica, recomenda e propõe — nunca muta);
  * Exporters nativos para **Unity**, **Godot** e **Unreal**, permitindo ingerir dados de combate direto do engine;
  * Superfície **MCP** tipada (gateway com autenticação, políticas por capability/workspace, rate limiting e auditoria) para consumo por agentes externos;
  * Projeção opcional em grafo de conhecimento (**Neo4j**) para consultas de caminhos até o launcher, ciclos candidatos, análise de impacto e proveniência;
  * Observabilidade nativa com métricas Prometheus, tracing OpenTelemetry e health checks por serviço.

### 🎯 Objetivos

* Oferecer um ambiente único para importar, simular e analisar combate de forma determinística e reproduzível;
* Apoiar decisões de balanceamento com recomendações e propostas não-destrutivas do Combat Director;
* Manter rastreabilidade entre especificações, regras, testes e evidência de implementação por meio do harness de desenvolvimento (`.harness/`).

---

## ✨ Funcionalidades

* ✅ Autenticação de usuários (registro, login, refresh e logout) com JWT e hash de senha via Argon2
* ✅ Workspaces isolados por usuário (criar, renomear, arquivar e visão geral)
* ✅ Catálogo de personagens, ataques e combos por workspace
* ✅ Importação de dados de combate de **Unity**, **Godot** e **Unreal** via exporters dedicados
* ✅ Simulação de combate determinística, executada pelo motor em Rust
* ✅ Análise de combate com achados (findings) e evidências
* ✅ Combat Director: chat consultivo via LLM (Gemini function calling) e propostas não-mutantes (criar, consultar, retirar)
* ✅ Projeção opcional em grafo de conhecimento Neo4j (caminhos, ciclos, impacto, proveniência, cenários)
* ✅ Observabilidade: métricas Prometheus, tracing OpenTelemetry e health checks (`/health`, `/health/live`, `/health/ready`, `/health/dependencies`)
* ✅ Gateway MCP tipado, com autenticação, autorização por capability/workspace, rate limiting e auditoria, para consumo por agentes externos

---

## 🖥️ Demonstração

### Screenshots

<img width="1920" height="910" alt="image" src="https://github.com/user-attachments/assets/300c9509-a9a4-4ff5-8901-0f676cdc0b71" />
<img width="1627" height="887" alt="image" src="https://github.com/user-attachments/assets/efdf759d-2d49-4e57-ae4a-f0a620d0b54e" />

---

## 🛠️ Tecnologias utilizadas

### Front-end

* [React 19](https://react.dev/)
* [React Router DOM 7](https://reactrouter.com/)
* [TypeScript](https://www.typescriptlang.org/)
* [esbuild](https://esbuild.github.io/)
* [Vitest](https://vitest.dev/) e [Playwright](https://playwright.dev/) (testes end-to-end)

### Back-end

* [Node.js](https://nodejs.org/) `>= 20` (execução via `--experimental-strip-types`, sem etapa de transpilação em dev)
* [TypeScript](https://www.typescriptlang.org/)
* [Zod](https://zod.dev/) (validação de schemas)
* [Argon2](https://github.com/ranisalt/node-argon2) (hash de senha)
* [@google/genai](https://www.npmjs.com/package/@google/genai) (LLM Gemini para o Combat Director)
* [OpenTelemetry](https://opentelemetry.io/) (métricas e tracing)
* **engine/**: [Rust](https://www.rust-lang.org/) — motor de combate puro, determinístico e orientado a clock de frames, com `serde`, `serde_json` e `thiserror`
* **mcp/**: [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/) — gateway e servidor MCP tipados

### Banco de dados

* PostgreSQL 16 (persistência canônica, opcional via `DATABASE_URL`)
* Neo4j 5.26 Community + plugin APOC (projeção em grafo de conhecimento, opcional)

### Ferramentas

* Git
* GitHub
* Docker / Docker Compose
* npm workspaces (`backend`, `mcp`, `frontend`) e Cargo workspace (`engine`)
* Vitest, Playwright, cargo test / clippy / fmt
* Prometheus e Grafana (provisionamento de dashboards de observabilidade)

---

## 📦 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) `>= 20` (as imagens Docker usam Node 22)
* npm (instalado com o Node.js)
* [Rust e Cargo](https://www.rust-lang.org/tools/install) (para compilar e testar o `engine/`)
* [Docker](https://www.docker.com/) e Docker Compose, caso deseje subir a stack completa (PostgreSQL, Neo4j e todos os serviços)

Verifique as versões:

```bash
git --version
node --version
npm --version
cargo --version
```

---

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/ok-kioo/combat-designer.git
```

### 2. Entre na pasta

```bash
cd combat-designer
```

### 3. Instale as dependências

```bash
npm install
```

### 4. Configure as variáveis de ambiente

Crie um arquivo `.env` baseado no exemplo:

```bash
cp .env.example .env
```

Principais variáveis disponíveis:

```env
# Aplicação
NODE_ENV=development
PORT=3001
MCP_PORT=3002
WEB_PORT=3000

# PostgreSQL (opcional — sem ela, repositórios em memória são usados)
POSTGRES_USER=combat_designer
POSTGRES_PASSWORD=combat_designer_dev_secret
POSTGRES_DB=combat_designer
DATABASE_URL=postgres://combat_designer:combat_designer_dev_secret@localhost:5432/combat_designer

# Neo4j (opcional — habilita a projeção do grafo de conhecimento)
NEO4J_VERSION=5.26.0-community
NEO4J_URI=bolt://localhost:7687
NEO4J_HTTP_URI=http://localhost:7474
NEO4J_USER=neo4j
NEO4J_PASSWORD=combat_designer_dev_secret_change_me
NEO4J_AUTH=neo4j/combat_designer_dev_secret_change_me

# Combat Director / LLM (opcional — sem a chave, um LLM mock determinístico é usado)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash

# Autenticação
JWT_SECRET=
```

### 5. Execute o projeto

Build do frontend:

```bash
npm --prefix frontend run build
```

Backend (API):

```bash
npm --prefix backend run dev
```

O projeto estará disponível em:

```text
http://localhost:3001
```

---

## 📖 Como usar

Após a instalação, os principais serviços ficam disponíveis nos seguintes endereços (padrão local ou via Docker Compose):

| Serviço              | URL padrão               |
| --------------------- | ------------------------- |
| Frontend (workbench)   | http://localhost:3000     |
| Backend / REST API     | http://localhost:3001     |
| MCP gateway/server      | http://localhost:3002     |
| Engine (Rust, standalone) | http://localhost:3003  |

O backend inicia com um workspace de demonstração (`ws-default`) pré-populado com ataques de um jogo de luta, para exploração imediata:

```text
👉 Base da REST API:  http://localhost:3001/api/workspaces/ws-default
👉 Health check:      http://localhost:3001/health
👉 Métricas:          http://localhost:3001/metrics
```

No frontend, o workbench cobre as seguintes áreas por workspace: visão geral, personagens, catálogo de ataques, combos, análises, simulação, importação de engine e o chat com o Combat Director.

---

## 🧪 Testes

Execute os testes com:

```bash
npm run test:architecture          # regras de arquitetura (shared/architecture)
npm --prefix backend test
npm --prefix frontend test
npm --prefix mcp test
```

Para verificar a tipagem:

```bash
npm run typecheck
```

Para os testes end-to-end do frontend (Playwright):

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/combat-playwright npm --prefix frontend run test:e2e
```

Para o motor de combate (Rust):

```bash
cargo fmt --check --manifest-path engine/Cargo.toml
cargo clippy --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target -- -D warnings
cargo test --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target
```

Para validar a governança de especificações (FIC):

```bash
npm run validate-fic
```

> Algumas integrações do backend abrem listeners HTTP locais. Em sandboxes restritos elas podem falhar com `listen EPERM`; execute-as em um ambiente com permissão de rede/host.

---

## 🐳 Docker

O projeto sobe como uma stack completa via Docker Compose, com os serviços `web` (frontend), `api` (backend), `mcp`, `engine` (Rust), `postgres` e `neo4j`.

### Construir as imagens

```bash
npm run docker:build
```

### Subir os containers

```bash
npm run docker:up
```

Isso disponibiliza:

* Frontend: http://localhost:3000
* API: http://localhost:3001
* MCP: http://localhost:3002
* Engine: http://localhost:3003
* Neo4j Browser: http://localhost:7474

Para acompanhar os logs:

```bash
npm run docker:logs
```

Para interromper:

```bash
npm run docker:down
```

---

## 📁 Estrutura do projeto

```text
combat-designer/
├── backend/                # HTTP API: auth, workspaces, ingestão, simulação/análise, chat, propostas
│   ├── src/
│   │   ├── modules/        # combat, auth, workspace, proposal, ingestion, fic, llm, mcp, observability
│   │   ├── infrastructure/ # HTTP server, providers (postgres, neo4j, llm, ingestão) e middlewares
│   │   └── routes/
│   └── tests/
├── engine/                 # Motor de combate determinístico em Rust (domínio, simulação, verificação)
│   ├── src/
│   └── tests/
├── frontend/                # React 19 + React Router DOM 7 (UI do workbench)
│   ├── app/                 # roteamento, layouts, bootstrap, servidor
│   ├── features/             # landing, auth, workspaces, personagens, catálogo, combos, análise, simulação, director-chat, ingestão, ajuda
│   ├── shared/
│   └── e2e/
├── mcp/                      # Gateway e servidor MCP tipados para o Combat Director
│   ├── gateway/               # roteamento, autenticação, políticas, rate limiting, auditoria
│   └── server/                # tools, recursos, orquestração LLM
├── shared/
│   └── architecture/          # testes de validação de arquitetura entre módulos
├── .harness/                  # specs, regras, skills, lições e documentação de arquitetura do processo de desenvolvimento
├── docker-compose.yml
├── Cargo.toml                 # workspace Rust (engine)
├── package.json                # workspaces npm (backend, mcp, frontend)
└── README.md
```

---

## 📄 Licença

Este projeto está licenciado sob a **MIT License**.

Consulte o arquivo `LICENSE` para obter o texto completo da licença.

---

## 🤝 Contribuindo

Contribuições são bem-vindas!

Antes de contribuir:

* siga as diretrizes descritas em `CONTRIBUTING.md`;
* utilize **Conventional Commits**;
* mantenha o padrão de código existente;
* adicione testes quando necessário.

## Convenção de commits

Este projeto utiliza [Conventional Commits](https://www.conventionalcommits.org/).

## Licença das contribuições

Ao contribuir com este projeto, você concorda que suas contribuições serão disponibilizadas sob os termos da licença vigente do repositório.

---

## ⭐ Apoie o projeto

Se este projeto foi útil para você, considere:

* ⭐ Dar uma estrela no repositório;
* 🐛 Reportar problemas;
* 💡 Sugerir melhorias;
* 🤝 Contribuir com código;
* 📢 Compartilhar o projeto.

**Obrigado por apoiar o projeto! ❤️**

---

## 📞 Suporte

Encontrou um problema?

Abra uma Issue descrevendo:

1. O problema encontrado;
2. Como reproduzi-lo;
3. O comportamento esperado;
4. O comportamento atual;
5. Logs ou mensagens de erro;
6. Sistema operacional e versão;
7. Versão do projeto.

---

## **# 📚 Documentação**

A documentação do projeto pode ser organizada nos seguintes recursos:

* **README:** documentação e instalação do projeto.
* **`CONTRIBUTING.md`:** guia para contribuição.
* **`LICENSE`:** licença do projeto.
* Documentação técnica de arquitetura, API, simulação, ingestão, grafo de conhecimento, operações e segurança: [`.harness/docs`](.harness/docs)
* Especificações e regras do processo de desenvolvimento: [`.harness/specs`](.harness/specs), [`.harness/rules`](.harness/rules)

---

<p align="center">
  Desenvolvido com ❤️ por <strong>Kaio Viana</strong>
</p>

<p align="center">
  <a href="https://github.com/ok-kioo/combat-designer">
    ⭐ Star este projeto
  </a>
</p>
