'use client'

import { useState, useRef, useCallback } from 'react'
import { AGENT_META, AGENT_KEYS, AgentKey } from '@/lib/agents'

type Message = { role: 'user' | 'agent'; text: string }
type Status = 'idle' | 'listening' | 'thinking' | 'speaking'

const AGENT_COLORS: Record<AgentKey, string> = {
  caspar: '#EF22DA',
}

const AGENT_GRADIENTS: Record<AgentKey, string> = {
  caspar: 'radial-gradient(ellipse at 40% 35%, #f472b6, #EF22DA, #9d174d)',
}

export default function TalkPage() {
  const [agent, setAgent] = useState<AgentKey>('caspar')
  const [status, setStatus] = useState<Status>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [liveText, setLiveText] = useState('')
  const [active, setActive] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const historyRef = useRef<{ role: string; content: string }[]>([])
  const latestTranscriptRef = useRef('')
  const shouldContinueRef = useRef(false)

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice input'); return }

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-AU'
    latestTranscriptRef.current = ''

    recognition.onstart = () => { setStatus('listening'); setLiveText('') }
    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      setLiveText(t)
      latestTranscriptRef.current = t
    }
    recognition.onend = () => {
      const final = latestTranscriptRef.current.trim()
      if (final && shouldContinueRef.current) sendMessage(final)
      else if (shouldContinueRef.current) startListening() // retry if nothing heard
      else setStatus('idle')
    }
    recognition.onerror = (e) => {
      if (e.error === 'no-speech' && shouldContinueRef.current) startListening()
      else setStatus('idle')
    }

    recognitionRef.current = recognition
    recognition.start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (text: string) => {
    setLiveText('')
    setStatus('thinking')
    setMessages(prev => [...prev, { role: 'user', text }])
    historyRef.current.push({ role: 'user', content: text })

    try {
      const res = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, agentKey: agent, history: historyRef.current.slice(-8) }),
      })

      const reply = decodeURIComponent(res.headers.get('X-Reply-Text') ?? '')
      historyRef.current.push({ role: 'assistant', content: reply })
      setMessages(prev => [...prev, { role: 'agent', text: reply }])

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      setStatus('speaking')

      audio.onended = () => {
        URL.revokeObjectURL(url)
        if (shouldContinueRef.current) {
          startListening()
        } else {
          setStatus('idle')
        }
      }
      audio.play()
    } catch {
      if (shouldContinueRef.current) startListening()
      else setStatus('idle')
    }
  }, [agent, startListening])

  const startSession = () => {
    shouldContinueRef.current = true
    setActive(true)
    setMessages([])
    historyRef.current = []
    startListening()
  }

  const endSession = () => {
    shouldContinueRef.current = false
    recognitionRef.current?.abort()
    audioRef.current?.pause()
    setActive(false)
    setStatus('idle')
    setLiveText('')
  }

  const color = AGENT_COLORS[agent]
  const gradient = AGENT_GRADIENTS[agent]
  const meta = AGENT_META[agent]

  const orbSize = status === 'speaking' ? 220 : status === 'listening' ? 200 : 180

  const statusLabel = {
    idle: active ? '' : `Tap to talk to ${meta.name}`,
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: meta.name,
  }[status]

  return (
    <div className="flex flex-col h-full bg-transparent relative overflow-hidden">
      <div className="flex justify-center pt-6 pb-2 px-4 z-10 relative">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">Talk to Caspar</div>
      </div>

      {/* Transcript scroll */}
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col justify-end">
        <div className="max-w-md mx-auto w-full flex flex-col gap-2">
          {messages.slice(-6).map((m, i) => (
            <div key={i} className={`text-sm leading-relaxed ${
              m.role === 'user'
                ? 'text-right text-[#8e8e93]'
                : 'text-left text-[#1c1c1e] font-medium'
            }`}>
              {m.text}
            </div>
          ))}
          {liveText && (
            <div className="text-right text-sm text-[#6c6c70] italic">{liveText}</div>
          )}
        </div>
      </div>

      {/* Orb area */}
      <div className="flex flex-col items-center pb-10 pt-4">
        <button
          onClick={active ? endSession : startSession}
          className="relative flex items-center justify-center focus:outline-none mb-5"
          style={{ width: orbSize + 40, height: orbSize + 40, transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          {/* Outer glow rings */}
          {(status === 'listening' || status === 'speaking') && (
            <>
              <span
                className="absolute rounded-full animate-ping opacity-20"
                style={{ width: orbSize + 40, height: orbSize + 40, background: gradient }}
              />
              <span
                className="absolute rounded-full animate-ping opacity-10"
                style={{ width: orbSize + 70, height: orbSize + 70, background: gradient, animationDelay: '0.4s' }}
              />
            </>
          )}

          {/* Main orb */}
          <span
            className="relative rounded-full shadow-2xl"
            style={{
              width: orbSize,
              height: orbSize,
              background: gradient,
              transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              animation: status === 'listening'
                ? 'blob 2s ease-in-out infinite'
                : status === 'speaking'
                ? 'blob 0.7s ease-in-out infinite'
                : status === 'thinking'
                ? 'breathe 1.5s ease-in-out infinite'
                : 'none',
              boxShadow: status !== 'idle'
                ? `0 20px 80px ${color}66, 0 0 0 1px ${color}22`
                : `0 8px 40px ${color}33`,
              filter: 'blur(0px)',
            }}
          >
            {status === 'thinking' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </span>
            )}
          </span>
        </button>

        {/* Status */}
        <p className="text-sm text-[#6c6c70] font-medium mb-1 h-5">{statusLabel}</p>

        {active && (
          <button
            onClick={endSession}
            className="mt-3 text-xs text-[#8e8e93] hover:text-[#6c6c70] transition-colors font-mono uppercase tracking-widest"
          >
            End session
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes blob {
          0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          25%       { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
          50%       { border-radius: 50% 60% 30% 60% / 30% 40% 70% 60%; }
          75%       { border-radius: 40% 60% 60% 30% / 60% 40% 50% 50%; }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50%       { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
