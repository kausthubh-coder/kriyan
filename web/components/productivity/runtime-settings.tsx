'use client'

import { useState } from 'react'

import { useRuntimeSettings, type KriyanRuntimeSettings } from '@/lib/runtime-settings'

function validConvexUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  } catch {
    return false
  }
}

export function RuntimeSettingsWorkspace() {
  const { settings, saveSettings } = useRuntimeSettings()
  const [draft, setDraft] = useState<KriyanRuntimeSettings>(settings)
  const [saved, setSaved] = useState(false)

  const canSave = draft.demoMode || (
    validConvexUrl(draft.convexUrl.trim())
    && draft.installationId.trim().length > 0
    && draft.displayName.trim().length > 0
  )

  return (
    <div className="workspace settings-workspace">
      <section className="settings-card">
        <div>
          <p className="eyebrow">Connection mode</p>
          <h2>{draft.demoMode ? 'Fully offline demo' : 'Self-hosted through Convex'}</h2>
          <p>
            The desktop and web clients subscribe to your Convex deployment. Your private VPS node independently
            connects through Convex to claim commands, run tools, and publish honest node and run state.
          </p>
        </div>
        <label className="mode-toggle">
          <input type="checkbox" checked={draft.demoMode} onChange={(event) => { setSaved(false); setDraft((current) => ({ ...current, demoMode: event.target.checked })) }} />
          <span><strong>Offline demo</strong><small>Use local sample data and make no Convex connection.</small></span>
        </label>
      </section>

      <form className="detail-form settings-form" onSubmit={(event) => {
        event.preventDefault()
        if (!canSave) return
        saveSettings(draft)
        setSaved(true)
      }}>
        <label className="span-2"><span>Convex deployment URL</span><input type="url" value={draft.convexUrl} onChange={(event) => { setSaved(false); setDraft((current) => ({ ...current, convexUrl: event.target.value })) }} placeholder="https://your-deployment.convex.cloud" disabled={draft.demoMode} required={!draft.demoMode} /></label>
        <label><span>Installation ID</span><input value={draft.installationId} onChange={(event) => { setSaved(false); setDraft((current) => ({ ...current, installationId: event.target.value })) }} placeholder="installation:owner-device" disabled={draft.demoMode} required={!draft.demoMode} /></label>
        <label><span>Display name</span><input value={draft.displayName} onChange={(event) => { setSaved(false); setDraft((current) => ({ ...current, displayName: event.target.value })) }} placeholder="My Kriyan" required /></label>
        <div className="form-actions span-2"><button className="primary-button" disabled={!canSave}>Save local settings</button>{saved && <span className="saved-indicator" role="status">Saved. The runtime has reloaded these preferences.</span>}</div>
      </form>

      <section className="settings-card compact-card">
        <div><p className="eyebrow">Local ownership</p><h2>No central Kriyan sign-in</h2><p>The URL, installation ID, display name, and demo toggle are non-secret connection preferences stored in this app profile. Credentials and node secrets do not belong here.</p></div>
      </section>
    </div>
  )
}
