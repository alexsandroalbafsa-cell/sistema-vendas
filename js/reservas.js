import { supabase } from './supabase.js';

let usuarioLogado = null;
let produtosDisponiveis = [];
let reservasCache = [];
let filtroStatus = 'ATIVA';

// ============================================
// RENDER PRINCIPAL
// ============================================
export async function render(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: u } = await supabase
    .from('usuarios')
    .select('id, nome, perfil')
    .eq('id', user.id)
    .single();
  usuarioLogado = u;

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco')
    .eq('ativo', true)
    .order('nome');

  produtosDisponiveis = produtos || [];

  container.innerHTML = `
    <div class="pagina-header">
      <h2>Reservas</h2>
      <button id="btn-nova-reserva" class="btn-primario">+ Nova reserva</button>
    </div>

    <div class="filtros-status">
      <button class="filtro-btn ${filtroStatus === 'ATIVA' ? 'ativo' : ''}" data-status="ATIVA">Ativas</button>
      <button class="filtro-btn ${filtroStatus === 'RETIRADA' ? 'ativo' : ''}" data-status="RETIRADA">Retiradas</button>
      <button class="filtro-btn ${filtroStatus === 'CANCELADA' ? 'ativo' : ''}" data-status="CANCELADA">Canceladas</button>
    </div>

    <div id="lista-reservas">Carregando...</div>
  `;

  document.getElementById('btn-nova-reserva')
    .addEventListener('click', () => abrirFormulario());

  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroStatus = btn.dataset.status;
      document.querySelectorAll('.filtro-btn').forEach(b =>
        b.classList.toggle('ativo', b === btn));
      carregarReservas();
    });
  });

  await carregarReservas();
}

// ============================================
// CARREGAR RESERVAS
// ============================================
async function carregarReservas() {
  const el = document.getElementById('lista-reservas');
  el.innerHTML = 'Carregando...';

  const { data, error } = await supabase
    .from('reservas')
    .select(`
      id, nome_pessoa, observacoes, status, criado_em,
      usuarios ( nome ),
      itens_reserva ( id, produto_nome, quantidade, valor_unitario )
    `)
    .eq('status', filtroStatus)
    .order('criado_em', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="erro">Erro: ${error.message}</p>`;
    return;
  }

  reservasCache = data || [];

  if (reservasCache.length === 0) {
    el.innerHTML = `<p class="vazio">Nenhuma reserva ${filtroStatus.toLowerCase()}.</p>`;
    return;
  }

  el.innerHTML = `
    <div class="lista-reservas">
      ${reservasCache.map(r => renderCard(r)).join('')}
    </div>
  `;

  el.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const reserva = reservasCache.find(r => r.id === id);
      const acao = btn.dataset.acao;
      if (acao === 'editar') abrirFormulario(reserva);
      if (acao === 'retirar') alterarStatus(reserva, 'RETIRADA');
      if (acao === 'cancelar') alterarStatus(reserva, 'CANCELADA');
    });
  });
}

function renderCard(r) {
  const data = new Date(r.criado_em).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  const total = (r.itens_reserva || []).reduce((s, i) =>
    s + Number(i.valor_unitario) * Number(i.quantidade), 0);

  return `
    <div class="reserva-card">
      <div class="reserva-header">
        <div>
          <strong>${escapeHtml(r.nome_pessoa)}</strong>
          <small>Reserva #${r.id} • ${data} • por ${escapeHtml(r.usuarios?.nome || '—')}</small>
        </div>
        <span class="badge ${badgeStatus(r.status)}">${r.status}</span>
      </div>

      <div class="reserva-itens">
        ${(r.itens_reserva || []).length === 0
          ? '<em>Sem itens</em>'
          : (r.itens_reserva || []).map(i => `
              <span class="item-tag">
                ${escapeHtml(i.produto_nome)} × ${formatQtd(Number(i.quantidade))}
              </span>
            `).join('')
        }
      </div>

      ${r.observacoes ? `<p class="reserva-obs">📝 ${escapeHtml(r.observacoes)}</p>` : ''}

      ${r.status === 'ATIVA' ? `
        <div class="reserva-acoes">
          <span class="total-reserva">Total: R$ ${total.toFixed(2)}</span>
          <div>
            <button class="btn-mini" data-acao="editar" data-id="${r.id}">Editar</button>
            <button class="btn-mini btn-sucesso" data-acao="retirar" data-id="${r.id}">Retirada</button>
            <button class="btn-mini btn-perigo" data-acao="cancelar" data-id="${r.id}">Cancelar</button>
          </div>
        </div>
      ` : `
        <div class="reserva-acoes">
          <span class="total-reserva">Total: R$ ${total.toFixed(2)}</span>
        </div>
      `}
    </div>
  `;
}

function badgeStatus(s) {
  if (s === 'ATIVA') return 'badge-verde';
  if (s === 'RETIRADA') return 'badge-azul';
  if (s === 'CANCELADA') return 'badge-cinza';
  return '';
}

// ============================================
// FORMULÁRIO (criar / editar)
// ============================================
function abrirFormulario(reserva = null) {
  const editando = !!reserva;

  // Cópia dos itens atuais (ou vazio)
  let itens = editando
    ? (reserva.itens_reserva || []).map(i => ({
        produto_id: null,
        produto_nome: i.produto_nome,
        preco: Number(i.valor_unitario),
        quantidade: Number(i.quantidade)
      }))
    : [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-largo">
      <h3>${editando ? 'Editar reserva' : 'Nova reserva'}</h3>

      <label>Nome da pessoa</label>
      <input type="text" id="res-nome" value="${editando ? escapeHtml(reserva.nome_pessoa) : ''}" required />

      <label>Produtos</label>
      <div class="add-produto" style="margin-bottom: 0.5rem;">
        <select id="res-select-produto">
          <option value="">Selecione...</option>
          ${produtosDisponiveis.map(p => `
            <option value="${p.id}" data-preco="${p.preco}" data-nome="${escapeAttr(p.nome)}">
              ${escapeHtml(p.nome)} — R$ ${Number(p.preco).toFixed(2)}
            </option>
          `).join('')}
        </select>
        <input type="number" id="res-qtd" value="1" min="1" step="1" />
        <button type="button" id="res-add" class="btn-primario">Adicionar</button>
      </div>

      <div id="res-itens-lista"></div>

      <label>Observações (opcional)</label>
      <textarea id="res-obs" rows="3" placeholder="Ex.: Não congelar.">${editando && reserva.observacoes ? escapeHtml(reserva.observacoes) : ''}</textarea>

      <p id="erro-res" class="erro"></p>

      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="res-cancelar">Cancelar</button>
        <button type="button" class="btn-primario" id="res-salvar">${editando ? 'Salvar' : 'Criar reserva'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const renderItens = () => {
    const el = document.getElementById('res-itens-lista');
    if (itens.length === 0) {
      el.innerHTML = '<p class="vazio">Nenhum item adicionado.</p>';
      return;
    }
    el.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Produto</th><th>Qtd</th><th></th></tr></thead>
        <tbody>
          ${itens.map((i, idx) => `
            <tr>
              <td>${escapeHtml(i.produto_nome)}</td>
              <td>${formatQtd(i.quantidade)}</td>
              <td>
                <button type="button" class="btn-mini btn-perigo" data-rm="${idx}">Remover</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', () => {
        itens.splice(Number(btn.dataset.rm), 1);
        renderItens();
      });
    });
  };
  renderItens();

  document.getElementById('res-add').onclick = () => {
    const sel = document.getElementById('res-select-produto');
    const qtd = parseFloat(document.getElementById('res-qtd').value);
    if (!sel.value) { alert('Selecione um produto.'); return; }
    if (isNaN(qtd) || qtd <= 0) { alert('Quantidade inválida.'); return; }

    const opt = sel.selectedOptions[0];
    itens.push({
      produto_id: Number(sel.value),
      produto_nome: opt.dataset.nome,
      preco: parseFloat(opt.dataset.preco),
      quantidade: qtd
    });
    sel.value = '';
    document.getElementById('res-qtd').value = 1;
    renderItens();
  };

  document.getElementById('res-cancelar').onclick = () => modal.remove();

  document.getElementById('res-salvar').onclick = async () => {
    const nome = document.getElementById('res-nome').value.trim();
    const obs = document.getElementById('res-obs').value.trim() || null;
    const erroEl = document.getElementById('erro-res');
    erroEl.textContent = '';

    if (!nome) { erroEl.textContent = 'Informe o nome.'; return; }
    if (itens.length === 0) { erroEl.textContent = 'Adicione pelo menos um produto.'; return; }

    if (editando) {
      // Atualiza reserva
      const { error: e1 } = await supabase
        .from('reservas')
        .update({ nome_pessoa: nome, observacoes: obs })
        .eq('id', reserva.id);
      if (e1) { erroEl.textContent = e1.message; return; }

      // Apaga itens antigos e recria (mais simples que fazer diff)
      const { error: e2 } = await supabase
        .from('itens_reserva')
        .delete()
        .eq('reserva_id', reserva.id);
      if (e2) { erroEl.textContent = e2.message; return; }

      const { error: e3 } = await supabase
        .from('itens_reserva')
        .insert(itens.map(i => ({
          reserva_id: reserva.id,
          produto_id: i.produto_id,
          produto_nome: i.produto_nome,
          quantidade: i.quantidade,
          valor_unitario: i.preco
        })));
      if (e3) { erroEl.textContent = e3.message; return; }
    } else {
      // Cria reserva
      const { data: nova, error: e1 } = await supabase
        .from('reservas')
        .insert({
          nome_pessoa: nome,
          responsavel_id: usuarioLogado.id,
          observacoes: obs,
          status: 'ATIVA'
        })
        .select('id')
        .single();
      if (e1) { erroEl.textContent = e1.message; return; }

      const { error: e2 } = await supabase
        .from('itens_reserva')
        .insert(itens.map(i => ({
          reserva_id: nova.id,
          produto_id: i.produto_id,
          produto_nome: i.produto_nome,
          quantidade: i.quantidade,
          valor_unitario: i.preco
        })));
      if (e2) { erroEl.textContent = e2.message; return; }
    }

    modal.remove();
    await carregarReservas();
  };
}

// ============================================
// MUDAR STATUS
// ============================================
async function alterarStatus(reserva, novoStatus) {
  const msg = novoStatus === 'RETIRADA'
    ? `Confirmar retirada da reserva de ${reserva.nome_pessoa}?`
    : `Cancelar a reserva de ${reserva.nome_pessoa}?`;
  if (!confirm(msg)) return;

  const { error } = await supabase
    .from('reservas')
    .update({ status: novoStatus })
    .eq('id', reserva.id);

  if (error) { alert('Erro: ' + error.message); return; }
  await carregarReservas();
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