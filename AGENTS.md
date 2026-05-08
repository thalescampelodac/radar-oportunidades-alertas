# Radar de Oportunidades e Alertas

## Visão do Projeto

Crie um MVP chamado **Radar de Oportunidades e Alertas** usando **Next.js com TypeScript**.

O sistema deve exibir um radar educacional de ações brasileiras, baseado em fundamentos, separando os ativos em:

1. **Oportunidades**: ações com bons fundamentos e possível atratividade.
2. **Alertas**: ações com sinais ruins, deterioração ou risco elevado.

Este projeto **não é uma recomendação financeira**. É apenas um radar educativo baseado em dados públicos e gratuitos.

---

## Objetivo da Tela

Criar uma interface simples, moderna e responsiva que mostre:

- Ranking de oportunidades
- 5 ações em alerta para evitar, acompanhar com cuidado ou desfazer
- Nota de 0 a 10 para cada ativo
- Justificativa objetiva
- Métricas principais
- Última atualização
- Aviso educacional de que não é recomendação financeira
- Status: `Atualização automática diária`

---

## Regras Obrigatórias de Custo

O projeto deve funcionar com custo zero.

Regras:

- Usar somente serviços gratuitos.
- Não usar APIs pagas.
- Não usar banco de dados pago.
- Persistir dados em arquivos JSON locais dentro da pasta `/data`.
- Não estourar o free tier do Gemini.
- O Gemini deve ser chamado no máximo 1 vez a cada 24 horas.
- Criar controle de cache para impedir chamadas repetidas.
- Não criar atualização em tempo real.
- Não criar polling no frontend.
- Não criar botão manual de atualização.
- Evitar dependências desnecessárias.

---

## Regras de Atualização

A atualização do radar deve acontecer automaticamente apenas **1 vez por dia**.

O frontend:

- Nunca deve chamar o Gemini diretamente.
- Nunca deve chamar APIs externas de ações diretamente.
- Deve apenas consumir o endpoint `GET /api/radar`.
- Deve apenas exibir os dados já salvos em `/data/radar.json`.

A atualização diária:

- Deve ser feita por um job, script ou endpoint interno.
- Deve verificar `/data/radar-meta.json`.
- Se o radar já foi atualizado nas últimas 24 horas, deve retornar cache.
- Se passou o intervalo mínimo de 24 horas, pode executar uma nova atualização.
- Após atualizar, deve salvar o resultado em `/data/radar.json`.
- Após atualizar, deve atualizar `/data/radar-meta.json`.

---

## Estrutura Desejada

Use esta estrutura como referência:

```text
/app
  /api
    /radar
      route.ts
    /cron
      /update-radar
        route.ts

/data
  radar.json
  radar-meta.json

/lib
  gemini.ts
  mcp-client.ts
  stock-rules.ts
  radar-storage.ts
  types.ts

/scripts
  update-radar.ts

/mcp-server
  server.ts