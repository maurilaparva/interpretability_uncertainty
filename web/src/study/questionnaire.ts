import { BAND_WORD, bandOf, fmtMargin } from '../lib/data';
import type { Dataset, Stats } from '../lib/types';
import { DEFAULT_VIEW_ORDER, type RotatedView } from './viewOrder.ts';

export type StudyView = 'overview' | 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'compare';
export type TaskSet = 'A' | 'B';

export function studyDatasetKey(data: Dataset): string {
  return `questionnaire-v2|${data.meta.model}|${data.meta.generated_at}`;
}

export interface StudyOption {
  value: string;
  label: string;
}

export interface StudyQuestion {
  id: string;
  prompt: string;
  type: 'single' | 'multi' | 'text' | 'scale' | 'ranking';
  options?: StudyOption[];
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  multiline?: boolean;
  required?: boolean;
}

export interface StudyStep {
  id: string;
  title: string;
  section: string;
  description?: string;
  questions: StudyQuestion[];
  /** explore = free exploration; tour = the guided "learn the views" walk-through. */
  mode?: 'form' | 'explore' | 'tour' | 'task' | 'reveal';
  /** Parts of the study with rough minutes, shown on the opening "how this study works" step. */
  outline?: { title: string; minutes: number; text: string }[];
  itemIds?: string[];
  initialView?: StudyView;
  hideExplorer?: boolean;
}

/** A stop on the explore step's tour: one of the views, or the opening "meet the question" page. */
export type TourStop = StudyView | 'question' | 'layers';

/** The explore tour has three parts: concepts (same for everyone), the rotated views, then all views together. */
export type TourPart = 'learn' | 'explore' | 'compare';
export interface TourStopInfo { view: TourStop; part: TourPart; label: string; hint: string }

const TOUR_TEXT: Record<TourStop, { label: string; hint: string }> = {
  question: { label: 'The question', hint: 'What the model was asked, and what it answered.' },
  r0: { label: 'R0 Baseline', hint: 'How likely the model rated its answer: the confidence number AI tools usually show.' },
  layers: { label: 'Inside the model', hint: 'The model works through the question in layers. A push nudges one of them.' },
  overview: { label: 'All questions', hint: 'All 24 questions: how confident the model is, and how big a push flips each answer. The Japan question (Tokyo) is circled.' },
  r1: { label: 'R1 Score', hint: 'One robustness score for Japan: the smallest push that flips it, compared with the other questions.' },
  r2: { label: 'R2 Flip curve', hint: 'Pushes of every strength at every layer, and where the answer flips.' },
  r3: { label: 'R3 Push it', hint: 'Push the model toward another answer with the slider, and watch when its answer flips.' },
  r4: { label: 'R4 Counterfactual', hint: 'The finding in one sentence.' },
  compare: { label: 'Compare all', hint: 'All the views side by side for this question.' },
};

/**
 * The explore step's tour. The concepts come first in a fixed order (each needs the one before); R1–R4 follow in the
 * participant's rotated order, so no view gains from always coming early or late; Compare all is last for everyone.
 */
export function tourFor(order: readonly RotatedView[]): TourStopInfo[] {
  const stops: [TourStop, TourPart][] = [
    ['question', 'learn'], ['r0', 'learn'], ['layers', 'learn'], ['overview', 'learn'],
    ...order.map((view): [TourStop, TourPart] => [view, 'explore']),
    ['compare', 'compare'],
  ];
  return stops.map(([view, part]) => ({ view, part, ...TOUR_TEXT[view] }));
}

export const STUDY_VIEWS: StudyOption[] = [
  { value: 'r0', label: 'R0 · Baseline confidence' },
  { value: 'r1', label: 'R1 · Margin score' },
  { value: 'r2', label: 'R2 · Flip curve' },
  { value: 'r3', label: 'R3 · Push it yourself' },
  { value: 'r4', label: 'R4 · Counterfactual' },
];

const ALL_VIEWS: StudyOption[] = [
  { value: 'overview', label: 'Overview' },
  ...STUDY_VIEWS,
  { value: 'compare', label: 'Compare all' },
];

// Curated against items.json: both task sets contain two correct and two incorrect answers.
const TASK_SETS = {
  A: { steering: 'q04', predictions: ['q09', 'q19', 'q17', 'q21'] },
  B: { steering: 'q24', predictions: ['q23', 'q22', 'q08', 'q19'] },
} as const;

export function supportsStudyDataset(data: Dataset): boolean {
  if (data.meta.is_mock) return false;
  const ids = new Set(data.items.map((item) => item.id));
  return ['q01', ...Object.values(TASK_SETS).flatMap((set) => [set.steering, ...set.predictions])]
    .every((id) => ids.has(id));
}

const options = (labels: string[]): StudyOption[] => labels.map((label) => ({ value: label, label }));
const single = (id: string, prompt: string, labels: string[]): StudyQuestion => ({
  id, prompt, type: 'single', options: options(labels), required: true,
});
const text = (id: string, prompt: string, multiline = true, required = true): StudyQuestion => ({
  id, prompt, type: 'text', multiline, required,
});
const scale = (
  id: string, prompt: string, lowLabel = 'Strongly disagree', highLabel = 'Strongly agree', max = 7,
): StudyQuestion => ({ id, prompt, type: 'scale', min: 1, max, lowLabel, highLabel, required: true });
const multi = (id: string, prompt: string, choices: StudyOption[]): StudyQuestion => ({
  id, prompt, type: 'multi', options: choices, required: true,
});

/** Participant-facing copy only. No answer keys or grading results are included. */
export function buildStudySteps(data: Dataset, stats: Stats, taskSet: TaskSet, viewOrder: readonly RotatedView[] = DEFAULT_VIEW_ORDER): StudyStep[] {
  if (!supportsStudyDataset(data)) return [];

  const set = TASK_SETS[taskSet];
  const findItem = (id: string) => data.items.find((item) => item.id === id)!;
  const first = findItem('q01');
  const steering = findItem(set.steering);
  const score = fmtMargin(first, stats);
  const band = bandOf(first, stats);
  const sizeWord = BAND_WORD[band];
  const percent = ((first.margin ?? 0) * 100).toFixed(1);
  const questionLabel = (id: string) => findItem(id).question;

  const steps: StudyStep[] = [
    {
      // What participants will do and for how long. Describes the activities only, never what we expect to find,
      // and explains no concepts, so the free exploration that follows stays unprompted.
      id: 'outline', section: 'Before you start', title: 'How this study works',
      description: 'Five parts, about 20–30 minutes in total. Your progress is saved, so you can pause between parts.',
      mode: 'form', hideExplorer: true, questions: [],
      outline: [
        { title: 'About you', minutes: 2, text: 'A few questions about your background.' },
        { title: 'Explore on your own', minutes: 4, text: 'Look around the interface freely, then tell us your first impressions.' },
        { title: 'Learn the views and try some tasks', minutes: 10, text: 'A short guided tour of each view, then a few tasks that use them.' },
        { title: 'Rate the views', minutes: 5, text: 'Look at each view again and rate it.' },
        { title: 'Final questions', minutes: 6, text: 'What you understood, how far you would trust it, and any feedback.' },
      ],
    },
    {
      id: 'background', section: 'A · Background', title: 'A little about your experience',
      mode: 'form', hideExplorer: true,
      questions: [
        single('A2', 'What is your current program?', ['Undergraduate', 'Master’s', 'PhD', 'Other', 'Prefer not to say']),
        scale('A3', 'How familiar are you with large language models?', 'I rarely use them', 'I train or fine-tune them', 5),
        scale('A4', 'How familiar are you with mechanistic interpretability?', 'Never heard of it', 'I do research in it', 5),
        single('A5', 'Have you used a tool that edits or steers a model’s internal activations?', ['Yes', 'No', 'Not sure']),
        scale('A6', 'How familiar are you with confidence or uncertainty scores in machine learning?', 'Not at all', 'Very familiar', 5),
      ],
    },
    {
      // Free, unprompted exploration (QUESTIONS.md, section B): the first impressions are only meaningful before any
      // explanation, so the guided tour comes later, at the start of C.
      id: 'explore', section: 'B · First impressions', title: 'Take a look around', mode: 'explore',
      description: 'Explore for about 3 minutes, however you like. Choose questions, switch views, and move the sliders. Then you will answer a few questions without coming back.',
      initialView: 'overview', hideExplorer: false, questions: [],
    },
    {
      id: 'first-impressions', section: 'B · First impressions', title: 'What stood out?',
      description: 'Answer from your first impressions, without returning to the interface.',
      mode: 'form', hideExplorer: true,
      questions: [
        text('B1', 'In one or two sentences, what do you think this interface is showing you?'),
        text('B2', 'In your own words, what does “Robustness” mean here?'),
        multi('B3', 'Which views did you open?', ALL_VIEWS),
        single('B4', 'Did you open “About this method”?', ['Yes, read most of it', 'Yes, skimmed it', 'No']),
        scale('B5', 'It was clear where to start.'),
        text('B6', 'What was the first thing that confused you, if anything?', false),
      ],
    },
    {
      // Concepts first (fixed order), then R1–R4 in the participant's rotated order, then Compare all (tourFor).
      id: 'learn-views', section: 'C · Guided tasks', title: 'Learn the views', mode: 'tour',
      description: 'Learn the ideas first, then go through each view, in order. About 4 minutes.',
      itemIds: ['q01'], hideExplorer: false, questions: [],
    },
    {
      id: 'read-answer', section: 'C · Guided tasks', title: 'Read one answer', mode: 'task',
      description: `Look at “${first.question}” in Compare all. For any answer you cannot determine, enter “Not sure”.`,
      itemIds: ['q01'], initialView: 'compare',
      questions: [
        text('C1', 'What is the model’s output confidence in its answer?', false, true),
        text('C2', 'If the answer flips, which word does it flip to?', false, true),
        text('C3', 'At which layer is this answer easiest to flip?', false, true),
        single('C4', 'Compared with the other questions, this answer is…', ['Easier to flip than most', 'About average', 'Harder to flip than most', 'Not sure']),
        scale('C5', 'How confident are you in your answers above?', 'Not at all confident', 'Very confident'),
      ],
    },
    {
      id: 'steer-answer', section: 'C · Guided tasks', title: 'Try an internal push', mode: 'task',
      description: `For “${steering.question}”, leave the layer where it is. Slowly increase Push strength from 0 until the answer changes. Then reset the push to 0, set Layer to 5, and try again.`,
      itemIds: [steering.id], initialView: 'r3',
      questions: [
        text('C6', 'At the default layer, at what push strength did the answer first change?', false, true),
        text('C7', 'What did the answer change to?', false, true),
        single('C8', 'At layer 5, compared with the default layer, the answer…', ['Changed at a smaller push', 'Changed at about the same push', 'Changed at a larger push', 'Never changed', 'Not sure']),
        scale('C9', 'What happened as I moved the slider matched what I expected.'),
        single('C10', 'Did you use Auto-play?', ['Yes, before dragging myself', 'Yes, after dragging myself', 'No']),
      ],
    },
  ];

  // QUESTIONS.md requires ≥90% confidence AND the Fragile band. The current dataset has
  // no such item, so Task 3 is omitted rather than presenting a false disagreement case.
  const disagreement = data.items.find((item) => item.p_answer >= 0.9 && bandOf(item, stats) === 'Fragile');
  const highRobust = data.items.find((item) => item.p_answer >= 0.9 && bandOf(item, stats) === 'Robust');
  const lowFragile = data.items.find((item) => item.p_answer < 0.9 && bandOf(item, stats) === 'Fragile');
  if (disagreement && highRobust && lowFragile) {
    const comparisonItems = taskSet === 'A'
      ? [highRobust, disagreement, lowFragile]
      : [lowFragile, highRobust, disagreement];
    steps.push({
      id: 'compare-signals', section: 'C · Guided tasks', title: 'Compare the two signals', mode: 'task',
      description: 'Look at each of these three questions in Compare all.',
      itemIds: comparisonItems.map((item) => item.id), initialView: 'compare',
      questions: [
        {
          id: 'C11', type: 'single', prompt: 'Which question has high output confidence but is easy to flip?', required: true,
          options: [...comparisonItems.map((item) => ({ value: item.id, label: item.question })),
            { value: 'none', label: 'None of them' }, { value: 'not-sure', label: 'Not sure' }],
        },
        text('C12', 'For that question, would you trust the model’s answer? Why or why not?'),
      ],
    });
  }

  steps.push(
    {
      id: 'predict-correctness', section: 'C · Guided tasks', title: 'Make your predictions', mode: 'task',
      description: 'Look at these four questions using any view. Judge each model answer before revealing the answer key. Your predictions will be locked when you continue.',
      itemIds: [...set.predictions], initialView: 'compare',
      questions: [
        ...set.predictions.map((id) => single(`C13_${id}`, questionLabel(id), [
          'Definitely wrong', 'Probably wrong', 'Probably right', 'Definitely right', 'Not sure',
        ])),
        multi('C14', 'Which views did you use to decide?', [...STUDY_VIEWS, { value: 'own-knowledge', label: 'My own knowledge of the answer' }]),
        scale('C15', 'How much did you rely on your own knowledge versus the interface?', 'Only my own knowledge', 'Only the interface'),
      ],
    },
    {
      id: 'reveal-answers', section: 'C · Guided tasks', title: 'Check your predictions', mode: 'reveal',
      description: 'The answer key is now available. Check the four questions, then share anything that surprised you.',
      itemIds: [...set.predictions], initialView: 'compare',
      questions: [text('C16', 'Did anything surprise you once you saw the answer key?')],
    },
    {
      id: 'steering-ratings', section: 'D · Steering experience', title: 'How did steering feel?',
      mode: 'form', hideExplorer: true,
      questions: [
        scale('D1a', 'I felt like I was controlling what the model would say.'),
        scale('D1b', 'I understood what “push strength” represents.'),
        scale('D1c', 'I understood what “layer” represents and why it matters.'),
        scale('D1d', 'Watching the answer flip helped me understand how stable the answer is.'),
        scale('D1e', 'The “flips at” marker matched what I saw when I pushed.'),
        scale('D1f', 'I wanted to push the model toward a word of my own choosing.'),
        scale('D1g', 'Steering felt like a way to test the model, not just a demo.'),
      ],
    },
    {
      id: 'steering-feedback', section: 'D · Steering experience', title: 'What did the controls do?',
      mode: 'form', hideExplorer: true,
      questions: [
        single('D2', 'While using Push it, did it feel like you were changing a live model or replaying recorded results?', ['Changing the live model', 'Replaying recorded results', 'Not sure', 'I didn’t think about it']),
        single('D3', 'Did you notice the note “Values are precomputed; the slider snaps to tested strengths”?', ['Yes', 'No']),
        text('D4', 'Describe a moment when pushing did something you did not expect.'),
        text('D5', 'If you could add one control to Push it, what would it be?', false),
      ],
    },
    // Rate R0 (the baseline) first, then R1–R4 in the same rotated order the participant explored them in.
    ...['r0', ...viewOrder].map((value) => STUDY_VIEWS.find((view) => view.value === value)!).map((view): StudyStep => ({
      id: `rate-${view.value}`, section: 'E · Rate the views', title: view.label,
      description: 'Take another look at this view, then rate your experience.',
      mode: 'task', itemIds: ['q01'], initialView: view.value as StudyView,
      questions: [
        scale(`E1_${view.value}`, 'I understood what this view was showing.'),
        scale(`E2_${view.value}`, 'This view helped me decide whether to trust the answer.'),
        scale(`E3_${view.value}`, 'This view was visually clear.'),
      ],
    })),
    {
      id: 'view-preferences', section: 'E · Rate the views', title: 'Which views worked best?',
      mode: 'form', hideExplorer: true,
      questions: [
        { id: 'E4', type: 'ranking', prompt: 'Rank the views from most to least useful.', options: STUDY_VIEWS, required: true },
        single('E5', `In R1, ${score} is labeled “${band}”. Did ${score} seem like a small or a large number to you?`, ['Small', 'Large', 'I had no sense of scale', 'Didn’t notice']),
        scale('E6', `In R4, “a ${sizeWord} internal nudge” matched the strength of ${score} shown.`),
        text('E7', 'Which view was most confusing, and why?'),
      ],
    },
    {
      id: 'understanding-scores', section: 'F · Understanding check', title: 'Reading the scores',
      description: 'Answer from your understanding. “Not sure” is always an option.',
      mode: 'form', hideExplorer: true,
      questions: [
        single('F1', `For question 1, “Robustness ${score}” means…`, [
          `The model is ${percent}% confident in “${first.answer_text}”`,
          `A push about ${percent}% the size of the model’s internal state at one layer is enough to change the answer`,
          `There is a ${percent}% chance the answer is wrong`,
          `${percent}% of the layers change the answer`,
          'Not sure',
        ]),
        single('F2', 'If the model’s output confidence is 99%, its answer must also be hard to flip.', ['True', 'False', 'Not sure']),
        single('F3', 'The Fragile / Moderate / Robust labels are based on…', [
          'Fixed thresholds from the original paper', 'How the answer compares with the other questions in this set', 'Whether the answer is correct', 'Not sure',
        ]),
      ],
    },
    {
      id: 'understanding-interventions', section: 'F · Understanding check', title: 'Understanding the push',
      mode: 'form', hideExplorer: true,
      questions: [
        single('F4', 'In the R2 flip curve, the grey lines show…', ['The same push at other layers', 'Other questions', 'Other models', 'Random noise', 'Not sure']),
        single('F5', 'Where is the push applied?', [
          'To the wording of the question', 'To the model’s internal state at one layer, while it reads the question', 'To the model’s weights, permanently', 'To the final probabilities only', 'Not sure',
        ]),
        single('F6', 'If the answer changes from “William Shakespeare” to “Shakespeare”, does that count as a flip here?', ['Yes', 'No', 'Not sure']),
        single('F7', 'A small robustness score tells you that…', [
          'The answer is definitely wrong',
          'The answer changes under a small tested internal push; this alone does not establish whether it is correct',
          'The model is larger than usual',
          'The model assigns a low probability to every answer',
          'Not sure',
        ]),
      ],
    },
    {
      id: 'trust-ratings', section: 'G · Trust and usefulness', title: 'How did this affect your trust?',
      mode: 'form', hideExplorer: true,
      questions: [
        scale('G1a', 'Robustness told me something that output confidence alone did not.'),
        scale('G1b', 'I could tell when to trust an answer and when to doubt it.'),
        scale('G1c', 'I would want robustness shown next to confidence in an AI tool I use.'),
        scale('G1d', 'Seeing answers flip made me trust the model less overall.'),
        scale('G1e', 'The interface made the model’s internal workings feel understandable.'),
        scale('G1f', 'The visuals made the model seem more reliable than I think it really is.'),
      ],
    },
    {
      id: 'trust-feedback', section: 'G · Trust and usefulness', title: 'Where would this help?',
      mode: 'form', hideExplorer: true,
      questions: [
        single('G2', 'For a high-stakes question, which signal would you rely on more?', ['Output confidence', 'Robustness', 'Both equally', 'Neither', 'Not sure']),
        text('G3', 'Did you find a question where confidence and robustness disagreed? What did you conclude?'),
        text('G4', 'Describe a situation where you would actually use a tool like this.'),
      ],
    },
    {
      id: 'usability', section: 'H · Your feedback', title: 'How easy was it to use?',
      mode: 'form', hideExplorer: true,
      questions: [
        scale('H1', 'This interface’s capabilities meet my requirements.'),
        scale('H2', 'This interface is easy to use.'),
        scale('H3', 'How mentally demanding was it to use this interface?', 'Very low', 'Very high'),
      ],
    },
    {
      id: 'final-feedback', section: 'H · Your feedback', title: 'One last thought',
      description: 'If nothing comes to mind, enter “None”.',
      mode: 'form', hideExplorer: true,
      questions: [
        text('H4', 'One thing we should keep exactly as it is.', false),
        text('H5', 'One thing we should change first.', false),
        text('H6', 'Did anything look broken, overlap, or behave oddly?'),
        text('H7', 'Anything else you want to tell us?'),
      ],
    },
  );
  return steps;
}
