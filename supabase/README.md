# Роли и админ-панель

Для включения ролей и приглашения сотрудников в проекте `doors`: 

1. В Supabase откройте **SQL Editor**, вставьте содержимое `js/data/data-base-roles.sql` и нажмите **Run**. Запускайте его после основной схемы `js/data/data-base.sql`. Если активного администратора ещё нет, миграция назначит администратором самую раннюю учетную запись.
2. Добавьте `https://doors-kappa.vercel.app` в **Authentication → URL Configuration → Redirect URLs**.
3. Установите Supabase CLI, выполните `supabase login`, затем из папки проекта выполните:

   ```sh
   supabase functions deploy invite-employee --project-ref rxzvtpkdkxdwooyyruwa
   supabase secrets set APP_SITE_URL=https://doors-kappa.vercel.app --project-ref rxzvtpkdkxdwooyyruwa
   ```

   Секретный `service_role` ключ не добавляйте в сайт, GitHub или Vercel. Supabase передает его Edge Function на сервере.
4. После обновления сайта войдите учетной записью администратора. В **Админ-панели → Сотрудники и роли** можно пригласить сотрудника, выбрать роль и назначить бригаду бригадиру.

Менеджерам доступно управление объектами, блоками и бригадами. Бригадир через базу получает только этажи, назначенные его бригаде. На этом этапе просмотр бригадира доступен без редактирования дверей; отметки установки, замечания и фотографии будут добавлены следующим шагом.
