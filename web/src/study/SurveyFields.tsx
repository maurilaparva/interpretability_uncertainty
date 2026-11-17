import type { StudyQuestion } from './questionnaire';
import type { StudySession } from './storage';

type Answer = StudySession['answers'][string];

export function SurveyField({ question: q, value, onChange, invalid }: {
  question: StudyQuestion;
  value: Answer | undefined;
  onChange: (value: Answer) => void;
  invalid: boolean;
}) {
  const errorId = `${q.id}-error`;
  const description = invalid ? errorId : undefined;
  return (
    <fieldset className={`study-field${invalid ? ' invalid' : ''}`} id={`field-${q.id}`}>
      <legend>{q.prompt}</legend>
      {q.type === 'text' && (q.multiline ? (
        <textarea aria-label={q.prompt} aria-describedby={description} aria-invalid={invalid} rows={3} maxLength={6000}
          value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" aria-label={q.prompt} aria-describedby={description} aria-invalid={invalid} maxLength={1000}
          value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
      ))}
      {(q.type === 'single' || q.type === 'multi') && (
        <div className="study-options">
          {q.options?.map((option) => {
            const checked = q.type === 'multi' ? Array.isArray(value) && value.includes(option.value) : value === option.value;
            return (
              <label className={`study-option${checked ? ' selected' : ''}`} key={option.value}>
                <input type={q.type === 'multi' ? 'checkbox' : 'radio'} name={q.id} value={option.value} checked={checked}
                  aria-describedby={description} onChange={() => {
                    if (q.type === 'single') onChange(option.value);
                    else {
                      const current = Array.isArray(value) ? value : [];
                      onChange(checked ? current.filter((v) => v !== option.value) : [...current, option.value]);
                    }
                  }} />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
      {q.type === 'scale' && (
        <>
          <div className="study-scale" style={{ gridTemplateColumns: `repeat(${(q.max ?? 7) - (q.min ?? 1) + 1}, 1fr)` }}>
            {Array.from({ length: (q.max ?? 7) - (q.min ?? 1) + 1 }, (_, i) => i + (q.min ?? 1)).map((n) => (
              <label key={n} className={value === n ? 'selected' : ''}>
                <input type="radio" name={q.id} value={n} checked={value === n} onChange={() => onChange(n)} aria-describedby={description} />
                <span>{n}</span>
              </label>
            ))}
          </div>
          <div className="study-scale-labels"><span>{q.lowLabel}</span><span>{q.highLabel}</span></div>
        </>
      )}
      {q.type === 'ranking' && (
        <div className="study-ranking">
          {q.options?.map((_, i) => {
            const ranking = Array.isArray(value) ? value : [];
            return (
              <label key={i}>
                <span className="rank-number">{i + 1}</span>
                <select aria-label={`Rank ${i + 1}${i === 0 ? ', most useful' : i === q.options!.length - 1 ? ', least useful' : ''}`}
                  value={ranking[i] ?? ''} aria-describedby={description} onChange={(e) => {
                    const next = Array.from({ length: q.options!.length }, (_, position) => ranking[position] ?? '');
                    next[i] = e.target.value;
                    onChange(next);
                  }}>
                  <option value="">{i === 0 ? 'Most useful' : i === q.options!.length - 1 ? 'Least useful' : 'Choose a view'}</option>
                  {q.options?.map((option) => <option key={option.value} value={option.value} disabled={ranking.includes(option.value) && ranking[i] !== option.value}>{option.label}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}
      {invalid && <p className="study-field-error" id={errorId}>Please answer this question to continue.</p>}
    </fieldset>
  );
}
