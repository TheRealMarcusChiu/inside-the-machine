import { useId, type ReactNode } from 'react';
import { KindBadge, type FigureKind } from './KindBadge';

interface ExhibitFigureProps {
  kind: FigureKind;
  title: string;
  description?: ReactNode;
  /** When set, the figure can be focused programmatically (e.g. "go to the adder"). */
  id?: string;
  className?: string;
  children: ReactNode;
}

/** A labelled exhibit figure. Its accessible name starts with its kind, e.g. "Live simulation Gate lab". */
export function ExhibitFigure({ kind, title, description, id, className, children }: ExhibitFigureProps) {
  const uid = useId();
  const badgeId = `${uid}-kind`;
  const titleId = `${uid}-title`;
  return (
    <figure
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`exhibit-figure exhibit-figure--${kind}${className ? ` ${className}` : ''}`}
      data-kind={kind}
      aria-labelledby={`${badgeId} ${titleId}`}
    >
      <figcaption className="exhibit-figure__caption">
        <KindBadge kind={kind} id={badgeId} />
        <span className="exhibit-figure__title" id={titleId}>
          {title}
        </span>
        {description && <span className="exhibit-figure__description">{description}</span>}
      </figcaption>
      <div className="exhibit-figure__body">{children}</div>
    </figure>
  );
}
