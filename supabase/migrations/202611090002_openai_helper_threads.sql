-- Keep helper conversations isolated while using the same OpenAI agent runtime.
alter table public.organizer_sessions drop constraint organizer_sessions_thread_check;
alter table public.organizer_sessions add constraint organizer_sessions_thread_check
check (thread in ('main','venue','outreach','volunteers','discover') or thread ~ '^platform_[a-z][a-z0-9_]{0,63}$');
