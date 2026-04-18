# cctree

**Gerenciamento hierárquico de sessões para o [Claude Code](https://claude.ai/code) com fluxo bidirecional de contexto.**

> [Read in English](README.md)

## O Problema

Quando você trabalha em um projeto que dura semanas usando o Claude Code, acaba criando dezenas de sessões: uma para decisões de arquitetura, outra para implementar uma feature, outra para debugar um bug, outra para escrever testes. Cada vez que inicia uma sessão nova, você perde todo o contexto das anteriores e precisa re-explicar o projeto, colar docs e se repetir.

Mas perder contexto entre sessões é só metade do problema. A outra metade é **precisar voltar**. Você está no meio de uma sessão de implementação e encontra um bug relacionado a uma decisão de arquitetura que tomou três sessões atrás. A única forma de conseguir ajuda útil é voltar para aquela sessão de arquitetura, porque é lá que o Claude tem o contexto completo de *por que* as coisas foram desenhadas daquele jeito. Então você sai da sessão de implementação, procura a sessão certa no `/resume`, faz a pergunta lá, volta e repassa a resposta manualmente. Essa troca constante de sessões quebra o fluxo e desperdiça tempo.

O `--fork-session` ajuda com o primeiro problema, mas é unidirecional: o filho recebe o histórico do pai, mas o que o filho aprende nunca volta. E não ajuda em nada com o segundo problema: você ainda não consegue consultar o conhecimento de uma sessão irmã de onde está.

**O cctree resolve os dois.** Ele cria uma árvore de sessões onde o conhecimento flui nas duas direções: pai para filho (injeção de contexto) e filho para pai (commit back). Cada nova sessão já começa com o conhecimento acumulado de todas as sessões anteriores. E quando você precisa de detalhes de uma sessão irmã específica, a tool `get_sibling_context` permite ler o resumo commitado dela sem sair da sessão atual.

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

1. Você cria uma **tree** (o pai) com documentos de contexto inicial
2. Você cria **branches** (sessões filhas) para tarefas específicas
3. Cada sessão filha abre o Claude Code com todo o contexto acumulado injetado
4. Quando uma sessão filha termina, o Claude **commita** um resumo estruturado de volta para o pai
5. A próxima sessão filha herda tudo automaticamente

O pai não é uma sessão do Claude. É um documento gerenciado em disco que cresce conforme os filhos fazem commit back. Nenhum token de context window é desperdiçado com uma sessão "hub".

## Início Rápido

### Instalação

```bash
npm install -g @railima/cctree
```

### Registrar o servidor MCP (uma vez)

```bash
cctree mcp-install
```

Isso registra o `cctree` como servidor MCP para que as sessões do Claude Code tenham acesso às tools `commit_to_parent`, `get_tree_status` e `get_sibling_context`.

### Criar a primeira tree

```bash
cctree init "Auth Service v2" --context docs/auth-spec.md docs/api-design.md
```

Cria uma tree chamada "Auth Service v2" e copia seus arquivos de spec como contexto inicial.

### Começar a trabalhar

```bash
# Sessão 1: pesquisa e decisões de arquitetura
cctree branch "Pesquisa de Arquitetura"
```

O Claude Code abre com seus arquivos de spec já no contexto. Trabalhe normalmente. Quando terminar:

```
Você: commita o que decidimos para o pai

Claude: [usa a tool commit_to_parent]
Committed summary for "Pesquisa de Arquitetura" to tree "Auth Service v2".
Accumulated context: 4.2 KB (1 sessions committed).
```

```bash
# Sessão 2: herda tudo da sessão 1
cctree branch "Schema do Banco"
```

Essa sessão já sabe todas as decisões de arquitetura da sessão 1. Quando terminar, commita de novo. A sessão 3 vai saber tudo das sessões 1 e 2, e assim por diante.

## Casos de Uso

### Planejamento de Release

Você está lançando uma feature que envolve backend, frontend e infraestrutura. Cada área precisa de uma sessão dedicada, mas todas precisam compartilhar contexto.

```bash
cctree init "Integração de Pagamentos" --context docs/payment-spec.md
cctree branch "Pesquisa de Provedor"           # comparar Stripe vs Adyen vs PayPal
# ... commit back ...
cctree branch "Design do Schema"               # desenhar tabelas sabendo o provedor escolhido
# ... commit back ...
cctree branch "Implementação da API"           # implementar sabendo schema + provedor
# ... commit back ...
cctree branch "Integração Frontend"            # construir UI sabendo a API completa
```

### Consultas de Conhecimento Entre Sessões

Você está implementando endpoints da API e encontra um problema relacionado a uma decisão de arquitetura de uma sessão anterior. Sem o cctree, você teria que sair da sessão atual, encontrar a sessão de arquitetura pelo `/resume`, fazer a pergunta lá, voltar e repassar a resposta manualmente.

Com o cctree, o resumo da sessão de arquitetura já está no seu contexto. E se precisar de mais detalhes:

```
Você: Estou tendo uma dependência circular entre o middleware de auth
      e o user service. O que decidimos sobre o grafo de dependências
      na sessão de arquitetura?

Claude: [usa get_sibling_context com nome "Decisões de Arquitetura"]
        Na sessão de arquitetura, decidimos usar um padrão event-driven
        para quebrar dependências circulares: o middleware de auth
        publica um evento "user.authenticated" e o user service se
        inscreve nele, ao invés de imports diretos.
```

Sem trocar de sessão. Sem copiar e colar. O conhecimento de cada sessão commitada é consultável de onde você estiver.

### Investigação de Bug

Um bug complexo em produção que exige múltiplos ângulos de investigação:

```bash
cctree init "Investigação Memory Leak" --context logs/error-dump.txt metrics/grafana-export.json
cctree branch "Análise de Logs"
# ... commit back ...
cctree branch "Análise de Heap Dump"           # já sabe o que os logs revelaram
# ... commit back ...
cctree branch "Implementação do Fix"           # sabe a causa raiz das duas análises
```

### De Spec Técnica para Implementação

Transformar uma spec em código funcional ao longo de várias sessões:

```bash
cctree init "Sistema de Notificações" --context specs/notifications-rfc.md
cctree branch "Decisões de Arquitetura"        # decidir message broker, patterns
# ... commit back ...
cctree branch "Scaffold do Serviço"            # implementar base sabendo a arquitetura
# ... commit back ...
cctree branch "Canal de Email"                 # implementar sabendo a API do core
# ... commit back ...
cctree branch "Canal de Push"                  # implementar sabendo core + padrões do email
```

### Pesquisa e Documentação

Acumular conhecimento ao longo de várias sessões de pesquisa:

```bash
cctree init "Avaliação de Migração Cloud"
cctree branch "Auditoria da Infraestrutura Atual"
# ... commit back ...
cctree branch "Análise de Custo AWS vs GCP"    # sabe os detalhes da infra atual
# ... commit back ...
cctree branch "Rascunho do Plano de Migração"  # sabe infra + análise de custo
# ... commit back ...
cctree branch "Avaliação de Riscos"            # visão completa de toda a pesquisa anterior
```

## Referência do CLI

### `cctree init <nome> [--context <arquivos...>]`

Cria uma nova session tree.

```bash
cctree init "Meu Projeto" --context spec.md plano.md arquitetura.md
cctree init "Investigação Rápida"    # sem arquivos de contexto
```

### `cctree branch <nome> [--no-open]`

Cria uma sessão filha e abre o Claude Code.

```bash
cctree branch "Design da API"
cctree branch "Protótipo" --no-open    # cria a entrada sem abrir o Claude
```

### `cctree resume <nome>`

Retoma uma sessão filha existente.

```bash
cctree resume "Design da API"
cctree resume design-da-api        # também aceita slugs
```

### `cctree list [--all]`

Mostra a árvore de sessões.

```bash
cctree list           # mostra apenas a tree ativa
cctree list --all     # mostra todas as trees
```

Saída:
```
Auth Service v2 (auth-service-v2) (active)
├── [committed] Pesquisa de Arquitetura (Apr 16)
├── [committed] Schema do Banco (Apr 17)
├── [active]    Implementação da API
└── [abandoned] Abordagem Antiga
```

O slug entre parênteses é o que você pode passar para `cctree use` ou `cctree resume`.

### `cctree status`

Mostra detalhes da tree ativa.

### `cctree context [--raw]`

Imprime o documento de contexto acumulado.

```bash
cctree context          # imprime no terminal
cctree context --raw    # markdown puro (útil para piping)
```

### `cctree use <nome>`

Troca a tree ativa.

```bash
cctree use "Integração de Pagamentos"
```

### `cctree mcp-install [--scope <scope>]`

Registra o servidor MCP do cctree no Claude Code.

```bash
cctree mcp-install                  # padrão: scope user
cctree mcp-install --scope local    # apenas o projeto atual
```

## Tools MCP (Dentro do Claude Code)

Essas tools ficam disponíveis para o Claude dentro de sessões lançadas via `cctree branch`:

| Tool | O que faz |
|------|-----------|
| `commit_to_parent` | Commita um resumo estruturado de volta para a tree pai |
| `get_tree_status` | Mostra a estrutura da tree com status de cada filho |
| `get_sibling_context` | Lê o resumo commitado de uma sessão irmã específica |

### Formato do summary ao commitar

```markdown
## Decisions
- Escolhemos PostgreSQL ao invés de MongoDB por compliance ACID
- API REST com endpoints versionados (/v1/...)

## Artifacts Created
- Migration: db/migrate/001_create_users.rb
- Controller: app/controllers/users_controller.rb

## Open Questions
- JWT ou auth baseada em sessão?

## Next Steps
- Implementar middleware de autenticação
- Adicionar rate limiting
```

## Múltiplas Trees

Você pode manter várias trees simultaneamente para projetos ou releases diferentes:

```bash
cctree init "Auth Service v2" --context docs/auth-spec.md
cctree init "Integração de Pagamentos" --context docs/payment-spec.md
cctree init "Sprint Performance Q3" --context docs/perf-targets.md

cctree list --all
# Auth Service v2 (auth-service-v2)
#     (no sessions yet)
#
# Integração de Pagamentos (integracao-de-pagamentos)
#     (no sessions yet)
#
# Sprint Performance Q3 (sprint-performance-q3) (active)
#     (no sessions yet)

cctree use "Auth Service v2"          # troca de contexto
cctree branch "Token Refresh"         # trabalha em auth
# ...
cctree use "Integração de Pagamentos" # troca para outro release
cctree branch "Webhook Handler"       # trabalha em pagamentos
```

Cada tree é totalmente independente. Trocar entre trees é instantâneo pois todo o estado é baseado em arquivos.

## Ideias de Integração

### Criar trees a partir de JIRA/Linear/CSV

Como `cctree init` e `cctree branch` são comandos CLI, você pode scriptá-los. Por exemplo, para criar uma tree a partir de um CSV de tickets do JIRA:

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
# Auth Service v2 (auth-service-v2) (active)
# ├── [active] AUTH-101: Token refresh flow
# ├── [active] AUTH-102: Session management
# └── [active] AUTH-103: SSO integration
```

Ou use o próprio Claude Code para ler seu board e criar a tree:

```
Você: Leia os tickets do arquivo docs/jira-export.csv e crie um cctree
      branch para cada um, agrupado por epic.

Claude: [lê o CSV, executa cctree init + cctree branch --no-open para cada ticket]
```

### Alimentar contexto de fontes externas

Arquivos de contexto inicial podem ser qualquer coisa: specs, docs de API, schemas de banco, dumps de log, diagramas de arquitetura (como texto). Você também pode gerá-los dinamicamente:

```bash
# Puxar schema atual como contexto
pg_dump --schema-only mydb > /tmp/schema.sql

# Puxar logs de erro recentes
kubectl logs deploy/api --since=24h > /tmp/recent-errors.log

cctree init "Fix Bug Produção" --context /tmp/schema.sql /tmp/recent-errors.log
```

### Integração com CI/CD

Após completar uma tree, exporte o contexto acumulado como documento de release:

```bash
cctree context --raw > docs/releases/auth-v2-decisions.md
git add docs/releases/auth-v2-decisions.md
git commit -m "Add Auth v2 release decisions"
```

## Armazenamento de Dados

Todos os dados são armazenados localmente em `~/.cctree/`:

```
~/.cctree/
├── active-tree                    # slug da tree atual
├── active-session.json            # tree + child atual (para o servidor MCP)
└── trees/
    └── auth-service-v2/
        ├── tree.json              # config da tree + metadados dos filhos
        ├── context.md             # contexto acumulado (auto-gerado)
        ├── .inject-context.md     # arquivo temporário para injeção no Claude
        ├── initial-context/
        │   ├── auth-spec.md
        │   └── api-design.md
        └── children/
            ├── pesquisa-de-arquitetura.md
            └── schema-do-banco.md
```

Nenhum dado é enviado para serviços externos. Tudo são arquivos locais.

## Requisitos

- Node.js >= 20
- [Claude Code CLI](https://claude.ai/code) instalado e autenticado

## Contribuindo

Contribuições são bem-vindas. Por favor, abra uma issue primeiro para discutir o que você gostaria de mudar.

```bash
git clone https://github.com/railima/cctree.git
cd cctree
npm install
npm test          # 44 testes
npm run build     # gera dist/
npm run lint      # verificação de tipos
```

## Licença

[MIT](LICENSE)
