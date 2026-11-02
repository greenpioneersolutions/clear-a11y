/**
 * Plain-language "who it affects" copy, keyed by WCAG success criterion (most specific first,
 * then guideline, then principle). Shown in the HTML report next to each finding.
 */
const BY_SC: Record<string, string> = {
  '1.1.1':
    'Blind and low-vision people using screen readers, and anyone whose images fail to load.',
  '1.3.1':
    'Screen reader users, who rely on headings, labels and table structure being in the code.',
  '1.3.2':
    'Screen reader and keyboard users, who meet content in code order rather than visual order.',
  '1.3.5': 'People with cognitive or motor disabilities who rely on autofill.',
  '1.4.1': 'People with color blindness or low vision.',
  '1.4.3': 'People with low vision or color blindness, and anyone reading in bright light.',
  '1.4.4': 'People with low vision who enlarge text.',
  '1.4.10':
    'People who zoom to 400% or use small screens, who should not have to scroll in two directions.',
  '1.4.11': 'People with low vision who need to see control boundaries and focus indicators.',
  '1.4.12': 'People with dyslexia or low vision who change text spacing.',
  '1.4.13':
    'Screen magnifier and keyboard users, who need hover and focus pop-ups to stay put and be dismissible.',
  '2.1.1': 'Keyboard users, including people who use switches, voice control or screen readers.',
  '2.1.2': 'Keyboard users, who can get stuck with no way out.',
  '2.4.1': 'Keyboard and screen reader users, who need a way to skip repeated blocks.',
  '2.4.2': 'Screen reader users and anyone juggling many tabs.',
  '2.4.3':
    'Keyboard, switch and screen magnifier users, who lose their place when focus jumps around.',
  '2.4.4': 'Screen reader users who browse a list of links out of context.',
  '2.4.6':
    'Screen reader users and people with cognitive disabilities, who scan headings and labels.',
  '2.4.7': 'Sighted keyboard users, who need to see where focus is.',
  '2.4.11': 'Sighted keyboard users, who cannot act on what they cannot see.',
  '2.5.3': 'Voice control users, who speak the visible label to activate a control.',
  '2.5.8': 'People with tremors or limited dexterity, and touch screen users.',
  '3.1.1': 'Screen reader users, whose software needs the page language to pronounce words.',
  '3.2.1': 'Keyboard and screen reader users, who are disoriented by unexpected changes.',
  '3.2.2': 'Keyboard and screen reader users, who are disoriented by unexpected changes.',
  '3.3.1':
    'Screen reader users and people with cognitive disabilities, who need errors explained in text.',
  '3.3.2':
    'Everyone filling in the form, especially screen reader users and people with cognitive disabilities.',
  '3.3.3': 'People with cognitive disabilities, who need help correcting mistakes.',
  '4.1.2':
    'Screen reader and voice control users, who need every control to expose its name, role and state.',
  '4.1.3': 'Screen reader users, who miss status updates that are not announced.',
};

const BY_GUIDELINE: Record<string, string> = {
  '1.2': 'Deaf, hard-of-hearing, blind and low-vision people using media.',
  '1.3': 'Screen reader users, who rely on structure being in the code.',
  '1.4': 'People with low vision or color blindness.',
  '2.1': 'Keyboard users, including people who use switches or voice control.',
  '2.2': 'People who need more time, including many people with disabilities.',
  '2.3': 'People with photosensitive seizure disorders or vestibular disorders.',
  '2.4': 'Keyboard and screen reader users finding their way around.',
  '2.5': 'People using touch, a pointer or voice input with limited dexterity.',
  '3.1': 'Screen reader users and people with cognitive disabilities.',
  '3.2': 'People who are disoriented by unexpected changes.',
  '3.3': 'Everyone filling in forms, especially people with cognitive disabilities.',
  '4.1': 'People using assistive technology such as screen readers.',
};

export function whoItAffects(wcag: readonly string[]): string {
  for (const sc of wcag) {
    const exact = BY_SC[sc];
    if (exact) return exact;
  }
  for (const sc of wcag) {
    const g = BY_GUIDELINE[sc.split('.').slice(0, 2).join('.')];
    if (g) return g;
  }
  return 'People who use assistive technology, and often everyone else too.';
}
