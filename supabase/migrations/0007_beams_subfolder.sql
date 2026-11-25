-- 0007: UNP, IPE and HEA beams get their own subfolder (RAW/BEAMS) instead of sharing Profiles.
-- Data only: moves existing rows by name, never touches quantities or costs. Safe to run twice.
update public.inventory
   set subfolder = 'BEAMS'
 where folder = 'RAW'
   and subfolder = 'PROFILES'
   and name ~* '^(UNP|IPE|HEA|HEB|УНП|ИПЕ|ХЕА|ХЕБ)\s*[0-9]'
   and is_remnant is not true;
