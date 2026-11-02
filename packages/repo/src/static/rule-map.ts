import type { Tier } from '@clear-a11y/core';
import type { ElementInfo } from './element.js';

/** Lint plugins we run. The key is the plugin prefix used in lint rule ids. */
export const LINT_PLUGINS = ['jsx-a11y', 'vuejs-accessibility', 'angular-template'] as const;
export type LintPlugin = (typeof LINT_PLUGINS)[number];

/** What the tier policy can see about one lint message. */
export interface TierContext {
  element?: ElementInfo;
  /** The raw lint message text (some rules report several different problems). */
  lintMessage: string;
}

export interface RepoRuleEntry {
  /** WCAG success criteria. The first one is the primary SC. */
  wcag: string[];
  /** Short title for reports. */
  title: string;
  /** Plain-language message: what is wrong and who it affects. */
  message: string;
  /** Suggested fix. */
  fix: string;
  /**
   * Default tier. Static lint can't see runtime props, CSS or rendered output, so most rules are
   * `likely`. `needs-review` rules must carry a `question`.
   */
  tier: Exclude<Tier, 'violation'>;
  /**
   * Upgrade to `violation` when this returns true: only for checks that are unambiguous in source
   * (a literal DOM element, no spread props that could supply the missing attribute).
   */
  violationWhen?: (ctx: TierContext) => boolean;
  /** Yes/no question for `needs-review` findings. */
  question?: string;
}

/** A literal DOM element (not a component) with no spread props. */
const plainDomElement = (ctx: TierContext): boolean =>
  !!ctx.element && ctx.element.isDomElement && !ctx.element.hasSpread;

const hasLiteral = (ctx: TierContext, attr: string): boolean => {
  const v = ctx.element?.attributes[attr];
  return typeof v === 'string' && v !== '{…}';
};

/** alt-text: `<img>`, `<area>` or `<input type="image">` with no alt at all (not the "prefer alt" advice). */
const missingAltOnImage = (ctx: TierContext): boolean =>
  plainDomElement(ctx) &&
  ['img', 'area', 'input'].includes(ctx.element?.tag ?? '') &&
  /must have (an )?alt/i.test(ctx.lintMessage);

const altText: RepoRuleEntry = {
  wcag: ['1.1.1'],
  title: 'Image has no text alternative',
  message:
    'This image has no alt text, so screen reader users get no description of what it shows (or hear the file name).',
  fix: 'Add alt text that describes the image\'s content or purpose. Use alt="" for purely decorative images.',
  tier: 'likely',
  violationWhen: missingAltOnImage,
};

const anchorHasContent: RepoRuleEntry = {
  wcag: ['2.4.4', '4.1.2'],
  title: 'Link has no content',
  message:
    'This link has no text content, so screen reader users hear "link" with no idea where it goes.',
  fix: 'Put visible text inside the link, or give it an accessible name with aria-label or aria-labelledby.',
  tier: 'likely',
};

const anchorIsValid: RepoRuleEntry = {
  wcag: ['2.1.1', '2.4.4'],
  title: 'Link without a valid destination',
  message:
    'This link has no real destination (no href, or href="#" / "javascript:"). It may not be reachable by keyboard and is announced as a link although it acts like a button.',
  fix: 'Use a <button type="button"> for actions. Use <a href="..."> only for navigation to a real URL.',
  tier: 'likely',
};

const ariaActivedescendant: RepoRuleEntry = {
  wcag: ['2.1.1'],
  title: 'aria-activedescendant on an element that cannot take focus',
  message:
    'This element uses aria-activedescendant but cannot receive keyboard focus, so keyboard users cannot reach the widget.',
  fix: 'Make the element focusable (tabIndex={0}) or move aria-activedescendant to the focusable element.',
  tier: 'likely',
};

const ariaProps: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Invalid ARIA attribute',
  message:
    'This element uses an aria-* attribute that does not exist (often a misspelling), so assistive technology ignores it.',
  fix: 'Fix the attribute name (for example aria-labelledby, not aria-labeledby).',
  tier: 'likely',
  violationWhen: (ctx) => !!ctx.element?.isDomElement,
};

const ariaProptypes: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Invalid ARIA attribute value',
  message:
    'An ARIA attribute on this element has a value that is not allowed, so assistive technology may ignore it or announce the wrong state.',
  fix: 'Use one of the values the ARIA specification allows for this attribute (for example "true"/"false").',
  tier: 'likely',
};

const ariaRole: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Invalid ARIA role',
  message:
    'This element has a role that is not a valid ARIA role, so assistive technology cannot tell users what it is.',
  fix: 'Use a valid, non-abstract ARIA role, or better, the native HTML element with that meaning.',
  tier: 'likely',
  violationWhen: (ctx) => !!ctx.element?.isDomElement && hasLiteral(ctx, 'role'),
};

const ariaUnsupported: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'ARIA on an element that does not support it',
  message:
    'This element (for example <meta>, <script> or <style>) does not support ARIA roles or attributes; they have no effect.',
  fix: 'Remove the role and aria-* attributes from this element.',
  tier: 'likely',
};

const autocompleteValid: RepoRuleEntry = {
  wcag: ['1.3.5'],
  title: 'Invalid autocomplete value',
  message:
    'This field has an autocomplete value that browsers do not recognize, so autofill and assistive tools cannot identify its purpose.',
  fix: 'Use a valid autocomplete token such as "email", "given-name" or "postal-code".',
  tier: 'likely',
};

const clickEventsHaveKeyEvents: RepoRuleEntry = {
  wcag: ['2.1.1'],
  title: 'Click handler without a keyboard handler',
  message:
    'This non-interactive element reacts to clicks but not to the keyboard, so keyboard-only users cannot activate it.',
  fix: 'Use a <button> (or <a href>) instead. If you must keep the element, add role, tabIndex={0} and Enter/Space key handling.',
  tier: 'likely',
};

const headingHasContent: RepoRuleEntry = {
  wcag: ['1.3.1', '2.4.6'],
  title: 'Empty heading',
  message:
    'This heading has no content, so screen reader users navigating by headings land on an empty heading.',
  fix: 'Put text inside the heading, or remove the heading element if it is only used for styling.',
  tier: 'likely',
};

const htmlHasLang: RepoRuleEntry = {
  wcag: ['3.1.1'],
  title: 'Page has no language',
  message:
    'The <html> element has no lang attribute, so screen readers may read the page with the wrong language and pronunciation.',
  fix: 'Add lang to the <html> element, for example <html lang="en">.',
  tier: 'likely',
  violationWhen: (ctx) => plainDomElement(ctx) && ctx.element?.tag === 'html',
};

const iframeHasTitle: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Frame has no title',
  message:
    'This iframe has no title, so screen reader users cannot tell what the embedded content is before entering it.',
  fix: 'Add a short, unique title to the iframe, for example title="Store locator map".',
  tier: 'likely',
};

const imgRedundantAlt: RepoRuleEntry = {
  wcag: ['1.1.1'],
  title: 'Alt text says "image" or "picture"',
  message:
    'This image\'s alt text contains words like "image", "photo" or "picture". Screen readers already announce it as an image, so the words add noise and may replace a real description.',
  fix: 'Describe what the image shows or does, without "image of" or "picture of".',
  tier: 'needs-review',
  question:
    'Does this alt text describe what the image shows or does (rather than only saying it is an image)?',
};

const interactiveSupportsFocus: RepoRuleEntry = {
  wcag: ['2.1.1'],
  title: 'Interactive role that cannot take focus',
  message:
    'This element has an interactive role and handlers but is not focusable, so keyboard users cannot reach it.',
  fix: 'Use the native element (for example <button>), or add tabIndex={0} and keyboard handling.',
  tier: 'likely',
};

const labelHasAssociatedControl: RepoRuleEntry = {
  wcag: ['1.3.1', '4.1.2'],
  title: 'Label not associated with a control',
  message:
    'This label is not connected to a form control, so screen readers do not announce it with the field and clicking it does not focus the field.',
  fix: 'Point the label at the control with htmlFor/for and a matching id, or wrap the control inside the label.',
  tier: 'likely',
};

const mediaHasCaption: RepoRuleEntry = {
  wcag: ['1.2.2'],
  title: 'Media without captions',
  message:
    'This video or audio element has no captions track, so deaf and hard-of-hearing users miss the spoken content.',
  fix: 'Add <track kind="captions" src="..."> (or provide captions another way and mark muted video as such).',
  tier: 'likely',
};

const mouseEventsHaveKeyEvents: RepoRuleEntry = {
  wcag: ['2.1.1'],
  title: 'Hover handler without a focus handler',
  message:
    'This element reacts to mouse hover (mouseover/mouseout) but not to keyboard focus, so keyboard users never see what hover reveals.',
  fix: 'Pair onMouseOver/onMouseOut with onFocus/onBlur that do the same thing.',
  tier: 'likely',
};

const noAutofocus: RepoRuleEntry = {
  wcag: ['2.4.3'],
  title: 'Autofocus on page load',
  message:
    'This element grabs focus automatically. Screen reader and keyboard users can be dropped into the middle of the page and miss the content before it.',
  fix: 'Remove autoFocus unless the element is the only purpose of the view (for example a search page or a just-opened dialog).',
  tier: 'needs-review',
  question:
    'Does moving focus to this element on load skip content that keyboard or screen reader users need to read first?',
};

const noDistractingElements: RepoRuleEntry = {
  wcag: ['2.2.2'],
  title: 'Moving <marquee> or <blink> content',
  message:
    'This element moves or blinks with no way to pause it, which distracts users with attention or vestibular disorders and is hard to read.',
  fix: 'Remove <marquee>/<blink>. If movement is needed, use CSS with a visible pause control and respect prefers-reduced-motion.',
  tier: 'likely',
};

const noInteractiveToNoninteractive: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Interactive element given a non-interactive role',
  message:
    'This interactive element (for example a button or link) has a non-interactive role, so assistive technology announces it as something users cannot operate.',
  fix: 'Remove the role, or use a non-interactive element if it really is not interactive.',
  tier: 'likely',
};

const noNoninteractiveInteractions: RepoRuleEntry = {
  wcag: ['2.1.1', '4.1.2'],
  title: 'Event handlers on a non-interactive element',
  message:
    'This non-interactive element (for example <li> or <p>) has click or key handlers, but keyboard and screen reader users are not told it is interactive and may not be able to operate it.',
  fix: 'Move the handler to a <button> or link inside the element, or give it an interactive role, tabIndex and keyboard support.',
  tier: 'likely',
};

const noNoninteractiveToInteractive: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Non-interactive element given an interactive role',
  message:
    'This non-interactive element has an interactive role. Users are told it can be operated, but the element brings none of the keyboard behavior that role needs.',
  fix: 'Use the native interactive element (for example <button>) instead of adding a role.',
  tier: 'likely',
};

const noStaticElementInteractions: RepoRuleEntry = {
  wcag: ['2.1.1', '4.1.2'],
  title: 'Clickable element with no role',
  message:
    'This element (for example a <div> or <span>) has click or key handlers but no role, so screen reader users are not told it is interactive and keyboard users usually cannot reach it.',
  fix: 'Use a <button> or <a href>. If you must keep the element, add a role, tabIndex={0} and keyboard handling.',
  tier: 'likely',
};

const roleHasRequiredAriaProps: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'Role missing required ARIA attributes',
  message:
    'This element\'s role requires ARIA attributes that are missing (for example aria-checked on role="checkbox"), so its state is not announced.',
  fix: 'Add the required attributes for the role, or use the native element that provides them.',
  tier: 'likely',
};

const roleSupportsAriaProps: RepoRuleEntry = {
  wcag: ['4.1.2'],
  title: 'ARIA attribute not supported by the role',
  message:
    'This element uses an ARIA attribute that its role does not support, so assistive technology ignores it.',
  fix: 'Remove the attribute, or change the role to one that supports it.',
  tier: 'likely',
};

const scopeOnTh: RepoRuleEntry = {
  wcag: ['1.3.1'],
  title: 'scope attribute on a non-header cell',
  message:
    'The scope attribute is used on an element other than <th>, so table header relationships are not exposed correctly.',
  fix: 'Use scope only on <th> elements.',
  tier: 'likely',
};

const tabindexNoPositive: RepoRuleEntry = {
  wcag: ['2.4.3'],
  title: 'Positive tabindex',
  message:
    'This element has a positive tabindex, which pulls it ahead of everything else in the Tab order, so keyboard users move through the page in a confusing order.',
  fix: 'Use tabIndex={0} (or no tabindex) and put elements in the DOM in the order they should be reached.',
  tier: 'likely',
};

const formControlHasLabel: RepoRuleEntry = {
  wcag: ['1.3.1', '4.1.2'],
  title: 'Form control without a label',
  message:
    'This form control has no label, so screen reader users hear "edit text" with no idea what to enter.',
  fix: 'Add a <label> connected with for/id, or wrap the control in a label; aria-label works when no visible label is possible.',
  tier: 'likely',
};

const elementsContent: RepoRuleEntry = {
  wcag: ['4.1.2', '2.4.4'],
  title: 'Interactive element has no content',
  message:
    'This button, link or heading has no text content, so screen reader users get no name for it.',
  fix: 'Put text inside the element or give it an accessible name with aria-label.',
  tier: 'likely',
};

/**
 * The maintained lint-rule -> WCAG map. Keys are lint rule ids exactly as the plugin reports them
 * (`<plugin>/<rule>`). Only rules listed here are enabled: a recommended rule without a defensible
 * WCAG mapping (for example jsx-a11y/no-redundant-roles) is not run at all.
 * See docs/repo-scanning.md for the reasoning behind each tier.
 */
export const RULE_MAP: Readonly<Record<string, RepoRuleEntry>> = {
  // eslint-plugin-jsx-a11y (recommended set)
  'jsx-a11y/alt-text': altText,
  'jsx-a11y/anchor-has-content': anchorHasContent,
  'jsx-a11y/anchor-is-valid': anchorIsValid,
  'jsx-a11y/aria-activedescendant-has-tabindex': ariaActivedescendant,
  'jsx-a11y/aria-props': ariaProps,
  'jsx-a11y/aria-proptypes': ariaProptypes,
  'jsx-a11y/aria-role': ariaRole,
  'jsx-a11y/aria-unsupported-elements': ariaUnsupported,
  'jsx-a11y/autocomplete-valid': autocompleteValid,
  'jsx-a11y/click-events-have-key-events': clickEventsHaveKeyEvents,
  'jsx-a11y/heading-has-content': headingHasContent,
  'jsx-a11y/html-has-lang': htmlHasLang,
  'jsx-a11y/iframe-has-title': iframeHasTitle,
  'jsx-a11y/img-redundant-alt': imgRedundantAlt,
  'jsx-a11y/interactive-supports-focus': interactiveSupportsFocus,
  'jsx-a11y/label-has-associated-control': labelHasAssociatedControl,
  'jsx-a11y/media-has-caption': mediaHasCaption,
  'jsx-a11y/mouse-events-have-key-events': mouseEventsHaveKeyEvents,
  'jsx-a11y/no-autofocus': noAutofocus,
  'jsx-a11y/no-distracting-elements': noDistractingElements,
  'jsx-a11y/no-interactive-element-to-noninteractive-role': noInteractiveToNoninteractive,
  'jsx-a11y/no-noninteractive-element-interactions': noNoninteractiveInteractions,
  'jsx-a11y/no-noninteractive-element-to-interactive-role': noNoninteractiveToInteractive,
  'jsx-a11y/no-static-element-interactions': noStaticElementInteractions,
  'jsx-a11y/role-has-required-aria-props': roleHasRequiredAriaProps,
  'jsx-a11y/role-supports-aria-props': roleSupportsAriaProps,
  'jsx-a11y/scope': scopeOnTh,
  'jsx-a11y/tabindex-no-positive': tabindexNoPositive,

  // eslint-plugin-vuejs-accessibility (flat/recommended set)
  'vuejs-accessibility/alt-text': altText,
  'vuejs-accessibility/anchor-has-content': anchorHasContent,
  'vuejs-accessibility/aria-props': ariaProps,
  'vuejs-accessibility/aria-role': ariaRole,
  'vuejs-accessibility/aria-unsupported-elements': ariaUnsupported,
  'vuejs-accessibility/click-events-have-key-events': clickEventsHaveKeyEvents,
  'vuejs-accessibility/form-control-has-label': formControlHasLabel,
  'vuejs-accessibility/heading-has-content': headingHasContent,
  'vuejs-accessibility/iframe-has-title': iframeHasTitle,
  'vuejs-accessibility/interactive-supports-focus': interactiveSupportsFocus,
  'vuejs-accessibility/label-has-for': labelHasAssociatedControl,
  'vuejs-accessibility/media-has-caption': mediaHasCaption,
  'vuejs-accessibility/mouse-events-have-key-events': mouseEventsHaveKeyEvents,
  'vuejs-accessibility/no-autofocus': noAutofocus,
  'vuejs-accessibility/no-distracting-elements': noDistractingElements,
  'vuejs-accessibility/no-static-element-interactions': noStaticElementInteractions,
  'vuejs-accessibility/role-has-required-aria-props': roleHasRequiredAriaProps,
  'vuejs-accessibility/tabindex-no-positive': tabindexNoPositive,

  // @angular-eslint/eslint-plugin-template accessibility rules (only when loaded from the repo)
  'angular-template/alt-text': altText,
  'angular-template/elements-content': elementsContent,
  'angular-template/label-has-associated-control': labelHasAssociatedControl,
  'angular-template/table-scope': scopeOnTh,
  'angular-template/valid-aria': ariaProptypes,
  'angular-template/click-events-have-key-events': clickEventsHaveKeyEvents,
  'angular-template/mouse-events-have-key-events': mouseEventsHaveKeyEvents,
  'angular-template/no-autofocus': noAutofocus,
  'angular-template/no-distracting-elements': noDistractingElements,
  'angular-template/interactive-supports-focus': interactiveSupportsFocus,
  'angular-template/role-has-required-aria': roleHasRequiredAriaProps,
  'angular-template/no-positive-tabindex': tabindexNoPositive,
};

/**
 * Recommended rules we deliberately do not run, with the reason (documented in
 * docs/repo-scanning.md). Kept here so the completeness test can tell "skipped on purpose" from
 * "forgot to map".
 */
export const SKIPPED_RULES: Readonly<Record<string, string>> = {
  'jsx-a11y/no-access-key':
    'accesskey conflicts are a usability concern; no WCAG SC fails because of accesskey alone.',
  'jsx-a11y/no-noninteractive-tabindex':
    'tabIndex={0} on non-interactive content is often required (scrollable regions need it for 2.1.1).',
  'jsx-a11y/no-redundant-roles': 'Redundant roles (button role="button") are harmless.',
  'vuejs-accessibility/no-access-key':
    'accesskey conflicts are a usability concern; no WCAG SC fails because of accesskey alone.',
  'vuejs-accessibility/no-redundant-roles': 'Redundant roles (button role="button") are harmless.',
};

/** Lint rule ids we enable for a plugin, e.g. ["jsx-a11y/alt-text", ...]. */
export function enabledRules(plugin: LintPlugin): string[] {
  return Object.keys(RULE_MAP).filter((id) => id.startsWith(`${plugin}/`));
}

/** Tier for one lint message under the policy above. */
export function tierFor(entry: RepoRuleEntry, ctx: TierContext): Tier {
  if (entry.violationWhen?.(ctx)) return 'violation';
  return entry.tier;
}

/** Confidence that goes with a tier for static lint findings. */
export const CONFIDENCE: Record<Tier, number> = {
  violation: 0.95,
  likely: 0.7,
  'needs-review': 0.5,
};
