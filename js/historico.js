import { supabase } from './supabase.js';

let usuarioLogado = null;
let historicoCache = [];
let filtroAcao = '';
let filtroTabela = '';
let termoBusca = '';

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

  if (usuarioLogado.perfil !== 'ADMIN') {
    container.innerHTML = '<p class="erro">Acesso restrito ao administrador.</p>';
    return;
  }

  container.innerHTML = `
    <div class="pagina-header">
      <h2>Histórico administrativo</h2>
      <button id="btn-recarregar" class="btn-secundario">Recarregar</button>
    </div>

    <div class="filtros-historico">
      <select id="filtro-acao">
        <option value="">Todas as ações</option>
        <option value="CRIACAO">Criação</option>
        <option value="EDICAO">Edição</option>
        <option value="ATIVACAO">Ativação</option>
        <option value="DESATIVACAO">Desativação</option>
      </select>

      <select id="filtro-tabela">
        <option value="">Todas as tabelas</option>
        <option value="produtos">Produtos</option>
        <option value="usuarios">Usuários</option>
        <option value="reservas">Reservas</option>
        <option value="clientes_fiado">Clientes de fiado</option>
        <option value="vendas">Vendas</option>
        <option value="movimentacoes_fiado">Movimentações de fiado</option>
      </select>

      <input type="text" id="busca-hist" placeholder="Pesquisar na descrição..." />
    </div>

    <div id="lista-hist">Carregando...</div>
  `;

  document.getElementById('filtro-acao').onchange = (e) => {
    filtroAcao = e.target.value;
    renderizarHistorico();
  };
  document.getElementById('filtro-tabela').onchange = (e) => {
    filtroTabela = e.target.value;
    renderizarHistorico();
  };
  document.getElementById('busca-hist').oninput = (e) => {
    termoBusca = e.target.value.toLowerCase();
    renderizarHistorico();
  };
  document.getElementById('btn-recarregar').onclick = carregarHistorico;

  await carregarHistorico();
}

// ============================================
// CARREGAR
// ============================================
async function carregarHistorico() {
  const el = document.getElementById('lista-hist');
  el.innerHTML = 'Carregando...';

  const { data, error } = await supabase
    .from('historico')
    .select(`
      id, acao, tabela, registro_id, descricao, criado_em,
      usuarios ( nome )
    `)
    .order('criado_em', { ascending: false })
    .limit(500);

  if (error) {
    el.innerHTML = `<p class="erro">Erro: ${error.message}</p>`;
    return;
  }

  historicoCache = data || [];
  renderizarHistorico();
}

// ============================================
// RENDER LISTA
// ============================================
function renderizarHistorico() {
  const el = document.getElementById('lista-hist');

  const filtrados = historicoCache.filter(h => {
    if (filtroAcao && h.acao !== filtroAcao) return false;
    if (filtroTabela && h.tabela !== filtroTabela) return false;
    if (termoBusca && !(h.descricao || '').toLowerCase().includes(termoBusca)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    el.innerHTML = `<p class="vazio">${
      historicoCache.length === 0
        ? 'Nenhum registro no histórico.'
        : 'Nenhum registro encontrado com esses filtros.'
    }</p>`;
    return;
  }

  el.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>Data/hora</th>
          <th>Usuário</th>
          <th>Ação</th>
          <th>Tabela</th>
          <th>Descrição</th>
        </tr>
      </thead>
      <tbody>
        ${filtrados.map(h => `
          <tr>
            <td>${new Date(h.criado_em).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}</td>
            <td>${escapeHtml(h.usuarios?.nome || '—')}</td>
            <td><span class="badge ${badgeAcao(h.acao)}">${h.acao}</span></td>
            <td><code>${escapeHtml(h.tabela)}</code></td>
            <td>${escapeHtml(h.descricao || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function badgeAcao(a) {
  if (a === 'CRIACAO') return 'badge-verde';
  if (a === 'EDICAO') return 'badge-azul';
  if (a === 'ATIVACAO') return 'badge-verde';
  if (a === 'DESATIVACAO') return 'badge-vermelho';
  return 'badge-cinza';
}

// ============================================
// UTIL
// ============================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}