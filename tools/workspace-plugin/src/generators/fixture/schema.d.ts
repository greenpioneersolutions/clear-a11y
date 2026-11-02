export interface FixtureGeneratorSchema {
  path: string;
  title?: string;
  correctPattern?: boolean;
  wcag?: string;
  layer?: string;
  ruleId?: string;
  description?: string;
}
