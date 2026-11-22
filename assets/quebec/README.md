# assets/quebec

Base visual da marca quebec, copiada do design system **quebec — Design System**, versão **1.1.1** (veja `VERSION`).

| Arquivo | Origem no design system | Observação |
| --- | --- | --- |
| `tokens.css` | gerado de `tokens.json` | Não editar à mão. `@font-face` aponta para `fonts/` ao lado. |
| `bundle.css` | `components/bundle.css` | Classes `qb-*`. Carregar depois de `tokens.css`. |
| `quebec.js` | `scripts/quebec.js` | Tema, menu do celular, busca/filtro do catálogo (`data-qb-*`). Sem dependências; carregar com `defer`. |
| `theme-head.html` | `scripts/theme-head.html` | Trecho para colar no `<head>`, antes dos CSS. |
| `fonts/` | `fonts/` | Só os pesos usados: Adventor 700, Inter 400/500/600, JetBrains Mono 400/600. Licenças incluídas. |
| `logos/` | grupo Logos (aprovado em 22/11/2026) | Nome, monograma, favicons 16/24/32, ícone 180 e 512 px. |

Para atualizar: altere o design system, gere uma nova versão, copie os arquivos para cá, atualize `VERSION` e o parâmetro `?v=` dos `<link>`/`<script>` nas páginas.
