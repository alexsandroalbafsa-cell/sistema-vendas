import { supabase } from './supabase.js';

let usuarioLogado = null;
let produtosDisponiveis = [];
let itensDaVenda = []; // [{ produto_id, produto_nome, preco, quantidade }]

// ============================================
// RENDER PRINCIPAL
// ============================================
export async function render(container) {
  // Usuário atual
  const { data: { user } } = await supabase.auth.getUser();
  const { data: u } = await supabase
    .from('usuarios')
    .select('id, nome, perfil')
    .eq('id', user.id)
    .single();
  usuarioLogado = u;

  // Produtos ativos
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco')
    .eq('ativo', true)
    .order('nome');

  produtosDisponiveis = produtos || [];
  itensDaVenda = [];

  container.innerHTML = `
    <div class="pagina-header">
      <h2>Nova venda</h2>
    </div>

    <div class="venda-layout">
      <!-- COLUNA ESQUERDA: seleção de produtos -->
      <div class="venda-esquerda">
        <div class="card-bloco">
          <h3>Adicionar produto</h3>
          <div class="add-produto">
            <select id="select-produto">
              <option value="">Selecione um produto...</option>
              ${produtosDisponiveis.map(p => `
                <option value="${p.id}" data-preco="${p.preco}" data-nome="${escapeAttr(p.nome)}">
                  ${escapeHtml(p.nome)} — R$ ${Number(p.preco).toFixed(2)}
                </option>
              `).join('')}
            </select>
            <input type="number" id="input-qtd" value="1" min="0.001" step="1" />
            <button id="btn-add-item" class="btn-primario">Adicionar</button>
          </div>
          ${produtosDisponiveis.length === 0
            ? '<p class="vazio" style="margin-top:1rem;">Nenhum produto ativo cadastrado. Cadastre em Produtos primeiro.</p>'
            : ''}
        </div>

        <div class="card-bloco">
          <h3>Itens da venda</h3>
          <div id="lista-itens"></div>
        </div>
      </div>

      <!-- COLUNA DIREITA: fechamento -->
      <div class="venda-direita">
        <div class="card-bloco">
          <h3>Fechamento</h3>

          <label>Forma de pagamento</label>
          <select id="select-pagamento">
            <option value="DINHEIRO">Dinheiro</option>
            <option value="PIX">PIX</option>
            <option value="DEBITO">Débito</option>
            <option value="CREDITO">Crédito</option>
            <option value="FIADO">Fiado</option>
          </select>

          <label>Observações (opcional)</label>
          <textarea id="input-obs" rows="3" placeholder="Ex.: cliente pediu troco para R$ 50"></textarea>

          <div class="total-box">
            <span>Total</span>
            <strong id="total-venda">R$ 0.00</strong>
          </div>

          <button id="btn-finalizar" class="btn-primario btn-full">Finalizar venda</button>
          <p id="erro-venda" class="erro"></p>
        </div>
      </div>
    </div>

    <h3 class="secao">Vendas do dia</h3>
    <div id="lista-vendas">Carregando...</div>
  `;

  document.getElementById('btn-add-item').addEventListener('click', adicionarItem);
  document.getElementById('btn-finalizar').addEventListener('click', finalizarVenda);

  renderizarItens();
  await carregarVendasDoDia();
}

// ============================================
// ITENS
// ============================================
function adicionarItem() {
  const select = document.getElementById('select-produto');
  const qtdInput = document.getElementById('input-qtd');

  const produtoId = Number(select.value);
  const quantidade = parseFloat(qtdInput.value);

  if (!produtoId) { alert('Selecione um produto.'); return; }
  if (isNaN(quantidade) || quantidade <= 0) { alert('Quantidade inválida.'); return; }

  const opt = select.selectedOptions[0];
  const nome = opt.dataset.nome;
  const preco = parseFloat(opt.dataset.preco);

  const existente = itensDaVenda.find(i => i.produto_id === produtoId);
  if (existente) {
    existente.quantidade += quantidade;
  } else {
    itensDaVenda.push({
      produto_id: produtoId,
      produto_nome: nome,
      preco,
      quantidade
    });
  }

  select.value = '';
  qtdInput.value = 1;
  renderizarItens();
}

function removerItem(produtoId) {
  itensDaVenda = itensDaVenda.filter(i => i.produto_id !== produtoId);
  renderizarItens();
}

function renderizarItens() {
  const el = document.getElementById('lista-itens');

  if (itensDaVenda.length === 0) {
    el.innerHTML = '<p class="vazio">Nenhum item adicionado.</p>';
    atualizarTotal();
    return;
  }

  el.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>Produto</th>
          <th>Qtd</th>
          <th>Unit.</th>
          <th>Subtotal</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${itensDaVenda.map(i => `
          <tr>
            <td>${escapeHtml(i.produto_nome)}</td>
            <td>${formatQtd(i.quantidade)}</td>
            <td>R$ ${i.preco.toFixed(2)}</td>
            <td>R$ ${(i.preco * i.quantidade).toFixed(2)}</td>
            <td>
              <button class="btn-mini btn-perigo" data-remover="${i.produto_id}">Remover</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.querySelectorAll('[data-remover]').forEach(btn => {
    btn.addEventListener('click', () => removerItem(Number(btn.dataset.remover)));
  });

  atualizarTotal();
}

function atualizarTotal() {
  const total = itensDaVenda.reduce((s, i) => s + i.preco * i.quantidade, 0);
  document.getElementById('total-venda').textContent = `R$ ${total.toFixed(2)}`;
}

// ============================================
// FINALIZAR VENDA
// ============================================
async function finalizarVenda() {
  const erroEl = document.getElementById('erro-venda');
  erroEl.textContent = '';

  if (itensDaVenda.length === 0) {
    erroEl.textContent = 'Adicione pelo menos um produto.';
    return;
  }

  const forma = document.getElementById('select-pagamento').value;
  const obs = document.getElementById('input-obs').value.trim() || null;

  const itensPayload = itensDaVenda.map(i => ({
    produto_id: i.produto_id,
    quantidade: i.quantidade
  }));

  document.getElementById('btn-finalizar').disabled = true;
  document.getElementById('btn-finalizar').textContent = 'Gravando...';

  const { data, error } = await supabase.rpc('criar_venda', {
    p_forma_pagamento: forma,
    p_observacoes: obs,
    p_itens: itensPayload
  });

  document.getElementById('btn-finalizar').disabled = false;
  document.getElementById('btn-finalizar').textContent = 'Finalizar venda';

  if (error) {
    erroEl.textContent = 'Erro ao gravar: ' + error.message;
    return;
  }

  // Sucesso
  itensDaVenda = [];
  document.getElementById('input-obs').value = '';
  document.getElementById('select-pagamento').value = 'DINHEIRO';
  renderizarItens();

  await carregarVendasDoDia();

  alert(`Venda #${data} registrada com sucesso!`);
}

// ============================================
// LISTAGEM DAS VENDAS DO DIA
// ============================================
async function carregarVendasDoDia() {
  const el = document.getElementById('lista-vendas');

  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('vendas')
    .select(`
      id, total, forma_pagamento, observacoes, criado_em,
      usuarios ( nome )
    `)
    .gte('criado_em', inicio.toISOString())
    .order('criado_em', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="erro">Erro ao carregar vendas: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = '<p class="vazio">Nenhuma venda registrada hoje.</p>';
    return;
  }

  el.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>#</th>
          <th>Hora</th>
          <th>Responsável</th>
          <th>Pagamento</th>
          <th>Total</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${data.map(v => `
          <tr>
            <td>${v.id}</td>
            <td>${new Date(v.criado_em).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
            <td>${escapeHtml(v.usuarios?.nome || '—')}</td>
            <td>${v.forma_pagamento}</td>
            <td>R$ ${Number(v.total).toFixed(2)}</td>
            <td>
              <button class="btn-mini" data-detalhe="${v.id}">Ver itens</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.querySelectorAll('[data-detalhe]').forEach(btn => {
    btn.addEventListener('click', () => mostrarDetalhe(Number(btn.dataset.detalhe)));
  });
}

async function mostrarDetalhe(vendaId) {
  const { data, error } = await supabase
    .from('itens_venda')
    .select('produto_nome, quantidade, valor_unitario, subtotal')
    .eq('venda_id', vendaId);

  if (error) { alert('Erro: ' + error.message); return; }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>Venda #${vendaId}</h3>
      ${(!data || data.length === 0)
        ? '<p class="vazio">Nenhum item encontrado.</p>'
        : `
          <table class="tabela">
            <thead>
              <tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${data.map(i => `
                <tr>
                  <td>${escapeHtml(i.produto_nome)}</td>
                  <td>${formatQtd(Number(i.quantidade))}</td>
                  <td>R$ ${Number(i.valor_unitario).toFixed(2)}</td>
                  <td>R$ ${Number(i.subtotal).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      <div class="modal-acoes">
        <button class="btn-secundario" id="fechar-detalhe">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('fechar-detalhe').onclick = () => modal.remove();
}

// ============================================
// UTIL
// ============================================
function formatQtd(n) {
  return Number.isInteger(n) ? n : n.toFixed(3).replace(/\.?0+$/, '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}