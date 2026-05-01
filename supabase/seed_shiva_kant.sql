-- BINOKIO — Dummy India profile: "Shiva Kant"
-- ---------------------------------------------------------------------------
-- 1) In Supabase Dashboard → Authentication → Users → "Add user"
--    Email:    shiva.kant.binokio@example.com
--    Password: (choose any, e.g. DummyShiva123!)
--    Auto Confirm User: ON (so you can log in immediately)
--
-- 2) Run this entire script in SQL Editor.
--
-- The signup trigger already created a row in public.profiles; this UPDATE
-- fills Indian location + bio + interests. Avatar stays null unless you set
-- avatar_url to a public image URL.
-- ---------------------------------------------------------------------------

UPDATE public.profiles AS p
SET
  full_name = 'Shiva Kant',
  age = 28,
  gender = 'Man',
  city = 'Varanasi, Uttar Pradesh, India',
  bio = 'Engineer who grew up along the Ganga — I love classical music, monsoon chai, and slow weekends exploring old cities. Here for something real, kind, and fun.',
  interests = 'Sitar, cricket, street food, Hindi cinema, hill stations, ISL'
FROM auth.users AS u
WHERE p.id = u.id
  AND u.email = 'shiva.kant.binokio@example.com';

-- Optional: verify
-- SELECT id, full_name, age, city, bio FROM public.profiles
-- WHERE full_name = 'Shiva Kant';
