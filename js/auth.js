import { supabase } from './supabase.js';

export async function login(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha
  });
  if (error) throw new Error('E-mail ou senha inválidos.');
  return data.user;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function usuarioAtual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, perfil, ativo')
    .eq('id', user.id)
    .single();

  if (error) throw new Error('Erro ao buscar dados do usuário.');
  if (!data.ativo) {
    await supabase.auth.signOut();
    throw new Error('Usuário desativado. Contate o administrador.');
  }
  return data;
}

export async function estaLogado() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}