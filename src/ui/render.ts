import type { ActLayout } from '../director/acts'
import type { Project } from '../content/projects'
import type { site as Site } from '../content/site'

type Child = Node | string | null | undefined | false
type Attrs = Record<string, string | number | boolean | undefined>

/** Minimal element builder — text is always set via text nodes, never HTML. */
export function el(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (key === 'class') node.className = String(value)
    else if (key === 'style') node.setAttribute('style', String(value))
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return node
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function act(id: string, len: number, label: string, ...stage: Child[]) {
  return el(
    'section',
    { class: `act act--${id}`, id, style: `--len:${len}`, 'aria-label': label },
    el('div', { class: 'act__stage' }, ...stage),
  )
}

function projectLink(href: string, label: string, unavailable: string) {
  return href
    ? el('a', { class: 'card__link', href, target: '_blank', rel: 'noopener noreferrer', 'data-cursor': '' }, label)
    : el('span', { class: 'card__link is-disabled', 'aria-disabled': 'true' }, unavailable)
}

/** Builds every section from the content files into `<main>`. */
export function renderSections(main: HTMLElement, site: typeof Site, projects: readonly Project[], layout: ActLayout) {
  const len = (id: keyof ActLayout['byId']) => layout.byId[id].length
  const fullName = `${site.name.first} ${site.name.last}`

  const pad = act(
    'pad',
    len('pad'),
    'Introduction',
    el('h1', { class: 'hero__name', 'data-beat': 'hero', translate: 'no' }, el('span', {}, site.name.first), ' ', el('span', {}, site.name.last)),
    el(
      'div',
      { class: 'hero', 'data-beat': 'hero' },
      el('p', { class: 'hero__role', 'data-scramble': '' }, site.role),
      el('p', { class: 'hero__intro' }, site.intro),
    ),
    el('div', { class: 'cue', 'data-beat': 'hero', 'aria-hidden': 'true' }, el('span', { class: 'cue__label' }, 'Scroll to launch'), el('span', { class: 'cue__line' })),
  )

  const gauge = el(
    'div',
    { class: 'gauge', 'data-beat': 'gauge', 'aria-hidden': 'true' },
    el('span', { class: 'gauge__label' }, 'Propellant load'),
    el('span', { class: 'gauge__track' }, el('i', { class: 'gauge__fill' })),
    el('span', { class: 'gauge__value' }, '0%'),
  )
  const manifesto = act(
    'manifesto',
    len('manifesto'),
    'Manifesto',
    el('h2', { class: 'sr-only' }, 'Manifesto'),
    el(
      'div',
      { class: 'manifesto' },
      ...site.manifesto.map((line, i) => el('p', { class: 'manifesto__line', 'data-beat': `manifesto-${i}` }, line)),
    ),
    gauge,
  )

  const launch = act(
    'launch',
    len('launch'),
    'Launch sequence',
    el('h2', { class: 'sr-only' }, 'Launch sequence'),
    el(
      'ol',
      { class: 'captions' },
      ...site.launch.map((caption, i) =>
        el('li', { class: 'caption', 'data-beat': `launch-${i}` }, el('span', { class: 'caption__text', 'data-scramble': '' }, caption)),
      ),
    ),
  )

  const total = projects.length
  const payloads = act(
    'payloads',
    len('payloads'),
    'Projects',
    el('div', { class: 'scrim', 'data-beat': 'scrim', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'payloads-intro', 'data-beat': 'payloads-intro' },
      el('h2', { class: 'payloads-intro__heading', 'data-scramble': '', tabindex: '-1' }, site.payloadsIntro.heading),
      el('p', { class: 'payloads-intro__body' }, site.payloadsIntro.body),
    ),
    ...projects.map((p, i) =>
      el(
        'article',
        { class: 'card', 'data-beat': `payload-${i}`, 'aria-labelledby': `payload-${p.id}` },
        el(
          'div',
          { class: 'card__meta' },
          el('span', { class: 'card__index', 'data-scramble': '' }, `Payload ${pad2(i + 1)} of ${pad2(total)}`),
          el('span', { class: 'card__status' }, el('i', { class: 'live-dot', 'aria-hidden': 'true' }), p.status),
        ),
        el('h3', { class: 'card__title', id: `payload-${p.id}` }, p.title),
        el('p', { class: 'card__summary' }, p.summary),
        el('ul', { class: 'card__tags', 'aria-label': 'Built with' }, ...p.tags.map((t) => el('li', {}, t))),
        el(
          'div',
          { class: 'card__links' },
          projectLink(p.repo, 'View repository', 'Repository not public yet'),
          projectLink(p.live, 'Open live demo', 'Demo coming soon'),
        ),
        el('span', { class: 'card__year' }, p.year),
      ),
    ),
  )

  const year = new Date().getFullYear()
  const contact = act(
    'contact',
    len('contact'),
    'Contact',
    el(
      'div',
      { class: 'contact', 'data-beat': 'contact' },
      el('h2', { class: 'contact__heading', 'data-scramble': '' }, site.contact.heading),
      el('p', { class: 'contact__body' }, site.contact.body),
      el(
        'ul',
        { class: 'channels' },
        ...site.contact.links.map((link) => {
          const live = /^(https?:|mailto:)/.test(link.href)
          return el(
            'li',
            {},
            el(
              'a',
              {
                class: 'channel',
                // Placeholders stay focusable (they drive the particle forms) but are marked unavailable.
                href: live ? link.href : '#contact',
                'aria-disabled': live ? undefined : 'true',
                'data-shape': link.shape,
                'data-cursor': '',
                ...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
              },
              el('span', { class: 'channel__label' }, link.label),
              el('span', { class: 'channel__detail' }, link.detail),
            ),
          )
        }),
      ),
      el(
        'footer',
        { class: 'footer' },
        el('span', {}, `© ${year} ${fullName}`),
        el('button', { class: 'footer__top', type: 'button', 'data-action': 'top', 'data-cursor': '' }, 'Return to pad'),
        el('span', {}, 'Built with Three.js'),
      ),
    ),
  )

  main.append(pad, manifesto, launch, payloads, contact)
}
