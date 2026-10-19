-- Removes the shared-text profanity filter added by 20261018221045. No data is changed.
drop trigger if exists filter_scouting_text on public.scouting_entries;
drop trigger if exists filter_shared_picklist_notes on public.shared_picklist_rankings;
drop trigger if exists filter_picklist_category_names on public.picklist_categories;
drop trigger if exists filter_picklist_tag_names on public.picklist_tags;
drop function if exists private.filter_shared_text();
drop function if exists private.content_json_blocked(jsonb);
drop function if exists private.content_text_blocked(text);
