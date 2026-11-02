import type { FocusStop } from '@clear-a11y/core';
import { escapeHtml, idFrom } from './escape.js';

const PAD = 28;

export interface LaidOutStop {
  /** 1-based position in the Tab sequence. */
  n: number;
  cx: number;
  cy: number;
  box: { x: number; y: number; width: number; height: number };
  backward: boolean;
}

export interface LaidOutArrow {
  from: number;
  to: number;
  /** Center of the stop it leaves. */
  x1: number;
  y1: number;
  /** Midpoint, where the arrowhead sits (so the numbered circles never hide it). */
  mx: number;
  my: number;
  /** Center of the stop it reaches. */
  x2: number;
  y2: number;
  backward: boolean;
}

export interface FocusPathLayout {
  width: number;
  height: number;
  stops: LaidOutStop[];
  arrows: LaidOutArrow[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scales the stops' page rectangles into a diagram at most `maxWidth` wide (never enlarged) and
 * computes arrows between the centers of consecutive stops, with the arrowhead at the midpoint. Stops without a rect are left out of the drawing (the text list keeps them).
 */
export function layoutFocusPath(
  stops: readonly FocusStop[],
  options: { maxWidth?: number; maxHeight?: number } = {},
): FocusPathLayout | undefined {
  const maxWidth = options.maxWidth ?? 640;
  const maxHeight = options.maxHeight ?? 720;
  const placed = stops
    .map((s, i) => ({ s, n: i + 1 }))
    .filter((p): p is { s: FocusStop & { rect: NonNullable<FocusStop['rect']> }; n: number } =>
      Boolean(p.s.rect),
    );
  if (!placed.length) return undefined;
  const minX = Math.min(...placed.map((p) => p.s.rect.x));
  const minY = Math.min(...placed.map((p) => p.s.rect.y));
  const maxX = Math.max(...placed.map((p) => p.s.rect.x + p.s.rect.width));
  const maxY = Math.max(...placed.map((p) => p.s.rect.y + p.s.rect.height));
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const scale = Math.min(1, (maxWidth - 2 * PAD) / bw, (maxHeight - 2 * PAD) / bh);
  const tx = (x: number) => r1(PAD + (x - minX) * scale);
  const ty = (y: number) => r1(PAD + (y - minY) * scale);

  const laid: LaidOutStop[] = placed.map(({ s, n }) => ({
    n,
    cx: tx(s.rect.x + s.rect.width / 2),
    cy: ty(s.rect.y + s.rect.height / 2),
    box: {
      x: tx(s.rect.x),
      y: ty(s.rect.y),
      width: r1(Math.max(s.rect.width * scale, 1)),
      height: r1(Math.max(s.rect.height * scale, 1)),
    },
    backward: Boolean(s.backward),
  }));

  const arrows: LaidOutArrow[] = [];
  for (let i = 1; i < laid.length; i++) {
    const a = laid[i - 1] as LaidOutStop;
    const b = laid[i] as LaidOutStop;
    if (b.n !== a.n + 1) continue; // a stop in between has no rect: don't imply a direct move
    if (Math.hypot(b.cx - a.cx, b.cy - a.cy) < 4) continue;
    arrows.push({
      from: a.n,
      to: b.n,
      x1: a.cx,
      y1: a.cy,
      mx: r1((a.cx + b.cx) / 2),
      my: r1((a.cy + b.cy) / 2),
      x2: b.cx,
      y2: b.cy,
      backward: b.backward,
    });
  }

  return {
    width: r1(Math.min(maxWidth, bw * scale + 2 * PAD)),
    height: r1(bh * scale + 2 * PAD),
    stops: laid,
    arrows,
  };
}

/** Human label for a stop: accessible name, else selector; role in parentheses. */
export function stopLabel(stop: FocusStop): string {
  const name = stop.name?.trim();
  const base = name ? name : stop.selector;
  return stop.role ? `${base} (${stop.role})` : base;
}

/** The focus-path figure: an SVG diagram plus an ordered list as its text alternative. */
export function renderFocusPath(stops: readonly FocusStop[], key: string): string {
  if (!stops.length) return '';
  const id = `fp-${idFrom(key)}`;
  const backwardCount = stops.filter((s, i) => i > 0 && s.backward).length;
  const summary = `Focus path: ${stops.length} stop${stops.length === 1 ? '' : 's'}, ${backwardCount} backward jump${backwardCount === 1 ? '' : 's'}.`;
  const layout = layoutFocusPath(stops);

  const pct = (v: number, of: number) => `${r1((v / of) * 100)}%`;
  let diagram = '';
  if (layout) {
    const { width: w, height: h } = layout;
    const boxes = layout.stops
      .map(
        (s) =>
          `<rect class="fp-box" x="${s.box.x}" y="${s.box.y}" width="${s.box.width}" height="${s.box.height}" rx="2"></rect>`,
      )
      .join('');
    const lines = layout.arrows
      .map((a) => {
        const cls = a.backward ? 'fp-arrow fp-back' : 'fp-arrow';
        const marker = a.backward ? `${id}-head-back` : `${id}-head`;
        return `<polyline class="${cls}" points="${a.x1},${a.y1} ${a.mx},${a.my} ${a.x2},${a.y2}" marker-mid="url(#${marker})"></polyline>`;
      })
      .join('');
    const head = (suffix: string, cls: string) =>
      `<marker id="${id}-${suffix}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="${cls}" d="M0,0 L10,5 L0,10 z"></path></marker>`;
    // Numbers and the "backward" labels are HTML laid over the SVG: they keep a fixed, legible
    // size when the diagram scales down, and sit on an opaque background so contrast is testable.
    // The digits are CSS generated content (data-n); the numbered list carries the same text.
    const nums = layout.stops
      .map(
        (s) =>
          `<span class="${s.backward ? 'fp-num fp-num-back' : 'fp-num'}" data-n="${s.n}" style="left:${pct(s.cx, w)};top:${pct(s.cy, h)}"></span>`,
      )
      .join('');
    const labels = layout.arrows
      .filter((a) => a.backward)
      .map(
        (a) =>
          `<span class="fp-back-label" style="left:${pct(a.mx, w)};top:${pct(a.my, h)}">backward</span>`,
      )
      .join('');
    diagram =
      `<div class="fp-canvas" role="img" aria-labelledby="${id}-cap" aria-describedby="${id}-desc" style="max-width:${w}px">` +
      `<svg class="fp-svg" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">` +
      `<defs>${head('head', 'fp-head')}${head('head-back', 'fp-head fp-head-back')}</defs>` +
      `${boxes}${lines}</svg>${nums}${labels}</div>` +
      `<p id="${id}-desc" class="visually-hidden">Numbered circles mark where keyboard focus lands, in Tab order. Arrows join consecutive stops. Backward jumps are drawn red, dashed and labelled backward. The numbered list that follows gives the same path as text.</p>`;
  }

  const items = stops
    .map((s, i) => {
      const prev = stops[i - 1];
      const back =
        i > 0 && s.backward && prev
          ? ` <strong class="fp-back-text">backward jump</strong> from ${i}. ${escapeHtml(stopLabel(prev))}`
          : '';
      return `<li><span>${escapeHtml(stopLabel(s))}</span> <code>${escapeHtml(s.selector)}</code>${back}</li>`;
    })
    .join('');

  return (
    `<figure class="focus-path">` +
    `<figcaption id="${id}-cap">${escapeHtml(summary)}${layout ? ' Diagram first, then the same path as a numbered list.' : ''}</figcaption>` +
    diagram +
    `<ol class="fp-list">${items}</ol>` +
    `</figure>`
  );
}
