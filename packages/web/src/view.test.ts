import { describe, it, expect } from 'vitest'
import { Scene } from 'foldkit/test'
import { initialModel, update, type Model } from './state'
import { view } from './view'
const ready = (data: unknown) => ({status:'ready',requestId:1,payload:{data,coverage:[],provenance:[]},error:''})
const render = (model: Model, check:(text:string)=>void) => Scene.scene({update,view},Scene.given(model),Scene.tap(simulation=>check(Scene.textContent(simulation.html))))
// Synthetic protocol data exercises actual Foldkit rendering, not shipped scholarly evidence.
describe('research evidence views',()=>{
  it('renders readable syntax groups, clause text and source-supplied roles',()=>{
    const tree = {kind:'clause',attributes:{role:'synthetic subject',rule:'test grouping'},children:[{kind:'word',text:'test-word',attributes:{'xml:id':'actual-id',gloss:'test gloss'},children:[]}]}
    render({...initialModel,tab:'syntax',resources:{syntax:ready({ref:'John.3.16',trees:[tree],tokens:[{id:'token-real',upstreamId:'actual-id',text:'test-word'}]})}},text=>{
      expect(text).toContain('Syntax tree & clause view')
      expect(text).toContain('synthetic subject · test grouping')
      expect(text).toContain('Clauses in reading order')
      expect(text).toContain('Anchor note to this group')
      expect(text).not.toContain('xml:id')
    })
  })
  it('renders independent lexical witnesses and pre-pagination distribution',()=>{
    const lexicon = ['source-one','source-two'].map(sourceId=>({sourceId,lemma:'test lemma',definition:`${sourceId} definition`,provenance:{locator:`${sourceId}:entry`}}))
    render({...initialModel,tab:'lexicon',resources:{lexicon:ready(lexicon),distribution:ready({total:203,books:[{book:'John',count:203}],forms:[],editions:[]}),concordance:ready([{ref:'John.3.16',edition:'sblgnt',token:{id:'real-id',text:'test form'}}])}},text=>{
      expect(text).toContain('source-one definition')
      expect(text).toContain('source-two definition')
      expect(text).toContain('203 matching tokens')
      expect(text).toContain('John.3.16')
      expect(text).toContain('Exact form')
    })
  })
  it('shows bounded grammar treatment with locator and its own reference link',()=>{
    render({...initialModel,resources:{token:ready({id:'test-token',text:'test-word',analyses:[],cautions:['Test caution'],grammar:[{title:'Test grammar',summary:'Application explanation: synthetic protocol example',canEstablish:'Test form only',cannotEstablish:'Test interpretation',url:'https://example.org/grammar',locator:'Synthetic section 12',provenance:{edition:'Test edition'}}]})}},text=>{
      expect(text).toContain('Can establish:')
      expect(text).toContain('Cannot establish:')
      expect(text).toContain('Synthetic section 12')
      expect(text).toContain('Read the reference grammar')
      expect(text).toContain('Notes on this token')
      expect(text).toContain('All indexed citations of this passage')
    })
  })
  it('retains exact source text and review status while distinguishing witness and translation',()=>{
    render({...initialModel,tab:'reception',resources:{page:ready({id:'test-page',sourceId:'test-source',locator:{label:'Printed 12'},text:'<script>synthetic source text</script>',provenance:{reviewStatus:'AI-assisted, unreviewed',upstreamUrl:'https://example.org/english'}}),sourceLibrary:ready([{id:'test-source',originalUrl:'https://example.org/original'}])}},text=>{
      expect(text).toContain('AI-assisted, unreviewed')
      expect(text).toContain('<script>synthetic source text</script>')
      expect(text).toContain('Open original witness')
      expect(text).toContain('Anchor note to this page')
    })
  })
})

it('distinguishes explicitly empty BSB slots from unloaded editions',()=>{
  render({...initialModel,resources:{passage:ready({ref:'Matt.17.21',editions:[{id:'bsb',label:'BSB',language:'en',text:'',tokens:[],textStatus:'empty-upstream'}]})}},text=>{
    expect(text).toContain('No verse text at this reference in the pinned BSB edition')
    expect(text).toContain('explicitly empty upstream verse slot')
    expect(text).not.toContain('Token analysis is not loaded for this edition.')
  })
})
it('keeps omitted reception paths and their actual reasons accessible in coverage',()=>{
  render({...initialModel,resources:{coverage:ready([{sourceId:'source-one',status:'partial',scope:'Synthetic dataset',limitations:['Test limit']},{sourceId:'unit-one',status:'not-loaded',scope:'In-progress work',inventory:{id:'unit-one',state:'in-progress',importedPaths:[],omitted:[{path:'uncompleted/unit/english.md',reason:'Synthetic omission reason'}]}}])}},text=>{
    expect(text).toContain('1 work inventory records returned')
    expect(text).toContain('uncompleted/unit/english.md')
    expect(text).toContain('Synthetic omission reason')
  })
})
