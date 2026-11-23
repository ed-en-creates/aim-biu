# Aim 2.0: CGPA & study planner for BIU students

An installable web app (PWA) for Benson Idahosa University students, starting with Computer Science. It's free and open source. There's no server, no AI service, no accounts and no tracking.

## What it does
- **Upload a portal screenshot.** Results or course registration pages are read **on the phone** by Tesseract (open-source text recognition, bundled in `vendor/`). The picture never leaves the device. The student checks and fixes the courses before saving.
- **BIU rules built in** (from the Faculty of Computing handbook):
  - Grading: A 70+ = 5, B 60–69 = 4, C 50–59 = 3, D 45–49 = 2, E 40–44 = 1, F = 0. Scores convert to letters.
  - Classes: First 4.50, 2:1 3.50, 2:2 2.40, Third 1.50, Pass 1.00.
  - **Weighted final grade by level** (§27): 5/20/35/40% (4-year), 0/25/35/40% (direct entry). There's also a "Simple CGPA" option.
  - Promotion rules (§16), plus retake handling ("every attempt counts" or "latest only").
  - The B.Sc. Computer Science course list for 100–400 level.
- **Target.** Shows the exact average needed from here. Grade goals for this semester put any B's where they cost least: lower levels first, then the subjects the student has struggled with. The difficulty of each course is worked out from past grades.
- **Study plan.** A weekly timetable weighted by units and difficulty, with reminders through a calendar file (.ics with alarms) or one-tap Google Calendar links.
- **Ask Spark.** A guided chat. Every answer is computed from the handbook and the student's results, and typed questions are matched by keywords. It never invents rules.
- **Spark the mascot.** Reacts with moods, synthesised sounds, confetti and haptics. All of it can be switched off, and it respects reduce-motion settings.
- **Other:** your own photo as the app icon, works offline, light and dark themes, backup and restore, undo.

## Run / deploy
Static files, no build step: `python3 -m http.server 8080`, then open http://localhost:8080.
Any static host works (Vercel, Netlify, GitHub Pages: all have free tiers). Bump `VERSION` in `sw.js` on every release.

## Tests
    node tests/logic.test.mjs     # BIU maths, weighted classes, suggestions, screenshot parsing, calendar

## To verify with BIU
- Whether the §27 level weighting applies to **part-time** students.
- How carryovers count in the CGPA (both attempts, or the latest only).
- The 300–400 level course units were transcribed from photos of the handbook. Check them against the original.
- The handbook and the portal disagree on some units (e.g. CSC 123). Screenshot imports use the portal's numbers.

## Licences
Tesseract.js (Apache-2.0), Nunito font (SIL OFL). See `vendor/tesseract/` and `fonts/OFL.txt`.
