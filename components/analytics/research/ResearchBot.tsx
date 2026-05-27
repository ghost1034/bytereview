'use client'

import { useState } from 'react'

import { ClientSelector, type ClientSelection } from '@/components/analytics/ClientSelector'
import type { ResearchBot as ResearchBotType } from '@/hooks/useAnalyticsResearchSessions'
import { ResearchLanding } from './ResearchLanding'
import { ResearchSession } from './ResearchSession'

export interface SelectedResearchClient {
  /** 'general' for non-client-specific research, otherwise the client UUID. */
  id: string
  name: string
}

interface ResearchBotProps {
  bot: ResearchBotType
}

type View = 'client' | 'landing' | 'session'

const BOT_TITLE: Record<ResearchBotType, string> = {
  irs: 'IRS Researcher',
  gaap: 'GAAP Researcher',
}

/**
 * Three-view orchestrator for the IRS / GAAP research bots, ported faithfully
 * from CPAAnalytics' ResearchBot: pick a client → landing dashboard → chat
 * session. Persistence runs on CPAAutomation's streaming + chat-session APIs
 * instead of Firestore.
 */
export function ResearchBot({ bot }: ResearchBotProps) {
  const [view, setView] = useState<View>('client')
  const [client, setClient] = useState<SelectedResearchClient | null>(null)
  // null = a brand-new session; otherwise the id of a session opened from history.
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const handleSelectClient = (selection: ClientSelection) => {
    setClient({ id: selection.id, name: selection.name })
    setView('landing')
  }

  const startNewSession = () => {
    setOpenSessionId(null)
    setView('session')
  }

  const openSession = (sessionId: string) => {
    setOpenSessionId(sessionId)
    setView('session')
  }

  if (view === 'client' || !client) {
    return (
      <ClientSelector
        onSelectClient={handleSelectClient}
        title={BOT_TITLE[bot]}
        description="Select a client to start the research workflow."
        allowGeneral
      />
    )
  }

  if (view === 'session') {
    return (
      <ResearchSession
        // Remount on session switch so chat state resets cleanly.
        key={openSessionId ?? 'new'}
        bot={bot}
        client={client}
        sessionId={openSessionId}
        onBack={() => setView('landing')}
      />
    )
  }

  return (
    <ResearchLanding
      bot={bot}
      client={client}
      onChangeClient={() => setView('client')}
      onNewSession={startNewSession}
      onOpenSession={openSession}
    />
  )
}

export default ResearchBot
