import { BAND_WORD, bandOf, comparePhrase, flipToken, fmtPush, tok, wordFor } from '../lib/data';
import type { Item, Stats } from '../lib/types';

export function R4Counterfactual({ item, stats, compact }: { item: Item; stats: Stats; compact?: boolean }) {
  const censored = item.censored || item.margin == null;
  const band = bandOf(item, stats);
  const answer = item.answer_text || tok(item.answer_token);
  const toward = wordFor(item, item.alt_token);
  const flipTo = flipToken(item, stats);
  // What the model says after the push; fall back to the flipped token if generation is empty.
  const cf = (item.counterfactual_text || (flipTo ? tok(flipTo) : toward)).trim();
  const sameAsAnswer = cf.toLowerCase() === answer.toLowerCase();

  const size = compact ? 20 : 28;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 16, justifyContent: 'center', flex: 1 }}>
      <blockquote
        style={{
          margin: 0, fontSize: size, lineHeight: 1.35, fontWeight: 450, color: 'var(--ink)',
          borderLeft: `4px solid ${censored ? 'var(--band-robust)' : 'var(--alt)'}`, paddingLeft: compact ? 14 : 20,
          maxWidth: '34ch', textWrap: 'pretty',
        }}
      >
        {censored ? (
          <>
            Even a <strong>large</strong> internal push ({stats.maxAlpha}) did not change this answer: the model still
            says “<span className="tok answer">{answer}</span>”.
          </>
        ) : (
          <>
            A <strong>{BAND_WORD[band]}</strong> internal nudge toward “<span className="tok alt">{toward}</span>”{' '}
            <span style={{ color: 'var(--muted)', fontSize: '0.62em', whiteSpace: 'nowrap' }}>
              (strength {fmtPush(item.margin!)}, layer {item.margin_layer})
            </span>{' '}
            makes the model answer “<strong className={`tok ${sameAsAnswer ? 'answer' : 'alt'}`}>{cf}</strong>” instead
            of “<span className="tok answer">{answer}</span>”.
          </>
        )}
      </blockquote>
      <p style={{ color: 'var(--muted)', fontSize: compact ? 13 : 15 }}>
        {censored ? 'Among the most robust answers tested.' : comparePhrase(item, stats, 'short')}
      </p>
      {!compact && (
        <p className="explain" style={{ maxWidth: '48em' }}>
          “Nudge” = adding a direction to the model's internal state at one layer, pointing from “{answer}”
          toward “{toward}”, sized relative to the state itself. Size word: small / moderate / large = the lower, middle
          or upper third of robustness scores in this set.
        </p>
      )}
    </div>
  );
}
