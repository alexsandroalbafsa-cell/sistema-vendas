import { supabase } from './supabase.js';

let usuarioLogado = null;
let produtosCache = [];
let termoBusca = '';

// ============================================
// RENDER PRINCIPAL
// ============================================
export async function render(container) {
  // Pega usuário atual (pra saber se é admin)
  const { data: { user } } = await supabase.auth.getUser();
  const { data: u } = await supabase
    .from('usuarios')
    .select('perfil, nome')
    .eq('id', user.id)
    .single();
  usuarioLogado = u;

  const isAdmin = usuarioLogado.perfil === 'ADMIN';

  container.innerHTML = `
    <div class="pagina-header">
      <h2>Produtos</h2>
      ${isAdmin ? '<button id="btn-novo-produto" class="btn-primario">+ Novo produto</button>' : ''}
    </div>

    <div class="barra-busca">
      <input type="text" id="busca-produto" placeholder="Pesquisar produto pelo nome..." />
    </div>

    <div id="lista-produtos">Carregando...</div>
  `;

  if (isAdmin) {
    document.getElementById('btn-novo-produto')
      .addEventListener('click', () => abrirFormulario());
  }

  document.getElementById('busca-produto')
    .addEventListener('input', (e) => {
      termoBusca = e.target.value.toLowerCase();
      renderizarLista();
    });

  await carregarProdutos();
}

// ============================================
// CARREGAR DADOS
// ============================================
async function carregarProdutos() {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    document.getElementById('lista-produtos').innerHTML =
      `<p class="erro">Erro ao carregar produtos: ${error.message}</p>`;
    return;
  }

  produtosCache = data || [];
  renderizarLista();
}

// ============================================
// LISTAGEM
// ============================================
function renderizarLista() {
  const el = document.getElementById('lista-produtos');
  const isAdmin = usuarioLogado.perfil === 'ADMIN';

  const filtrados = produtosCache.filter(p =>
    p.nome.toLowerCase().includes(termoBusca)
  );

  if (filtrados.length === 0) {
    el.innerHTML = `<p class="vazio">${
      produtosCache.length === 0
        ? 'Nenhum produto cadastrado.'
        : 'Nenhum produto encontrado para esta busca.'
    }</p>`;
    return;
  }

  el.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>Produto</th>
          <th>Preço</th>
          <th>Status</th>
          ${isAdmin ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${filtrados.map(p => `
          <tr>
            <td>${escapeHtml(p.nome)}</td>
            <td>R$ ${Number(p.preco).toFixed(2)}</td>
            <td>
              <span class="badge ${p.ativo ? 'badge-verde' : 'badge-cinza'}">
                ${p.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            ${isAdmin ? `
              <td class="acoes">
                <button class="btn-mini" data-acao="editar" data-id="${p.id}">Editar</button>
                <button class="btn-mini ${p.ativo ? 'btn-perigo' : 'btn-sucesso'}"
                        data-acao="toggle" data-id="${p.id}">
                  ${p.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            ` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  if (isAdmin) {
    el.querySelectorAll('[data-acao]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const produto = produtosCache.find(p => p.id === id);
        if (btn.dataset.acao === 'editar') abrirFormulario(produto);
        if (btn.dataset.acao === 'toggle') alternarStatus(produto);
      });
    });
  }
}

// ============================================
// FORMULÁRIO (criar / editar)
// ============================================
function abrirFormulario(produto = null) {
  const editando = !!produto;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>${editando ? 'Editar produto' : 'Novo produto'}</h3>
      <form id="form-produto">
        <label>Nome</label>
        <input type="text" id="prod-nome" value="${produto ? escapeHtml(produto.nome) : ''}" required />

        <label>Preço (R$)</label>
        <input type="number" id="prod-preco" step="0.01" min="0"
               value="${produto ? produto.preco : ''}" required />

        <p id="erro-produto" class="erro"></p>

        <div class="modal-acoes">
          <button type="button" class="btn-secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn-primario">${editando ? 'Salvar' : 'Cadastrar'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-cancelar').onclick = () => modal.remove();

  document.getElementById('form-produto').onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById('prod-nome').value.trim();
    const preco = parseFloat(document.getElementById('prod-preco').value);
    const erroEl = document.getElementById('erro-produto');

    if (!nome) { erroEl.textContent = 'Informe o nome.'; return; }
    if (isNaN(preco) || preco < 0) { erroEl.textContent = 'Preço inválido.'; return; }

    const { error } = editando
      ? await supabase.from('produtos').update({ nome, preco }).eq('id', produto.id)
      : await supabase.from('produtos').insert({ nome, preco });

    if (error) {
      erroEl.textContent = error.message;
      return;
    }

    modal.remove();
    await carregarProdutos();
  };
}

// ============================================
// ATIVAR / DESATIVAR
// ============================================
async function alternarStatus(produto) {
  const { error } = await supabase
    .from('produtos')
    .update({ ativo: !produto.ativo })
    .eq('id', produto.id);

  if (error) {
    alert('Erro: ' + error.message);
    return;
  }
  await carregarProdutos();
}

// ============================================
// UTIL
// ============================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}