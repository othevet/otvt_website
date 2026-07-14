import type { SupabaseClient } from '@supabase/supabase-js';

export const MESSAGE_COLUMNS =
  'id, client_id, sender, body, created_at, attachment_path, attachment_name, attachment_mime';

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export type Message = {
  id: string;
  client_id: string;
  sender: 'client' | 'olivier';
  body: string | null;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
};

export function slugifyFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]+/g, '-').toLowerCase();
}

export function formatMessageTime(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function renderMessageAttachment(
  supabase: SupabaseClient,
  container: HTMLElement,
  message: Message,
  downloadLabel: string,
) {
  if (!message.attachment_path) return;
  const { data, error } = await supabase.storage
    .from('message-attachments')
    .createSignedUrl(message.attachment_path, 3600);
  if (error || !data) return;

  container.classList.remove('hidden');
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  if (message.attachment_mime?.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = data.signedUrl;
    img.alt = message.attachment_name ?? '';
    img.className = 'max-h-48 rounded-lg object-cover';
    link.appendChild(img);
  } else {
    link.className = 'text-xs underline underline-offset-2';
    link.textContent = message.attachment_name ?? downloadLabel;
  }
  container.appendChild(link);
}

export function appendMessageBubble(options: {
  supabase: SupabaseClient;
  thread: HTMLElement;
  template: HTMLTemplateElement;
  message: Message;
  isOwn: boolean;
  locale: string;
  downloadLabel: string;
  renderedMessageIds: Set<string>;
}) {
  const {
    supabase,
    thread,
    template,
    message,
    isOwn,
    locale,
    downloadLabel,
    renderedMessageIds,
  } = options;

  const node = template.content.cloneNode(true) as DocumentFragment;
  const row = node.querySelector('.message-row') as HTMLElement;
  const bubble = node.querySelector('.message-bubble') as HTMLElement;

  row.classList.add(isOwn ? 'justify-end' : 'justify-start');
  bubble.classList.add(
    ...(isOwn
      ? ['bg-vert', 'text-white', 'rounded-br-sm']
      : ['bg-surface-alt', 'text-ink', 'rounded-bl-sm']),
  );
  const bodyEl = node.querySelector('.message-body') as HTMLElement;
  const timeEl = node.querySelector('.message-time');
  const attachmentEl = node.querySelector(
    '.message-attachment',
  ) as HTMLElement;
  if (message.body) {
    bodyEl.textContent = message.body;
  } else {
    bodyEl.classList.add('hidden');
  }
  if (timeEl) timeEl.textContent = formatMessageTime(message.created_at, locale);
  if (message.attachment_path)
    renderMessageAttachment(supabase, attachmentEl, message, downloadLabel);

  thread.appendChild(node);
  renderedMessageIds.add(message.id);
}
