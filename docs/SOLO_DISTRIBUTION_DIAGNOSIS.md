# Solo-round scoring-distribution bug — diagnosis

Investigation artifact for the `get_user_score_distribution` RPC returning an empty distribution on a real Solo round despite `get_user_stats` correctly counting the round.

## Live queries to run

Since no live DB access is available from this session (requires the `SUPABASE_DB_PASSWORD`), these queries are documented for the human to run in the Supabase SQL editor and paste results into the PR:

### Query 1 — what does the function return?

```sql
select * from public.get_user_score_distribution(
  (select user_id from public.profiles where display_name = 'Jonathan' limit 1)
);
```

### Query 2 — actual data shape for the user

```sql
select
  r.id,
  r.status,
  r.game_type,
  r.created_by,
  jsonb_typeof(r.course_details) as course_details_type,
  jsonb_typeof(r.course_details->'pars') as pars_type,
  r.course_details->'pars' as pars,
  rp.id as round_player_id,
  rp.user_id as rp_user_id,
  jsonb_typeof(rp.hole_scores) as hs_type,
  rp.hole_scores
from rounds r
left join round_players rp on rp.round_id = r.id
where r.created_by = (select user_id from profiles where display_name = 'Jonathan' limit 1)
   or rp.user_id = (select user_id from profiles where display_name = 'Jonathan' limit 1)
order by r.created_at desc;
```

### Query 3 — trace the CTE against the data

```sql
-- Run piecewise. Any step that returns 0 rows is where the function breaks.

-- 3a: does the user's round_players row exist?
select count(*) from round_players where user_id = <jonathan_id>;

-- 3b: does jsonb_each on hole_scores produce rows?
select kv.key, kv.value
from round_players rp, jsonb_each(rp.hole_scores) kv
where rp.user_id = <jonathan_id>;

-- 3c: does jsonb_array_elements_text on pars produce rows?
select p.value, p.ord
from rounds r, jsonb_array_elements_text(r.course_details->'pars') with ordinality p(value, ord)
where r.id = <solo_round_id>;

-- 3d: does the LATERAL + JOIN pattern match rows?
-- (run the CTE from the function with user_id filled in)
```
