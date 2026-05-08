# Radar de Oportunidades e Alertas

## Arquitetura Atual

O projeto agora opera em dois modos compatíveis:

- desenvolvimento local:
  - frontend Next.js
  - `GET /api/radar` lendo `data/radar.json`
  - MCP via servidor local em `http://127.0.0.1:3031/mcp`
  - persistência em JSON local
- produção no Vercel:
  - frontend Next.js
  - `GET /api/radar` lendo storage durável via Vercel Blob
  - MCP em transporte interno, sem processo separado
  - atualização diária por Vercel Cron

O contrato do frontend não muda:

- o frontend continua chamando apenas `GET /api/radar`
- o frontend nunca fala com brapi nem Gemini
- score e categoria continuam vindo das regras locais

## Fluxo Completo

1. O frontend chama `GET /api/radar`.
2. A rota lê o radar persistido mais recente.
3. Em desenvolvimento, a leitura vem de `/data/radar.json` e `/data/radar-meta.json`.
4. Em produção com Blob configurado, a leitura vem de:
   - `radar/radar.json`
   - `radar/radar-meta.json`
5. O cron diário chama `GET /api/cron/update-radar`.
6. A rota valida `CRON_SECRET`.
7. O update respeita o cache de 24 horas.
8. Se a janela permitir, `update-radar.ts` chama `lib/mcp-client.ts`.
9. O cliente MCP:
   - usa HTTP local em desenvolvimento
   - usa execução interna em-processo no Vercel
10. A tool `get_stock_fundamentals` consulta a `brapi.dev`.
11. Os dados reais passam por `stock-rules.ts`.
12. As regras locais definem score, categoria, riscos e justificativas base.
13. Se `GEMINI_API_KEY` existir, o radar classificado recebe 1 chamada opcional de enriquecimento textual.
14. O Gemini pode enriquecer:
   - `summary`
   - `educationalNote`
   - justificativas e notas educativas por ativo
15. Se Gemini falhar, o radar segue com texto local.
16. Se a brapi ou o MCP falharem, o sistema reaproveita o radar atual e completa com fallback local/mock.
17. O radar só é persistido se o resultado final for válido e suficiente.

## Persistência

### Desenvolvimento local

Arquivos usados:

- `data/radar.json`
- `data/radar-meta.json`

### Produção no Vercel

Blob pathnames usados:

- `radar/radar.json`
- `radar/radar-meta.json`

O Blob é usado automaticamente quando `BLOB_READ_WRITE_TOKEN` estiver presente.

Se o token não existir:

- localmente o projeto continua usando JSON
- no Vercel o deploy ainda sobe usando os arquivos versionados do repositório
- mas a atualização diária não terá persistência durável

## Variáveis de Ambiente

Copie:

```bash
cp .env.example .env.local
```

### Obrigatórias em produção

```env
CRON_SECRET=
BLOB_READ_WRITE_TOKEN=
```

### Opcionais

```env
BRAPI_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
RADAR_STORAGE_MODE=
RADAR_BLOB_ACCESS=private
MCP_TRANSPORT=
```

Uso:

- `CRON_SECRET`
  - protege `GET /api/cron/update-radar` e `POST /api/cron/update-radar`
- `BLOB_READ_WRITE_TOKEN`
  - habilita persistência durável no Vercel Blob
- `BRAPI_API_KEY`
  - opcional para ampliar cobertura da brapi
- `GEMINI_API_KEY`
  - opcional para enriquecimento textual
- `RADAR_STORAGE_MODE`
  - vazio: auto
  - `local`: força JSON local
  - `blob`: força Blob
- `RADAR_BLOB_ACCESS`
  - padrão `private`
- `MCP_TRANSPORT`
  - vazio: auto
  - `http`: força MCP via servidor local
  - `internal`: força MCP em-processo

## Como Configurar no Vercel

### 1. Criar um Blob Store

No dashboard do projeto:

1. abra `Storage`
2. crie um `Blob`
3. escolha acesso `private`
4. conecte o store ao projeto

Isso injeta `BLOB_READ_WRITE_TOKEN` no ambiente do projeto.

### 2. Configurar envs do projeto

No Vercel, configure:

```env
CRON_SECRET=um_token_forte
BRAPI_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
RADAR_BLOB_ACCESS=private
```

### 3. Deploy

Depois do deploy, o `vercel.json` ativa 1 cron diário em:

- `GET /api/cron/update-radar`

Schedule atual:

- `0 11 * * *`

Observação:

- no Hobby, a execução diária acontece em UTC e pode ocorrer em qualquer minuto da hora agendada

## Como Testar Localmente

### Fluxo local com MCP HTTP

```bash
npm install
npm run mcp:start
npm run dev
curl http://localhost:3000/api/radar
curl -X POST http://localhost:3000/api/cron/update-radar -H "Authorization: Bearer $CRON_SECRET"
```

### Simular modo Vercel sem subir o MCP local

```bash
export MCP_TRANSPORT=internal
npm run dev
curl -X POST http://localhost:3000/api/cron/update-radar -H "Authorization: Bearer $CRON_SECRET"
```

### Testar a rota de cron no formato do Vercel

```bash
curl http://localhost:3000/api/cron/update-radar \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Fallbacks Mantidos

- se o MCP falhar, o radar atual é preservado
- se a brapi responder parcialmente, o restante é completado com cache/mock
- se Gemini falhar, o texto local continua
- `radar.json` e `radar-meta.json` não são sobrescritos com payload vazio ou inválido
- o frontend continua funcional mesmo sem atualização nova

## O Que Ainda Permanece em Fallback ou Mock

- parte do universo de tickers continua vindo de fallback quando a brapi gratuita não cobre tudo
- sem `BRAPI_API_KEY`, a coleta real fica reduzida à lista gratuita suportada
- os mocks internos continuam como última camada de segurança

## Comandos para Validar

### Local

```bash
npm install
npm run dev
npm run build
npm run mcp:start
```

### Rotas

```bash
curl http://localhost:3000/api/radar
curl http://localhost:3000/api/cron/update-radar -H "Authorization: Bearer $CRON_SECRET"
curl -X POST http://localhost:3000/api/cron/update-radar -H "Authorization: Bearer $CRON_SECRET"
```

### Produção

```bash
curl https://SEU-DOMINIO/api/radar
curl https://SEU-DOMINIO/api/cron/update-radar -H "Authorization: Bearer SEU_CRON_SECRET"
```
