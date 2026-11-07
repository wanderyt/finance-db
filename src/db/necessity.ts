export const NECESSITY_LEVELS = ['essential', 'personal_priority', 'flexible', 'unexpected'] as const;
export type NecessityLevel = (typeof NECESSITY_LEVELS)[number];

export const NECESSITY_LABELS: Record<NecessityLevel, string> = {
  essential: '必需',
  personal_priority: '享受',
  flexible: '可选',
  unexpected: '突发',
};

export function isNecessityLevel(value: unknown): value is NecessityLevel {
  return NECESSITY_LEVELS.includes(value as NecessityLevel);
}
