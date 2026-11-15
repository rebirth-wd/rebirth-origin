# COPY.md — Rebirth Web Design home page copy, mapped onto useorigin.com text slots

Source of all Rebirth text: the client's old site https://rebirthwebdesign.com.au (home, /ai-tools), captured 2026-11-16.
Text is verbatim or lightly trimmed/re-cut; short UI labels (buttons, captions, chips) are connective labels.
Format: `slot (ref text, N chars) → Rebirth text (M chars)`. One *emphasis* word per heading = render in italic (`<em>`).
Brand: "Rebirth Web Design" (short "Rebirth"). The old site calls itself "Rebirth Online"; that name is NOT used here.
`·` inside a slot = line break where the ref breaks lines. `**bold**` = bold action phrase.

---

## 1. navbar (`.navbar`)
- logo text mark (ref: Origin wordmark svg) → **Rebirth**
- dropdown trigger (ref "Products", 8) → **Services** (8)
- dropdown items (ref "Spending" / "Investing" / "Forecasting" / "Estate Planning" / "Couples") →
  1. **AI Assistant** → /ai-tools
  2. **Site Maintenance** → /ai-tools
  3. **Performance** → /ai-tools
  4. **Lead Capture** → /ai-tools
  5. **AI in Your Workplace** → /ai-tools
- link (ref "For Employers", 13) → **About** → /about   (alt: "How We Work", 11)
- link (ref "Resources", 9) → **Blog** → /blog
- link (ref "Log In", 6) → **Call us** → tel:+61488162040
- white button (ref "Get Started →", 11) → **Start your project →** (18) → /contact
  (if width is tight: "Get started →" is acceptable as a UI label; "Start your project" is the old site's CTA)

## 2. hero (`section.hero.hero-v2`)
- h1 (ref "Meet your *proactive* · AI Financial Advisor.", 41) → **High-performance websites · for the *modern* web.** (46)
  (old site: "High-performance websites engineered for the modern web")
- subhead (ref "Track all of your finances while Origin proactively finds new ways to save you money.", 85)
  → **Rebirth builds fast, secure, static-first websites on a production-grade architecture.** (86)
- CTA (ref "Get Started", 11) → **Start Your Project** (18)
- phone card headline (ref "We found 14 actions that can save you $3,457", 44)
  → **Your site answers, fixes and updates itself** (43)  — animate word-by-word like ref; no numbers.
- 4 category cards (ref caption 6–12 / title 23–28 / body 86–117):
  1. caption (ref "SAVINGS") → **AI ASSISTANT**
     title (ref "Your money is sitting still.", 28) → **Trained on your business.** (25)
     body (ref 117) → **A chatbot that knows your services, pricing, suburbs and FAQs — and answers after hours.** (88)
  2. caption (ref "CREDIT") → **MAINTENANCE**
     title (ref "Improve your credit score.", 26) → **Your site repairs itself.** (25)
     body (ref 103) → **Security scanning and patching, uptime alerts, and backups that run without anyone remembering to.** (98)
  3. caption (ref "RETIREMENT") → **PERFORMANCE**
     title (ref "Grow your HSA to $180K.", 23) → **Fixes applied, not reported.** (28)
     body (ref 86) → **Your codebase is audited against Google's own metrics. We send you the score after we've fixed it.** (98)
  4. caption (ref "TAX STRATEGY") → **LEAD CAPTURE**
     title (ref "Save $2,200 on childcare.", 25) → **See who's ready to buy.** (23)
     body (ref 103) → **Every enquiry gets read, summarised and scored before it hits your inbox, with a reply drafted.** (95)

## 3. certificate (`.certificate-section`)
- heading (ref "You shouldn't have to *think* · about your money.", 43) → **Websites in Bundaberg · just got an *upgrade*.** (43)
- sub (ref "We'll tell you what to do next and why it matters, right when it counts.", 72)
  → **Hosting, backups, security, and updates — managed for you, every month.** (71)
- 4 laurel badges (ref images: Forbes / Fast Company / star / certified — do NOT reproduce). Badge title + tiny caption:
  1. **2-3** · BUILD DAYS
  2. **<2s** · LOAD SPEED
  3. **100%** · CLIENT SATISFACTION
  4. **39k+** · ASTRO USERS
  (all four are the old site's own stat strip, verbatim)

## 4. logo-slider (`.logo-slider-section`)
- caption (ref "Loved by these companies", 24) → **Built on a modern stack** (23)
- 8 plain-text wordmarks (set in type, no logos), all named on the old site:
  **Astro · Tailwind CSS · GitHub · Cloudflare · Lighthouse · PageSpeed Insights · Core Web Vitals · Semantic HTML**
  (only 6 are real products/platforms; "Core Web Vitals" and "Semantic HTML" are concepts the site names — see Gaps)

## 5. feature-slider (`.financial-slider-section`)
- heading (ref "*Track* your entire · financial life.", 33) → ***Modern* technology, · proven at scale.** (36)
- button (ref "MORE ABOUT SPENDING", 19) → **EXPLORE THE STACK** (17) → /#features (or /about)
- 5 cards (ref title 14–25 / body 58–80):
  1. title (ref "Monitor your spending", 21) → **Built on Astro** (14)
     body (ref 65) → **Ships zero unnecessary JavaScript, so your site loads in a blink.** (64)
     infographic: four Lighthouse-style score rings (Performance / Accessibility / Best Practices / SEO), each labelled "90–100" or "90+" (site: "scores 90-100 on Google's performance metrics by default").
  2. title (ref "Stay on budget", 14) → **Tracked with GitHub** (19)
     body (ref 80) → **Every change to your site is tracked, backed up, and reversible — a professional workflow.** (88)
     infographic: vertical commit/branch timeline, 4 rows with short hashes and messages like "Update hero copy", "Add contact section", a "Revert" pill on one row.
  3. title (ref "Manage your subscriptions", 25) → **Powered by Cloudflare** (22)
     body (ref 64) → **Built and hosted by one of the internet's core backbones.** (57)
     infographic: deploy card — "Production · Deployed" status chip with green dot, branch "main", "Cloudflare edge", a thin progress bar at 100%.
  4. title (ref "Invest with intention", 21) → **Engineered to rank** (19)
     body (ref 58) → **Core Web Vitals and semantic HTML, built into the architecture.** (64)
     infographic: three Core Web Vitals bars (LCP / INP / CLS), each a green segment with a "GOOD" mono label; no figures.
  5. title (ref "Maximize your savings", 21) → **Loads in under a second** (23)
     body (ref 79) → **Static pages served from Cloudflare's edge, built to turn traffic into customers.** (81)
     infographic: network waterfall (HTML / CSS / font / image bars, staggered) with a vertical marker labelled "< 1s".

## 6. notifications (2nd `section.hero`)
- heading (ref "*Receive* always-on · financial advice.", 35) → **A website that *works* · while you sleep.** (39)
  (old site /ai-tools: "Six AI tools, one website that works while you sleep")
- notification rows (ref message 40–80 chars with a bold action phrase; sub "1m ago"):
  1. **Security patch applied and tested on a preview deploy.** **View deploy** — 1m ago (66)
  2. New enquiry read, summarised and scored. **Reply drafted** — 1m ago (55)
  3. **Market shift detected.** Copy adjusted to match what people search for. (ref row 3 has no bold) — 1m ago (73)
  4. Blog post published and pushed to your socials. **See post** — 1m ago (58)
  (all derived from the AI Site Maintenance / Lead Capture / Content tools; they are illustrative UI states, no figures.)
  Correct bold usage per row: row1 bold "View deploy", row2 bold "Reply drafted", row3 none, row4 bold "See post".

## 7. two-cols (`.two-cols-section`)
### Block 1
- heading (ref "We analyze · *everything*", 20) → **We audit · *every page*** (19)
- body (ref "We connect every piece of your finances to understand what matters most.", 72)
  → **Your codebase is audited against Google's own metrics, and the fixes get applied.** (81)
- infographic: checklist chips (ref 6 chips, 27–32 chars, each with check/warn icon):
  1. ✓ Pre-rendered static pages (25)
  2. ✓ Minimal client JavaScript (25)
  3. ✓ Clean, semantic markup (22)
  4. ✓ Mobile-first and accessible (27)
  5. ✓ No database or plugins to hack (30)
  6. ✓ Served from Cloudflare's edge (29)
### Block 2
- heading (ref "We find · *ways to save*", 20) → **Engineered · *to rank*** (18)
- body (ref "Hundreds of expert-built checks uncover ways to save, earn, and optimize your money.", 84)
  → **Google weighs Core Web Vitals and semantic HTML. Astro outputs both by default.** (79)
- infographic (score card): title **Lighthouse**, big value **90+**, caption **OUT OF THE BOX**, four rows
  Performance / Accessibility / Best Practices / SEO each with a full green bar and "90+" (FAQ: "90+ Lighthouse scores out of the box").
### Block 3
- heading (ref "We guide your · *next move*", 22) → **Actively maintained, · *not left to rot*** (35)  (alt shorter: "We keep you · *current*", 22)
- body (ref 123) → **Astro, dependencies, and integrations are kept current — tested against a preview deploy before they hit production.** (118)
- infographic summary card:
  - title (ref "Summary") → **Summary**
  - description (ref 85) → **Your site stays modern instead of aging into a liability, with updates applied deliberately.** (91)
  - 3 action cards (ref caption / title 31–36 / body 181–237 / button "See Advice"):
    1. caption **SECURITY** · title **Fewer weak points by design** (27)
       body: **Most website hacks happen through databases and plugins. Your site doesn't use either, so there's simply far less that can be broken into. Fewer weak points, fewer things to worry about.** (186)
       button **SEE DETAILS**
    2. caption **UPDATES** · title **Tested before it hits production** (32)
       body: **Security patches and framework updates are applied deliberately and tested against a preview deploy before they ever hit production. Your site stays modern instead of aging into a liability.** (195)
       button **SEE DETAILS**
    3. caption **DELIVERY** · title **Fast for anyone, anywhere** (25)
       body: **Your site is distributed across Cloudflare's network and served from the node closest to each visitor. Local customers get instant loads, with no origin server to fall over under traffic.** (192)
       button **SEE DETAILS**

## 8. partner-hero (`.partner-hero`)
- heading (ref "Your financial life, *together*.", 30) → **A direct line to the *developer*.** (33)
- body (ref "Invite your partner to build your budget, plan your estate and manage your finances in one place.", 97)
  → **You work with the person writing the code — not an account manager, not an offshore team.** (89)
- button (ref "MORE ABOUT COUPLES", 18) → **HOW WE WORK** (11) → /about
- tiny note (ref "Free with your membership", 25) → **One Bundaberg-based developer** (29)

## 9. assistant (`.finance-section`)
- heading (ref "Your finances, *understood*.", 26) → **Your business, *understood*.** (28)
- body (ref 112) → **A chatbot that actually knows your business — your services, your pricing, your suburbs, your FAQs.** (99)
- phone chat UI:
  - status chip → **Trained on your business** (alt: "Answers after hours")
  - user bubble → **How long does it take to build a website?**
  - assistant reply → **A focused prototype can be ready in just a few days. Full custom sites typically take 2–4 weeks from kickoff to launch, depending on scope and feedback rounds.**
  - small 3-row table (label | value):
    - Prototype | A few days
    - Full custom site | 2–4 weeks
    - Build days | 2–3
  - follow-up line (optional) → **I work iteratively — quick wins early, refinements along the way.**
  - input placeholder → **Ask anything about your website…**

## 10. testimonials (`.testimonial-section`) — NOT testimonials
The old site has no testimonials, reviews or reviewer names. Use 9 info cards. Replace the 5-star row with a short gold mono
label; replace the name with a small muted footer line. Lengths follow the ref quotes (139/119/112/86/199/284/330/228/178).
1. label **WHY REBIRTH** · footer *Why choose Rebirth for my project?*
   statement: **Fast, modern static websites built with Astro and Tailwind CSS — standout design, blazing speed, and 90+ Lighthouse scores.** (125)
2. label **AFTER LAUNCH** · footer *Do you offer maintenance or updates after launch?*
   statement: **Yes. I can hand off the full source code, or provide ongoing support — updates, new sections, performance tweaks.** (114)
3. label **SECURITY** · footer *A minimal attack surface by design*
   statement: **Most website hacks happen through databases and plugins. Your site doesn't use either, so far less can be broken into.** (118)
4. label **TIMELINE** · footer *How long does it take to build a website?*
   statement: **A focused prototype can be ready in just a few days. Full custom sites take 2–4 weeks.** (87)
5. label **PROJECTS** · footer *What kinds of projects do you take on?*
   statement: **High-quality static sites: portfolios, business landing pages, marketing sites, documentation hubs, and personal brands. Light dynamic features — forms, search, simple APIs — when they add real value.** (199)
6. label **PRICING** · footer *How much does a website cost?*
   statement: **Pricing is custom and transparent based on your needs. Paid projects start in the mid-four-figure range for bespoke, high-performance sites. A limited number of pro-bono or heavily discounted sites are offered each year. You get a detailed quote after our initial discussion.** (276)
7. label **GETTING STARTED** · footer *What do you need from me to get started?*
   statement: **Clear goals, any existing branding and assets (logo, colours, photos), content or a plan for it, and reference sites you love. If you're not sure about any of that, I can guide you through discovery and help shape the direction. Every site is mobile-first, accessible, SEO-ready, and tailored to your vision.** (305)
8. label **EDGE-DELIVERED** · footer *Edge-delivered, globally*
   statement: **Your site is distributed across Cloudflare's network and served from the node closest to each visitor. Local customers get instant loads; you're also fast for anyone, anywhere, with no origin server to fall over.** (214)
9. label **DIRECT LINE** · footer *Direct line to the developer*
   statement: **Architecture decisions, changes, and fixes come from one Bundaberg-based developer who knows your entire stack — not an account manager, not an offshore team.** (159)

## 11. cta (`.footer-hero.cta-v3`)
- heading (ref "*Download* Origin", 15) → ***Start* your project** (18)  (old site: "Start Your Project")
- small line above/below if needed → **Modern websites, built to last.** (31)
- button (ref "Get started", 11) → **CALL 0488 162 040** (17) → tel:+61488162040  (alt: "Book a Call", 11 → /contact)

## 12. footer (`footer.footer`)
- newsletter title (ref "The Gist", 8) → **Newsletter** (10)
- newsletter body (ref 103) → **Sign up to our newsletter for insights on modern web design, performance, and long-term maintainability.** (104)
- email placeholder (ref "Enter your email") → **Enter your email**
- submit button → **SIGN UP**
- column 1 (ref "Products": Investing, Spending, Forecasting, Couples, Resources) → **Pages**: Home, About, AI Tools, Blog, Contact
- column 2 (ref "For Employers": Get a demo, Employers) → **Legal**: Terms (/terms), Privacy Policy (/privacy)
- column 3 (ref "Resources": Company, Careers, Help Center, Legal) → **Services**: AI Assistant, Site Maintenance, Performance Tuning, Lead Capture (all → /ai-tools)
- app-download column (ref "Download the Origin App" / "Download the desktop app" / "macOS Catalina 10.15 or higher is recommended")
  → **Contact**: +61 488 162 040 (tel:+61488162040) · Bundaberg, QLD · Email Us (/contact) · button **CALL US**
  tiny note under it (ref macOS line, 45) → **Websites in Bundaberg just got an upgrade.** (42)
- social (ref "Follow us": X, LinkedIn, Instagram, Reddit, YouTube) → **Follow us**: Facebook, Instagram, YouTube (only these three exist)
- bottom links (ref "Log In", "Get Started") → **Call us**, **Start your project**
- logo text → **Rebirth**
- legal paragraphs (ref 5 long uppercase-mono paragraphs) → only real text available:
  1. **© 2026 Rebirth Web Design / Alex Harris. All Rights Reserved.**  (old site verbatim: "© 2026 Rebirth Online/Alex Harris. All Rights Reserved.")
  2. **High-performance websites engineered for the modern web. Hosting, backups, security, and updates — managed for you, every month.** (old-site lines, usable as a second short paragraph)
  No AI-assistant disclaimer exists on the old site's home or /ai-tools pages — do not invent one; leave the remaining paragraphs out (the block will be shorter than the ref).

---

## Facts
- Brand: Rebirth Web Design (short: Rebirth). Old site name: Rebirth Online. Owner/developer: Alex Harris, Bundaberg-based.
- Phone: +61 488 162 040 (display "0488 162 040"; tel:+61488162040)
- Location: Bundaberg, QLD (service area mentioned: Bundaberg–Wide Bay)
- Pages: https://rebirthwebdesign.com.au/ · /about · /ai-tools · /blog · /contact · /terms · /privacy
- Social: https://www.facebook.com/rebirthwd · https://www.instagram.com/rebirthwd · https://www.youtube.com/@ReBirthWebDesign
- Stats (verbatim strip): 2-3 BUILD DAYS · <2s LOAD SPEED · 100% CLIENT SATISFACTION · 39k+ ASTRO USERS
- Other numbers on the site: "scores 90-100 on Google's performance metrics", "90+ Lighthouse scores", "2–4 weeks" full custom build, "loads in under a second", "over half of mobile visitors abandon a site that takes more than three seconds".
- Tagline: "Modern websites, built to last."

## Gaps (no honest source copy)
- No testimonials, reviewer names, client logos or awards exist → testimonial grid uses FAQ/Foundation cards; laurel badges use the stat strip.
- Logo slider: only 6 real product names (Astro, Tailwind CSS, GitHub, Cloudflare, Lighthouse, PageSpeed Insights); slots 7–8 are concepts the site names.
- No AI-assistant disclaimer and no long legal text on the old site; footer legal block is just the copyright line (+ optional tagline paragraph).
- Notification rows and infographic contents are illustrative UI states derived from the AI-tools descriptions (no metrics invented).
- No email address published (only a "Email Us" link to /contact).
