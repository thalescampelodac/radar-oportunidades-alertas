# Radar de Oportunidades e Alertas

## Status Atual

O projeto agora usa este fluxo:

- frontend continua consumindo apenas `GET /api/radar`
- MCP local faz toda a coleta de fundamentos
- `stock-rules.ts` continua sendo a fonte principal de score e categoria
- Gemini e opcional e serve apenas para enriquecer texto
- cache de 24 horas continua sendo a trava principal de custo

## Fluxo Completo Atualizado

1. O frontend chama `GET /api/radar`.
2. A rota le `data/radar.json` e `data/radar-meta.json`.
3. `POST /api/cron/update-radar` ou `scripts/update-radar.ts` inicia a atualizacao.
4. O script verifica se a janela de 24 horas permite nova execucao.
5. Se permitir, o script chama o cliente MCP em `lib/mcp-client.ts`.
6. O cliente chama a tool `get_stock_fundamentals`.
7. O servidor MCP em `mcp-server/server.ts` consulta a `brapi.dev`.
8. Os fundamentos retornam ao `update-radar.ts`.
9. `stock-rules.ts` calcula score, categoria, justificativa base e riscos.
10. Se `GEMINI_API_KEY` estiver configurada, o Gemini recebe os ativos ja classificados em uma unica chamada.
11. O Gemini pode enriquecer:
    - justificativas
    - resumo textual do radar
    - observacoes educativas
12. O Gemini nao altera score nem categoria.
13. O Gemini tenta primeiro JSON mode; se a API rejeitar essa configuracao, tenta um fallback simples automaticamente.
14. Se o Gemini ainda falhar, o fluxo segue com as justificativas locais.
15. Se o MCP falhar, o fluxo preserva primeiro o `radar.json` atual.
16. Se o MCP devolver apenas parte dos ativos, o restante e preenchido com cache local ou mocks.
17. Se nao houver cache valido, os mocks internos continuam como fallback final.

## Ativar ou Desativar Gemini

### Ativar

Defina `GEMINI_API_KEY` no `.env.local`:

```env
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
```

### Desativar

Deixe `GEMINI_API_KEY` vazia ou remova a variavel do `.env.local`.

Com Gemini desativado:

- o radar continua funcionando normalmente
- score e categoria continuam sendo calculados pelas regras locais
- nenhuma chamada ao Gemini e feita

## Variaveis de Ambiente

Crie um `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

### `BRAPI_API_KEY` opcional

```env
BRAPI_API_KEY=
```

Uso:

- sem chave: usa a lista gratuita reduzida suportada pela brapi
- sem chave, os demais ativos do radar sao completados com fallback local
- com chave: permite ampliar a cobertura da coleta real

### `CRON_SECRET`

```env
CRON_SECRET=
```

Se definido, protege `POST /api/cron/update-radar` com:

```http
Authorization: Bearer SEU_CRON_SECRET
```

### `GEMINI_API_KEY`

```env
GEMINI_API_KEY=
```

Uso:

- opcional
- somente backend
- nunca exposta ao frontend
- no maximo 1 chamada por dia, porque o cache de 24 horas impede reexecucoes frequentes
- modelo padrao atual: `gemini-2.5-flash`
- versao padrao atual da API: `v1beta`

## Como Iniciar o MCP Localmente

```bash
npm run mcp:start
```

Esse comando:

1. compila `mcp-server/server.ts` e dependencias para `.mcp-dist`
2. sobe o servidor MCP local em `http://127.0.0.1:3031/mcp`

### Testar healthcheck do MCP

```bash
curl http://127.0.0.1:3031/health
```

### Testar a tool `get_stock_fundamentals`

```bash
curl -X POST http://127.0.0.1:3031/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"get_stock_fundamentals","params":{"tickers":["PETR4","VALE3"]}}'
```

## Como Testar o Projeto

```bash
npm install
npm run mcp:start
npm run dev
curl http://localhost:3000/api/radar
curl -X POST http://localhost:3000/api/cron/update-radar
curl -X POST http://localhost:3000/api/cron/update-radar -H "Authorization: Bearer $CRON_SECRET"
npm run build
```

## Garantias do Fluxo

- o frontend nunca chama MCP nem Gemini
- o MCP e a unica camada responsavel pela coleta de fundamentos
- as regras locais continuam sendo a base da pontuacao
- o Gemini apenas enriquece texto
- erro no Gemini nunca bloqueia atualizacao
- erro no MCP nunca deve quebrar o frontend
- `radar.json` nao e sobrescrito com lista vazia ou payload invalido
- a escrita continua atomica

## O Que Ainda Esta em Fallback ou Mock

- varios ativos ainda podem depender de cache ou mock fora da lista gratuita da brapi
- os mocks internos permanecem como ultima camada de seguranca
- o texto enriquecido pelo Gemini e opcional e pode nao existir em todas as atualizacoes

## Custo Esperado no Free Tier

Esperado: custo zero, desde que o uso continue dentro do free tier.

Cenario atual:

- 1 chamada diaria ao MCP para fundamentos
- 1 chamada diaria ao Gemini no maximo
- prompt reduzido e uma unica resposta JSON curta

Na pratica, esse desenho deve ficar confortavelmente dentro do free tier do `gemini-1.5-flash` para um MVP com atualizacao diaria, mas a disponibilidade exata continua sujeita aos limites vigentes da conta e da API.
