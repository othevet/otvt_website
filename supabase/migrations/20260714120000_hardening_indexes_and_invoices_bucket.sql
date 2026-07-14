-- Durcissement : index manquants sur les clés étrangères client_id, et
-- limites sur le bucket "invoices" (jusqu'ici sans file_size_limit ni
-- allowed_mime_types, contrairement à "message-attachments").

create index projects_client_id_idx on projects (client_id);
create index invoices_client_id_idx on invoices (client_id);

update storage.buckets
set file_size_limit = 10485760, -- 10 Mo, cohérent avec message-attachments
    allowed_mime_types = array['application/pdf']
where id = 'invoices';
