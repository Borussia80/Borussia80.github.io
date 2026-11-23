# assets/quebec

Base visual da marca quebec, copiada do design system **quebec — Design System**, versão **1.2.0** (veja `VERSION`).

| Arquivo | Origem no design system | Observação |
| --- | --- | --- |
| `tokens.css` | gerado de `tokens.json` | Não editar à mão. `@font-face` aponta para `fonts/` ao lado. |
| `bundle.css` | `components/bundle.css` | Classes `qb-*`. Carregar depois de `tokens.css`. |
| `quebec.js` | `scripts/quebec.js` | Tema, menu do celular, busca/filtro do catálogo (`data-qb-*`). Sem dependências; carregar com `defer`. |
| `icons.svg` | grupo Ícones (1.2.0) | Sprite com ~35 ícones (grade 24, traço 2). Uso: `<svg class="qb-i"><use href="…/icons.svg?v=1.2.0#nome"/></svg>`. |
| `theme-head.html` | `scripts/theme-head.html` | Trecho para colar no `<head>`, antes dos CSS. |
| `fonts/` | `fonts/` | Só os pesos usados: Adventor 700, Inter 400/500/600, JetBrains Mono 400/600. Licenças incluídas. |
| `logos/` | grupo Logos (aprovado em 22/11/2026) | Nome, monograma, favicons 16/24/32, ícone 180 e 512 px. |

Para atualizar: altere o design system, gere uma nova versão, copie os arquivos para cá, atualize `VERSION` e o parâmetro `?v=` dos `<link>`/`<script>` nas páginas.

## 1.2.0 (23/11/2026)

- **Correções:** tokens `--space-5`, `--space-10` e `--space-20` (faltavam e derrubavam o espaçamento da home, do PDF e do Diceware); `.qb-foot-title` no bundle e rodapé com `repeat(auto-fit, minmax(160px, 1fr))`.
- **Tokens novos:** `--accent`/`--accent-tint` (realce por ferramenta, presets `violeta` e `ciano`), `--band-border`, `--band-border-strong`, `--on-success`, `--dur-1`, `--dur-2`, `--ease`.
- **Componentes novos:** `qb-page`, `qb-page-head`, `qb-panel`, `qb-label`, `qb-control`, `qb-select`, `qb-checks`/`qb-check`, `qb-status`, `qb-output`, `qb-disclosure`, `qb-grid--2`/`--4`, `qb-drop-text`, `qb-i` e `icons.svg`.
- **quebec.js:** ano do rodapé (`[data-qb-year]`) e `window.QB` (`status`, `drop`, `copy`).
- `tool-pages.css` foi absorvido pelo bundle e removido.
- Ícone `compress` (documento com setas convergentes) acrescentado ao `icons.svg` para a ferramenta Comprimir PDF. Replique-o no grupo Ícones do design system.
- Atenção: `tokens.css` declara ser gerado de `tokens.json`. Aplique as mesmas adições no `tokens.json` do design system antes de gerar a próxima versão, ou elas serão perdidas.

Cabeçalho, rodapé e `<head>` das páginas vêm de `_partials/` via `node tools/shell.mjs`. Guia para novas ferramentas: `_partials/NOVA-FERRAMENTA.md`.
