import { useEffect, useId, useState } from 'react';
import { bandOf, fmtMargin, fmtPush, pct, rowOfLayer, tokenRole, wordFor } from '../lib/data';
import { PlayIcon } from '../components/PlayIcon';
import type { Item, Stats } from '../lib/types';
import '../components/quick-guide.css';

/** First stop of the explore tour: the question and the model's answer, before any view. */
export function QuestionIntro({ item }: { item: Item }) {
  const answer = item.answer_text || item.answer_token.trim();
  return (
    <div className="study-question-intro">
      <span className="study-workspace-label">The question</span>
      <p className="study-intro-question">{item.question}</p>
      <span className="study-workspace-label">The model answered</span>
      <p className="study-intro-answer">{answer}</p>
      <p className="study-intro-note">
        The next views look at this one answer from different angles: <strong>how likely</strong> the model thinks
        “{answer}” is, and <strong>how hard it is to change</strong> that answer from inside the model.
      </p>
    </div>
  );
}

/** Explore tour stop before R3: what a layer is and what a push does, before the participant tries one. */
export function LayersIntro({ item, nLayers }: { item: Item; nLayers: number }) {
  const answer = item.answer_text || item.answer_token.trim();
  const third = Math.ceil(nLayers / 3);
  const groups = [['Early', 0, third], ['Middle', third, 2 * third], ['Late', 2 * third, nLayers]] as const;
  return (
    <div className="study-question-intro wide">
      <span className="study-workspace-label">Inside the model</span>
      <div className="study-layers" aria-hidden="true">
        <span className="study-layers-end">Question</span>
        {groups.map(([name, from, to]) => (
          <div key={name} className="study-layers-group">
            <div className="study-layers-cells">{Array.from({ length: to - from }, (_, i) => <i key={i} />)}</div>
            <span>{name} layers</span>
          </div>
        ))}
        <span className="study-layers-end answer">{answer}</span>
      </div>
      <p className="study-intro-note">
        The model does not jump straight to an answer. It passes the question through {nLayers} <strong>layers</strong>,{' '}
        <em>one after another</em>. Each layer updates an <strong>internal signal</strong>, and the last one turns that
        signal into the answer.
      </p>
      <p className="study-intro-note">
        A <strong>push</strong> nudges that signal at <em>one layer</em> toward a <strong>different answer</strong>.
        Then we watch whether the model still says “{answer}”. Next, you try one yourself.
      </p>
    </div>
  );
}


/**
 * Tour stop after "Inside the model" (was the quick guide's first two chapters): the participant pushes the answer
 * themselves, at a few layers, before meeting the views that summarise those pushes.
 */
export function PushIntro({ item, stats }: { item: Item; stats: Stats }) {
  const defaultRow = rowOfLayer(stats, item.margin_layer);
  const [row, setRow] = useState(defaultRow);
  const [ai, setAi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rangeId = useId();

  const firstFlip = item.curves.top1[row].findIndex((token) => tokenRole(item, token) !== 'answer');
  const animationEnd = firstFlip < 0 ? stats.alphas.length - 1 : Math.min(firstFlip + 1, stats.alphas.length - 1);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(ai + 1, animationEnd);
      setAi(next);
      if (next === animationEnd) setPlaying(false);
    }, ai === 0 ? 400 : 150);
    return () => window.clearTimeout(timer);
  }, [playing, ai, animationEnd]);

  const replay = () => {
    if (playing) { setPlaying(false); return; }
    if (reducedMotion) { setAi(animationEnd); return; }
    setAi(0);
    setPlaying(true);
  };

  const answer = wordFor(item, item.answer_token);
  const alternative = wordFor(item, item.alt_token);
  const top = item.curves.top1[row][ai];
  const changed = tokenRole(item, top) !== 'answer';
  // An early, a middle and the easiest layer: the same push lands very differently across them.
  const layerChoices = [...new Set([Math.min(5, stats.layers.length - 1), Math.floor((stats.layers.length - 1) / 2), defaultRow])].sort((a, b) => a - b);

  return (
    <div className="study-question-intro wide study-push-intro">
      <div>
        <span className="study-workspace-label">Try a push</span>
        <p className="study-intro-note">
          A <strong>push</strong> nudges the <strong>model’s internal signal</strong> toward a <strong>different answer</strong>, here
          “{alternative}”. The question stays the same.
        </p>
        <p className="study-intro-note">
          <strong>Push strength</strong> is how big the nudge is. 0 means no push.
        </p>
        <p className="study-intro-note">
          The <strong>layer</strong> is <em>where</em> the push is applied. Try the same push at different layers: the
          answer may react differently.
        </p>
        <p className="study-intro-fine">A strength of 0.05 adds a change 5% the size of the internal signal at that layer.</p>
      </div>
      <section className="guide-demo" aria-label="Recorded example">
        <div className="guide-answer-pair">
          <div><span className="guide-small-label">Original answer</span><strong>{answer}</strong></div>
          <span className="guide-push-arrow" aria-hidden="true">→</span>
          <div><span className="guide-small-label">Push toward</span><strong>{alternative}</strong></div>
        </div>
        <div className="guide-layers">
          <span className="guide-small-label">Apply the push at</span>
          <div className="guide-layer-track">{layerChoices.map((choice) => <button type="button" key={choice} aria-pressed={row === choice} className={row === choice ? 'active' : ''} onClick={() => { setPlaying(false); setRow(choice); }}><span>Layer</span>{stats.layers[choice]}</button>)}</div>
          <div className="guide-layer-ends"><span>Earlier</span><span>Later</span></div>
        </div>
        <div className="guide-range-heading"><label htmlFor={rangeId}>Push strength</label><output htmlFor={rangeId}>{fmtPush(stats.alphas[ai])}</output></div>
        <input id={rangeId} className="guide-range" type="range" min={0} max={stats.alphas.length - 1} step={1} value={ai}
          aria-valuetext={`Push strength ${fmtPush(stats.alphas[ai])} at layer ${stats.layers[row]}`}
          onChange={(event) => { setPlaying(false); setAi(Number(event.target.value)); }} />
        <div className="guide-range-ends"><span>No push</span><span>Stronger push</span></div>
        <div className={`guide-result${changed ? ' changed' : ''}`} role="status" aria-atomic="true">
          <div><span className="guide-small-label">At this push</span><strong key={top}>{wordFor(item, top)}</strong></div>
          <span className="guide-result-state">{changed ? 'Answer changed' : 'Same answer'}</span>
        </div>
        <div className="guide-demo-actions"><button type="button" className="guide-replay" onClick={replay}><PlayIcon playing={playing} />{playing ? 'Stop' : reducedMotion ? 'Show result' : 'See it change'}</button><button type="button" className="guide-reset" onClick={() => { setPlaying(false); setAi(0); }}>Reset</button></div>
        <p className="guide-data-note">The slider replays measured results at the tested strengths.</p>
      </section>
    </div>
  );
}

/** Tour stop before the Overview (was the quick guide's last chapter): the two numbers the Overview plots. */
export function ScoresIntro({ item, stats }: { item: Item; stats: Stats }) {
  const answer = item.answer_text || item.answer_token.trim();
  return (
    <div className="study-question-intro wide">
      <span className="study-workspace-label">Two scores for “{answer}”</span>
      <div className="study-scores">
        <div>
          <span className="study-scores-name">Output confidence</span>
          <strong>{pct(item.p_answer)}</strong>
          <p>How likely the model rated its answer <em>before</em> any push. The number from R0 Baseline.</p>
        </div>
        <div>
          <span className="study-scores-name">Robustness</span>
          <strong>{fmtMargin(item, stats)}</strong>
          <p>The <strong>smallest push</strong> that flips the answer, at the layer where it flips most easily. Bigger means <strong>harder to flip</strong>. {bandOf(item, stats)} compared with the other questions.</p>
        </div>
      </div>
      <p className="study-intro-note">
        The two scores measure <strong>different things</strong>: an answer can look confident and still be easy to flip.
        <em> Neither</em> score tells you whether the answer is correct.
      </p>
    </div>
  );
}
