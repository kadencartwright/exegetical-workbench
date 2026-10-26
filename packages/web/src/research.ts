import type { Html, HtmlBuilder } from 'foldkit/html'
import { safeLink, ntBooks } from './api'
import { Message, envelope, type Model } from './state'
type H = HtmlBuilder<Message>
export type RecordData = Record<string, any>
const records = (value: unknown): RecordData[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : []
const text = (value: unknown, fallback = 'Not supplied') => typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
export function grammarView(h: H, value: unknown): Html {
  const entries = records(value)
  return entries.length ? h.div([h.Class('grammar-cards')], entries.map(entry => h.details([h.Class('callout'),h.Open(entry.id === (entries.find(e=>e.category === 'referent')?.id ?? entries[0]?.id))], [
    h.summary([], [text(entry.title ?? entry.category)]), h.p([], [text(entry.summary)]),
    ...['canEstablish','cannotEstablish'].flatMap(key => entry[key] ? [h.strong([], [key === 'canEstablish' ? 'Can establish: ' : 'Cannot establish: ']), h.p([], [Array.isArray(entry[key]) ? entry[key].join(' ') : text(entry[key])])] : []),
    h.p([h.Class('locator')], [text(entry.locator ?? entry.provenance?.locator)]),
    ...(safeLink(entry.url) ? [h.a([h.Href(safeLink(entry.url)!), h.Target('_blank'), h.Rel('noopener noreferrer')], ['Read the reference grammar ↗'])] : []),
    h.p([h.Class('caption')], ['Application explanation; consult the linked grammar for its actual wording. ', text(entry.provenance?.edition, ''), ' · ', text(entry.provenance?.version, '')]),
  ]))) : h.p([h.Class('empty')], ['No grammar treatment loaded for this token.'])
}
export function syntaxView(h: H, model: Model, value: unknown): Html {
  const syntaxes = Array.isArray(value) ? records(value) : value ? [value as RecordData] : []
  function node(n: RecordData, depth = 0): Html {
    const attrs = n.attributes ?? {}
    const children = records(n.children)
    if (n.kind === 'word') {
      const tokens = syntaxes.flatMap(s => records(s.tokens))
      const token = tokens.find(t => t.upstreamId && t.upstreamId === attrs['xml:id']) ?? tokens.find(t => t.text === n.text)
      return h.li([h.Class('syntax-word')], [
        ...(token ? [h.button([h.Type('button'), h.OnClick(Message.SelectToken({id:token.id}))], [text(n.text)])] : [h.span([h.Lang('grc')], [text(n.text)])]),
        h.span([h.Class('caption')], [[attrs.role, attrs.gloss, attrs.class, attrs.case].filter(Boolean).join(' · ')]),
      ])
    }
    if (depth > 30) return h.li([], ['Further structure is available in the source.'])
    const heading = [attrs.role, attrs.rule, attrs.class, attrs.type].filter(Boolean).join(' · ') || text(n.kind, 'Group')
    const leaves = (function collect(n: RecordData): string[] {return n.kind === 'word' ? [n.attributes?.['xml:id'] ?? n.attributes?.ref].filter(Boolean) : records(n.children).flatMap(collect)})(n)
    const id = attrs['xml:id'] ?? attrs.id ?? (leaves.length ? `syntax-span:${leaves[0]}..${leaves.at(-1)}` : undefined)
    return h.li([], [h.details([h.Open(depth < 5)], [h.summary([], [heading]), ...(id ? [h.button([h.Type('button'), h.OnClick(Message.AnchorSelected({type:attrs.class === 'cl' || n.kind === 'clause' ? 'clause' : 'phrase',id}))], ['Anchor note to this group'])] : []), h.ul([h.Class('syntax-tree')], children.map(c => node(c, depth + 1)))])])
  }
  function clauses(n: RecordData): RecordData[] {
    const a = n.attributes ?? {}
    return [...((a.class === 'cl' || a.type === 'clause' || /clause/i.test(n.kind ?? '')) ? [n] : []), ...records(n.children).flatMap(clauses)]
  }
  function words(n: RecordData): string {
    function leaves(group:RecordData):RecordData[] {return group.text ? [group] : records(group.children).flatMap(leaves)}
    return leaves(n).sort((a,b)=>Number(/!(\d+)$/.exec(a.attributes?.ref ?? '')?.[1] ?? 0)-Number(/!(\d+)$/.exec(b.attributes?.ref ?? '')?.[1] ?? 0)).map(word=>word.text).join(' ')
  }
  return h.div([], [h.h3([], ['Syntax tree & clause view']), h.p([h.Class('caption')], ['Expand the source groups. Roles and rules are dataset labels; grouping does not settle interpretation. Select an annotated word to inspect it.']), ...syntaxes.flatMap(s => [
    h.h4([], [text(s.ref)]), h.ul([h.Class('syntax-tree')], records(s.trees).map(n => node(n))),
    h.h4([], ['Clauses in reading order']),
    ...(records(s.trees).flatMap(clauses).length ? records(s.trees).flatMap(clauses).map(c => h.article([h.Class('clause')], [h.p([h.Lang('grc')], [words(c)]), h.p([h.Class('caption')], [text(c.attributes?.rule ?? c.attributes?.role, 'Clause label not supplied')])])) : [h.p([h.Class('empty')], ['This source does not mark standalone clauses for this reference. The tree above retains its supplied groups.'])]),
  ]), ...(!syntaxes.length ? [h.p([h.Class('empty')], ['Syntax not loaded for this reference.'])] : [])])
}
export function lexiconView(h: H, value: unknown): Html {
  const entries = records(value)
  return h.div([h.Class('lexicon-grid')], entries.length ? entries.map(e => h.article([h.Class('lexicon-card')], [
    h.h4([], [text(e.sourceId)]), h.h3([h.Lang('grc')], [text(e.lemma)]), h.p([h.Class('caption')], [[e.strong,e.transliteration].filter(Boolean).join(' · ')]),
    ...(Array.isArray(e.domains)?e.domains.map((id:string)=>h.button([h.Type('button'),h.OnClick(Message.Domain({id:e.sourceId+':'+id}))],['Domain '+id])):[]),h.p([], [text(e.gloss, '')]), h.p([h.Class('definition')], [text(e.definition)]),
    h.p([h.Class('locator')], [text(e.provenance?.locator)]), h.p([h.Class('caption')], [[e.provenance?.edition,e.provenance?.version,e.provenance?.license].filter(Boolean).join(' · ')]),
    ...(safeLink(e.provenance?.upstreamUrl) ? [h.a([h.Href(safeLink(e.provenance.upstreamUrl)!),h.Target('_blank'),h.Rel('noopener noreferrer')], ['Lexicon source ↗'])] : []),
  ])) : [h.p([h.Class('empty')], ['No lexicon entries returned. Interlinear glosses are not substitutes for lexicon witnesses. Check coverage.'])])
}
export function concordanceFilters(h: H, model: Model): Html {
  return h.form([h.OnSubmit(Message.SearchConcordance()), h.Class('filters')], [
    h.label([], ['Book', h.select([h.Value(model.filterBook),h.OnChange(value => Message.FilterChanged({field:'filterBook',value})),h.AriaLabel('Concordance book')], [h.option([h.Value('')], ['All books']), ...ntBooks.map(b => h.option([h.Value(b.id)], [b.name]))])]),
    h.label([], ['Exact form',h.input([h.Value(model.filterForm),h.AriaLabel('Concordance form'),h.OnInput(value => Message.FilterChanged({field:'filterForm',value}))])]),
    h.label([], ['Edition',h.select([h.Value(model.filterEdition),h.AriaLabel('Concordance edition'),h.OnChange(value => Message.FilterChanged({field:'filterEdition',value}))], [h.option([h.Value('')], ['All editions']), h.option([h.Value('sblgnt')], ['SBLGNT']),h.option([h.Value('bsb')], ['BSB']),h.option([h.Value('lxx')],['LXX']),h.option([h.Value('sblgnt,lxx')],['LXX + NT']),h.option([h.Value('oshb')],['OSHB']),h.option([h.Value('macula-hebrew')],['Macula Hebrew'])])]),
    h.button([h.Type('submit')], ['Apply filters']),
  ])
}
export function distributionView(h: H, value: unknown): Html {
  const data = value as RecordData | null
  const books = records(data?.books), max = Math.max(1,...books.map(b => Number(b.count)))
  return h.div([], [
    h.p([], [`${text(data?.total,'0')} matching tokens across the loaded corpus (before pagination).`]),
    h.div([h.Class('distribution'),h.AriaLabel('Concordance distribution by book')], books.map(b => h.div([h.Class('distribution-row')], [
      h.span([], [text(b.book)]),
      h.meter([h.Attribute('min','0'),h.Attribute('max',String(max)),h.Attribute('value',String(b.count)),h.AriaLabel(`${b.book}: ${b.count}`)], [String(b.count)]),
      h.span([], [String(b.count)]),
    ]))),
    ...['forms','editions'].map(key => h.details([], [
      h.summary([], [key === 'forms' ? 'Forms and counts' : 'Editions and counts']),
      h.ul([], records(data?.[key]).map(r => h.li([], [`${text(r.form ?? r.edition)} · ${r.count}`]))),
    ])),
  ])
}
export function concordanceView(h: H, model: Model, value: unknown): Html {
  const rows = records(value)
  return h.div([], [h.ol([h.Class('concordance')],rows.map(row => {
    const token = row.token ?? row, ref = row.ref ?? token.id?.split(':')[1]
    return h.li([], [h.a([h.Href(`/study/${encodeURIComponent(ref ?? model.ref)}?token=${encodeURIComponent(token.id ?? '')}`)], [text(ref)]), ' · ',h.span([h.Lang('grc')], [text(token.text)]),' · ',text(row.edition ?? token.sourceId),...(row.edition==='lxx'?[h.button([h.Type('button'),h.OnClick(Message.Parallel({ref}))],['Hebrew parallel'])]:[]),h.p([h.Class('caption')], [text(token.gloss ?? token.morphology?.description,'')])])
  })), ...(!rows.length ? [h.p([h.Class('empty')], ['No matches for these filters in the loaded corpus.'])] : []), h.div([h.Class('actions')], [h.button([h.Type('button'),h.Disabled(model.concordanceOffset === 0),h.OnClick(Message.ConcordancePage({offset:model.concordanceOffset-100}))], ['Previous 100']),h.span([], [`${model.concordanceOffset + (rows.length ? 1 : 0)}–${model.concordanceOffset+rows.length}`]),h.button([h.Type('button'),h.Disabled(model.concordanceOffset + rows.length >= (envelope<RecordData>(model,'distribution')?.data?.total ?? Infinity) || rows.length < 100),h.OnClick(Message.ConcordancePage({offset:model.concordanceOffset+100}))], ['Next 100'])])])
}
export function crossreferencesView(h: H, value: unknown): Html {
  const rows = records(value)
  return h.div([], [h.h3([], ['Canonical cross-references']),h.p([h.Class('caption')], ['Editorial suggestions, not proof of a shared meaning. Old Testament targets may be outside the loaded reader.']),h.ul([],rows.map(r => h.li([], [h.a([h.Href(`/study/${encodeURIComponent(r.toRef + (r.endRef ? '-' + r.endRef.split('.').slice(1).join('.') : ''))}`)], [text(r.toRef), ...(r.endRef ? ['–',text(r.endRef)] : [])]),` · ${text(r.votes,'0')} votes · ${text(r.sourceId)}`]))),...(!rows.length ? [h.p([h.Class('empty')], ['No cross-references returned; consult source coverage.'])] : [])])
}
export function sourcePageView(h: H, value: unknown, model?: Model): Html {
  const p = value as RecordData | null
  if (!p) return h.p([h.Class('empty')], ['This exact source page is not loaded.'])
  const source = records(model && envelope(model,'sourceLibrary')?.data).find(s => s.id === p.sourceId)
  const reception=p.provenance?.source==='reformed-retrieval'
  const upstream=safeLink(p.originalUrl??source?.originalUrl??p.provenance?.upstreamUrl)
  return h.article([h.Class('source-reader')],[
    h.h3([],[text(p.locator?.label??p.locator??p.id)]),
    h.p([h.Class('badge review')],[text(p.provenance?.reviewStatus)]),
    h.div([h.Class(reception?'parallel':'source-section')],[
      h.div([],[h.h4([],[reception?'English · AI-assisted, unreviewed':'Source text']),h.p([h.Class('source-text')],[text(p.text)])]),
      ...(reception?[h.div([],[h.h4([],['Original language']),h.p([h.Class('caption')],[text(p.original?.alignmentStatus,'No aligned original loaded')]),h.p([h.Class('source-text'),h.Lang(p.original?.language||'la')],[text(p.original?.text,'Original text is not loaded for this page.')])])]:[]),
    ]),
    h.button([h.Type('button'),h.OnClick(Message.QuotePage())],['Quote page into note']),
    ...(reception?[h.a([h.Href('https://github.com/kadencartwright/reformed-retrieval/issues/new?title='+encodeURIComponent('Source correction: '+text(p.id))+'&body='+encodeURIComponent('Locator: '+text(p.id)+'\nPinned source: '+text(p.provenance?.upstreamUrl)+'\n\nObserved error:\n\nSuggested correction:\n')),h.Target('_blank'),h.Rel('noopener noreferrer')],['Draft source correction ↗'])]:[]),
    h.p([h.Class('locator')],[text(p.id)]),
    h.button([h.Type('button'),h.OnClick(Message.AnchorSelected({type:'source-page',id:p.id}))],['Anchor note to this page']),
    ...(upstream?[h.a([h.Class('source-link'),h.Href(upstream),h.Target('_blank'),h.Rel('noopener noreferrer')],[p.originalUrl||source?.originalUrl?'Open original witness ↗':'Open pinned source file ↗'])]:[]),
  ])
}

export function sourceResultsView(h: H, model: Model, value: unknown): Html {
  const rows = records(value).filter(s => !model.sourceId || s.id === model.sourceId)
  return h.div([], [h.p([h.Class('caption')],[`${rows.length} source units returned. Each unit retains its own incomplete coverage; no matches do not establish silence.`]),...rows.map(s => h.article([h.Class('citation')],[
    h.h3([],[text(s.title)]),h.p([h.Class('caption')],[[s.author,s.date,s.path].filter(Boolean).join(' · ')]),
    h.span([h.Class('badge review')],[text(s.provenance?.reviewStatus)]),
    h.p([],[text(s.coverage?.scope,'Coverage not supplied')]),
    ...(Array.isArray(s.coverage?.limitations) ? s.coverage.limitations.map((l:unknown)=>h.p([h.Class('caption')],[text(l)])) : []),
    h.p([h.Class('locator')],[text(s.provenance?.locator)]),
    ...(safeLink(s.originalUrl) ? [h.a([h.Href(safeLink(s.originalUrl)!),h.Target('_blank'),h.Rel('noopener noreferrer')],['Open original witness ↗'])] : []),
    ...(safeLink(s.provenance?.upstreamUrl) ? [h.a([h.Class('source-link'),h.Href(safeLink(s.provenance.upstreamUrl)!),h.Target('_blank'),h.Rel('noopener noreferrer')],['Pinned English source ↗'])] : []),
  ]))])
}

export function coverageView(h: H, value: unknown): Html {
  const rows = records(value), sources = rows.filter(r=>!r.inventory), works = rows.filter(r=>r.inventory)
  function card(row:RecordData):Html {
    const inventory = row.inventory
    return h.details([h.Class('coverage-unit')],[
      h.summary([],[h.span([h.Class('badge')],[text(row.status)]),' ',text(row.sourceId ?? row.source),...(row.count !== undefined ? [` · ${row.count}`] : []),...(inventory ? [` · ${inventory.state} · ${inventory.importedPaths?.length ?? 0} imported files`] : [])]),
      h.p([],[text(row.scope)]),
      ...(Array.isArray(row.limitations) ? row.limitations.map((limit:unknown)=>h.p([h.Class('caption')],[text(limit)])) : []),
      ...(inventory ? [h.h4([],['Imported English paths']),h.ul([], (inventory.importedPaths ?? []).map((path:unknown)=>h.li([h.Class('locator')],[text(path)]))),h.h4([],['Omitted paths & reasons']),h.ul([],records(inventory.omitted).map(omitted=>h.li([],[h.p([h.Class('locator')],[text(omitted.path)]),h.p([h.Class('caption')],[text(omitted.reason)])]))),...(safeLink(inventory.upstreamUrl)?[h.a([h.Href(safeLink(inventory.upstreamUrl)!),h.Target('_blank'),h.Rel('noopener noreferrer')],['Pinned work inventory ↗'])]:[])] : []),
    ])
  }
  return h.div([], [h.p([h.Class('caption')],[`${sources.length} dataset coverage records; ${works.length} work inventory records returned. Expand a record for its exact limits.`]),...sources.map(card),...(works.length ? [h.details([h.Class('work-inventory')],[h.summary([],[`Reception work inventory · ${works.length} works`]),...works.map(card)])] : [])])
}

export function translationView(h:H,value:unknown):Html {
 const data=value as RecordData|null;
 return h.div([h.Class('reverse-interlinear')],data?.words?.length?records(data.words).map(w=>h.span([h.Class('alignment-word')],[h.strong([],[text(w.english)]),h.span([h.Lang(/[\u0590-\u05FF]/.test(w.original)?'he':'grc')],[text(w.original)]),h.span([h.Class('caption')],[text(w.parse)]),h.span([h.Class('locator')],[text(w.strong)])])):[h.p([],['Translation table is not loaded for this reference.'])]);
}
export function confessionView(h:H,value:unknown):Html {
 return h.div([],records(value).map(c=>h.article([],[h.h4([],[text(c.id)+' · '+text(c.title)]),h.button([h.Type('button'),h.OnClick(Message.OpenPage({locator:c.id}))],['Quote or annotate this section']),h.p([h.Class('source-text')],[text(c.text)]),...(c.proofTexts?.length?[h.details([],[h.summary([],['Proof texts']),h.pre([h.Class('source-text')],[c.proofTexts.map((p:unknown)=>typeof p==='string'?p:JSON.stringify(p,null,2)).join('\n')])])]:[]),h.p([h.Class('caption')],[text(c.provenance?.edition)+' · '+text(c.provenance?.license)]),h.a([h.Href(c.provenance?.upstreamUrl),h.Target('_blank'),h.Rel('noopener noreferrer')],['Pinned confessional source ↗'])])));
}
export function parallelView(h:H,value:unknown):Html {
 const data=value as RecordData|null;
 return h.div([],data?[h.h4([],[text(data.ref)+' · LXX reference']),h.p([h.Class('caption')],[text(data.mapping?.method??data.status)]),...records(data.hebrew).map(e=>h.article([],[h.h4([],[text(e.provenance?.locator)]),h.p([h.Dir('rtl'),h.Lang('he'),h.Class('passage-text')],[text(e.text)]),h.a([h.Href('/study/'+encodeURIComponent(e.provenance?.locator))],['Inspect Hebrew words'])]))]:[h.p([],['Choose Hebrew parallel from an LXX concordance occurrence.'])]);
}
export function domainView(h:H,value:unknown):Html {
 const data=value as RecordData|null;
 return h.div([],data?[...records(data.domains).map(d=>h.div([],[h.h4([],[text(d.label)+' · '+text(d.code)]),h.p([],[text(d.description)]),h.p([],[text(d.comment)])])),...records(data.entries).map(e=>h.article([],[h.a([h.Href('/lexicon?lemma='+encodeURIComponent(e.lemma))],[text(e.lemma)]),h.p([],[text(e.definition)])]))]:[h.p([],['Choose a domain from a UBS lexical entry.'])]);
}
