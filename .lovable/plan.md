# Sistema PDV Profissional — Plano de Implementação

Sistema completo é grande demais para uma única entrega. Proponho construir em **fases**, começando por um MVP funcional sólido e evoluindo. Tudo com a estética dark premium + verde neon descrita.

---

## Design System (aplicado a todo o app)

- Base dark: preto esverdeado (`oklch(0.16 0.02 155)`), grafite, carvão
- Verde-lima de identidade (`oklch(0.82 0.22 135)`) — botões primários, estados ativos, focus
- Cinzas frios para texto secundário, off-white para principal
- Cards com borda semitransparente, cantos arredondados (10px), sombra + glow verde sutil apenas em foco/ativo
- Tipografia: Inter/Geist sans-serif, títulos semibold
- Layout: sidebar fixa esquerda + topbar compacta + área principal em grid de cards
- Microanimações 150–300ms, hover com leve elevação + borda verde
- Tokens em `src/styles.css` (@theme), componentes shadcn customizados
- Responsivo: sidebar vira drawer no mobile

---

## Backend (Lovable Cloud)

Ativar Cloud com:
- **Auth** (email/senha) + tabela `profiles` + `user_roles` (enum `gerente` | `vendedor`) + função `has_role` (security definer)
- Tabelas: `categories`, `products`, `sales`, `sale_items`, `payments`, `fiado_customers`, `fiado_accounts`, `product_audit`, `general_audit`, `settings`
- RLS: vendedor vê só as próprias vendas/fiados; gerente vê tudo (via `has_role`)
- Storage bucket `product-images`
- Triggers: gera código interno automático, cria auditoria em alterações de preço, atualiza estoque ao finalizar venda

---

## Fase 1 — Fundação (esta entrega)

1. Design system dark premium + tokens
2. Auth (login) + roles + rota protegida `_authenticated`
3. Shell: sidebar + topbar + layout responsivo
4. **Tela de Vendas (core)**:
   - Captura global de teclado/scanner quando nenhum input ativo
   - Busca por nome/categoria/código de barras/código interno
   - Lista de itens com edição inline de qtd/peso, remover
   - Resumo (subtotal, desconto, total)
   - Modal de pagamento múltiplo (Dinheiro, Débito, Crédito, Pix, Outros, Fiado) com cálculo de troco
   - "Produto com valor errado" → atualiza produto + gera auditoria
   - Minimizar venda (até 3, configurável) preservando estado
   - Cadastro rápido em modal quando código não existir
   - Recibo (imprimir/PDF)
5. **Estoque**: CRUD de produtos, categorias, upload de imagem, código interno auto, preço custo opcional
6. **Histórico de vendas**: vendedor vê próprias, gerente vê tudo com filtros
7. Cancelar/excluir venda conforme permissão (com confirmação e auditoria)

## Fase 2 — Fiado + Auditoria + Config

- Área secundária de Fiado (registrar, listar, quitar)
- Auditoria individual dentro do produto
- Auditoria geral em menu admin
- Configurações (limite de vendas minimizadas, dados do mercado para recibo)
- Gestão de usuários (gerente)

## Fase 3 — Relatórios + Insights

- Relatórios semanal, mensal, anual, período personalizado
- Cards de KPIs + gráficos (recharts) + rankings
- Insights automáticos textuais (comparação com período anterior, alertas)

## Fase 4 — Busca automática de imagens

- Edge function/server function que consulta API de imagens (Google Custom Search ou similar — requer chave), prioriza fundo transparente/branco
- Grid de 5 sugestões + "buscar mais"
- Necessita chave de API do provedor

---

## Detalhes técnicos

- Stack: TanStack Start + React 19 + Tailwind v4 + shadcn + Lovable Cloud
- Estado de vendas minimizadas em Zustand (persist no localStorage por segurança de sessão de caixa)
- React Query para dados do servidor
- Scanner: listener global em `window` que agrega dígitos rápidos + Enter (padrão de leitores USB HID)
- Impressão de recibo via `window.print()` com estilos dedicados

---

## O que preciso de você antes de começar

1. **Confirmar a Fase 1** como escopo desta entrega (é ~1 semana de trabalho denso — muito mais do que uma iteração normal, mas dá base sólida)?
2. **Nome/logo do mercado** para o recibo e sidebar (posso usar placeholder "Mercado" por enquanto)?
3. **Busca automática de imagens** (Fase 4) exige chave paga de API de imagens (Google/Bing/SerpAPI). Ok deixar para depois?
4. **Usuário inicial gerente**: crio um seed ou você cria pelo signup e me diz o email para eu promover a gerente via migration?

Assim que responder, começo pela Fase 1.