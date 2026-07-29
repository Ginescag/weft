import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  BookOpen,
  Cards,
  Code,
  Exam,
  NotePencil,
  Target,
  type Icon,
} from '@phosphor-icons/react'

export type TabKey = 'lessons' | 'examples' | 'tests' | 'challenges' | 'flashcards' | 'notes'

export const TAB_KEYS: TabKey[] = ['lessons', 'examples', 'tests', 'challenges', 'flashcards', 'notes']

const LABEL: Record<TabKey, string> = {
  lessons: 'Lessons',
  examples: 'Examples',
  tests: 'Tests',
  challenges: 'Challenges',
  flashcards: 'Flashcards',
  notes: 'Notes',
}

const ICON: Record<TabKey, Icon> = {
  lessons: BookOpen,
  examples: Code,
  tests: Exam,
  challenges: Target,
  flashcards: Cards,
  notes: NotePencil,
}

interface TabBarProps {
  conceptId: string
  active: TabKey
  counts?: Partial<Record<TabKey, number>>
}

export default function TabBar({ conceptId, active, counts }: TabBarProps) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-hairline px-8" aria-label="Concept sections">
      {TAB_KEYS.map((key) => {
        const isActive = key === active
        const count = counts?.[key]
        const TabIcon = ICON[key]
        return (
          <Link
            key={key}
            to={`/concept/${conceptId}/${key}`}
            aria-current={isActive ? 'page' : undefined}
            className={`relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-[13px] font-medium transition-colors ${
              isActive ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            <TabIcon size={15} weight={isActive ? 'fill' : 'regular'} aria-hidden />
            {LABEL[key]}
            {count !== undefined && count > 0 && (
              <span className="font-mono text-[11px] text-muted">{count}</span>
            )}
            {isActive && (
              // The active tab is stitched to the content by a sliding thread.
              <motion.span
                layoutId="tab-thread"
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-burgundy"
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
