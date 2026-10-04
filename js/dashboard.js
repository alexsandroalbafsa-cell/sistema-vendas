import { supabase } from './supabase.js';

export async function render(container) {
  container.innerHTML = '<h2>Início</h2><p>Carregando...</p>';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioDoDia = hoje.toISOString();

  // Vendas hoje
  const { data: vendasHoje } = await supabase
    .from('vendas')
    .select('total')
    .gte('criado_em', inicioDoDia);

  const totalHoje = (vendasHoje || []).reduce((s, v) => s + Number(v.total), 0);
  const qtdVendasHoje = (vendasHoje || []).length;

  // Reservas ativas
  const { count: reservasAtivas } = await supabase
    .from('reservas')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ATIVA');

  // Usuários ativos
  const { count: usuariosAtivos } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true);

  // Movimentações de fiado (somatório)
  const { data: movs } = await supabase
    .from('movimentacoes_fiado')
    .select('tipo, valor');

  const saldoFiado = (movs || []).reduce((s, m) => {
    if (m.tipo === 'COMPRA') return s + Number(m.valor);
    if (m.tipo === 'PAGAMENTO') return s - Number(m.valor);
    return s + Number(m.valor); // AJUSTE: positivo soma, negativo subtrai
  }, 0);

  // Vendas recentes
  const { data: vendasRecentes } = await supabase
    .from('vendas')
    .select('id, total, forma_pagamento, criado_em, usuarios(nome)')
    .order('criado_em', { ascending: false })
    .limit(5);

  container.innerHTML = `
    <h2>Início</h2>

    <div class="cards">
      <div class="card">
        <h3>Vendas hoje</h3>
        <p class="numero">R$ ${totalHoje.toFixed(2)}</p>
        <small>${qtdVendasHoje} venda(s)</small>
      </div>
      <div class="card">
        <h3>Reservas ativas</h3>
        <p class="numero">${reservasAtivas || 0}</p>
      </div>
      <div class="card">
        <h3>Fiado em aberto</h3>
        <p class="numero">R$ ${saldoFiado.toFixed(2)}</p>
      </div>
      <div class="card">
        <h3>Usuários ativos</h3>
        <p class="numero">${usuariosAtivos || 0}</p>
      </div>
    </div>

    <h3 class="secao">Vendas recentes</h3>
    ${renderVendasRecentes(vendasRecentes)}
  `;
}

function renderVendasRecentes(vendas) {
  if (!vendas || vendas.length === 0) {
    return '<p class="vazio">Nenhuma venda registrada.</p>';
  }
  return `
    <table class="tabela">
      <thead>
        <tr>
          <th>#</th><th>Valor</th><th>Pagamento</th><th>Responsável</th><th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${vendas.map(v => `
          <tr>
            <td>${v.id}</td>
            <td>R$ ${Number(v.total).toFixed(2)}</td>
            <td>${v.forma_pagamento}</td>
            <td>${v.usuarios?.nome || '—'}</td>
            <td>${new Date(v.criado_em).toLocaleString('pt-BR')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}