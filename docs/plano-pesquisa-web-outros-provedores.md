# Plano: pesquisa na web (+ Web) nos outros provedores

Situação: proposto em 2026-11-04 e implementado em 2026-11-05 (fases A e B), nas versões 0.3.0 (computador) e 0.2.0 (celular). Testado offline (`test/teste-busca-web.js`) e nas páginas de teste. Teste real em 2026-11-05, na Developer Edition: funcionaram a busca nativa da Anthropic (Haiku 5.5), a Anthropic com a busca da DeepSeek e a DeepSeek. **Falta** testar OpenAI e Gemini com as APIs de verdade, porque o Tampermonkey da Developer Edition não tem as chaves deles.

Decisões tomadas na implementação, diferentes do plano original:
- Anthropic: sempre `web_search_20250305`, que o Haiku 5.5 aceita. As versões com filtragem dinâmica exigem `allowed_callers` conforme o modelo e mandam blocos de execução de código no streaming.
- Fase B: opção `buscaWeb` ('nativa' | 'deepseek') em ⚙ → Perguntas. Sem a chave da DeepSeek, o + Web fica desativado.
- Ainda **não confirmados na documentação**: o `max_tool_calls` da Responses API e os detalhes de `functionCall`/`functionResponse` na generateContent do Gemini (a documentação nova do Google trata da Interactions API). Se um desses der erro 400 no teste real, é por aí.

## Como funciona hoje (DeepSeek)

Busca feita pelo script, por meio de uma função que o modelo chama. Os nomes abaixo existem nos dois arquivos, `resumir-pagina.user.js` e `resumir-pagina-celular.user.js`, que são independentes e precisam receber a mesma mudança:

- `PROVEDORES.deepseek.buscaNaWeb: true` e `suportaBusca(provedor)`: ligam o botão **+ Web**.
- `FERRAMENTA_BUSCA`: função `pesquisar_web({consulta})`, no formato OpenAI.
- `montarPedido`: só põe `body.tools` quando o provedor é a DeepSeek. Na última volta manda `tool_choice: 'none'` (`semMaisBuscas`).
- `lerEvento`: junta `delta.tool_calls` em `r.chamadas`.
- `responder`: repete até `MAX_BUSCAS` (3) vezes: o modelo pede, `pesquisarDeepSeek` (`/v1/tools/search`) pesquisa, a resposta volta como `role: 'tool'` em `voltas` (`{ bruto }`), e o modelo continua.
- `resposta.buscas = [{ consulta, resultados: [{titulo, url, site, data, resumo}], erro }]`, que `desenharBuscas` mostra e a cópia em Markdown inclui.

## Decisão

1. **Fase A (principal):** usar a busca nativa de cada provedor. Basta a chave do próprio provedor.
2. **Fase B (opcional, depois):** em ⚙, "usar a busca da DeepSeek com qualquer modelo", porque é mais barata e tem o mesmo limite e a mesma exibição para todos.

Dá para fazer a fase B só para a OpenAI antes de tudo, como teste barato: a Chat Completions usa o mesmo formato de ferramenta da DeepSeek.

## Fase A: busca nativa

### Estrutura comum
- [ ] `buscaNaWeb` passa de booleano para `'funcao'` (deepseek) ou `'nativa'` (anthropic, openai, gemini). `suportaBusca` continua devolvendo `!!buscaNaWeb`.
- [ ] `lerEvento` passa a devolver também `consulta` (busca iniciada) e `fontes` (lista no formato `{titulo, url, site, data, resumo}`).
- [ ] No `responder`, no modo `'nativa'`, `consulta` e `fontes` preenchem `resposta.buscas` (ligando cada fonte à última consulta aberta). O ciclo de várias voltas fica só para `'funcao'`, mais o `pause_turn` da Anthropic.
- [ ] O prompt de `sistema('web')` deixa de citar `pesquisar_web` pelo nome quando a busca é nativa ("você pode pesquisar na web…"). A seção "Na web" e o limite de 3 buscas continuam.
- [ ] Tirar os textos "por enquanto só a DeepSeek": a dica (`title`) do botão em `atualizarNiveis`, a nota em ⚙ → Perguntas e o README.

### Anthropic
- [ ] `tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]`. **A conferir:** a `web_search_20260209` (filtragem dinâmica) é documentada para Opus/Sonnet 5.x, mas não para o Haiku 5.5 (modelo padrão). Escolher a versão pelo modelo, como já se faz com `effort`.
- [ ] Streaming:
  - `content_block_start` com `content_block.type === 'server_tool_use'`: começa uma busca, e a consulta chega por `input_json_delta` (`{"query": ...}`). Juntar pelo `index` do bloco.
  - `content_block_start` com `web_search_tool_result`: `content` em **lista** (`{type:'web_search_result', url, title, page_age}`) são as fontes; em **objeto** (`{error_code}`) é erro da busca, que não chega como erro HTTP.
  - Texto com `citations_delta`: pode ser ignorado no começo, já que o prompt pede os links na seção "Na web".
- [ ] `stop_reason: 'pause_turn'`: reenviar com a mensagem do assistente tal como veio (blocos crus, inclusive `encrypted_content`). Para isso o streaming tem de remontar os blocos; dá para reaproveitar o `bruto` de `voltas`.

### OpenAI
- [ ] A Chat Completions não tem busca para o `gpt-5-mini`. **Só no nível web**, mandar para `POST /v1/responses` com `tools: [{ type: 'web_search' }]`, `input` (mensagens) e `instructions` (sistema), com `reasoning: { effort: 'low' }` nos gpt-5/o*. Os outros níveis continuam na Chat Completions.
- [ ] Streaming da Responses: `response.output_text.delta` (texto), itens `web_search_call` (`action.query`, para a consulta), `response.output_text.annotation.added` / anotações `url_citation` (`url`, `title`, para as fontes), `response.completed` / `response.failed` / `error`.
- [ ] Não há como limitar o número de buscas: o limite fica só no prompt.

### Gemini
- [ ] `tools: [{ google_search: {} }]` no corpo. **A conferir** se o `gemini-flash-lite-latest` aceita grounding.
- [ ] Em cada evento, `candidates[0].groundingMetadata`: `webSearchQueries` (consultas) e `groundingChunks[].web.{uri, title}` (fontes). A `uri` é um redirecionador do Google (vertexaisearch…); o título costuma ser o domínio. Tirar as duplicatas, porque o metadado pode se repetir entre eventos.
- [ ] Também não há limite de buscas, só pelo prompt.

## Fase B: busca da DeepSeek com qualquer modelo (opcional)

- [ ] Opção em ⚙ → Perguntas: "Pesquisar pela DeepSeek (mais barato; exige chave da DeepSeek)". Com ela ligada, `buscaNaWeb` vale `'funcao'` para todos, e `pesquisarDeepSeek` usa `cfg.chaves.deepseek`.
- [ ] OpenAI: só liberar `body.tools`/`tool_choice` para `openai` também.
- [ ] Anthropic: ferramenta `{ name: 'pesquisar_web', description, input_schema }`. A chamada chega como bloco `tool_use` (`input_json_delta`) e o resultado volta como `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }`; a mensagem do assistente vai com os blocos `text` + `tool_use`. Na última volta, `tool_choice: { type: 'none' }`; o tipo forçado (`any`/`tool`) dá 400 nos modelos 5.x, mas `none` funciona.
- [ ] Gemini: `tools: [{ functionDeclarations: [...] }]`. A chamada chega inteira na parte `functionCall` e o resultado volta como `{ role: 'user', parts: [{ functionResponse: { name, response } }] }`. Na última volta, `toolConfig: { functionCallingConfig: { mode: 'NONE' } }`.
- [ ] Generalizar `voltas`/`bruto`, que hoje estão no formato OpenAI, para o formato de cada provedor (montar com uma função por provedor).

## Custos (confirmar antes de pôr no README)

- DeepSeek: US$ 0,75 por 1.000 buscas (nov/2026, já no README).
- Anthropic: costumava ser US$ 10 por 1.000 buscas, mais os tokens dos resultados.
- OpenAI e Gemini: cobram por busca ou por pedido com grounding, mais os tokens. Conferir as páginas de preço.

## Testes

- [ ] `test/pagina-teste.html` e `test/pagina-teste-celular.html` na Firefox Developer Edition (padrão), com uma pergunta que exija informação atual, em cada provedor: a seção "Na web" sai com links, e a caixa "N busca(s) na web" mostra consultas e fontes.
- [ ] Erros: chave sem permissão de busca e busca que falha (por exemplo, um domínio bloqueado na Anthropic), além de parar a resposta no meio de uma busca (`pararPedido`).
- [ ] Copiar em Markdown com buscas.
- [ ] Chamadas pagas com as minhas chaves: pedir confirmação antes de testar.

## Versões e publicação

- Computador: 0.2.2 → **0.3.0**. Celular: 0.1.4 → **0.2.0**. Nenhuma versão com 13.
- README: atualizar a seção "Perguntas: só a página, conhecimento ou web" (como funciona em cada provedor e o custo).
- Antes de publicar, perguntar se quero conferir no Firefox principal.
