# Ferramentas PDF QUEBEC

Aplicação estática em `ferramentas.quebec.com.br/pdf/`. Os arquivos selecionados são processados no navegador com `pdf-lib` e PDF.js, carregados de jsDelivr. Os documentos não são enviados à QUEBEC. As bibliotecas precisam de conexão no primeiro carregamento; não há modo offline.

## Ferramentas disponíveis

- Unir, dividir em intervalos, organizar, extrair e girar páginas.
- Converter JPG/PNG em PDF e exportar páginas de PDF em PNG ou JPG (ZIP para várias imagens).
- Adicionar texto visível e numerar páginas de um PDF exportado.
- Consultar trechos de texto selecionável por palavras, com a página de origem. Esta consulta não usa IA generativa nem OCR.
- Comprimir PDF, em dois modos (veja abaixo).

## Comprimir PDF

Arquivos: `compress.js` (interface e modo imagens, carregado sob demanda), `compress-worker.js` (Web Worker do modo estrutural) e `compress-core.js` (funções puras, testadas em `tests/compress-core.test.mjs`).

- **Estrutural (preserva texto e vetores):** roda num Web Worker (módulo) com `pdf-lib`. Remove miniaturas (`/Thumb`) e dados privados de aplicativos (`/PieceInfo`), descarta objetos que não são alcançáveis a partir do trailer, comprime com `/FlateDecode` os streams sem filtro (via `CompressionStream('deflate')`, formato zlib) e grava com object streams. Favoritos, formulários e metadados são preservados.
- **Imagens / escaneados (maior redução):** o PDF.js renderiza uma página por vez num `<canvas>`, que vira JPEG (`canvas.toBlob`) e é remontado com `pdf-lib`. Presets: Leve (150 DPI, 0,85), Equilibrado (120 DPI, 0,70) e Máximo (96 DPI, 0,55). O texto deixa de ser selecionável.
- Interface com componentes quebec 1.2.0: `QB.drop` recebe e valida o arquivo (tipo, 30 MB, um por vez), `QB.status` mostra mensagens e erros, ícones do `icons.svg` (`compress`, `upload`, `download`, `check`).
- A barra mostra o progresso real (página X de Y ou conteúdo X de Y). O botão **Cancelar** interrompe o laço de páginas ou encerra o Worker (`worker.terminate()`).
- Se o resultado não ficar menor, a interface avisa que o PDF já está otimizado e o download entrega o original.
- Licenças: `pdf-lib` 1.17.1 (MIT) e `pdfjs-dist` 4.10.38 (Apache-2.0). Não há Ghostscript, qpdf nem dependências GPL/AGPL. O qpdf em WASM disponível exige `SharedArrayBuffer` (cabeçalhos COOP/COEP), que o GitHub Pages não oferece.

Não há conversão de arquivos Office, assinatura digital ou OCR. A edição de texto adiciona conteúdo à cópia; não altera o texto original do PDF.

## Limites e operação

- Arquivos de até 30 MiB cada; até 300 páginas carregadas.
- Até 100 imagens por operação de exportação, para limitar o uso de memória do navegador.
- Divisão em até 50 intervalos. PDFs protegidos por senha não são abertos.
- Os resultados são baixados pelo navegador. A interface não armazena documentos nem usa servidor de processamento.

Sirva a raiz do repositório com um servidor HTTP estático para testar localmente (por exemplo, `python3 -m http.server 8000` e abra `http://localhost:8000/pdf/`). Não abra via `file://`: Web Workers e módulos ES exigem HTTP. O `index.html` usa caminhos relativos para `app.js` e `style.css`.
