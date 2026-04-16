# cctree

**Gerenciamento hierarquico de sessoes para o [Claude Code](https://claude.ai/code) com fluxo bidirecional de contexto.**

> [Read in English](README.md)

## O Problema

Quando voce trabalha em um projeto que dura semanas usando o Claude Code, acaba criando dezenas de sessoes: uma para decisoes de arquitetura, outra para implementar uma feature, outra para debugar um bug, outra para escrever testes. Cada vez que inicia uma sessao nova, voce perde todo o contexto das anteriores e precisa re-explicar o projeto, colar docs e se repetir.

O `--fork-session` ajuda, mas e unidirecional: o filho recebe o historico do pai, mas o que o filho aprende nunca volta. A sessao #5 nao sabe o que as sessoes #2, #3 e #4 descobriram.

**O cctree resolve isso.** Ele cria uma arvore de sessoes onde o conhecimento flui nas duas direcoes: pai para filho (injecao de contexto) e filho para pai (commit back). Cada nova sessao ja comeca com o conhecimento acumulado de todas as sessoes anteriores.

## Como Funciona

```
                    ┌─────────────────────────┐
                    │   Auth Service v2        │  <- pai (acumulador de contexto)
                    │                         │
                    │  context.md cresce       │
                    │  a cada commit           │
                    └──────────┬──────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
   ┌────────▼────────┐ ┌──────▼───────┐ ┌────────▼────────┐
   │  Pesquisa de    │ │   Schema do  │ │  Implementacao  │
   │  Arquitetura    │ │   Banco      │ │  da API         │
   │                 │ │              │ │                 │
   │ commit back ────┤ │ commit back ─┤ │ commit back ────┤
   └─────────────────┘ └──────────────┘ └─────────────────┘
```

1. Voce cria uma **tree** (o pai) com documentos de contexto inicial
2. Voce cria **branches** (sessoes filhas) para tarefas especificas
3. Cada sessao filha abre o Claude Code com todo o contexto acumulado injetado
4. Quando uma sessao filha termina, o Claude **commita** um resumo estruturado de volta para o pai
5. A proxima sessao filha herda tudo automaticamente

O pai nao e uma sessao do Claude. E um documento gerenciado em disco que cresce conforme os filhos fazem commit back. Nenhum token de context window e desperdicado com uma sessao "hub".

## Inicio Rapido

### Instalacao

```bash
npm install -g cctree
```

### Registrar o servidor MCP (uma vez)

```bash
cctree mcp-install
```

Isso registra o `cctree` como servidor MCP para que as sessoes do Claude Code tenham acesso as tools `commit_to_parent`, `get_tree_status` e `get_sibling_context`.

### Criar a primeira tree

```bash
cctree init "Auth Service v2" --context docs/auth-spec.md docs/api-design.md
```

Cria uma tree chamada "Auth Service v2" e copia seus arquivos de spec como contexto inicial.

### Comecar a trabalhar

```bash
# Sessao 1: pesquisa e decisoes de arquitetura
cctree branch "Pesquisa de Arquitetura"
```

O Claude Code abre com seus arquivos de spec ja no contexto. Trabalhe normalmente. Quando terminar:

```
Voce: commita o que decidimos para o pai

Claude: [usa a tool commit_to_parent]
Committed summary for "Pesquisa de Arquitetura" to tree "Auth Service v2".
Accumulated context: 4.2 KB (1 sessions committed).
```

```bash
# Sessao 2: herda tudo da sessao 1
cctree branch "Schema do Banco"
```

Essa sessao ja sabe todas as decisoes de arquitetura da sessao 1. Quando terminar, commita de novo. A sessao 3 vai saber tudo das sessoes 1 e 2, e assim por diante.

## Casos de Uso

### Planejamento de Release

Voce esta lancando uma feature que envolve backend, frontend e infraestrutura. Cada area precisa de uma sessao dedicada, mas todas precisam compartilhar contexto.

```bash
cctree init "Integracao de Pagamentos" --context docs/payment-spec.md
cctree branch "Pesquisa de Provedor"           # comparar Stripe vs Adyen vs PayPal
# ... commit back ...
cctree branch "Design do Schema"               # desenhar tabelas sabendo o provedor escolhido
# ... commit back ...
cctree branch "Implementacao da API"            # implementar sabendo schema + provedor
# ... commit back ...
cctree branch "Integracao Frontend"             # construir UI sabendo a API completa
```

### Investigacao de Bug

Um bug complexo em producao que exige multiplos angulos de investigacao:

```bash
cctree init "Investigacao Memory Leak" --context logs/error-dump.txt metrics/grafana-export.json
cctree branch "Analise de Logs"
# ... commit back ...
cctree branch "Analise de Heap Dump"           # ja sabe o que os logs revelaram
# ... commit back ...
cctree branch "Implementacao do Fix"           # sabe a causa raiz das duas analises
```

### De Spec Tecnica para Implementacao

Transformar uma spec em codigo funcional ao longo de varias sessoes:

```bash
cctree init "Sistema de Notificacoes" --context specs/notifications-rfc.md
cctree branch "Decisoes de Arquitetura"        # decidir message broker, patterns
# ... commit back ...
cctree branch "Scaffold do Servico"            # implementar base sabendo a arquitetura
# ... commit back ...
cctree branch "Canal de Email"                 # implementar sabendo a API do core
# ... commit back ...
cctree branch "Canal de Push"                  # implementar sabendo core + padroes do email
```

### Pesquisa e Documentacao

Acumular conhecimento ao longo de varias sessoes de pesquisa:

```bash
cctree init "Avaliacao de Migracao Cloud"
cctree branch "Auditoria da Infraestrutura Atual"
# ... commit back ...
cctree branch "Analise de Custo AWS vs GCP"    # sabe os detalhes da infra atual
# ... commit back ...
cctree branch "Rascunho do Plano de Migracao"  # sabe infra + analise de custo
# ... commit back ...
cctree branch "Avaliacao de Riscos"            # visao completa de toda a pesquisa anterior
```

## Referencia do CLI

### `cctree init <nome> [--context <arquivos...>]`

Cria uma nova session tree.

```bash
cctree init "Meu Projeto" --context spec.md plano.md arquitetura.md
cctree init "Investigacao Rapida"    # sem arquivos de contexto
```

### `cctree branch <nome> [--no-open]`

Cria uma sessao filha e abre o Claude Code.

```bash
cctree branch "Design da API"
cctree branch "Prototipo" --no-open    # cria a entrada sem abrir o Claude
```

### `cctree resume <nome>`

Retoma uma sessao filha existente.

```bash
cctree resume "Design da API"
cctree resume design-da-api        # tambem aceita slugs
```

### `cctree list [--all]`

Mostra a arvore de sessoes.

```bash
cctree list           # mostra apenas a tree ativa
cctree list --all     # mostra todas as trees
```

Saida:
```
Auth Service v2 (active)
├── [committed] Pesquisa de Arquitetura (Apr 16)
├── [committed] Schema do Banco (Apr 17)
├── [active]    Implementacao da API
└── [abandoned] Abordagem Antiga
```

### `cctree status`

Mostra detalhes da tree ativa.

### `cctree context [--raw]`

Imprime o documento de contexto acumulado.

```bash
cctree context          # imprime no terminal
cctree context --raw    # markdown puro (util para piping)
```

### `cctree use <nome>`

Troca a tree ativa.

```bash
cctree use "Integracao de Pagamentos"
```

### `cctree mcp-install [--scope <scope>]`

Registra o servidor MCP do cctree no Claude Code.

```bash
cctree mcp-install                  # padrao: scope user
cctree mcp-install --scope local    # apenas o projeto atual
```

## Tools MCP (Dentro do Claude Code)

Essas tools ficam disponiveis para o Claude dentro de sessoes lancadas via `cctree branch`:

| Tool | O que faz |
|------|-----------|
| `commit_to_parent` | Commita um resumo estruturado de volta para a tree pai |
| `get_tree_status` | Mostra a estrutura da tree com status de cada filho |
| `get_sibling_context` | Le o resumo commitado de uma sessao irma especifica |

### Formato do summary ao commitar

```markdown
## Decisions
- Escolhemos PostgreSQL ao inves de MongoDB por compliance ACID
- API REST com endpoints versionados (/v1/...)

## Artifacts Created
- Migration: db/migrate/001_create_users.rb
- Controller: app/controllers/users_controller.rb

## Open Questions
- JWT ou auth baseada em sessao?

## Next Steps
- Implementar middleware de autenticacao
- Adicionar rate limiting
```

## Multiplas Trees

Voce pode manter varias trees simultaneamente para projetos ou releases diferentes:

```bash
cctree init "Auth Service v2" --context docs/auth-spec.md
cctree init "Integracao de Pagamentos" --context docs/payment-spec.md
cctree init "Sprint Performance Q3" --context docs/perf-targets.md

cctree list --all
# Auth Service v2
#     (no sessions yet)
#
# Integracao de Pagamentos
#     (no sessions yet)
#
# Sprint Performance Q3 (active)
#     (no sessions yet)

cctree use "Auth Service v2"          # troca de contexto
cctree branch "Token Refresh"         # trabalha em auth
# ...
cctree use "Integracao de Pagamentos" # troca para outro release
cctree branch "Webhook Handler"       # trabalha em pagamentos
```

Cada tree e totalmente independente. Trocar entre trees e instantaneo pois todo o estado e baseado em arquivos.

## Ideias de Integracao

### Criar trees a partir de JIRA/Linear/CSV

Como `cctree init` e `cctree branch` sao comandos CLI, voce pode scriptaros. Por exemplo, para criar uma tree a partir de um CSV de tickets do JIRA:

```bash
# tickets.csv:
# key,summary
# AUTH-101,Token refresh flow
# AUTH-102,Session management
# AUTH-103,SSO integration

cctree init "Auth Service v2" --context docs/auth-spec.md

while IFS=, read -r key summary; do
  cctree branch "$key: $summary" --no-open
done < <(tail -n +2 tickets.csv)

cctree list
# Auth Service v2 (active)
# ├── [active] AUTH-101: Token refresh flow
# ├── [active] AUTH-102: Session management
# └── [active] AUTH-103: SSO integration
```

Ou use o proprio Claude Code para ler seu board e criar a tree:

```
Voce: Leia os tickets do arquivo docs/jira-export.csv e crie um cctree
      branch para cada um, agrupado por epic.

Claude: [le o CSV, executa cctree init + cctree branch --no-open para cada ticket]
```

### Alimentar contexto de fontes externas

Arquivos de contexto inicial podem ser qualquer coisa: specs, docs de API, schemas de banco, dumps de log, diagramas de arquitetura (como texto). Voce tambem pode gera-los dinamicamente:

```bash
# Puxar schema atual como contexto
pg_dump --schema-only mydb > /tmp/schema.sql

# Puxar logs de erro recentes
kubectl logs deploy/api --since=24h > /tmp/recent-errors.log

cctree init "Fix Bug Producao" --context /tmp/schema.sql /tmp/recent-errors.log
```

### Integracao com CI/CD

Apos completar uma tree, exporte o contexto acumulado como documento de release:

```bash
cctree context --raw > docs/releases/auth-v2-decisions.md
git add docs/releases/auth-v2-decisions.md
git commit -m "Add Auth v2 release decisions"
```

## Armazenamento de Dados

Todos os dados sao armazenados localmente em `~/.cctree/`:

```
~/.cctree/
├── active-tree                    # slug da tree atual
├── active-session.json            # tree + child atual (para o servidor MCP)
└── trees/
    └── auth-service-v2/
        ├── tree.json              # config da tree + metadados dos filhos
        ├── context.md             # contexto acumulado (auto-gerado)
        ├── .inject-context.md     # arquivo temporario para injecao no Claude
        ├── initial-context/
        │   ├── auth-spec.md
        │   └── api-design.md
        └── children/
            ├── pesquisa-de-arquitetura.md
            └── schema-do-banco.md
```

Nenhum dado e enviado para servicos externos. Tudo sao arquivos locais.

## Requisitos

- Node.js >= 20
- [Claude Code CLI](https://claude.ai/code) instalado e autenticado

## Contribuindo

Contribuicoes sao bem-vindas. Por favor, abra uma issue primeiro para discutir o que voce gostaria de mudar.

```bash
git clone https://github.com/railima/cctree.git
cd cctree
npm install
npm test          # 44 testes
npm run build     # gera dist/
npm run lint      # verificacao de tipos
```

## Licenca

[MIT](LICENSE)
