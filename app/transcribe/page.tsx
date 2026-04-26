'use client'

import { useState, useRef } from 'react'

export default function TranscribePage() {
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function transcribeFile(file: File) {
    setLoading(true)
    setError('')
    setTranscript('')
    setFileName(file.name)
    setStatus('Uploading...')

    const form = new FormData()
    form.append('file', file)

    try {
      setStatus('Processing...')
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setTranscript(data.transcript)
      setStatus('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) transcribeFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) transcribeFile(file)
  }

  function copy() {
    navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-8 pt-8 pb-6 border-b border-white/7">
        <p className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-1">Utility</p>
        <h1 className="text-2xl font-semibold text-[#1c1c1e]">Transcribe</h1>
        <p className="text-[#6c6c70] text-sm mt-1">Drop any audio or video file — get clean text back.</p>
      </div>

      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Left — upload */}
        <div className="w-[380px] shrink-0 border-r border-white/7 p-8 flex flex-col gap-6">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all ${
              dragOver
                ? 'border-[#EF22DA] bg-[#EF22DA]/5'
                : 'border-white/10 bg-white hover:border-black/20 hover:bg-black/[0.03]'
            }`}
          >
            <div className="text-4xl">🎙️</div>
            <div className="text-center">
              <p className="text-sm text-[#3a3a3c] font-medium">Drop a file here</p>
              <p className="text-xs text-[#8e8e93] mt-1">or click to browse</p>
            </div>
            <p className="text-[10px] text-[#4b5563] font-mono uppercase tracking-wider">
              MP3 · MP4 · M4A · WAV · MOV · WEBM
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={onFileChange}
          />

          {fileName && !loading && (
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-white/7 rounded-xl">
              <span className="text-xs text-[#8e8e93] font-mono truncate flex-1">{fileName}</span>
              <button
                onClick={() => { setFileName(''); setTranscript(''); if (inputRef.current) inputRef.current.value = '' }}
                className="text-[#4b5563] hover:text-[#3a3a3c] text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {status && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" />
              <p className="text-xs text-[#6c6c70] font-mono">{status}</p>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Right — transcript */}
        <div className="flex-1 overflow-y-auto p-8">
          {transcript ? (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs uppercase tracking-widest text-[#6c6c70]">Transcript</span>
                <button
                  onClick={copy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/7 text-[#8e8e93] hover:text-[#3a3a3c] hover:border-white/15 transition-all font-mono"
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <div className="bg-white border border-white/7 rounded-2xl p-6">
                <p className="text-sm text-[#3a3a3c] leading-relaxed whitespace-pre-wrap">{transcript}</p>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4">🎙️</div>
                <p className="text-[#8e8e93] text-sm">
                  {loading ? 'Transcribing...' : 'Upload a file to see the transcript here.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
