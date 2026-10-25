# Pio Pio Pizza ordering system

_Started 2026-10-25 18:47 UTC_

---

## User

Design a mobile app for : # 🎨 UI/UX Design System Spec: Pio Pio Pizza – Express Ordering System

You are an expert Principal Product Designer and UI Architect. Generate a high-performance, mobile-first design system and component layout for "Pio Pio Pizza," a hyper-fast pizza ordering PWA optimized for sub-30-second orders and sub-20-minute delivery.

---

## 🎯 Design Core KPI & Philosophy
* **Goal:** Zero-friction ordering completed in <30 seconds.
* **Aesthetics:** Dark mode with high-contrast, neon accent highlights (Speed + Appetite appeal).
* **Mobile First:** Designed for 1-handed thumb navigation (90%+ mobile traffic).

---

## 🎨 Design Tokens & Visual System

### Color Palette (Tailwind CSS Mapping)
* **Background:** Deep Pitch (`#0F0F11` / `bg-zinc-950`)
* **Card Surface:** Charcoal Elevated (`#18181B` / `bg-zinc-900`)
* **Primary Accent / CTA:** Electric Neon Orange (`#FF5500` / `bg-orange-600`) or High-Viz Yellow (`#EAB308` / `bg-yellow-500`)
* **Status Badges:**
  * Received: Blue (`#3B82F6`)
  * In Oven: Amber (`#F59E0B`)
  * Out for Delivery: Purple (`#8B5CF6`)
  * Delivered: Emerald (`#10B981`)

### Typography & Touch Targets
* **Font Display:** Heavy, rounded sans-serif for impact headers.
* **Minimum Touch Target:** 48px height on mobile primary buttons.

---

## 📱 View Layout Architecture

### 1. Customer Ordering View (`/`)
* **Header:** Minimalist brand logo + Live delivery estimate badge ("⚡ Avg. 18 min delivery").
* **Menu Grid (Max 5 Items):**
  * High-res food imagery with tight crop.
  * Item Title, concise ingredient line, price in NOK.
  * Direct "Add +" pill button.
* **Sticky Bottom Checkout Dock (Persistent):**
  * Fulfillment Toggle: `[ 🛵 Delivery (49kr) | 🛍️ Pickup ]`
  * One-Tap Vipps Express CTA: `[ ⚡ Pay with Vipps • {TOTAL} NOK ]`

### 2. Live Tracker Screen (`/order-status/[id]`)
* **Prominent 20-Minute Countdown Timer:** Large SVG circular ring or high-contrast numerical timer.
* **Progress Stepper (4 States):**
  1. Received 
  2. In Oven 
  3. Out for Delivery 
  4. Arrived
* **Driver & Map Card:** Mini route map embed, driver name, direct "Call Driver" button.

### 3. Kitchen KDS View (`/kitchen`) – Tablet Landscape
* **Grid Layout:** Columns split by order status.
* **High Contrast Cards:** Large order numbers, bold timer elapsed indicators (e.g., `+04:12 min`), item checklist with big touch checkboxes.
* **Action Footer:** Big single-tap advance button: `[ MOVE TO OVEN ➡️ ]`.

---

## 🛠️ Required Deliverables
1. **React / Tailwind CSS Code:** Generate clean, responsive, fully styled mockups for the **Customer Ordering View** and **Live Tracker Screen**.
2. **Interactive Elements:** Include interactive tab toggles, counter states, and status badges using standard React state hooks.
3. **Accessibility & Contrast:** Ensure all CTA buttons meet WCAG AAA contrast requirements against the dark background.

## Assistant

_[tool: list_files]_

_[tool: copy_starter_component]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

I built the Pio Pio Pizza app as a clickable phone prototype, with a design-spec panel beside it. It's with a reviewer now and hasn't been checked yet.

**How it works:**
- **Ordering screen:** five pizzas. "Add +" turns into a − / + counter. You can switch between Delivery and Pickup, and the total updates as you go. The pay button stays greyed out until something is in the bag.
- **Paying:** tapping "Pay with Vipps" shows a short "Confirm in Vipps" sheet, then opens the tracker.
- **Tracker screen:** a 20-minute countdown ring and the four status steps in your colours. In delivery mode it shows a small route map with the driver moving and a "Call" button. In pickup mode it shows the shop details instead.
- Your cart, delivery choice and timer are kept if you reload the page.

**Changes from your spec:**
- Your `#FF5500` orange falls just short of the AAA contrast you asked for (7:1) on the pay button. I used `#FF6B00` for buttons instead, which reaches 7.4:1 with black text. `#FF5500` is still used for the timer ring and other accents that aren't text.
- The status badge labels use lighter versions of each status colour so the text is easy to read.
- The attached design system was empty, so I used your spec's colours with Fredoka (rounded, heavy) for headings and DM Sans for body text.

**Settings:** you can switch the pay button between orange and yellow, change the timer speed (it runs 60× faster by default so you can watch the whole order in about 20 seconds), and hide the spec panel.

**Still to do:**
- The pizza photos and driver picture are empty slots. Drag your own images onto them.
- I haven't built the kitchen tablet screen. Tell me if you want it.

## User

make something from canva for higgsfield

## Assistant



## Assistant

_[tool: ask_user]_

_[tool: tool_search_tool_bm25]_

I've sent you a short form. Once you answer it, I'll know the goal, which Canva design to start from (if any), the formats and what the frames should show.

## User

Answered — goal: Import an existing Canva design and adapt it; canva_source: I have a Canva design to start from (I'll share link/ID); format: 1:1 square; frames: 5–6 storyboard; content: Hero pizza shot, 'Door in 20' speed message, App ordering screen, Live tracker countdown

## Assistant

To start, I need your Canva design. Please paste its share link or design ID (it starts with "D", like `DAG…`).

Once I have it, I'll export it and adapt it into a 1:1 storyboard of 5–6 frames covering the hero pizza, "Door in 20", the ordering screen and the live tracker countdown.

## User

are you not connected?

## Assistant

_[tool: canva__search-designs]_

_[tool: tool_search_tool_bm25]_

_[tool: canva__search-designs]_

Yes, I'm connected to Canva. Your account has 5 designs, all for Urban Tails, and nothing comes up for "pizza" or Pio Pio:

- Åpningsfest for Urban Tails (Story)
- Urban Tails opening party Instagram post
- Urban Tails Instagram Story
- Urban Tails Instagram-innlegg
- Premium Dog Grooming Instagram Post

Which do you want to use?

1. **Use one of these as the layout:** pick it, and I'll reuse its structure and type for a 1:1 Pio Pio storyboard of 5–6 frames.
2. **Start fresh:** I'll make the 1:1 storyboard from the Pio Pio app instead, then send it to Canva so you can edit it and pass the frames to Higgsfield.

## User

none of them.,, find some other desigs for pizza shop there

## Assistant

_[tool: canva__generate-design]_

_[tool: tool_search_tool_bm25]_

_[tool: tool_search_tool_bm25]_

I couldn't find any pizza-shop designs in your Canva account, so I had Canva generate 4 new ones in the Pio Pio dark style. I haven't looked at them myself, so open each link to judge:

- A: https://www.canva.com/d/Nv9pXJ9xcEJ4bje
- B: https://www.canva.com/d/9147VQxkdyTY00C
- C: https://www.canva.com/d/D3q4TlNIkm4q7_5
- D: https://www.canva.com/d/BXdy8inr-bepyDs

Canva generates Instagram posts at 4:5, not the 1:1 square you picked, so I'll crop to square later.

Tell me which one (A–D) to use. I'll save it to your account and build the 5–6 square frames from it: hero pizza, "Door in 20", the ordering screen and the tracker countdown. Then you can export them for Higgsfield.

## User

same all of them for later use

## Assistant

_[tool: canva__create-design-from-candidate]_

_[tool: canva__create-design-from-candidate]_

_[tool: canva__create-design-from-candidate]_

_[tool: canva__create-design-from-candidate]_

All 4 designs are now saved in your Canva account:

- A: https://www.canva.com/d/QtNooVO-JWASSId
- B: https://www.canva.com/d/TFfQbBUoeirRbDN
- C: https://www.canva.com/d/qzI29XpL7XiS8Zj
- D: https://www.canva.com/d/Ufmy0WgNZWS3-rM

When you want the Higgsfield frames, tell me which design to start from.

## User

add some pizza picutres also

## User

add some pizza picutres also

## User

nice what else can add here?

## Assistant

Ideas, roughly in order of value for a sub-30-second order:

**In the app**
1. **Kitchen screen (`/kitchen`)** – the tablet view from your spec: orders in columns by status, an elapsed-time counter on each, big checkboxes and a "Move to oven" button. It's the last missing screen.
2. **Pizza detail sheet** – tap a pizza to choose size and up to 3 extra toppings, then add. Simple orders stay one tap.
3. **Reorder last order** – a card at the top of the menu that does it in one tap. Returning customers would order in about 3 seconds.
4. **Address & ETA** – a small "Deliver to Thorvald Meyers gate 12 · 17 min" line with a change-address sheet.
5. **Order-arrived moment** – a celebration screen when the timer hits zero, with a star rating and a tip for the driver.
6. **Drinks & dips** – a single upsell row above the pay area (Coke, garlic dip).

**For Canva / Higgsfield**
7. **Square storyboard** – 5–6 frames from the photos and app screens (hero pizza, "Door in 20", tapping to order, the countdown ring, an end card with the logo), exported for Higgsfield to animate.
8. **Swap the new photos into the 4 Canva posts.**

Tell me which numbers you want.

