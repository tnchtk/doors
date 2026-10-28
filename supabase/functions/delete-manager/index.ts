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
      return jsonResponse({ error: 'Функция удаления сотрудника не настроена' }, 500);
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
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('role,is_active')
      .eq('id', callerResult.user.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (callerProfile?.role !== 'admin' || !callerProfile.is_active) {
      return jsonResponse({ error: 'Удалять менеджеров может только активный администратор' }, 403);
    }

    const body = await request.json();
    const userId = String(body.user_id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return jsonResponse({ error: 'Не удалось определить учетную запись менеджера' }, 400);
    }
    if (userId === callerResult.user.id) {
      return jsonResponse({ error: 'Нельзя удалить свою учетную запись' }, 400);
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (targetProfileError) throw targetProfileError;
    if (!targetProfile) return jsonResponse({ error: 'Менеджер уже удалён или не найден' }, 404);
    if (targetProfile.role !== 'manager') {
      return jsonResponse({ error: 'Удалять можно только учетные записи менеджеров' }, 403);
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) return jsonResponse({ error: deleteError.message }, 400);
    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Не удалось удалить менеджера' }, 500);
  }
});
