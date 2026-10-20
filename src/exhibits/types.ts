import type { ComponentType } from 'react';

/** Props every exhibit page receives from the shell. Kept deliberately small. */
export type ExhibitProps = Record<string, never>;

export interface ExhibitModule {
  default: ComponentType<ExhibitProps>;
}

interface ExhibitBase {
  /** URL slug: /#/exhibits/<slug>. Lowercase kebab-case, never reused. */
  slug: string;
  /** Gallery position (Room number), shown on the home page. */
  number: number;
  title: string;
  subtitle: string;
  summary: string;
  topics: string[];
}

/** A complete exhibit. Only these are routable. */
export interface OpenExhibit extends ExhibitBase {
  status: 'open';
  /** Lazy loader so each exhibit is code-split into its own chunk. */
  load: () => Promise<ExhibitModule>;
}

/**
 * Announced in the gallery as "in preparation". Has no loader and therefore
 * no route — the museum never shows empty or placeholder pages.
 */
export interface PlannedExhibit extends ExhibitBase {
  status: 'planned';
}

export type ExhibitEntry = OpenExhibit | PlannedExhibit;
