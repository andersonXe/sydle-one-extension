# SYDLE ONE (New UI) +

Extensão do Chrome com atalhos de desenvolvimento para a nova interface do [SYDLE ONE](https://www.sydle.com/one) (8.3+). Funciona em qualquer domínio `*.sydle.one`.

## Funcionalidades

Cada funcionalidade pode ser ligada ou desligada no popup da extensão (ícone na barra do Chrome).

### Listagem de objetos

Adiciona um painel de informações em cada card da listagem, com:

- `_id` do objeto e `_id` da classe (clique para copiar);
- **_class** — abre o objeto da classe;
- **JSON** — abre o JSON completo do objeto (`_get` da API) em um visualizador;
- **Get Path** — copia o trecho `_utils.getMethod('_classId', '<classe>', '_get')({_id: '<id>'})`.

### Exibição de objeto

Mostra o mesmo painel na tela de detalhes de um objeto (desligado por padrão).

### Botão Query

Adiciona um botão **Query** ao lado do botão de filtros da listagem. Ao clicar, copia para a área de transferência a query do Elasticsearch equivalente aos filtros aplicados.

- Sem ordenação personalizada, copia apenas a cláusula de filtro:
  ```json
  { "term": { "_class._id": "000000000000000000000002" } }
  ```
- Com um campo selecionado em **Organizado por**, copia um corpo de `_search` completo:
  ```json
  {
    "query": { "term": { "_class._id": "000000000000000000000002" } },
    "sort": [{ "login.keyword": { "order": "asc" } }]
  }
  ```

A ordenação é lida do seletor da tela. O ID do campo é convertido no identificador usado no índice consultando a definição da classe; campos de texto são ordenados pelo subcampo `.keyword`. O modo **Organização avançada** (múltiplos campos) ainda não é suportado.

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/andersonXe/sydle-one-extension.git
   ```
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do repositório.

Depois de alterar o código, clique em recarregar na extensão em `chrome://extensions` **e** recarregue a página do SYDLE ONE.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `manifest.json` | Manifesto MV3; define os content scripts e a ordem de carregamento. |
| `script.js` | Ponto de entrada: injeta o interceptor, observa o DOM e aplica as configurações do popup. |
| `scripts/injected.js` | Roda no contexto da página e intercepta `fetch`/`XMLHttpRequest` para capturar os payloads de busca. |
| `scripts/query-parser.js` | Converte os filtros do SYDLE (`searchParams`) em query do Elasticsearch. |
| `scripts/sort-reader.js` | Lê a ordenação do seletor "Organizado por" e gera o bloco `sort`. |
| `scripts/query-ui.js` | Injeta o botão Query e monta a saída copiada. |
| `scripts/info-panel.js` | Monta o painel de informações dos cards e da tela de detalhes. |
| `scripts/button-functions.js` | Ações dos botões do painel (copiar, JSON, Get Path). |
| `scripts/dom-utils.js` | Busca de elementos atravessando shadow DOM. |
| `popup.html` / `popup.js` | Popup com os interruptores de cada funcionalidade. |
| `background.js` | Service worker que abre o visualizador de JSON em nova aba. |
| `json-viewer/` | Visualizador de JSON usado pelo botão **JSON**. |
| `ace-editor/` | Biblioteca [Ace](https://ace.c9.io/) usada pelo visualizador. |

## Depuração

As mensagens da extensão aparecem no console da página com o prefixo `[SYDLE Extension]`. Se o botão Query não incluir a ordenação esperada, procure por avisos como `Seletor de ordenação não encontrado` ou `Campo de ordenação não resolvido`.
