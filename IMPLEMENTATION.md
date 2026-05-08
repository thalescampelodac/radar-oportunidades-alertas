# Radar de Oportunidades e Alertas

## Status da Implementação

O projeto está com:

- frontend funcional consumindo apenas `GET /api/radar`
- atualização automática diária com cache de 24 horas
- integração real com `brapi.dev` no backend
- fallback seguro para dados já salvos em disco
- fallback final para mocks internos
- Gemini ainda desativado

## Variáveis de Ambiente

Crie um `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

### `BRAPI_API_KEY` (opcional)

Use esta variável se quiser ampliar o acesso da integração com a `brapi.dev`.

```env
BRAPI_API_KEY=seu_token_aqui
```

Comportamento atual:

- sem `BRAPI_API_KEY`: o projeto usa a lista gratuita reduzida suportada pela brapi
- com `BRAPI_API_KEY`: a mesma integração backend pode ser expandida sem expor token no frontend
- se a brapi falhar: o radar mantém cache local e mocks

### `CRON_SECRET` (recomendado)

Protege o endpoint `POST /api/cron/update-radar`.

```env
CRON_SECRET=uma_string_grande_e_aleatoria
```

Se `CRON_SECRET` estiver definido, o endpoint exige:

```http
Authorization: Bearer SEU_CRON_SECRET
```

### `GEMINI_API_KEY`

Já está prevista no `.env.example`, mas ainda **não é usada nesta etapa**.

## Fluxo Atual

1. O frontend chama apenas `GET /api/radar`.
2. O endpoint lê `data/radar.json` e `data/radar-meta.json`.
3. Se a leitura falhar, o endpoint responde com um payload seguro vazio em vez de quebrar a interface.
4. A atualização diária roda via `scripts/update-radar.ts` ou `POST /api/cron/update-radar`.
5. A atualização tenta buscar dados reais via `brapi.dev`.
6. Se a brapi falhar, o sistema usa o radar atual do disco.
7. Se também não houver cache válido, o sistema cai para mocks internos.
8. `radar.json` só é sobrescrito quando o resultado é válido e suficiente para persistência.

## Hardening Aplicado

### Resiliência do frontend

- `GET /api/radar` nunca depende diretamente da brapi
- o frontend nunca chama APIs externas
- se o arquivo local estiver ausente ou inválido, a API devolve payload seguro com listas vazias

### Segurança de persistência

- `radar.json` é validado antes de ser salvo
- `radar-meta.json` é validado antes de ser salvo
- a escrita é atômica usando arquivo temporário + rename
- listas vazias ou resultados insuficientes não sobrescrevem o radar atual
- em caso de erro, o cache atual é preservado

### Atualização diária

- respeita intervalo mínimo de 24 horas
- retorna cache se ainda estiver no período válido
- registra logs simples das etapas principais
- não ativa Gemini

## Como Testar

### 1. Desenvolvimento

```bash
npm install
npm run dev
```

### 2. Validar build

```bash
npm run build
```

### 3. Testar `GET /api/radar`

Com o app rodando localmente:

```bash
curl http://localhost:3000/api/radar
```

Resposta esperada:

- `data.opportunities`
- `data.alerts`
- `meta.lastUpdateTime`
- `meta.nextUpdateTime`

Mesmo se o arquivo local falhar, a rota deve continuar respondendo com JSON renderizável.

### 4. Testar `POST /api/cron/update-radar`

Sem `CRON_SECRET`:

```bash
curl -X POST http://localhost:3000/api/cron/update-radar
```

Com `CRON_SECRET` configurado:

```bash
curl -X POST http://localhost:3000/api/cron/update-radar \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 5. Conferir arquivos persistidos

Depois da atualização:

```bash
cat data/radar.json
cat data/radar-meta.json
```

## O Que Ainda Está em Fallback ou Mock

Os itens abaixo ainda não são totalmente reais nesta fase:

- a lista monitorada continua dependente de fallback para vários ativos fora da lista gratuita da brapi
- os mocks internos continuam existindo como última camada de segurança
- se a brapi não responder ou responder parcialmente, o sistema completa com cache local
- Gemini ainda não participa da análise

## Limitações Atuais

- a lista gratuita sem token da brapi é reduzida
- sem `BRAPI_API_KEY`, a cobertura real é parcial
- a classificação continua baseada em regras estáticas, sem camada de IA
- este projeto depende de JSON local em disco, então o comportamento em ambientes serverless precisa considerar persistência efêmera
