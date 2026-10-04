import { supabase } from './supabase.js';

let usuarioLogado = null;
let clientesCache = [];

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

  container.innerHTML = `
    <div class="pagina-header">
      <h2>Fiado</h2>
      <button id="btn-novo-cliente" class="btn-primario">+ Novo cliente</button>
    </div>

    <div class="barra-busca">
      <input type="text" id="busca-cliente" placeholder="Pesquisar cliente pelo nome..." />
    </div>

    <div id="lista-clientes">Carregando...</div>
  `;

  document.getElementById('btn-novo-cliente')
    .addEventListener('click', () => abrirFormularioCliente());

  document.getElementById('busca-cliente')
    .addEventListener('input', renderizarClientes);

  await carregarClientes();
}

// ============================================
// CARREGAR CLIENTES + SALDOS
// ============================================
async function carregarClientes() {
  const { data: clientes, error } = await supabase
    .from('clientes_fiado')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    document.getElementById('lista-clientes').innerHTML =
      `<p class="erro">Erro: ${error.message}</p>`;
    return;
  }

  // Busca todas as movimentações de uma vez (para calcular saldos)
  const { data: movs } = await supabase
    .from('movimentacoes_fiado')
    .select('cliente_id, tipo, valor');

  const saldos = {};
  (movs || []).forEach(m => {
    const v = Number(m.valor);
    if (!saldos[m.cliente_id]) saldos[m.cliente_id] = 0;
    if (m.tipo === 'COMPRA') saldos[m.cliente_id] += v;
    else if (m.tipo === 'PAGAMENTO') saldos[m.cliente_id] -= v;
    else saldos[m.cliente_id] += v; // AJUSTE (positivo soma, negativo subtrai)
  });

  clientesCache = (clientes || []).map(c => ({
    ...c,
    saldo: saldos[c.id] || 0
  }));

  renderizarClientes();
}

function renderizarClientes() {
  const el = document.getElementById('lista-clientes');
  const busca = (document.getElementById('busca-cliente')?.value || '').toLowerCase();

  const filtrados = clientesCache.filter(c =>
    c.nome.toLowerCase().includes(busca)
  );

  if (filtrados.length === 0) {
    el.innerHTML = `<p class="vazio">${
      clientesCache.length === 0
        ? 'Nenhum cliente cadastrado.'
        : 'Nenhum cliente encontrado.'
    }</p>`;
    return;
  }

  el.innerHTML = `
    <div class="lista-clientes">
      ${filtrados.map(c => `
        <div class="cliente-card" data-id="${c.id}">
          <div class="cliente-info">
            <strong>${escapeHtml(c.nome)}</strong>
            ${c.telefone ? `<small>📞 ${escapeHtml(c.telefone)}</small>` : ''}
          </div>
          <div class="cliente-saldo ${c.saldo > 0 ? 'devendo' : (c.saldo < 0 ? 'credito' : 'zerado')}">
            <span>Saldo</span>
            <strong>R$ ${c.saldo.toFixed(2)}</strong>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  el.querySelectorAll('.cliente-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      const cliente = clientesCache.find(c => c.id === id);
      abrirFichaCliente(cliente);
    });
  });
}

// ============================================
// FORMULÁRIO DE CLIENTE (criar/editar)
// ============================================
function abrirFormularioCliente(cliente = null) {
  const editando = !!cliente;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>${editando ? 'Editar cliente' : 'Novo cliente'}</h3>

      <label>Nome</label>
      <input type="text" id="cli-nome" value="${editando ? escapeHtml(cliente.nome) : ''}" required />

      <label>Telefone (opcional)</label>
      <input type="text" id="cli-tel" value="${editando && cliente.telefone ? escapeHtml(cliente.telefone) : ''}" />

      <label>Observações (opcional)</label>
      <textarea id="cli-obs" rows="2">${editando && cliente.observacoes ? escapeHtml(cliente.observacoes) : ''}</textarea>

      <p id="erro-cli" class="erro"></p>

      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="cli-cancelar">Cancelar</button>
        <button type="button" class="btn-primario" id="cli-salvar">${editando ? 'Salvar' : 'Cadastrar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('cli-cancelar').onclick = () => modal.remove();

  document.getElementById('cli-salvar').onclick = async () => {
    const nome = document.getElementById('cli-nome').value.trim();
    const telefone = document.getElementById('cli-tel').value.trim() || null;
    const observacoes = document.getElementById('cli-obs').value.trim() || null;
    const erroEl = document.getElementById('erro-cli');

    if (!nome) { erroEl.textContent = 'Informe o nome.'; return; }

    const payload = { nome, telefone, observacoes };

    const { error } = editando
      ? await supabase.from('clientes_fiado').update(payload).eq('id', cliente.id)
      : await supabase.from('clientes_fiado').insert({ ...payload, criado_por: usuarioLogado.id });

    if (error) { erroEl.textContent = error.message; return; }

    modal.remove();
    await carregarClientes();
  };
}

// ============================================
// FICHA DO CLIENTE
// ============================================
async function abrirFichaCliente(cliente) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-largo">
      <div class="ficha-header">
        <div>
          <h3>${escapeHtml(cliente.nome)}</h3>
          ${cliente.telefone ? `<small>📞 ${escapeHtml(cliente.telefone)}</small>` : ''}
        </div>
        <div class="ficha-saldo">
          <span>Saldo</span>
          <strong id="ficha-saldo">R$ ${cliente.saldo.toFixed(2)}</strong>
        </div>
      </div>

      <div class="ficha-acoes">
        <button class="btn-primario" id="btn-nova-mov">+ Nova movimentação</button>
        <button class="btn-secundario" id="btn-editar-cliente">Editar cliente</button>
        <button class="btn-secundario btn-perigo-outline" id="btn-desativar-cliente">Desativar</button>
      </div>

      <div id="ficha-historico">Carregando...</div>

      <div class="modal-acoes">
        <button class="btn-secundario" id="ficha-fechar">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('ficha-fechar').onclick = () => modal.remove();

  document.getElementById('btn-editar-cliente').onclick = () => {
    modal.remove();
    abrirFormularioCliente(cliente);
  };

  document.getElementById('btn-desativar-cliente').onclick = async () => {
    if (!confirm(`Desativar cliente ${cliente.nome}?`)) return;
    const { error } = await supabase
      .from('clientes_fiado')
      .update({ ativo: false })
      .eq('id', cliente.id);
    if (error) { alert('Erro: ' + error.message); return; }
    modal.remove();
    await carregarClientes();
  };

  document.getElementById('btn-nova-mov').onclick = () => {
    abrirFormularioMovimentacao(cliente, async () => {
      modal.remove();
      await carregarClientes();
      // Reabre a ficha atualizada
      const atualizado = clientesCache.find(c => c.id === cliente.id);
      if (atualizado) abrirFichaCliente(atualizado);
    });
  };

  await carregarHistorico(cliente.id, modal);
}

async function carregarHistorico(clienteId, modal) {
  const el = modal.querySelector('#ficha-historico');

  const { data, error } = await supabase
    .from('movimentacoes_fiado')
    .select(`
      id, tipo, valor, observacoes, criado_em,
      usuarios ( nome )
    `)
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="erro">Erro: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = '<p class="vazio">Nenhuma movimentação registrada.</p>';
    return;
  }

  el.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Valor</th>
          <th>Responsável</th>
          <th>Obs.</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(m => `
          <tr>
            <td>${new Date(m.criado_em).toLocaleDateString('pt-BR')}</td>
            <td>
              <span class="badge ${badgeMov(m.tipo)}">${m.tipo}</span>
            </td>
            <td class="${m.tipo === 'PAGAMENTO' ? 'valor-verde' : (m.tipo === 'COMPRA' ? 'valor-vermelho' : '')}">
              ${m.tipo === 'PAGAMENTO' ? '−' : '+'} R$ ${Number(m.valor).toFixed(2)}
            </td>
            <td>${escapeHtml(m.usuarios?.nome || '—')}</td>
            <td>${m.observacoes ? escapeHtml(m.observacoes) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function badgeMov(tipo) {
  if (tipo === 'COMPRA') return 'badge-vermelho';
  if (tipo === 'PAGAMENTO') return 'badge-verde';
  return 'badge-azul';
}

// ============================================
// FORMULÁRIO DE MOVIMENTAÇÃO
// ============================================
function abrirFormularioMovimentacao(cliente, onSalvo) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>Nova movimentação</h3>
      <p class="subtitulo">Cliente: <strong>${escapeHtml(cliente.nome)}</strong></p>

      <label>Tipo</label>
      <select id="mov-tipo">
        <option value="COMPRA">Compra (aumenta a dívida)</option>
        <option value="PAGAMENTO">Pagamento (reduz a dívida)</option>
        <option value="AJUSTE">Ajuste (correção manual)</option>
      </select>

      <label>Valor (R$)</label>
      <input type="number" id="mov-valor" step="0.01" min="0" required />

      <label>Observações (opcional)</label>
      <textarea id="mov-obs" rows="2"></textarea>

      <p id="erro-mov" class="erro"></p>

      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="mov-cancelar">Cancelar</button>
        <button type="button" class="btn-primario" id="mov-salvar">Registrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('mov-cancelar').onclick = () => modal.remove();

  document.getElementById('mov-salvar').onclick = async () => {
    const tipo = document.getElementById('mov-tipo').value;
    const valor = parseFloat(document.getElementById('mov-valor').value);
    const obs = document.getElementById('mov-obs').value.trim() || null;
    const erroEl = document.getElementById('erro-mov');

    if (isNaN(valor) || valor <= 0) {
      erroEl.textContent = 'Valor inválido.';
      return;
    }

    // Ajuste: se o valor for digitado com sinal negativo, respeita;
    // se positivo, soma. Aqui forçamos a lógica: AJUSTE usa o sinal que o usuário quer,
    // mas para simplificar, exigimos valores positivos e o usuário escolhe a intenção
    // pelo tipo. Então AJUSTE positivo soma; para subtrair, use PAGAMENTO.
    // (Você pode evoluir depois para permitir AJUSTE negativo.)
    const payload = {
      cliente_id: cliente.id,
      responsavel_id: usuarioLogado.id,
      tipo,
      valor: Math.abs(valor),
      observacoes: obs
    };

    const { error } = await supabase
      .from('movimentacoes_fiado')
      .insert(payload);

    if (error) { erroEl.textContent = error.message; return; }

    modal.remove();
    if (onSalvo) await onSalvo();
  };
}

// ============================================
// UTIL
// ============================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}