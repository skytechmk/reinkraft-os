// Messages for the "calendar" area. Keys are namespaced ("calendar.something"). Macedonian must cover every English key.
export const en = {
  'calendar.prev': 'Previous month',
  'calendar.next': 'Next month',
  'calendar.nothingDue': 'Nothing is due this month.',
  'calendar.comingUp': 'Coming up',
  'calendar.noneOpen': 'No open project has a due date. Set one in the project header.',
} as const;

export const mk: Record<keyof typeof en, string> = {
  'calendar.prev': 'Претходен месец',
  'calendar.next': 'Следен месец',
  'calendar.nothingDue': 'Овој месец нема рокови.',
  'calendar.comingUp': 'Следно',
  'calendar.noneOpen': 'Ниту еден отворен проект нема рок. Постави го во заглавието на проектот.',
};
