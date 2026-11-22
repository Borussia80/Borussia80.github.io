# Ferramentas PDF QUEBEC

Aplicação estática em `ferramentas.quebec.com.br/pdf/`. Os arquivos selecionados são processados no navegador com `pdf-lib` e PDF.js, carregados de jsDelivr. Os documentos não são enviados à QUEBEC. As bibliotecas precisam de conexão no primeiro carregamento; não há modo offline.

## Ferramentas disponíveis

- Unir, dividir em intervalos, organizar, extrair e girar páginas.
- Converter JPG/PNG em PDF e exportar páginas de PDF em PNG ou JPG (ZIP para várias imagens).
- Adicionar texto visível e numerar páginas de um PDF exportado.
- Consultar trechos de texto selecionável por palavras, com a página de origem. Esta consulta não usa IA generativa nem OCR.

Não há conversão de arquivos Office, compressão de PDF, assinatura digital ou OCR. A edição de texto adiciona conteúdo à cópia; não altera o texto original do PDF.

## Limites e operação

- Arquivos de até 30 MiB cada; até 300 páginas carregadas.
- Até 100 imagens por operação de exportação, para limitar o uso de memória do navegador.
- Divisão em até 50 intervalos. PDFs protegidos por senha não são abertos.
- Os resultados são baixados pelo navegador. A interface não armazena documentos nem usa servidor de processamento.

Sirva esta pasta com um servidor HTTP estático para testar localmente. O `index.html` usa caminhos relativos para `app.js` e `style.css`.
