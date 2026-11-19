import type { ReactNode } from 'react';
import type { Item, Stats } from '../lib/types';
import { R0Compact } from '../views/R0Baseline';
import { R1Score } from '../views/R1Score';
import { R2FlipCurve } from '../views/R2FlipCurve';
import { R3Push } from '../views/R3Push';
import { R4Counterfactual } from '../views/R4Counterfactual';
import { STUDY_VIEWS, viewHint, type StudyView } from './questionnaire';

/**
 * Small, non-interactive pictures of the views beside questions that ask about them (e.g. the ranking), so
 * participants recognise each view instead of recalling it from its name. Same question for everyone (Japan).
 */
export function ViewReminder({ views, item, items, stats }: { views: StudyView[]; item: Item; items: Item[]; stats: Stats }) {
  const preview: Partial<Record<StudyView, ReactNode>> = {
    r0: <R0Compact item={item} />,
    r1: <R1Score item={item} items={items} stats={stats} compact />,
    r2: <R2FlipCurve item={item} stats={stats} compact />,
    r3: <R3Push item={item} stats={stats} compact />,
    r4: <R4Counterfactual item={item} stats={stats} compact />,
  };
  return (
    <section className="study-workspace study-reminder" aria-label="Reminder of the views">
      <p className="study-reminder-intro">The views you saw, shown for “{item.question}”</p>
      <div className="study-reminder-grid">
        {views.map((view) => (
          <article key={view} className={`panel study-reminder-card reminder-${view}`}>
            <h3>{STUDY_VIEWS.find((option) => option.value === view)?.label}</h3>
            <p>{viewHint(view)}</p>
            {/* A picture, not a control: participants rank what they remember, without exploring again. */}
            <div className="study-reminder-preview" inert aria-hidden="true"><div className="study-reminder-scaled">{preview[view]}</div></div>
          </article>
        ))}
      </div>
    </section>
  );
}
