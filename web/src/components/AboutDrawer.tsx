import { useEffect, useRef } from 'react';
import type { Loaded } from '../lib/data';
import type { Stats } from '../lib/types';

export function AboutDrawer({ loaded, stats, onClose }: { loaded: Loaded; stats: Stats; onClose: () => void }) {
  const { meta } = loaded.data;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const nLayers = stats.layers.length;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button ref={closeRef} className="btn close" onClick={onClose} aria-label="Close">✕</button>
        <h2 id="about-title">About this method</h2>

        {loaded.isMock && (
          <p className="note">
            <strong>Mock data.</strong> These curves are hand-made to look like real pipeline output; no model was run.
            {loaded.fallbackReason && <> ({loaded.fallbackReason})</>}
          </p>
        )}

        <h3>The idea</h3>
        <p>
          Ordinary confidence is read from the model's <em>output</em>: how likely its chosen word was.{' '}
          <strong>Mechanistic uncertainty</strong> asks how stable the <em>internal</em> computation producing that word
          is. Komanduri et al. (2026,{' '}
          <a href="https://arxiv.org/abs/2610.22636" target="_blank" rel="noreferrer">arXiv 2610.22636</a>) define a{' '}
          <strong>causal robustness margin</strong>: the smallest internal intervention that changes the model's output.
          A small margin means a fragile answer; they report that incorrect and uncertain answers tend to have smaller
          margins.
        </p>

        <h3>How this prototype approximates it</h3>
        <p style={{ marginBottom: 6 }}>This is an <strong>approximation</strong>, not the paper's exact method.</p>
        <ul>
          <li>
            <strong>Direction:</strong> a contrastive logit-lens direction{' '}
            <code>W_U[alt] − W_U[answer]</code> (answer vs. runner-up word), instead of the paper's Jacobian-lens concept
            vectors. This is the special case J = I.
          </li>
          <li>
            <strong>Push:</strong> added at one layer, at the last prompt position only, scaled by the size of the
            internal state there (<code>α · ‖h‖ · v̂</code>), so strengths are comparable across layers.
          </li>
          <li><strong>Flip:</strong> only the first answer token is checked.</li>
          <li>
            <strong>Aggregation:</strong> the margin is the smallest flip strength over {nLayers} tested layers; the
            paper's aggregation may differ.
          </li>
          <li>
            <strong>Grid:</strong> {stats.alphas.length} push strengths from 0 to {stats.maxAlpha} per layer (√-spaced on
            charts), with the flip point refined by binary search. “&gt; {stats.maxAlpha}” means it never flipped.
          </li>
        </ul>

        <h3>Limitations</h3>
        <ul>
          <li>A single alternative direction per question (no random-direction control).</li>
          <li>A small model and a short demo question set.</li>
          <li>Not validated against the paper's numbers or against human judgments.</li>
          <li>Fragility bands are relative to <em>this</em> question set (tertiles), not absolute.</li>
        </ul>

        <h3>This dataset</h3>
        <table className="meta-table">
          <tbody>
            <tr><td>Model</td><td>{meta.model}</td></tr>
            <tr><td>Layers</td><td>{meta.n_layers}{nLayers !== meta.n_layers ? ` (${nLayers} tested)` : ''}</td></tr>
            <tr><td>Generated</td><td>{meta.generated_at}</td></tr>
            <tr><td>Note</td><td>{meta.method_note}</td></tr>
          </tbody>
        </table>
      </aside>
    </>
  );
}
