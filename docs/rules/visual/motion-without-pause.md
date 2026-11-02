---
id: visual/motion-without-pause
title: Moving content without a pause control
engine: engine-visual
wcag: [2.2.2]
tier: likely
---

# Moving content without a pause control

**Rule:** `visual/motion-without-pause` · **WCAG:** 2.2.2 · **Tier:** `likely` / `needs-review` · **Engine:** `engine-visual`

## What it catches

Content that starts moving, scrolling, blinking or updating by itself, keeps going for more than five seconds, is shown next to other content, and has no control to pause, stop or hide it. Typical examples: a scrolling news ticker, a carousel that rotates on a timer, a CSS animation that loops forever, text that refreshes every second.

## Who it affects

People with attention deficit disorders or other cognitive disabilities, who can't focus on the rest of the page while something moves. People who read slowly, or use screen magnification, who can't finish reading text that moves away. Screen reader users, when auto-updating content keeps changing under them.

## How it's measured

The check runs once per page (default state), on a second page of the same browser context so it can watch for a few seconds while the other visual checks run in parallel.

1. **Watch with `prefers-reduced-motion: no-preference`**, which is what most people get. The page is loaded and watched for `visual.motionObserveMs` (2100 ms by default), or `visual.motionCarouselObserveMs` (5500 ms) when a carousel, slider, slideshow, ticker or marquee is on the page without a running animation to explain it.
   - CSS animations and Web Animations come from `document.getAnimations()`: running ones that last forever or longer than five seconds.
   - Script-driven motion (timers, `requestAnimationFrame`) is seen with a `MutationObserver` on `style`, `class`, `hidden`, `src`, text and children. It counts when changes repeat (two separate bursts, or continuous changes for most of the window). Inside a carousel a single change counts, because carousels rotate.
   - Not counted: loading indicators (`role="progressbar"`, `aria-busy`, spinners and loaders by name), dots smaller than 16 × 16 px, and content that is the only thing on the page.
2. **Look for a control** next to the moving content (in its closest containers): a button, switch or checkbox named like "Pause", "Stop", "Hide", "Close", "Turn off autoplay", or a page-wide "Pause all animations". The engine activates it and watches again. If the motion stopped or the content is gone, that is a pass and nothing is reported.
3. **Watch again with `prefers-reduced-motion: reduce`** (after a reload) for the content that still has no working control, to learn whether it honours the user's system setting.

| Situation                                                    | Tier           |
| ------------------------------------------------------------ | -------------- |
| A control stops or hides it                                  | no finding     |
| A control was found but motion continued after activating it | `needs-review` |
| No control, motion stops only with reduced motion            | `needs-review` |
| No control, motion continues even with reduced motion        | `likely`       |

Honouring `prefers-reduced-motion` helps the people affected, but WCAG doesn't list it as a sufficient way to meet SC 2.2.2: the SC asks for a mechanism on the page, and most people never change the system setting. Because that interpretation is debated, it lowers the finding to `needs-review` instead of hiding it. The scanner's other checks keep running with reduced motion (the scanner's default), so they measure a still page.

Not covered: animated GIFs and videos, motion that starts later than the watch window, and carousels that rotate more slowly than the longer window.

## How to fix

Give every moving part a visible control right next to it that really stops it, and keep honouring reduced motion as well.

```html
<section class="ticker" aria-label="Latest headlines">
  <div class="ticker-window"><div class="ticker-track">...</div></div>
  <button type="button" aria-pressed="false" id="pause">Pause headlines</button>
</section>
<script>
  pause.addEventListener('click', () => {
    const paused = ticker.classList.toggle('paused'); // .paused .ticker-track { animation-play-state: paused }
    pause.setAttribute('aria-pressed', String(paused));
  });
</script>
<style>
  @media (prefers-reduced-motion: reduce) {
    .ticker-track {
      animation: none;
      flex-wrap: wrap;
    }
  }
</style>
```

For carousels: don't autoplay, or stop on hover and focus and provide a Pause button. For auto-updating content: let users pause updates or choose how often they happen.

## WCAG

[SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) (A): for moving, blinking or scrolling information that starts automatically, lasts more than five seconds and is presented in parallel with other content, there is a mechanism to pause, stop or hide it, unless the movement is essential. Related techniques: [G4](https://www.w3.org/WAI/WCAG22/Techniques/general/G4) (allowing the content to be paused and restarted), [G11](https://www.w3.org/WAI/WCAG22/Techniques/general/G11) (content that blinks for less than five seconds); failures [F16](https://www.w3.org/WAI/WCAG22/Techniques/failures/F16) (scrolling content without a way to pause it) and [F7](https://www.w3.org/WAI/WCAG22/Techniques/failures/F7) (blinking content without a way to stop it).

## Examples

- Barrier: [`fixtures/site/visual/motion-without-pause.html`](../../../fixtures/site/visual/motion-without-pause.html) (an endless CSS ticker; `likely`)
- Barrier: [`fixtures/site/visual/motion-without-pause-carousel.html`](../../../fixtures/site/visual/motion-without-pause-carousel.html) (a carousel that rotates every two seconds and only stops with reduced motion; `needs-review`)
- Correct pattern: [`fixtures/site/visual/motion-without-pause-ok.html`](../../../fixtures/site/visual/motion-without-pause-ok.html) (both have working pause buttons)
