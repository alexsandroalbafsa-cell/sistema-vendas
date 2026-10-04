import { supabase } from './supabase.js';
import { login, logout, usuarioAtual, estaLogado } from './auth.js';
import * as dashboard from './dashboard.js';
import * as produtos from './produtos.js';
import * as vendas from './vendas.js';
import * as reservas from './reservas.js';
import * as fiado from './fiado.js';
import * as usuarios from './usuarios.js';
import * as historico from './historico.js';

// Mapa de rotas
const rotas = {
  inicio: dashboard.render,
  produtos: produtos.render,
  vendas: vendas.render,
  reservas: reservas.render,
  fiado: fiado.render,
  usuarios: usuarios.render,
  historico: historico.render
};

let usuarioLogado = null;

// ============ INICIALIZAÇÃO ============
async function iniciar() {
  // Formulário de login
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    const erroEl = document.getElementById('erro-login');
    erroEl.textContent = '';

    try {
      await login(email, senha);
      await entrarNoApp();
    } catch (err) {
      erroEl.textContent = err.message;
    }
  });

  // Botão sair
  document.getElementById('btn-sair').addEventListener('click', async () => {
    await logout();
    location.reload();
  });

  // Navegação
  window.addEventListener('hashchange', rotear);
  document.querySelectorAll('[data-rota]').forEach(el => {
    el.addEventListener('click', () => { /* o hash muda sozinho */ });
  });

  // Indicador de conexão
  monitorarConexao();

  // Se já tem sessão, entra direto
  if (await estaLogado()) {
    try {
      await entrarNoApp();
    } catch (err) {
      console.error(err);
      await logout();
    }
  }
}

// ============ ENTRAR NO APP ============
async function entrarNoApp() {
  usuarioLogado = await usuarioAtual();

  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  document.getElementById('usuario-nome').textContent = usuarioLogado.nome;

  // Esconde itens admin para vendedor
  if (usuarioLogado.perfil !== 'ADMIN') {
    document.querySelectorAll('[data-admin="true"]').forEach(el => el.remove());
  }

  // Rota inicial
  if (!location.hash) location.hash = '#inicio';
  rotear();
}

// ============ ROTEAMENTO ============
function rotear() {
  const rota = (location.hash || '#inicio').slice(1);
  const container = document.getElementById('conteudo');
  const fn = rotas[rota];

  // Marca link ativo
  document.querySelectorAll('[data-rota]').forEach(el => {
    el.classList.toggle('ativo', el.dataset.rota === rota);
  });

  if (fn) {
    fn(container);
  } else {
    container.innerHTML = `<h2>${rota}</h2><p>Em construção.</p>`;
  }
}

// ============ INDICADOR DE CONEXÃO ============
function monitorarConexao() {
  const el = document.getElementById('status-conexao');

  const atualizar = async () => {
    if (!navigator.onLine) {
      el.className = 'status offline';
      el.innerHTML = '<span class="dot"></span> Sem conexão';
      return;
    }
    try {
      // Ping leve no Supabase
      const { error } = await supabase.from('produtos').select('id').limit(1);
      if (error) throw error;
      el.className = 'status online';
      el.innerHTML = '<span class="dot"></span> Conectado';
    } catch {
      el.className = 'status offline';
      el.innerHTML = '<span class="dot"></span> Sem conexão';
    }
  };

  atualizar();
  setInterval(atualizar, 30000); // a cada 30s
  window.addEventListener('online', atualizar);
  window.addEventListener('offline', atualizar);
}

// ============ START ============
iniciar();