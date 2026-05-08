/**
 * Servidor MCP (Model Context Protocol)
 *
 * Este servidor será usado para:
 * - Integrar com APIs de dados de ações (B3, APIs públicas)
 * - Buscar fundamentos em tempo real
 * - Servir como intermediário entre o app Next.js e fontes de dados externas
 *
 * Implementação futura com:
 * - @modelcontextprotocol/sdk
 * - Integração com APIs como yfinance, fundamentus, etc
 *
 * Para começar:
 * 1. npm install @modelcontextprotocol/sdk
 * 2. Implementar tools para:
 *    - get_stock_data(ticker)
 *    - get_stock_fundamentals(ticker)
 *    - get_multiple_stocks(tickers[])
 * 3. Iniciar o servidor em uma porta específica
 * 4. Apontar o cliente MCP em /lib/mcp-client.ts para este servidor
 */

// TODO: Implementar quando dependências forem adicionadas

export function initMCPServer(): void {
  console.log("MCP Server: A ser implementado");
  // Será implementado em futuro próximo
}
