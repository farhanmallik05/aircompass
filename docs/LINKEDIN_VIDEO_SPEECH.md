# AirCompass — LinkedIn Demo Video Speech Script
**Target:** ≤ 3 minutes | Tone: Builder-first, energetic, honest

---

## 🎬 OPENING HOOK (0:00–0:20)

*[Show the Today view — AQI 259, NAQI 316, red "Severe" chip on screen]*

> "Delhi AQI: 259. NAQI: 316. Severe smog.
> My kids need to go to school. My elderly parents need their morning walk.
> My wife needs to commute.
> And every air quality app gives me the same advice:
> **'Stay indoors.'**
> That's it. That's the whole plan."

*[Beat. Look at camera.]*

> "So I built something better. This is **AirCompass**."

---

## 🧩 THE PROBLEM (0:20–0:40)

*[Stay on Today view, point to the AQI chip]*

> "India has 21 of the world's 30 most polluted cities.
> Existing apps show you a number — but numbers don't tell a family of five
> *what to do, when to do it, and what it actually costs* to change their routine.
> 
> Real people need a **personalised, honest, actionable plan** —
> not a generic warning."

---

## 💡 THE SOLUTION (0:40–1:15)

*[Show Setup form → Plan view loading]*

> "AirCompass is a **GenAI-powered urban air quality planner for Indian families.**
> You tell it your household — family size, kids, elders, purifier, commute days.
> 
> Then it does two things simultaneously:"

*[Show Plan view with engine badge and AI badge]*

> "First, a **deterministic physics engine** — trained on CPCB emission factors —
> calculates exactly *which actions* cut your household PM2.5 exposure the most,
> ranked by impact score. No hallucinations. Real maths.
>
> Then, **Google Gemini** takes those ranked actions and writes them as
> warm, human-readable guidance — in English *or* Hindi —
> explaining the trade-offs honestly."

*[Point to amber trade-off badge]*

> "See this amber badge? That means 'this action has a real cost — here's what it is.'
> We never pretend a recommendation is free."

---

## 🔬 TECHNICAL CREDIBILITY (1:15–1:45)

*[Show Impact view — before/after PM2.5, cigarette equivalents]*

> "The Impact Simulator uses a one-compartment indoor ODE model.
> Physics-based. Peer-reviewed parameters.
> 
> It tells you: *before* your plan, ~5.3 cigarette-equivalents a day (117.5 µg/m³).
> *After* adding filtration, N95, indoor exercise, and metro commute: ~2.4 (52.9 µg/m³, down 55%).
> That's not AI guessing. That's ODE integration."

*[Show test run or terminal output — 143 tests, 91% mutation]*

> "Under the hood:
> - **143 automated tests** — unit, integration, golden, property-based
> - **91.2% mutation score** — Stryker verified every assertion
> - **WCAG 2.2 AA** accessible — zero Axe violations
> - **Nonce CSP** security — Playwright e2e tested in production build
> - **2.65 MB repo** — well under the 10 MB limit, runs fast"

---

## 🤖 GEN AI ROLE — WHERE GEMINI ACTUALLY HELPS (1:45–2:05)

*[Show plan cards with Gemini-generated text]*

> "Here's the honest answer to 'where's the AI?'
>
> Gemini does three jobs:
> 1. **Plans the words** — takes engine-ranked actions, writes household-specific guidance
> 2. **Answers your questions** — a contextual chat assistant that knows *your* setup
> 3. **Writes the community brief** — a printable, WhatsApp-shareable clean-air report
>    for your apartment building's RWA meeting
>
> The AI never touches the numbers. The engine owns the numbers.
> That's how you get **reliability at the speed of LLMs.**"

---

## 🌐 BILINGUAL + COMMUNITY (2:05–2:20)

*[Toggle to Hindi view]*

> "And because clean air is for everyone — not just English speakers —
> every single word is available in Hindi.
> Toggle once. Full bilingual parity. No compromise."

*[Show Brief view]*

> "And the Community Brief? One click to generate a printable, shareable PDF
> your building secretary can take to the next committee meeting.
> Because air quality is a collective problem."

---

## 🏁 CALL TO ACTION (2:20–2:40)

*[Show GitHub repo / Vercel live link on screen]*

> "AirCompass is live, open-source, and free to use.
>
> **GitHub:** github.com/farhanmallik05/aircompass
> **Live Demo:** [your-vercel-url]
>
> Built with:
> → **Next.js 16** + TypeScript
> → **Google Gemini** via Gemini API
> → **Open-Meteo** for real-time AQI
> → **Google Antigravity** as my AI coding partner
> → Vitest · Stryker · Playwright · Axe · Nonce CSP
>
> This was my submission for **Hack2skill PromptWars Virtual Challenge 06.**
> If clean air matters to you, give the repo a ⭐ — and let's build smarter cities together."

---

## 🎤 CLOSING LINE (2:40–2:50)

*[Smile. Look at camera.]*

> "Because 'Stay indoors' is not a plan.
> **AirCompass is.**"

---

## 📋 SPEAKER NOTES

| Segment | Duration | Key visual |
|---|---|---|
| Hook | 0–20s | Today view, AQI 259 chip |
| Problem | 20–40s | Today view close-up |
| Solution | 40–75s | Setup → Plan view |
| Technical | 75–105s | Impact view + terminal |
| GenAI role | 105–125s | Plan cards + chat |
| Bilingual | 125–140s | Hindi toggle + Brief |
| CTA | 140–160s | GitHub + live URL |
| Closing | 160–170s | Face to camera |

**Total: ~2:50** — safely under 3 minutes.

### Tips for recording:
- Record in a quiet room; captions will be auto-generated by YouTube
- Keep screen on LEFT, face on RIGHT (or full-screen the demo)
- Zoom into key UI elements when pointing
- Upload as **Unlisted** on YouTube — not Public, not Private
- Add English auto-captions; review for accuracy before submitting
