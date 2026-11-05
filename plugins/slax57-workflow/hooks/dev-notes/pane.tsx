// Rendering layer: draws the notes pane from plain state and calls the
// actions it is handed. No `$` and no Notion here; register.tsx wires both.
import type { Elements } from 'claude-code'

import type { DevNotesEntry, DevNotesSection, DevNotesUi, DevNotesView } from '../../types'

import { displayText, SECTIONS } from './markdown'

export type PaneElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Input' | 'Link'>

export type PaneActions = {
  refresh: () => void
  toggle: (section: string, index: number) => void
  startEdit: (key: string, text: string) => void
  cancelEdit: (key: string) => void
  saveEdit: (section: string, index: number, key: string, text: string) => void
  askDelete: (key: string) => void
  cancelDelete: () => void
  confirmDelete: (section: string, index: number) => void
  draft: (key: string, text: string) => void
  add: (section: string, key: string, text: string) => void
}

const STATUS_TEXT: Record<string, string> = {
  idle: 'Chargement des notes…',
  loading: 'Chargement des notes…',
  unconfigured: 'Base Notion non configurée (notionDatabaseId).',
  'no-repo': 'Pas de dépôt git ici.',
  detached: 'HEAD détachée : pas de notes pour cette session.',
}

export function itemKey(section: string, index: number): string {
  return `${section}:${index}`
}

export function addKey(section: string): string {
  return `add:${section}`
}

export function renderPane(
  { Box, Text, Button, Input, Link }: PaneElements,
  view: DevNotesView,
  ui: DevNotesUi,
  actions: PaneActions,
) {
  const toolbar = (
    <Box flexDirection="row" gap={2}>
      <Button key="refresh" label="Rafraîchir" onPress={() => actions.refresh()} />
      {view.status === 'ready' && <Link href={view.page.url} label="Ouvrir dans Notion" />}
      {ui.isBusy && <Text dimColor>écriture…</Text>}
    </Box>
  )
  if (view.status !== 'ready') {
    return (
      <Box flexDirection="column" gap={1}>
        {toolbar}
        {view.status === 'error' && <Text dimColor>Erreur : {view.message}</Text>}
        {view.status === 'unavailable' && (
          <Box flexDirection="column">
            <Text dimColor>Connecteur Notion indisponible. Serveurs essayés :</Text>
            {view.attempts.map(attempt => (
              <Text dimColor>- {attempt}</Text>
            ))}
          </Box>
        )}
        {view.status !== 'error' && view.status !== 'unavailable' && <Text dimColor>{STATUS_TEXT[view.status]}</Text>}
      </Box>
    )
  }

  const renderEntry = (section: DevNotesSection, entry: DevNotesEntry, index: number) => {
    if (entry.type === 'raw') {
      return <Text dimColor>{entry.lines.join('\n')}</Text>
    }
    const key = itemKey(section.name, index)
    const text = displayText(entry.item.text)
    if (ui.editing === key) {
      return (
        <Box flexDirection="row" gap={1}>
          <Input
            key={`edit:${key}`}
            value={ui.drafts[`edit:${key}`] ?? text}
            submitLabel="enregistrer"
            autoFocus
            onInput={value => actions.draft(`edit:${key}`, value)}
            onSubmit={value => actions.saveEdit(section.name, index, key, value)}
          />
          <Button key={`cancel:${key}`} label="Annuler" onPress={() => actions.cancelEdit(key)} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {entry.item.kind === 'todo' ? (
            <Button
              key={`toggle:${key}`}
              plain
              label={entry.item.checked ? '[x]' : '[ ]'}
              onPress={() => actions.toggle(section.name, index)}
            />
          ) : (
            <Text>•</Text>
          )}
          <Text strikethrough={entry.item.checked} dimColor={entry.item.checked}>
            {text}
          </Text>
          <Button key={`edit-start:${key}`} plain dimColor label="éditer" onPress={() => actions.startEdit(key, text)} />
          <Button key={`delete:${key}`} plain dimColor label="supprimer" onPress={() => actions.askDelete(key)} />
        </Box>
        {entry.children.length > 0 && <Text dimColor>{entry.children.join('\n')}</Text>}
        {ui.confirming === key && (
          <Box flexDirection="row" gap={1}>
            <Text>Supprimer cet item ?</Text>
            <Button key={`delete-yes:${key}`} label="Oui" onPress={() => actions.confirmDelete(section.name, index)} />
            <Button key={`delete-no:${key}`} label="Non" onPress={() => actions.cancelDelete()} />
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {toolbar}
      {SECTIONS.map(({ name, kind }) => {
        const section = view.page.sections.find(one => one.name === name)
        const key = addKey(name)

        return (
          <Box flexDirection="column">
            <Text bold>{name}</Text>
            {section === undefined ? (
              <Text dimColor>Section absente de la page.</Text>
            ) : (
              <Box flexDirection="column">
                {section.entries.map((entry, index) => renderEntry(section, entry, index))}
                <Input
                  key={key}
                  value={ui.drafts[key] ?? ''}
                  placeholder={kind === 'todo' ? 'Ajouter une case à cocher…' : 'Ajouter une puce…'}
                  submitLabel="ajouter"
                  onInput={value => actions.draft(key, value)}
                  onSubmit={value => actions.add(name, key, value)}
                />
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
