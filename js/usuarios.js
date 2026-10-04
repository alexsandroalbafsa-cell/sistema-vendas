import { supabase } from './supabase.js';

let usuarioLogado = null;
let usuariosCache = [];

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

  // Guarda de segurança: só ADMIN entra
  if (usuarioLogado.perfil !== 'ADMIN') {
    container.innerHTML = '<p class="erro">Acesso restrito ao administrador.</p>';
    return;
  }

  container.innerHTML = `
    <div class="pagina-header">
      <h2>Usuários</h2>
      <button id="btn-novo-usuario" class="btn-primario">+ Novo usuário</button>
    </div>

    <p class="aviso-info">
      Para criar um novo usuário, cadastre primeiro o e-mail e a senha em
      <strong>Supabase → Authentication → Users → Add user</strong> (marque
      <em>Auto Confirm</em>). Depois volte aqui e clique em <strong>+ Novo usuário</strong>
      para vincular o nome e o perfil.
    </p>

    <div id="lista-usuarios">Carregando...</div>
  `;

  document.getElementById('btn-novo-usuario')
    .addEventListener('click', () => abrirFormulario());

  await carregarUsuarios();
}

// ============================================
// CARREGAR USUÁRIOS
// ============================================
async function carregarUsuarios() {
  const el = document.getElementById('lista-usuarios');

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, perfil, ativo, criado_em')
    .order('criado_em', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="erro">Erro: ${error.message}</p>`;
    return;
  }

  usuariosCache = data || [];

  if (usuariosCache.length === 0) {
    el.innerHTML = '<p class="vazio">Nenhum usuário cadastrado.</p>';
    return;
  }

  el.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Perfil</th>
          <th>Status</th>
          <th>Criado em</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${usuariosCache.map(u => `
          <tr>
            <td>${escapeHtml(u.nome)}</td>
            <td>
              <span class="badge ${u.perfil === 'ADMIN' ? 'badge-azul' : 'badge-cinza'}">
                ${u.perfil}
              </span>
            </td>
            <td>
              <span class="badge ${u.ativo ? 'badge-verde' : 'badge-cinza'}">
                ${u.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td>${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
            <td class="acoes">
              <button class="btn-mini" data-acao="editar" data-id="${u.id}">Editar</button>
              ${u.id !== usuarioLogado.id ? `
                <button class="btn-mini ${u.ativo ? 'btn-perigo' : 'btn-sucesso'}"
                        data-acao="toggle" data-id="${u.id}">
                  ${u.ativo ? 'Desativar' : 'Ativar'}
                </button>
              ` : '<em style="color:#9ca3af;font-size:0.8rem;">(você)</em>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = usuariosCache.find(x => x.id === btn.dataset.id);
      if (btn.dataset.acao === 'editar') abrirFormulario(u);
      if (btn.dataset.acao === 'toggle') alternarStatus(u);
    });
  });
}

// ============================================
// FORMULÁRIO (criar / editar)
// ============================================
function abrirFormulario(usuario = null) {
  const editando = !!usuario;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>${editando ? 'Editar usuário' : 'Vincular novo usuário'}</h3>

      <label>UUID do usuário (Auth)</label>
      <input type="text" id="usr-id"
             value="${editando ? escapeHtml(usuario.id) : ''}"
             ${editando ? 'readonly' : ''}
             placeholder="Cole aqui o UUID de Authentication → Users"
             required />

      ${!editando ? `
        <p class="aviso-mini">
          Crie o usuário primeiro em <strong>Authentication → Users</strong> e
          copie o UUID (campo "User UID").
        </p>
      ` : ''}

      <label>Nome</label>
      <input type="text" id="usr-nome" value="${editando ? escapeHtml(usuario.nome) : ''}" required />

      <label>Perfil</label>
      <select id="usr-perfil">
        <option value="VENDEDOR" ${editando && usuario.perfil === 'VENDEDOR' ? 'selected' : ''}>VENDEDOR</option>
        <option value="ADMIN" ${editando && usuario.perfil === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
      </select>

      <p id="erro-usr" class="erro"></p>

      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="usr-cancelar">Cancelar</button>
        <button type="button" class="btn-primario" id="usr-salvar">${editando ? 'Salvar' : 'Vincular'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('usr-cancelar').onclick = () => modal.remove();

  document.getElementById('usr-salvar').onclick = async () => {
    const id = document.getElementById('usr-id').value.trim();
    const nome = document.getElementById('usr-nome').value.trim();
    const perfil = document.getElementById('usr-perfil').value;
    const erroEl = document.getElementById('erro-usr');

    if (!id || !nome) { erroEl.textContent = 'Preencha todos os campos.'; return; }

    if (editando) {
      const { error } = await supabase
        .from('usuarios')
        .update({ nome, perfil })
        .eq('id', id);
      if (error) { erroEl.textContent = error.message; return; }
    } else {
      // Verifica se já existe
      const { data: existente } = await supabase
        .from('usuarios')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (existente) {
        erroEl.textContent = 'Esse UUID já está vinculado a um usuário.';
        return;
      }

      const { error } = await supabase
        .from('usuarios')
        .insert({ id, nome, perfil, ativo: true });
      if (error) { erroEl.textContent = error.message; return; }
    }

    modal.remove();
    await carregarUsuarios();
  };
}

// ============================================
// ATIVAR / DESATIVAR
// ============================================
async function alternarStatus(usuario) {
  if (usuario.id === usuarioLogado.id) {
    alert('Você não pode desativar a si mesmo.');
    return;
  }

  const msg = usuario.ativo
    ? `Desativar o usuário ${usuario.nome}? Ele não conseguirá mais fazer login.`
    : `Reativar o usuário ${usuario.nome}?`;

  if (!confirm(msg)) return;

  const { error } = await supabase
    .from('usuarios')
    .update({ ativo: !usuario.ativo })
    .eq('id', usuario.id);

  if (error) { alert('Erro: ' + error.message); return; }
  await carregarUsuarios();
}

// ============================================
// UTIL
// ============================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}