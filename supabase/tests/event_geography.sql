begin;
do $$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); org uuid; other_org uuid; item uuid; blocked boolean; data jsonb;
begin
 insert into auth.users(id,email) values(owner_id,'geo-owner@example.invalid'),(other_id,'geo-other@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 execute 'set local role authenticated'; org:=public.create_vendor_workspace('Event geography test');
 data:='{"title":"Resource fair","purpose":"Bring neighbors together","event_date":"2027-04-01","geographic_area":"Orlando, Florida","budget_cents":10000}'::jsonb;
 item:=public.save_community_event(org,data);
 if (select geographic_area from public.community_events where id=item)<>'Orlando, Florida' then raise exception 'Event area not saved'; end if;
 perform public.review_community_event(item,1,'approve');
 perform public.save_community_event(org,data||'{"geographic_area":"Tampa, Florida"}'::jsonb,item,1);
 if (select geographic_area from public.community_events where id=item)<>'Tampa, Florida' or (select revision from public.community_events where id=item)<>2 or (select status from public.community_events where id=item)<>'draft' then raise exception 'Location edit did not revise plan'; end if;
 blocked:=false; begin perform public.save_community_event(org,data,item,1); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Stale event update accepted'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
 other_org:=public.create_vendor_workspace('Other geography test');
 if exists(select 1 from public.community_events where id=item) then raise exception 'Cross-organization event read'; end if;
 blocked:=false; begin perform public.save_community_event(other_org,data,item,2); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Cross-organization location edit'; end if;
 execute 'reset role';
end; $$;
rollback;
