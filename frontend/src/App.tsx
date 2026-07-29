import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { Loading } from './components/ui'

// Route-level split keeps Cytoscape (graph) and the markdown/highlight stack
// (concept screens) in separate chunks.
const GraphScreen = lazy(() => import('./screens/GraphScreen'))
const ConceptScreen = lazy(() => import('./screens/ConceptScreen'))
const ErrorsScreen = lazy(() => import('./screens/ErrorsScreen'))

export default function App() {
  return (
    // reducedMotion="user" drops transform/layout animations for users with
    // prefers-reduced-motion; opacity fades remain.
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<GraphScreen />} />
          <Route path="/errors" element={<ErrorsScreen />} />
          <Route path="/concept/:id/:tab?" element={<ConceptScreen />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  )
}
