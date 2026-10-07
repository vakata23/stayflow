-- ============================================================================
-- Миграция 011: етикет на стая за всяка снимка (Етап 7б, версия БЕЗ платено AI)
--
-- Собственикът маркира всяка снимка с един клик (Дневна, Спалня, Кухня, Баня,
-- Тераса, Гледка, Отвън, Друго). Страницата се подрежда по етикетите — в
-- кода, без никакви външни извиквания.
--
-- properties.ai_assistant: изключено по подразбиране „AI асистент“ за бъдеще.
-- Докато няма ANTHROPIC_API_KEY в Netlify, включването му не прави нищо
-- платено — сървърната функция отказва без ключ.
--
-- Идемпотентна: безопасно за повторно пускане.
-- ============================================================================

alter table public.property_photos add column if not exists room text
  check (room is null or room in ('living', 'bedroom', 'kitchen', 'bathroom', 'terrace', 'view', 'exterior', 'other'));

alter table public.properties add column if not exists ai_assistant boolean not null default false;

select 'Миграция 011 е пусната успешно' as status;
