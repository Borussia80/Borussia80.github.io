# Nova ferramenta em ferramentas.quebec.com.br

Cada ferramenta é uma **página fina**: a interface vem do quebec (casca, componentes `qb-*`, ícones, `window.QB`) e o trabalho pesado vem de uma biblioteca MIT carregada do jsDelivr com versão fixa. Exemplos prontos: `/3d/` (three.js) e `/diagramas/` (Mermaid).

## Passo a passo

1. Copie `_partials/modelo-ferramenta.html` para `PASTA/index.html` e crie `PASTA/app.js`.
2. Acrescente a ferramenta em `_partials/site.json` (`id` = nome da pasta, `label` curto para o menu, `footer` para o rodapé).
3. Rode `node tools/shell.mjs`. Ele preenche `<head>`, cabeçalho e rodapé de **todas** as páginas; o menu novo aparece em todas de uma vez.
4. Adicione o card no catálogo (`index.html`): `data-category`, `data-search` e o contador do chip da categoria.
5. Rode as verificações (as mesmas do CI):
   `node tools/check-tokens.mjs && node tools/shell.mjs --check && node tests/tool-smoke.cjs`

## Beta (burn-in) antes do catálogo

Toda ferramenta nova entra em produção como beta por 5 a 7 dias de uso real, antes de ganhar card e menu:

- `<meta name="robots" content="noindex">` no `<head>` e `<span class="qb-badge qb-badge--brand">beta</span>` no eyebrow;
- `<!-- qb:header active="" -->` (sem entrada em `site.json` enquanto for beta);
- sem card no `index.html`.

No aceite: retire o `noindex` e o selo, registre em `site.json`, rode `node tools/shell.mjs` e adicione o card. O checklist do burn-in fica no repositório `gestao_sites` (`sites/ferramentas-quebec/burn-in/`).

## Código compartilhado e testes

- Módulos usados por mais de uma ferramenta ficam em `lib/` (ES modules sem DOM, testáveis em Node). Ex.: `lib/dias-uteis.js`.
- Testes de navegador usam `tests/_e2e-base.cjs` (servidor estático) e Playwright. Ex.: `tests/dias-uteis.e2e.cjs`.

## O que a página fina usa do sistema

| Precisa de | Use |
| --- | --- |
| Receber arquivos | `.qb-drop` com `<input type="file" accept>` dentro + `QB.drop(el, { onFiles, maxBytes, maxFiles, status })`. Valida tipo e tamanho; `.busy(true)` durante o processamento. Depois de carregar, `.is-compact` reduz a área. |
| Mensagens | `.qb-status` + `QB.status(el, texto, 'error' | 'ok')` |
| Copiar | botão com `<span data-qb-label>` + `QB.copy(botao, texto)` (estado confirmado em verde, `--on-success`) |
| Campos | `.qb-label` + `.qb-control` (44 px, radius-md); select dentro de `<span class="qb-select">`; opções em `.qb-checks` / `.qb-check` |
| Botões, filtros | `.qb-btn--primary/--secondary/--ghost`, `.qb-chip[aria-pressed]` |
| Layout | `.qb-page` (880 px) ou `.qb-page--wide`, `.qb-page-head`, `.qb-panel`, `.qb-row2`, `.qb-actions`, `.qb-disclosure` |
| Resultado | `.qb-output` (valor em mono), `.qb-kv` (pares chave/valor), `.qb-result` (arquivo pronto) |
| Ícones | `<svg class="qb-i"><use href="/assets/quebec/icons.svg?v=1.2.1#nome"/></svg>` — nunca caracteres como ▤ ⚄ ✳ (viram emoji no celular) |
| Cor própria | `data-qb-accent="violeta"` ou `"ciano"` no `<main>`. Pinta só ícones e destaques (`.qb-accent-text`); botões, links e foco continuam iguais em todas as páginas. Não sobrescreva `--primary`, `--link` ou `--focus`. |
| Cores no canvas/WebGL | leia os tokens com `getComputedStyle(document.body).getPropertyValue('--accent')` e observe `data-theme` no `<html>` (veja `/3d/app.js`). |

Pontos de quebra: 1100 / 860 / 600 px. Espaços: só os tokens `--space-*` existentes (o CI recusa variável sem definição).

## Escolha do motor

- Licença MIT (ou Apache-2.0/BSD) e versão fixa na URL (`pacote@1.2.3`), nunca `@latest`.
- Processamento no navegador; o arquivo não sai do dispositivo. Diga isso na página.
- Carregue o motor só na página que o usa.
