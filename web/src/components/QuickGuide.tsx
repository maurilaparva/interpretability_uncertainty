import { useEffect, useId, useRef, useState } from 'react';
import { bandOf, fmtMargin, fmtPush, pct, rowOfLayer, tokenRole, wordFor } from '../lib/data';
import { PlayIcon } from './PlayIcon';
import type { Item, Stats } from '../lib/types';
import './quick-guide.css';

interface Props {
  items: Item[];
  stats: Stats;
  onClose: (completed: boolean) => void;
  onStep?: (step: number) => void;
  finishLabel?: string;
}

const CHAPTERS = ['Push strength', 'Layers', 'Read the scores'];

export function QuickGuide({ items, stats, onClose, onStep, finishLabel = 'Got it' }: Props) {
  // Use a separate example from the study's reading, steering, and prediction tasks.
  const item = items.find((candidate) => candidate.id === 'q06') ?? items.find((candidate) => candidate.margin != null && !candidate.censored) ?? items[0];
  const defaultRow = rowOfLayer(stats, item.margin_layer);
  const [chapter, setChapter] = useState(0);
  const [row, setRow] = useState(defaultRow);
  const [ai, setAi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const rangeId = useId();
  const instructionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    dialogRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [chapter]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setReducedMotion(media.matches); setPlaying(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

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

  const changeChapter = (next: number) => {
    setPlaying(false);
    setChapter(next);
    if (next !== 1) { setRow(defaultRow); setAi(0); }
    onStep?.(next);
  };

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
  const strength = stats.alphas[ai];
  const layerChoices = [...new Set([Math.min(5, stats.layers.length - 1), Math.floor((stats.layers.length - 1) / 2), defaultRow])].sort((a, b) => a - b);

  return (
    <dialog className="quick-guide" ref={dialogRef} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(false); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(false); }}>
      <div className="guide-inner">
        <header className="guide-header">
          <div><span className="guide-kicker">Quick guide</span><h2 id={titleId}>What makes an answer change?</h2></div>
          <button className="guide-close" type="button" aria-label="Close quick guide" onClick={() => onClose(false)}>×</button>
        </header>
        <nav className="guide-chapters" aria-label="Guide steps">
          {CHAPTERS.map((label, i) => <button key={label} type="button" className={chapter === i ? 'active' : ''} aria-current={chapter === i ? 'step' : undefined} onClick={() => changeChapter(i)}><span>{i + 1}</span>{label}</button>)}
        </nav>
        <div className="guide-body">
          <section className="guide-copy" key={chapter} aria-labelledby={`${titleId}-chapter`}>
            <span className="guide-step-number">0{chapter + 1}</span>
            <h3 id={`${titleId}-chapter`} ref={titleRef} tabIndex={-1}>{['Nudge an internal signal.', 'Choose where to nudge.', 'Two different measurements.'][chapter]}</h3>
            {chapter === 0 && <>
              <p>A <strong>push</strong> temporarily changes a signal inside the model, toward the displayed alternative.</p>
              <p><strong>Push strength</strong> controls how large that change is. Zero means no push.</p>
              <div className="guide-takeaway">The question stays the same. The internal signal changes.</div>
              <details className="guide-number-note"><summary>What do the numbers mean?</summary><p>A strength of 0.05 adds a change 5% the size of the internal state at that layer.</p></details>
            </>}
            {chapter === 1 && <>
              <p>A <strong>layer</strong> is a stage in the model’s computation. It chooses where the push is applied.</p>
              <p>Try another layer while keeping the push the same. The answer may respond differently.</p>
              <div className="guide-takeaway">Same push. Different place inside the model.</div>
            </>}
            {chapter === 2 && <>
              <dl className="guide-definitions">
                <div><dt>Output confidence</dt><dd>The probability assigned to the answer’s first token: a word or word piece.</dd></div>
                <div><dt>Robustness</dt><dd>The smallest push found across the tested layers that changes the answer. Higher means harder to change.</dd></div>
              </dl>
              <div className="guide-takeaway">Neither score guarantees that the answer is correct.</div>
              <p className="guide-fine-print">Fragile, Moderate, and Robust compare answers within this question set.</p>
            </>}
          </section>
          <section className="guide-demo" aria-label="Recorded example">
            <div className="guide-demo-heading"><span>{item.question}</span><span className="guide-recorded">Recorded example</span></div>
            <div className="guide-answer-pair">
              <div><span className="guide-small-label">Original answer</span><strong>{answer}</strong></div>
              <span className="guide-push-arrow" aria-hidden="true">→</span>
              <div><span className="guide-small-label">Push toward</span><strong>{alternative}</strong></div>
            </div>

            {chapter === 1 ? (
              <div className="guide-layers">
                <span className="guide-small-label">Apply the push at</span>
                <div className="guide-layer-track">{layerChoices.map((choice) => <button type="button" key={choice} aria-pressed={row === choice} className={row === choice ? 'active' : ''} onClick={() => { setPlaying(false); setRow(choice); }}><span>Layer</span>{stats.layers[choice]}</button>)}</div>
                <div className="guide-layer-ends"><span>Earlier</span><span>Later</span></div>
              </div>
            ) : chapter === 2 ? (
              <div className="guide-score-pair">
                <div><span className="guide-small-label">Output confidence</span><strong>{pct(item.p_answer)}</strong><span>Before the push</span></div>
                <div><span className="guide-small-label">Robustness</span><strong>{fmtMargin(item, stats)}</strong><span>{bandOf(item, stats)} in this set</span></div>
              </div>
            ) : <div className="guide-route" aria-label={`Push applied at layer ${item.margin_layer}`}><span>Question</span><span aria-hidden="true">→</span><span className="guide-route-layer">Push at layer {item.margin_layer}<i aria-hidden="true" /></span><span aria-hidden="true">→</span><span>Answer</span></div>}

            <div className="guide-range-heading"><label htmlFor={rangeId}>Push strength</label><output htmlFor={rangeId}>{fmtPush(strength)}</output></div>
            <input id={rangeId} className="guide-range" type="range" min={0} max={stats.alphas.length - 1} step={1} value={ai}
              aria-valuetext={`Push strength ${fmtPush(strength)} at layer ${stats.layers[row]}`} aria-describedby={instructionId}
              onChange={(event) => { setPlaying(false); setAi(Number(event.target.value)); }} />
            <div className="guide-range-ends"><span>No push</span><span>Stronger push</span></div>
            <div className={`guide-result${changed ? ' changed' : ''}`} role="status" aria-atomic="true">
              <div><span className="guide-small-label">At this push</span><strong key={top}>{wordFor(item, top)}</strong></div>
              <span className="guide-result-state">{changed ? 'Answer changed' : 'Same answer'}</span>
            </div>
            <div className="guide-demo-actions"><button type="button" className="guide-replay" onClick={replay}><PlayIcon playing={playing} />{playing ? 'Stop' : reducedMotion ? 'Show result' : 'See it change'}</button><button type="button" className="guide-reset" onClick={() => { setPlaying(false); setAi(0); }}>Reset</button></div>
            <p id={instructionId} className="guide-data-note">Sliders replay measured results at tested strengths.</p>
          </section>
        </div>
        <footer className="guide-footer"><span>{chapter + 1} of {CHAPTERS.length}</span><div>{chapter > 0 && <button type="button" className="btn" onClick={() => changeChapter(chapter - 1)}>Back</button>}<button type="button" className="guide-next" onClick={() => chapter < CHAPTERS.length - 1 ? changeChapter(chapter + 1) : onClose(true)}>{chapter === CHAPTERS.length - 1 ? finishLabel : 'Next'}<span aria-hidden="true">→</span></button></div></footer>
      </div>
    </dialog>
  );
}
