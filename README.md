# Resumir página com IA

Userscript que resume a página aberta (ou só o trecho selecionado) com **Alt+R**, pela API da **Anthropic (Claude)**, **OpenAI (GPT)**, **Google (Gemini)** ou **DeepSeek**. O resumo aparece num painel lateral com Markdown, e dá para continuar perguntando sobre a página.

Nada aparece na página até você apertar o atalho: sem botão, sem selo.

## Por que não usar a barra lateral de IA do Firefox

O chatbot da barra lateral só abre o site do Gemini (ou ChatGPT, Claude…) num painel. Para "Resumir página", o Firefox tenta extrair o texto pelo Modo Leitura. Quando a página não parece um artigo (feed do Reddit, sistemas, listas) ou o texto é grande demais, ele manda **só a URL**. A IA então tenta abrir o endereço pelos próprios servidores, e falha em sites que bloqueiam robôs ou que exigem login.

Este script lê o texto **já renderizado no seu navegador**, com o seu login e o que já carregou na tela, e o envia direto à API.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/) (Violentmonkey também serve).
2. Abra **[https://raw.githubusercontent.com/jusgador/ResumirPagina/main/resumir-pagina.user.js](https://raw.githubusercontent.com/jusgador/ResumirPagina/main/resumir-pagina.user.js)**. O Tampermonkey mostra a tela de instalação; clique em **Instalar**.

### Atualizações

O script traz `@updateURL` e `@downloadURL` apontando para o arquivo no GitHub (ramo `main`). O Tampermonkey e o Violentmonkey conferem esse endereço de tempos em tempos e atualizam sozinhos quando o `@version` sobe. Para atualizar na hora: ícone do Tampermonkey → *Painel* → *Procurar atualizações* (no Violentmonkey, o botão de atualizar do script).

Quem instalou antes da 0.2.2 (por `http://127.0.0.1:8765/…`) precisa abrir o link acima uma vez. Nome e namespace são os mesmos, então a instalação vira uma atualização e as chaves e a configuração continuam lá.

Para testar uma versão local antes de publicar, sirva a pasta com `python -m http.server 8765 --bind 127.0.0.1` e abra `http://127.0.0.1:8765/resumir-pagina.user.js`. A próxima atualização automática volta a puxar do GitHub, porque os endereços estão no cabeçalho.

## Configurar as chaves

Cada provedor cobra pelo uso da API na sua conta. A chave da API é diferente da assinatura do site (ChatGPT Plus, Gemini Advanced, Claude Pro): é preciso criar uma no painel de desenvolvedor e pôr créditos ou um meio de pagamento.

| Provedor | Onde criar a chave |
|---|---|
| Anthropic | <https://console.anthropic.com/settings/keys> |
| OpenAI | <https://platform.openai.com/api-keys> |
| Gemini | <https://aistudio.google.com/apikey> (tem cota gratuita) |
| DeepSeek | <https://platform.deepseek.com/api_keys> |

Depois:

1. Em qualquer página, aperte **Alt+R** e clique em **⚙**. Outra opção: ícone do Tampermonkey → *Resumir página com IA* → **Configurar chaves e modelos**.
2. No provedor desejado, clique em **Definir chave**, cole a chave na caixa que abre e dê OK. A chave é gravada na hora, e o painel confirma com "Chave gravada (N caracteres)".
   - A caixa é nativa do navegador, de propósito: o site aberto não consegue ler o que você digita ou cola nela.
   - Se o site bloquear essas caixas, aparece um campo dentro do painel para colar a chave.
3. Confira o **modelo**. O botão **Listar modelos** consulta o provedor e preenche a lista com os modelos que a sua chave pode usar.
4. Escolha o **provedor padrão** e clique em **Salvar**, no fim da tela. Isso grava modelo, provedor e instrução; **Voltar** descarta essas mudanças, mas não as chaves, que já foram gravadas.

Basta configurar um provedor. Os outros podem ficar sem chave.

As chaves ficam no armazenamento do Tampermonkey, neste navegador (fora do alcance dos sites). Não ficam criptografadas no disco. Se quiser, crie chaves só para este uso, com limite de gasto no painel do provedor.

## Uso

| Ação | Como |
|---|---|
| Resumir a página | **Alt+R** |
| Resumir só um trecho | selecione o texto e aperte **Alt+R** (ou **↻ Resumir** com o painel aberto) |
| Perguntar sobre a página | escreva no campo de baixo; **Enter** envia, **Shift+Enter** quebra a linha |
| Parar a resposta | **■ Parar** |
| Resumir de novo / trocar de IA | escolha o provedor na lista e clique **↻ Resumir** |
| Fonte | **A−** / **A+** |
| Tema | **Tema** alterna entre claro, sépia e escuro |
| Modo leitura | **Leitura**: tela cheia, coluna estreita e fonte serifada |
| Largura do painel | arraste a borda esquerda |
| Copiar | **Copiar** copia a conversa em Markdown |
| Fechar | **Esc**, **✕** ou **Alt+R** de novo |

Ao reabrir com Alt+R na mesma página, o último resumo volta sem nova chamada. Fonte, tema, modo leitura e largura ficam salvos.

## Perguntas: só a página, conhecimento ou web

Acima do campo de pergunta, **Responder com:** escolhe as fontes das perguntas. O resumo inicial é sempre só da página.

Os níveis são cumulativos: **+ Web** já inclui o conhecimento do modelo. Em ⚙ → **Perguntas**, escolha qual nível vem marcado depois de cada resumo (padrão: **+ Conhecimento**). Durante a conversa, os botões mudam o nível só daquela página; o próximo resumo volta ao configurado.

| Nível | O que faz | Custo extra |
|---|---|---|
| **Só a página** | Responde apenas com o que está na página; se não estiver, diz que não está | nenhum |
| **+ Conhecimento** | Usa a página e completa com o conhecimento do próprio modelo, numa seção "Além da página". O modelo tem data de corte e pode estar desatualizado | nenhum |
| **+ Web** | Também pesquisa na web quando a pergunta pede informação atual ou que não está na página. As fontes vêm em links, numa seção "Na web", e as buscas feitas aparecem no fim da resposta | por busca (veja abaixo) |

Por enquanto, a pesquisa na web só funciona com a **DeepSeek**; nos outros provedores o botão **+ Web** fica desativado.

Como funciona com a DeepSeek: o script oferece ao modelo uma função `pesquisar_web`. Quando o modelo a chama, o script consulta o endpoint de busca da DeepSeek (`/v1/tools/search`), devolve até 6 resultados (título, URL, site, data e resumo) e o modelo continua a resposta. São no máximo **3 buscas por pergunta**. A busca custa US$ 0,75 por 1.000 (preço de novembro de 2026), e buscas que falham ou não acham nada não são cobradas. Os resultados entram como tokens de entrada.

## Modelos padrão

Os padrões são os modelos baratos de cada provedor que ainda resumem bem. Para páginas difíceis (textos técnicos longos, discussões com muitas vozes), troque em ⚙ por um modelo maior.

| Provedor | Padrão | Mais capaz (e mais caro) |
|---|---|---|
| Anthropic | `claude-haiku-5-5`, com esforço baixo (`effort: low`) | `claude-sonnet-5-5`, `claude-opus-5-5` |
| OpenAI | `gpt-5-mini`, com `reasoning_effort: low` | `gpt-5`; o `gpt-5-nano` é ainda mais barato, mas mais fraco |
| Gemini | `gemini-flash-lite-latest`, apelido do Flash-Lite mais recente | `gemini-flash-latest`, `gemini-pro-latest` |
| DeepSeek | `deepseek-flash`, com o raciocínio desligado | `deepseek-v4-pro` |

Quem ficou nos padrões antigos passa sozinho para os novos: `claude-opus-5-5` e `gemini-flash-latest` (da 0.1.0) e `deepseek-v4-flash` (nome antigo, até a 0.1.2). Um modelo escolhido à mão não é trocado.

Na DeepSeek, o raciocínio vem ligado em nível alto se nada for pedido. O script o desliga, porque para resumo e perguntas isso só deixa a resposta mais lenta e cara.

Os nomes de modelo mudam com o tempo. Se der "modelo não encontrado", use **Listar modelos** em ⚙.

### Quanto custa

Uma página comum dá de 2 mil a 15 mil tokens de entrada (cerca de 4 caracteres por token); o painel mostra quantos caracteres foram enviados. Preços da Anthropic em outubro de 2026, por milhão de tokens (entrada / saída):

- `claude-haiku-5-5` (padrão): US$ 0,10 / 0,50. Um resumo sai por menos de um décimo de centavo de dólar.
- `claude-sonnet-5-5`: US$ 2 / 10.
- `claude-opus-5-5`: US$ 4 / 20. Alguns centavos de dólar por resumo.

DeepSeek (`deepseek-flash`, novembro de 2026), por milhão de tokens: US$ 0,15 / 0,60 fora do horário de pico e o dobro no pico. O pico vai das 01h às 04h e das 06h às 10h UTC, em dias úteis (22h–01h e 03h–07h em Brasília). Um resumo com uma pergunta e duas buscas na web saiu por menos de um centavo de dólar.

Para os outros provedores, veja a página de preços de cada um.

## O que vai para a IA

- A instrução de resumo (editável em ⚙), o título e a URL da página e o texto visível.
- O texto vem da área principal (`<main>`/`<article>`) quando ela concentra a maior parte do conteúdo; senão, da página inteira. Entra também o conteúdo de ShadowRoots abertos (o Reddit novo usa) e de iframes da mesma origem.
- Ficam de fora o texto oculto, scripts, botões e campos de formulário.
- Acima do limite de caracteres (padrão 200.000, ajustável em ⚙) o texto é cortado, e o painel avisa.

A instrução de sistema diz à IA que o conteúdo da página é só dado, para que um texto malicioso na página não dê ordens a ela. O Markdown da resposta passa pelo DOMPurify, e imagens e mídia são removidas: uma página maliciosa poderia induzir a IA a escrever uma imagem que vazasse dados para outro servidor.

## Limites

- Não roda em `about:`, na loja de extensões nem no visualizador de PDF do Firefox (o navegador não deixa userscripts entrarem nelas).
- Não lê iframes de outra origem, ShadowRoots fechados nem conteúdo desenhado em `<canvas>`.
- **Não roda no PJe** (`pje*.jus.br`, `*.pje.jus.br`, `frontend-prd.trf5.jus.br` e `*.cnj.cloud`), para não brigar com o Alt+R da extensão PJe Sem Firulas, que expande o editor de minutas. Os demais sites `.jus.br`, como os de jurisprudência, continuam com o resumo.
- Em outros sites que usem Alt+R para algo próprio, o script tem prioridade enquanto estiver ativo.
- Usa duas bibliotecas por `@require`, com versão fixa: [marked](https://marked.js.org/) 12.0.2 (Markdown) e [DOMPurify](https://github.com/cure53/DOMPurify) 3.1.6 (limpeza do HTML). O Tampermonkey as baixa uma vez, na instalação.

## No celular (Firefox Android)

A versão para celular é outro arquivo, independente: [`resumir-pagina-celular.user.js`](resumir-pagina-celular.user.js), feito para o [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) no Firefox Android. Os dois podem ficar instalados juntos, porque têm nome e namespace diferentes. As chaves e a configuração também ficam separadas.

| Ação | Como |
|---|---|
| Resumir a página | toque rápido com **3 dedos** (sem arrastar) |
| Resumir só um trecho | selecione o texto e toque com 3 dedos |
| Fechar | **Voltar** do Android, **✕** ou toque com 3 dedos de novo |
| Perguntar | escreva no campo de baixo e toque em **Enviar** (Enter quebra a linha) |
| Fonte, tema, leitura, copiar, ⚙ | botão **⋯** |
| Parar ou refazer o resumo | **■** / **↻** |
| Resposta cortada (conexão caiu) | **↻ Tentar de novo**, que refaz só o último turno |

**Instalar:** com o Violentmonkey no Firefox do celular, abra **[https://raw.githubusercontent.com/jusgador/ResumirPagina/main/resumir-pagina-celular.user.js](https://raw.githubusercontent.com/jusgador/ResumirPagina/main/resumir-pagina-celular.user.js)** e toque em **Instalar**. As atualizações vêm sozinhas pelo mesmo endereço, como no desktop. Quem instalou antes da 0.1.4 pelo cabo USB precisa abrir o link uma vez.

Também dá para abrir pelo menu do Violentmonkey (⋮ → Extensões → Violentmonkey → *Resumir esta página*).

O painel ocupa a área visível da tela e acompanha o teclado. Em páginas sem versão para celular, ou com zoom, ele desfaz o zoom para manter o tamanho normal. Se você trocar de app durante uma resposta, o Android pode cortar a conexão; o texto que já chegou fica na tela.

### Testar uma versão local pelo cabo USB

1. No celular: em *Opções do desenvolvedor*, ligue a **Depuração USB**. No Firefox, em Configurações, ligue a **Depuração remota via USB**. Instale o Violentmonkey.
2. No PC, sirva a pasta e ligue a porta do celular à do PC:
   ```
   python -m http.server 8765 --bind 127.0.0.1
   adb reverse tcp:8765 tcp:8765
   ```
   O `adb` fica em `%LOCALAPPDATA%\Android\Sdk\platform-tools`. A porta não é exposta na rede: o celular a alcança só pelo cabo.
3. No Firefox do celular, abra `http://127.0.0.1:8765/resumir-pagina-celular.user.js`. O Violentmonkey mostra a tela de instalação. Para atualizar, abra o mesmo endereço de novo. A atualização automática seguinte volta a puxar do GitHub.
4. Para depurar, use a Firefox Developer Edition no PC: `about:debugging` → conecte o celular por USB → inspecione a aba. O console mostra, a cada resposta, quantos pedaços do streaming chegaram antes do fim (`[Resumir celular] …`). Se for 0, a resposta veio toda de uma vez. No Violentmonkey do Firefox Android, a resposta chega aos poucos (conferido em novembro de 2026, num Galaxy S23 Ultra).

A página `test/pagina-teste-celular.html` funciona como a do desktop, com `GM_*` simulados: `http://127.0.0.1:8765/test/pagina-teste-celular.html`, no PC ou no celular. Uma chave `cair` simula a conexão caindo no meio da resposta.

## Desenvolvimento

- `test/pagina-teste.html` roda o script fora do Tampermonkey, com `GM_*` simulados e respostas falsas no formato de streaming de cada provedor. Nada sai do computador e nada é cobrado. Sirva a pasta por HTTP e abra `http://127.0.0.1:8765/test/pagina-teste.html`. Uma chave `erro` simula chave recusada (401). Com a DeepSeek no nível **+ Web**, o simulador pede uma busca (com os argumentos chegando em pedaços, como no streaming real), responde pelo endpoint de busca, inclusive com um link `javascript:` que o painel deve mostrar como texto, e só então dá a resposta final.
- Com o script instalado no Tampermonkey, a cópia instalada se desliga na página de teste (ela tem `<meta name="resumir-pagina-teste">`), para não haver dois painéis nem chamadas reais.
- Publicar: o que entra no `main` chega a todos os navegadores instalados quando o `@version` sobe. Teste pela página de teste ou pelo servidor local antes de subir a versão.
- Versões: nenhum número de versão contém 13 (depois de 0.12.x vem 0.14.0; depois de x.y.12 vem x.y.14).
