import { Hono } from 'hono'
import { renderer } from './renderer'
import GraphPage from './pages/graph'
import AddVocab from './pages/add'
import SearchVocab from './pages/search'
import { vocabRoutes } from './api/routes/vocab'
import { searchRoutes } from './api/routes/search'
import { graphRoutes } from './api/routes/graph'

const app = new Hono()

app.use(renderer)

// ── Pages ────────────────────────────────────────────────────────────────────

app.get('/', (c) => {
  return c.render(<GraphPage />)
})

app.get('/graph', (c) => {
  return c.render(<GraphPage />)
})

app.get('/add', (c) => {
  return c.render(<AddVocab />)
})

app.get('/search', (c) => {
  return c.render(<SearchVocab />)
})

app.get('/test', (c) => {
  return c.json({
    message: "working"
  })
})

// ── API routes ───────────────────────────────────────────────────────────────

app.route('/api/vocab', vocabRoutes)
app.route('/api/search', searchRoutes)
app.route('/api/graph', graphRoutes)

export default app
