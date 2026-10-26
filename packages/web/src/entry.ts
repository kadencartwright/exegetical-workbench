import { Runtime } from 'foldkit'
import { Model, Message, initFromUrl, update } from './state'
import { view } from './view'
import './style.css'

const application = Runtime.makeApplication({
  Model, init: () => initFromUrl(window.location.href), update, view,
  container: document.getElementById('root'),
  devTools: { Message },
})
Runtime.run(application)
