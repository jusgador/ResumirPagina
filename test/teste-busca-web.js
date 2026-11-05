// Teste offline da pesquisa na web (+ Web): carrega o userscript no Node, com
// GM_xmlhttpRequest simulado, e confere os pedidos montados para cada provedor
// e a leitura do streaming. Não chama nenhuma API.
//
// Uso: node test/teste-busca-web.js [resumir-pagina.user.js | resumir-pagina-celular.user.js]

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const arquivo = path.resolve(__dirname, '..', process.argv[2] || 'resumir-pagina.user.js');
let codigo = fs.readFileSync(arquivo, 'utf8');
// Expõe o que o teste precisa, de dentro do escopo do script.
const gancho = `
    globalThis.__rp = {
        definir(nome, valor) { eval(nome + ' = valor'); },
        ler(nome) { return eval(nome); },
        montarPedido, criarLeitor, mensagensDeResultado, modoBusca, suportaBusca, responder,
    };
})();`;
const fimIIFE = codigo.lastIndexOf('})();');
assert.ok(fimIIFE > 0, 'não achei o fim do script');
codigo = codigo.slice(0, fimIIFE) + gancho + codigo.slice(fimIIFE + 5);

// ---------------- ambiente simulado ----------------
const fila = [];        // respostas esperadas, na ordem dos pedidos
const pedidos = [];     // pedidos feitos: { url, body }
let armazenado = '{}';
const elementoFalso = () => new Proxy(function () {}, {
    get: (alvo, k) => (k === Symbol.toPrimitive ? () => '' : elementoFalso()),
    apply: () => elementoFalso(),
    set: () => true,
});
const contexto = {
    console,
    URL,
    TextDecoder,
    setTimeout: (f) => { f(); return 0; },
    window: { addEventListener() {}, getSelection: () => '', innerWidth: 1200 },
    document: {
        querySelector: () => null, createElement: () => elementoFalso(), documentElement: elementoFalso(),
        visibilityState: 'visible', addEventListener() {}, removeEventListener() {},
    },
    location: { href: 'https://exemplo.test/pagina' },
    GM_getValue: () => armazenado,
    GM_setValue: (k, v) => { armazenado = v; },
    GM_setClipboard() {},
    GM_xmlhttpRequest(op) {
        const corpo = op.data ? JSON.parse(op.data) : undefined;
        pedidos.push({ url: op.url, body: corpo });
        const resp = fila.shift();
        if (!resp) throw new Error('pedido inesperado: ' + op.url);
        Promise.resolve().then(() => {
            if (typeof resp === 'string') {
                const r = { status: 200, responseText: resp };
                if (op.onprogress) op.onprogress(r);
                op.onload(r);
            } else {
                op.onload({ status: 200, responseText: JSON.stringify(resp) });
            }
        });
        return { abort() {} };
    },
};
contexto.globalThis = contexto;
vm.createContext(contexto);
vm.runInContext(codigo, contexto, { filename: arquivo });
const rp = contexto.__rp;

// A interface vira no-op: o teste olha só o estado da resposta.
for (const f of ['atualizarInfo', 'agendarDesenho', 'marcarOcupado', 'desenharConversa']) rp.definir(f, () => {});

const json = (x) => JSON.parse(JSON.stringify(x)); // arrays do vm têm outro protótipo
const sse = (eventos) => eventos.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');

function preparar(provedor, buscaWeb) {
    const cfg = rp.ler('cfg');
    cfg.provedor = provedor;
    cfg.buscaWeb = buscaWeb || 'nativa';
    cfg.chaves = { anthropic: 'sk-a', openai: 'sk-o', gemini: 'k-g', deepseek: 'sk-d' };
    rp.definir('estado', {
        url: 'https://exemplo.test/pagina',
        conversa: [
            { papel: 'user', texto: 'Resuma.\n\n<pagina>texto</pagina>' },
            { papel: 'assistant', texto: 'Resumo.' },
            { papel: 'user', texto: 'Qual a notícia de hoje?', nivel: 'web' },
        ],
    });
    pedidos.length = 0;
}
const resposta = () => { const c = rp.ler('estado').conversa; return c[c.length - 1]; };

const testes = [];
const teste = (nome, f) => testes.push([nome, f]);

// ---------------- Anthropic ----------------
teste('Anthropic nativa: consulta, fontes e texto', async () => {
    preparar('anthropic');
    fila.push(sse([
        { type: 'message_start', message: {} },
        { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"notícias hoje"}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [
            { type: 'web_search_result', title: 'Jornal', url: 'https://www.jornal.test/a', encrypted_content: 'x', page_age: '5 de nov.' },
        ] } },
        { type: 'content_block_stop', index: 1 },
        { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Hoje saiu X.' } },
        { type: 'content_block_stop', index: 2 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.erro, undefined, r.erro);
    assert.strictEqual(r.texto, 'Hoje saiu X.');
    assert.strictEqual(r.buscas.length, 1);
    assert.strictEqual(r.buscas[0].consulta, 'notícias hoje');
    assert.deepStrictEqual(json(r.buscas[0].resultados.map(x => [x.titulo, x.site, x.data])), [['Jornal', 'jornal.test', '5 de nov.']]);
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(pedidos[0].body.tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
});

teste('Anthropic nativa: erro da busca e pause_turn', async () => {
    preparar('anthropic');
    fila.push(sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: {} } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"a"}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'content_block_start', index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 'srv1', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } } },
        { type: 'content_block_stop', index: 2 },
        { type: 'message_delta', delta: { stop_reason: 'pause_turn' } },
    ]));
    fila.push(sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sem dados.' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.texto, 'Sem dados.');
    assert.match(r.buscas[0].erro, /unavailable/);
    assert.strictEqual(pedidos.length, 2);
    const ultima = pedidos[1].body.messages[pedidos[1].body.messages.length - 1];
    assert.strictEqual(ultima.role, 'assistant');
    assert.deepStrictEqual(ultima.content.map(b => b.type), ['server_tool_use', 'web_search_tool_result'], 'bloco de texto vazio deveria sair');
    assert.deepStrictEqual(ultima.content[0].input, { query: 'a' });
    assert.ok(!('_json' in ultima.content[0]));
});

teste('Anthropic com busca da DeepSeek', async () => {
    preparar('anthropic', 'deepseek');
    fila.push(sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Vou pesquisar. ' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu1', name: 'pesquisar_web', input: {} } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"consulta":"x"}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]));
    fila.push({ results: [{ title: 'T', url: 'https://t.test', site_name: 't', summary: 's' }] });
    fila.push(sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Resposta.' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.texto, 'Resposta.');
    assert.strictEqual(r.buscas[0].consulta, 'x');
    assert.strictEqual(pedidos[0].body.tools[0].name, 'pesquisar_web');
    assert.ok(pedidos[0].body.tools[0].input_schema);
    assert.strictEqual(pedidos[1].url, 'https://api.deepseek.com/v1/tools/search');
    const msgs = pedidos[2].body.messages;
    assert.deepStrictEqual(msgs[msgs.length - 2].content.map(b => b.type), ['text', 'tool_use']);
    assert.strictEqual(msgs[msgs.length - 1].role, 'user');
    assert.strictEqual(msgs[msgs.length - 1].content[0].type, 'tool_result');
    assert.strictEqual(msgs[msgs.length - 1].content[0].tool_use_id, 'tu1');
});

// ---------------- OpenAI ----------------
teste('OpenAI nativa (Responses API)', async () => {
    preparar('openai');
    fila.push(sse([
        { type: 'response.created', response: {} },
        { type: 'response.output_item.added', item: { type: 'web_search_call', id: 'ws1', status: 'in_progress' } },
        { type: 'response.output_item.done', item: { type: 'web_search_call', id: 'ws1', status: 'completed',
            action: { type: 'search', query: 'notícias', sources: [{ type: 'url', url: 'https://g1.test/n' }] } } },
        { type: 'response.output_text.delta', delta: 'Saiu X ' },
        { type: 'response.output_text.annotation.added', annotation: { type: 'url_citation', url: 'https://g1.test/n', title: 'G1' } },
        { type: 'response.output_text.delta', delta: '(G1).' },
        { type: 'response.completed', response: {} },
    ]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.erro, undefined, r.erro);
    assert.strictEqual(r.texto, 'Saiu X (G1).');
    assert.strictEqual(pedidos[0].url, 'https://api.openai.com/v1/responses');
    assert.deepStrictEqual(pedidos[0].body.tools, [{ type: 'web_search' }]);
    assert.strictEqual(pedidos[0].body.input.length, 3);
    assert.strictEqual(r.buscas.length, 1);
    assert.strictEqual(r.buscas[0].consulta, 'notícias');
    assert.strictEqual(r.buscas[0].resultados[0].url, 'https://g1.test/n');
});

teste('OpenAI nativa sem lista de fontes usa as citações', async () => {
    preparar('openai');
    fila.push(sse([
        { type: 'response.output_item.done', item: { type: 'web_search_call', id: 'ws1', status: 'completed', action: { type: 'search', query: 'q' } } },
        { type: 'response.output_text.delta', delta: 'Ok.' },
        { type: 'response.output_text.annotation.added', annotation: { type: 'url_citation', url: 'https://a.test', title: 'A' } },
        { type: 'response.output_text.annotation.added', annotation: { type: 'url_citation', url: 'https://a.test', title: 'A' } },
        { type: 'response.completed', response: {} },
    ]));
    await rp.responder();
    assert.deepStrictEqual(json(resposta().buscas[0].resultados.map(x => x.titulo)), ['A']);
});

teste('OpenAI nativa: erro no streaming', async () => {
    preparar('openai');
    fila.push(sse([{ type: 'response.failed', response: { error: { message: 'deu ruim' } } }]));
    await rp.responder();
    assert.match(resposta().erro, /deu ruim/);
});

teste('OpenAI com busca da DeepSeek (Chat Completions)', async () => {
    preparar('openai', 'deepseek');
    fila.push(sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'pesquisar_web', arguments: '{"consulta":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"y"}' } }] }, finish_reason: 'tool_calls' }] },
    ]));
    fila.push({ results: [] });
    fila.push(sse([{ choices: [{ delta: { content: 'Nada achei.' }, finish_reason: 'stop' }] }]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.texto, 'Nada achei.');
    assert.strictEqual(pedidos[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.strictEqual(pedidos[0].body.tools[0].function.name, 'pesquisar_web');
    const msgs = pedidos[2].body.messages;
    assert.strictEqual(msgs[msgs.length - 1].role, 'tool');
    assert.strictEqual(msgs[msgs.length - 1].content, 'Nenhum resultado para esta busca.');
});

teste('OpenAI sem + Web continua na Chat Completions', async () => {
    preparar('openai');
    rp.ler('estado').conversa[2].nivel = 'conhecimento';
    fila.push(sse([{ choices: [{ delta: { content: 'Ok' } }] }]));
    await rp.responder();
    assert.strictEqual(pedidos[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.strictEqual(pedidos[0].body.tools, undefined);
});

// ---------------- Gemini ----------------
teste('Gemini nativa (Google Search)', async () => {
    preparar('gemini');
    fila.push(sse([
        { candidates: [{ content: { role: 'model', parts: [{ text: 'Hoje ' }] } }] },
        { candidates: [{ content: { role: 'model', parts: [{ text: 'saiu X.' }] }, finishReason: 'STOP',
            groundingMetadata: { webSearchQueries: ['q1', 'q2'], groundingChunks: [
                { web: { uri: 'https://vertexaisearch.test/r1', title: 'g1.test' } },
                { web: { uri: 'https://vertexaisearch.test/r2', title: 'uol.test' } },
            ] } }] },
    ]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.texto, 'Hoje saiu X.');
    assert.deepStrictEqual(pedidos[0].body.tools, [{ google_search: {} }]);
    assert.strictEqual(r.buscas.length, 1);
    assert.strictEqual(r.buscas[0].n, 2);
    assert.strictEqual(r.buscas[0].consulta, 'q1 · q2');
    assert.strictEqual(r.buscas[0].resultados.length, 2);
});

teste('Gemini com busca da DeepSeek', async () => {
    preparar('gemini', 'deepseek');
    fila.push(sse([{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'pesquisar_web', args: { consulta: 'z' } }, thoughtSignature: 'sig' }] }, finishReason: 'STOP' }] }]));
    fila.push({ results: [{ title: 'Z', url: 'https://z.test' }] });
    fila.push(sse([{ candidates: [{ content: { role: 'model', parts: [{ text: 'Feito.' }] }, finishReason: 'STOP' }] }]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.texto, 'Feito.');
    assert.strictEqual(pedidos[0].body.tools[0].functionDeclarations[0].name, 'pesquisar_web');
    const c = pedidos[2].body.contents;
    assert.strictEqual(c[c.length - 2].role, 'model');
    assert.strictEqual(c[c.length - 2].parts[0].thoughtSignature, 'sig');
    assert.strictEqual(c[c.length - 1].parts[0].functionResponse.name, 'pesquisar_web');
});

// ---------------- DeepSeek e regras gerais ----------------
teste('DeepSeek continua igual, com limite de buscas', async () => {
    preparar('deepseek', 'nativa');
    const pedeBusca = (i) => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c' + i, function: { name: 'pesquisar_web', arguments: `{"consulta":"q${i}"}` } }] }, finish_reason: 'tool_calls' }] }]);
    for (let i = 0; i < 3; i++) { fila.push(pedeBusca(i)); fila.push({ results: [] }); }
    fila.push(sse([{ choices: [{ delta: { content: 'Fim.' }, finish_reason: 'stop' }] }]));
    await rp.responder();
    const r = resposta();
    assert.strictEqual(r.texto, 'Fim.');
    assert.strictEqual(r.buscas.length, 3);
    assert.strictEqual(pedidos[pedidos.length - 1].body.tool_choice, 'none');
    assert.deepStrictEqual(pedidos[0].body.thinking, { type: 'disabled' });
});

teste('Busca da DeepSeek sem a chave dela desliga o + Web', async () => {
    preparar('anthropic', 'deepseek');
    rp.ler('cfg').chaves.deepseek = '';
    assert.strictEqual(rp.suportaBusca('anthropic'), false);
    rp.ler('cfg').buscaWeb = 'nativa';
    assert.strictEqual(rp.suportaBusca('anthropic'), true);
    assert.strictEqual(rp.modoBusca('deepseek'), 'funcao');
});

teste('Resumo (primeiro turno) nunca pesquisa', async () => {
    preparar('anthropic');
    rp.ler('estado').conversa.splice(1);
    fila.push(sse([{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'R' } }]));
    await rp.responder();
    assert.strictEqual(pedidos[0].body.tools, undefined);
});

(async () => {
    let falhas = 0;
    for (const [nome, f] of testes) {
        fila.length = 0;
        try { await f(); console.log('ok    ' + nome); }
        catch (e) { falhas++; console.log('FALHA ' + nome + '\n      ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')); }
        if (fila.length) { falhas++; console.log('FALHA ' + nome + ': sobraram ' + fila.length + ' resposta(s) na fila'); }
    }
    console.log(`\n${path.basename(arquivo)}: ${testes.length - falhas}/${testes.length} ok`);
    process.exitCode = falhas ? 1 : 0;
})();
