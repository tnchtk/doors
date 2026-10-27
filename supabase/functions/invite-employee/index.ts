import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Метод не поддерживается' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !anonKey || !serviceRoleKey || !authorization) {
      return jsonResponse({ error: 'Функция приглашения не настроена' }, 500);
    }

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerResult, error: authError } = await callerClient.auth.getUser();
    if (authError || !callerResult.user) return jsonResponse({ error: 'Нужно войти заново' }, 401);

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role,is_active')
      .eq('id', callerResult.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'admin' || !profile.is_active) {
      return jsonResponse({ error: 'Приглашать сотрудников может только администратор' }, 403);
    }

    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || fullName.length > 120) {
      return jsonResponse({ error: 'Укажите имя и правильный адрес электронной почты' }, 400);
    }

    const appSiteUrl = Deno.env.get('APP_SITE_URL');
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      ...(appSiteUrl ? { redirectTo: appSiteUrl } : {}),
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ id: data.user?.id, email });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Не удалось пригласить сотрудника' }, 500);
  }
});
