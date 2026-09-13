# Frontend — roteamento e entrega

A aplicação de produto é React 19 com React Router DOM 7 declarativo. Não havia React/router
instalado antes desta migração; a escolha foi fixada pela decisão explícita do usuário.
Compatibilidade: Node >=20 e build com esbuild; versões exatas em package-lock.json.
Referência primária: https://reactrouter.com/start/declarative/installation

```text
Antes: HTTP / -> server.ts -> Landing + Auth + Dashboard + Workspace -> CSS visibility
Depois: URL -> BrowserRouter -> AppRoutes -> Auth/Workspace guards -> Layout/Outlet -> Page -> ApiClient -> API/Application
```

## Proprietários

- `frontend/app/server.ts`: transporte HTTP, proxy /api, assets, health e history fallback.
- `frontend/app/shell.ts`: documento de bootstrap sem árvores de páginas.
- `frontend/app/build.mjs`: empacota bootstrap React/CSS e copia exporter para dist/assets.
- `frontend/app/bootstrap.tsx`: um BrowserRouter e AuthProvider.
- `frontend/app/router.tsx`: única árvore de rotas e guards; URL é autoridade de navegação.
- `frontend/app/layouts`: PublicLayout/AuthLayout e WorkspaceLayout com Outlet.
- `frontend/shared/auth/AuthProvider.tsx`: sessão validada, bootstrap, refresh inicial e logout.
- `frontend/shared/services/api-client.ts`: transporte existente, ampliado com request tipado/status seguro.
- `frontend/shared/ui/Resource.tsx`: loading/error/retry; AbortController descarta resposta obsoleta.
- `frontend/features/*/components/*Page.tsx`: páginas por capacidade. LandingPageView e AuthPages são os módulos de landing/auth.

WorkspaceLayout lê useParams, carrega o projeto autenticado e compartilha contexto entre filhos.
Nenhum ID persistido em localStorage seleciona workspace. Troca de ID desmonta o contexto e
impede que seleção de golpes/cache local migrem entre projetos. Backend autoriza cada operação.

Os controllers históricos mantêm contratos para seus testes/consumidores anteriores, mas não
são outro router nem entrada de produção. A nova suíte e2e executa exatamente o shell e bundle
servidos em produção; os testes históricos não são evidência suficiente de comportamento web.

## Operação

`npm --prefix frontend start` compila antes de servir. Docker compila durante build e executa
apenas o servidor. `npm --prefix frontend run build` gera dist; não há dependência de harness
no produto. Alterações em fonte requerem novo build/restart; não há HMR configurado.
Fallback não mapeia páginas: entrega shell para URLs de documento. APIs e assets não entram nele.
`PUBLIC_API_URL` é serializado com escape contra fechamento de script; o padrão é proxy same-origin.

## Segurança e testes

ReturnTo restringe destinos a caminhos internos canônicos. AuthProvider valida tokens com /me,
restaura por refresh e limpa estado quando há 401. Backend verifica ownership; o guard não concede
permissão. Erros 403/404 de workspace têm mensagem equivalente. React escapa conteúdo de API.

`frontend/e2e/navigation.spec.ts` cobre rotas, histórico, nova aba, refresh, bootstrap e chat.
`frontend/tests/routing-contract.test.ts` protege shell/estrutura e returnTo.
`backend/tests/integration/api/routed-workspace-actions.test.ts` cobre ownership, rename e character creation.
