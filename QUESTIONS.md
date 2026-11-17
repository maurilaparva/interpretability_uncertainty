User Study Questionnaire — Mechanistic Uncertainty Interface
Nov 16, 2026 · @Mauricio Villavicencio
How to run it
Run it as a ~20-minute, self-paced session. Each participant works alone with the interface in one tab and the form in another. The form mixes graded tasks (did they read the views correctly?) with ratings and open questions (how did steering feel?), so you get both performance and perception data.
Part
Form section
Time
Consent + background
A
2 min
Free exploration, then first impressions
B
4 min
Guided tasks (read, steer, compare, predict)
C
8 min
Steering experience
D
2 min
Rate each view (R0–R4)
E
2 min
Understanding check
F
2 min
Trust, usability, open feedback
G, H
3 min
Setup notes for Google Forms:
Put each lettered section, and each task in C, on its own form page (Add section). Participants then cannot read ahead, and Task 4 predictions are made before the answer key is revealed.
Turn on Settings → Make this a quiz, give points only to Sections C and F, and set grade release to manual. Nobody sees correct answers mid-class.
For 1–7 agreement items, use a Multiple-choice grid: rows are the statements, columns are 1 (Strongly disagree) to 7 (Strongly agree).
Add “Not sure” to every graded multiple-choice question so guesses show up as uncertainty, not errors.
Optional counterbalancing: odd birth months use task set A, even use set B (two different question choices for Tasks 2–4). This stops neighbors converging on the same answers.
What to say at the start, and nothing more: “This tool shows how stable a language model’s answer is inside the model. Explore it, then follow the form. Keep Show answer key off until the form tells you to turn it on.” Leaving the method unexplained is deliberate, since the About panel is part of what you are testing.
If you might publish these responses beyond the class report, check with UMD’s IRB before running; class-only use usually does not need it, but confirm with the instructor.
Section A — Consent and background
Form description text: “This short study is part of a CMSC839E class project. It takes about 20 minutes. Participation is voluntary, responses are anonymous and used only for our project report, and you can stop at any time.”
A1. I have read the description above and agree to participate. — Multiple choice (required): Yes / No (route “No” to submit)
A2. What is your current program? — Multiple choice: Undergraduate / Master’s / PhD / Other
A3. How familiar are you with large language models (LLMs)? — Linear scale 1–5: 1 = I rarely use them, 5 = I train or fine-tune them
A4. How familiar are you with mechanistic interpretability (e.g., logit lens, probing, activation steering)? — Linear scale 1–5: 1 = Never heard of it, 5 = I do research in it
A5. Have you used a tool that edits or steers a model’s internal activations (e.g., Neuronpedia steering, TransformerLens hooks)? — Multiple choice: Yes / No / Not sure
A6. How familiar are you with confidence or uncertainty scores in machine learning? — Linear scale 1–5: 1 = Not at all, 5 = Very familiar
A7. Birth month (only used to assign a task set). — Dropdown: January–December, then branch odd → Set A, even → Set B (skip if not counterbalancing)
Section B — First impressions
Page instruction: “Spend 3 minutes exploring the interface however you like. Click questions, switch views, move sliders. Then answer below without going back.” These answers capture the unprompted mental model, before any task shapes it.
B1. In one or two sentences, what do you think this interface is showing you? — Paragraph
B2. In your own words, what does “Robustness” mean here? — Paragraph
B3. Which views did you open? — Checkboxes: Overview / R0 Baseline / R1 Score / R2 Flip curve / R3 Push it / R4 Counterfactual / Compare all
B4. Did you open “About this method”? — Multiple choice: Yes, read most of it / Yes, skimmed it / No
B5. It was clear where to start. — Linear scale 1–7 (Strongly disagree → Strongly agree)
B6. What was the first thing that confused you, if anything? — Short answer
Section C — Guided tasks
Four tasks, each on its own form page, each with an answer you can grade. Task 1 tests reading, Task 2 tests steering, Task 3 tests comparing the two signals, and Task 4 tests whether the views help people judge correctness. Bracketed names like [FRAGILE-Q] are placeholders; the last section says how to pick them.
Task 1 — Read one answer
Instruction: “Select question 1, What is the capital of Japan?, and open Compare all.”
C1. What is the model’s output confidence in its answer? — Short answer
C2. If the answer flips, which word does it flip to? — Short answer
C3. At which layer is this answer easiest to flip? — Short answer
C4. Compared with the other questions, this answer is… — Multiple choice: Easier to flip than most / About average / Harder to flip than most / Not sure
C5. How confident are you in your answers to C1–C4? — Linear scale 1–7
Task 2 — Push it yourself
Instruction: “Select [FRAGILE-Q] and open R3 Push it. Leave the layer where it is. Slowly drag Push strength up from 0 until the model’s answer changes.”
C6. At what push strength did the answer first change? — Short answer
C7. What did the answer change to? — Short answer
C8. Now set Layer to 5 and push again. Compared with the default layer, the answer… — Multiple choice: Changed at a smaller push / Changed at about the same push / Changed at a larger push / Never changed / Not sure
C9. What happened as I moved the slider matched what I expected. — Linear scale 1–7
C10. Did you use Auto-play? — Multiple choice: Yes, before dragging myself / Yes, after dragging myself / No
Task 3 — When the two signals disagree
Instruction: “Look at [Q-X], [Q-Y] and [Q-Z] in Compare all.”
C11. Which of these has high output confidence but is easy to flip? — Multiple choice: [Q-X] / [Q-Y] / [Q-Z] / None of them / Not sure
C12. For that question, would you trust the model’s answer? Why or why not? — Paragraph
Task 4 — Spot the wrong answers
Instruction: “Keep Show answer key OFF. Look at [Q-P], [Q-Q], [Q-R] and [Q-S]. Some answers are wrong. Use any view you like.”
C13. Do you think the model’s answer is correct? — Multiple-choice grid. Rows: [Q-P], [Q-Q], [Q-R], [Q-S]. Columns: Definitely wrong / Probably wrong / Probably right / Definitely right
C14. Which views did you use to decide? — Checkboxes: R0 Baseline / R1 Score / R2 Flip curve / R3 Push it / R4 Counterfactual / My own knowledge of the answer
C15. How much did you rely on your own knowledge versus the interface? — Linear scale 1–7: 1 = Only my own knowledge, 7 = Only the interface
Next page instruction: “Now turn on Show answer key and check your four answers.”
C16. Did anything surprise you once you saw the answer key? — Paragraph
C15 matters because these are easy trivia questions: most people know Canberra without any interface. Pick at least one Task 4 question that few classmates will know, or the task measures trivia knowledge instead of the tool.
Section D — The steering experience
This section answers “did you feel like you could steer?” directly. It separates feeling in control from understanding what the control does, since those can come apart.
D1. Rate your agreement. — Multiple-choice grid, columns 1 (Strongly disagree) to 7 (Strongly agree). Rows:
Row
Statement
Measures
D1a
I felt like I was controlling what the model would say.
Sense of agency
D1b
I understood what “push strength” represents.
Understanding of the control
D1c
I understood what “layer” represents and why it matters.
Understanding of the control
D1d
Watching the answer flip helped me understand how stable the answer is.
Usefulness of steering
D1e
The “flips at” marker matched what I saw when I pushed.
Consistency across views
D1f
I wanted to push the model toward a word of my own choosing.
Desire for more control
D1g
Steering felt like a way to test the model, not just a demo.
Perceived purpose
D2. While using Push it, did it feel like you were changing the live model or replaying recorded results? — Multiple choice: Changing the live model / Replaying recorded results / Not sure / I didn’t think about it
D3. Did you notice the note “Values are precomputed; the slider snaps to tested strengths”? — Multiple choice: Yes / No
D4. Describe a moment when pushing did something you did not expect. — Paragraph
D5. If you could add one control to Push it, what would it be? — Short answer
D2 and D3 together tell you whether people over-attribute live control to a precomputed slider, which is worth reporting either way.
Section E — Rating each view
Since your study conditions are the different uncertainty representations, rate every view on the same three dimensions. That gives a clean within-subject comparison of R0–R4.
E1–E3. Three Multiple-choice grids, one per statement. Rows in each: R0 Baseline confidence / R1 Margin score / R2 Flip curve / R3 Push it yourself / R4 Counterfactual sentence. Columns: 1 (Strongly disagree) to 7 (Strongly agree).
Grid
Statement
Measures
E1
I understood what this view was showing.
Comprehension
E2
This view helped me decide whether to trust the answer.
Decision usefulness
E3
This view was visually clear.
Visual clarity
E4. Rank the views from most to least useful. — Multiple-choice grid with rows R0–R4 and columns 1st–5th; turn on “Limit to one response per column” so it behaves like a ranking
E5. In R1, the score 0.048 is labeled “Robust.” Did 0.048 seem like a small or a large number to you? — Multiple choice: Small / Large / I had no sense of scale / Didn’t notice
E6. In R4, the sentence calls a strength of 0.048 “a large internal nudge.” That wording matched the number shown. — Linear scale 1–7
E7. Which view was most confusing, and why? — Paragraph
E5 and E6 target a real tension in the design: the bands are relative to this question set, so a number that looks tiny is labeled robust and described as large.
Section F — Understanding check
Seven graded multiple-choice questions on what the views mean. Compare scores with B2 to see how the mental model changed after use. Correct answers are in the answer key below, not here, so you can paste these straight in.
F1. For question 1, “Robustness 0.048” means…
The model is 4.8% confident in “Tokyo”
A push about 4.8% the size of the model’s internal state at one layer is enough to change the answer
There is a 4.8% chance the answer is wrong
4.8% of the layers change the answer
Not sure
F2. True or false: if the model’s output confidence is 99%, its answer must also be hard to flip.
True
False
Not sure
F3. The Fragile / Moderate / Robust labels are based on…
Fixed thresholds from the original paper
How the answer compares with the other questions in this set
Whether the answer is correct
Not sure
F4. In the R2 flip curve, the grey lines show…
The same push at other layers
Other questions
Other models
Random noise
Not sure
F5. Where is the push applied?
To the wording of the question
To the model’s internal state at one layer, while it reads the question
To the model’s weights, permanently
To the final probabilities only
Not sure
F6. If the model’s answer changes from “William Shakespeare” to “Shakespeare,” does that count as a flip here?
Yes
No
Not sure
F7. A small robustness score most likely means…
The answer is definitely wrong
The answer is more likely to be wrong or uncertain
The model is larger than usual
Nothing about the answer’s quality
Not sure
Section G — Trust and usefulness
This section asks whether robustness adds anything over plain confidence. Your About page reports ρ = 0.71 between the two, so the honest question is whether people noticed the exceptions.
G1. Rate your agreement. — Multiple-choice grid, columns 1 (Strongly disagree) to 7 (Strongly agree). Rows:
Row
Statement
G1a
Robustness told me something that output confidence alone did not.
G1b
I could tell when to trust an answer and when to doubt it.
G1c
I would want robustness shown next to confidence in an AI tool I use.
G1d
Seeing answers flip made me trust the model less overall.
G1e
The interface made the model’s internal workings feel understandable.
G1f
The visuals made the model seem more reliable than I think it really is.
G2. For a high-stakes question (e.g., medical), which signal would you rely on more? — Multiple choice: Output confidence / Robustness / Both equally / Neither / Not sure
G3. Did you find a question where confidence and robustness disagreed? What did you conclude from it? — Paragraph
G4. Describe a situation where you would actually use a tool like this. — Paragraph
G1f probes over-trust caused by the visuals; G1d catches the opposite reaction, where seeing flips makes people distrust everything.
Section H — Usability and open feedback
H1 and H2 are the two UMUX-Lite items, a validated short usability scale, so your usability number is comparable with other systems without the length of the 10-item SUS.
H1. This interface’s capabilities meet my requirements. — Linear scale 1–7 (Strongly disagree → Strongly agree)
H2. This interface is easy to use. — Linear scale 1–7
H3. How mentally demanding was it to use this interface? — Linear scale 1–7: 1 = Very low, 7 = Very high
H4. One thing we should keep exactly as it is. — Short answer
H5. One thing we should change first. — Short answer
H6. Did anything look broken, overlap, or behave oddly? — Paragraph
H7. Anything else you want to tell us? — Paragraph
Answer key and placeholders
Fill the placeholders from your precomputed data before class; Task 1 and Section F already have answers.
Placeholders to pick
Placeholder
How to pick it
Set A pick
Set B pick
[FRAGILE-Q]
In the Fragile band, flips at the default layer well inside the slider range, to a meaningful word (a plausible wrong answer, not a fragment).
[Q-X], [Q-Y], [Q-Z]
One with confidence of 90% or more but in the Fragile band (the disagreement case), plus one high-and-robust and one low-and-fragile. If no question is high-confidence and fragile, drop Task 3 rather than force it.
[Q-P]–[Q-S]
Two answers the model got right and two it got wrong, with mixed robustness. At least one whose correct answer most classmates will not know.
Answer key
Item
Correct answer
Grading note
C1
99%
Accept 99 or 0.99
C2
Kyoto
C3
22
C4
Harder to flip than most
More robust than 91% of questions
C6
First slider value at or above [FRAGILE-Q]’s margin
The slider snaps to tested strengths, so accept the first snapped value past the flip point
C7
[FRAGILE-Q]’s flip word
C8
Larger push, or Never changed
Your data says the most fragile layer is always 22 or 23. Check layer 5 for your pick.
C11
[the disagreement question]
C13
Right / wrong per question from the answer key
Score as calibration: “Probably/Definitely right” on a correct answer counts as a hit
F1
A push about 4.8% the size of the internal state changes the answer
Push is α · ‖h‖ · v̂, with v̂ a unit vector
F2
False
Signals agree (ρ = 0.71) but not always
F3
How the answer compares with the other questions
Tertiles of this set
F4
The same push at other layers
F5
The model’s internal state at one layer
Last prompt position only
F6
No
Pieces of the same answer do not count
F7
More likely to be wrong or uncertain
Not “definitely wrong”
For analysis, the clearest result is likely C13 split by C14: are people who used R1–R4 better calibrated than those who used only R0 or their own knowledge?
One thing to fix tonight if you can: in the screenshot, R1’s axis tick labels (0.005, 0.01, 0.02…) are clipped at the bottom of the card. Otherwise expect it to show up in H6.