export interface RuleGeneratorSchema {
  name: string;
  engine: string;
  wcag: string;
  tier?: 'violation' | 'likely' | 'needs-review';
  title?: string;
}
