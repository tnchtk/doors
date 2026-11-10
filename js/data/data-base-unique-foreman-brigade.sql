-- Один активный бригадир на бригаду. Запускать после data-base-roles.sql.
-- Если запрос ниже вернёт строки, сначала разведите бригадиров по разным бригадам.
-- SELECT brigade_id, count(*) FROM public.profiles
--   WHERE role='foreman' AND is_active AND brigade_id IS NOT NULL GROUP BY brigade_id HAVING count(*)>1;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_active_foreman_per_brigade
  ON public.profiles (brigade_id)
  WHERE role='foreman' AND is_active AND brigade_id IS NOT NULL;
