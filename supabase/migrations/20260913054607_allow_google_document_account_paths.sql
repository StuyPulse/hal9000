alter table public.event_global_documents
  drop constraint if exists event_global_documents_document_url_check;

alter table public.event_global_documents
  add constraint event_global_documents_document_url_check
  check (
    document_url ~ '^https://docs\\.google\\.com/(document|spreadsheets|presentation)/(u/[0-9]+/)?d/[A-Za-z0-9_-]+'
  );
