import { Runtime, Url } from 'foldkit'
import { Model, Message, initFromUrl, update } from './state'
import { view } from './view'
import './style.css'

const application = Runtime.makeApplication({
  routing: {
    onUrlChange: url => Message.RouteChanged({href:Url.toString(url)}),
    onUrlRequest: request => {
      const href = request._tag === 'External' ? request.href : (() => {
        const url = new URL(Url.toString(request.url))
        return url.pathname + url.search + url.hash
      })()
      return Message.LinkRequested({href})
    },
  },
  Model, init: () => initFromUrl(window.location.href), update, view,
  container: document.getElementById('root'),
  devTools: { Message },
})
Runtime.run(application)
