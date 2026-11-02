import { ensureHelpers, type PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import {
  audioAutoplayNoControlRule,
  detectAudioAutoplayNoControl,
} from '../rules/audio-autoplay-no-control.js';
import {
  autocompleteMissingRule,
  detectAutocompleteMissing,
} from '../rules/autocomplete-missing.js';
import {
  detectMediaAlternativeMissing,
  mediaAlternativeMissingRule,
} from '../rules/media-alternative-missing.js';
import {
  detectMediaCaptionsMissing,
  mediaCaptionsMissingRule,
  type MediaInfo,
} from '../rules/media-captions-missing.js';
import { atFinding, quote } from './findings.js';

/** Max elements read per check, so huge pages stay fast. */
const MAX_ELEMENTS = 300;

interface RawMedia extends MediaInfo {
  selector: string;
  html: string;
  stopControl: boolean;
  /** Visible or with controls: something the visitor can play (hidden autoplay audio is not). */
  playable: boolean;
}

interface RawField {
  selector: string;
  type: string;
  label: string;
  name: string;
  id: string;
  autocomplete: string | null;
  html: string;
}

/**
 * Media and form-purpose checks that read the page without changing it, so they run in every
 * state: captions and alternatives for <video>/<audio> (1.2.x), autoplaying sound (1.4.2) and
 * autocomplete tokens on personal-data fields (1.3.5).
 */
export async function runMediaAndFormChecks(ctx: PageContext): Promise<Finding[]> {
  await ensureHelpers(ctx.page);
  const findings: Finding[] = [];

  const media = await ctx.page.evaluate((max: number): RawMedia[] => {
    const h = window.__clearA11y!;
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const textOfIds = (ids: string | null) =>
      (ids ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    const TRANSCRIPT = /\btranscript\b/i;
    const DESCRIBED = /\baudio[- ]?descri(bed|ption)\b|\bdescribed version\b/i;
    const nameOf = (el: Element) =>
      clean(
        `${el.getAttribute('aria-label') ?? ''} ${textOfIds(el.getAttribute('aria-labelledby'))} ${(el as HTMLElement).innerText ?? ''}`,
      );
    const controls = Array.from(
      document.querySelectorAll('button, [role=button], [role=switch], input[type=checkbox]'),
    ).filter((el) => h.isVisible(el));
    return Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'))
      .filter((el) => !el.closest('[aria-hidden=true], [inert]'))
      .filter((el) => h.isVisible(el) || el.autoplay || el.controls)
      .slice(0, max)
      .map((el) => {
        // The player's own block: its figure/section/article, or its parent.
        const scope =
          el.closest('figure, section, article, li, [role=region], [role=group]') ??
          el.parentElement ??
          document.body;
        const nearby = Array.from(
          scope.querySelectorAll('a[href], button, summary, h2, h3, h4, h5, h6, figcaption'),
        ).map(nameOf);
        nearby.push(textOfIds(el.getAttribute('aria-describedby')));
        const media = el as HTMLMediaElement & {
          audioTracks?: { length: number };
          mozHasAudio?: boolean;
          webkitAudioDecodedByteCount?: number;
        };
        const hasAudio =
          (media.audioTracks?.length ?? 0) > 0 ||
          media.mozHasAudio === true ||
          (media.webkitAudioDecodedByteCount ?? 0) > 0;
        return {
          selector: h.selector(el),
          html: h.snippet(el),
          kind: el.tagName === 'VIDEO' ? ('video' as const) : ('audio' as const),
          // <track> children plus tracks added from script (addTextTrack).
          tracks: [
            ...new Set([
              ...Array.from(el.querySelectorAll('track')).map(
                (t) => (t.getAttribute('kind') ?? 'subtitles').toLowerCase() || 'subtitles',
              ),
              ...Array.from(el.textTracks ?? []).map((t) => t.kind),
            ]),
          ],
          live: el.srcObject instanceof MediaStream || el.duration === Infinity,
          playable: h.isVisible(el) || el.controls,
          ...(hasAudio ? { hasAudio: true } : {}),
          muted: el.muted || el.hasAttribute('muted'),
          autoplay: el.autoplay,
          controls: el.controls,
          loop: el.loop,
          duration: Number.isFinite(el.duration) ? el.duration : null,
          transcript: nearby.some((t) => TRANSCRIPT.test(t)),
          audioDescribed: nearby.some((t) => DESCRIBED.test(t)),
          stopControl: controls.some(
            (c) =>
              (el.id && (c.getAttribute('aria-controls') ?? '').split(/\s+/).includes(el.id)) ||
              /\b(pause|stop|mute|unmute|sound|audio|music|volume)\b/i.test(nameOf(c)),
          ),
        };
      });
  }, MAX_ELEMENTS);

  for (const m of media) {
    const what = m.kind === 'video' ? 'video' : 'audio';
    const captions = m.playable ? detectMediaCaptionsMissing(m) : undefined;
    if (captions) {
      findings.push(
        atFinding(ctx, mediaCaptionsMissingRule, {
          selector: m.selector,
          role: m.kind,
          tier: captions.tier,
          wcag: captions.wcag,
          confidence: captions.tier === 'likely' ? 0.75 : 0.5,
          message: `This ${m.live ? 'live ' : ''}video has no captions track${m.tracks.length ? ` (only ${m.tracks.join(', ')})` : ''}. If it has speech or meaningful sound, Deaf and hard of hearing people miss it.`,
          question:
            'Does this video have accurate captions for all speech and meaningful sounds (a captions track, open captions in the picture, or captions in the live stream), or no audio at all?',
          evidence: { html: m.html, data: { tracks: m.tracks, transcript: m.transcript } },
        }),
      );
    }
    const alternative = m.playable ? detectMediaAlternativeMissing(m) : undefined;
    if (alternative) {
      findings.push(
        atFinding(ctx, mediaAlternativeMissingRule, {
          selector: m.selector,
          role: m.kind,
          wcag: alternative.wcag,
          confidence: 0.5,
          message:
            m.kind === 'audio'
              ? 'This audio has no transcript next to it, so Deaf and hard of hearing people cannot get its content.'
              : m.transcript
                ? 'This video has a transcript but no audio description, so blind people may miss what is only shown on screen.'
                : 'This video has no audio description and no transcript next to it, so blind people may miss what is only shown on screen.',
          question: alternative.question,
          evidence: {
            html: m.html,
            data: {
              tracks: m.tracks,
              transcript: m.transcript,
              audioDescribed: m.audioDescribed,
            },
          },
        }),
      );
    }
    if (detectAudioAutoplayNoControl(m)) {
      findings.push(
        atFinding(ctx, audioAutoplayNoControlRule, {
          selector: m.selector,
          role: m.kind,
          confidence: m.duration === null ? 0.7 : 0.85,
          message: `This ${what} starts playing sound by itself${m.loop ? ' on a loop' : ''}, with no controls and no pause, stop or mute button on the page. Screen reader users cannot hear their screen reader over it.`,
          evidence: {
            html: m.html,
            data: { autoplay: true, muted: false, loop: m.loop, duration: m.duration },
          },
        }),
      );
    }
  }

  const fields = await ctx.page.evaluate((max: number): RawField[] => {
    const h = window.__clearA11y!;
    const textOfIds = (ids: string | null) =>
      (ids ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    const FIELD =
      'input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=url], input[type=date], select, textarea';
    return Array.from(document.querySelectorAll<HTMLInputElement>(FIELD))
      .filter(
        (el) =>
          h.isVisible(el) &&
          !el.disabled &&
          !el.readOnly &&
          !el.closest('[aria-hidden=true], [inert], [role=search], search') &&
          // Custom comboboxes turn browser autofill off on purpose: it would fight their own popup.
          el.getAttribute('role') !== 'combobox' &&
          !el.hasAttribute('aria-autocomplete'),
      )
      .slice(0, max)
      .map((el) => ({
        selector: h.selector(el),
        type:
          el.tagName === 'INPUT'
            ? (el.getAttribute('type') ?? 'text').toLowerCase()
            : el.tagName.toLowerCase(),
        label: (
          Array.from(el.labels ?? [])
            .map((l) => l.textContent ?? '')
            .join(' ') ||
          textOfIds(el.getAttribute('aria-labelledby')) ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim(),
        name: el.getAttribute('name') ?? '',
        id: el.id,
        autocomplete:
          el.getAttribute('autocomplete') ?? el.form?.getAttribute('autocomplete') ?? null,
        html: h.snippet(el),
      }));
  }, MAX_ELEMENTS);

  for (const f of fields) {
    const token = detectAutocompleteMissing(f);
    if (!token) continue;
    findings.push(
      atFinding(ctx, autocompleteMissingRule, {
        selector: f.selector,
        ...(f.label ? { name: f.label } : {}),
        confidence: 0.7,
        message: `The field ${f.label ? quote(f.label) : f.selector} asks for personal data (${token}) but ${f.autocomplete === null ? 'has no autocomplete attribute' : `has autocomplete="${f.autocomplete}"`}, so browsers and assistive tools cannot fill it in or identify its purpose.`,
        evidence: { html: f.html, data: { expected: token, autocomplete: f.autocomplete } },
      }),
    );
  }
  return findings;
}
